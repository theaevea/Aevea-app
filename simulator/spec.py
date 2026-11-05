"""Loads docs/protocol.json and exposes it as typed lookup tables.

Everything the simulator knows about wire formats comes from here; nothing is
hard-coded twice.  The loader refuses a protocol file whose major version is not
SUPPORTED_MAJOR (device-protocol.md section 13).
"""
from __future__ import annotations

import enum
import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

SUPPORTED_MAJOR = 1
ENV_VAR = "AEVEA_PROTOCOL_JSON"


class SpecVersionError(RuntimeError):
    pass


def default_path() -> Path:
    env = os.environ.get(ENV_VAR)
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent / "docs" / "protocol.json"


def _int(x: str | int) -> int:
    return x if isinstance(x, int) else int(x, 0)


@dataclass
class Command:
    opcode: int
    name: str
    devices: list[str]
    magclip_target: bool
    owner_auth_required: bool
    request: list[dict]
    request_size: Any  # int or "var"
    response: list  # list of fields OR list of "struct:xxx" strings
    response_size: Any
    queue: dict
    example: dict
    raw: dict = field(repr=False, default_factory=dict)

    @property
    def response_structs(self) -> list[str]:
        if self.response and isinstance(self.response[0], str):
            return [s.split(":", 1)[1].split()[0] for s in self.response]
        return []

    @property
    def response_fields(self) -> list[dict]:
        return [] if self.response_structs else list(self.response)


@dataclass
class Event:
    code: int
    name: str
    sources: list[str]
    fields: list[dict]
    size: int
    example_hex: str


@dataclass
class DfuOp:
    op: int
    name: str
    request: list[dict]
    response: list[dict]
    example: dict


class Spec:
    def __init__(self, data: dict):
        self.data = data
        v = data["version"]
        self.major, self.minor = v["major"], v["minor"]
        if self.major != SUPPORTED_MAJOR:
            raise SpecVersionError(
                f"protocol.json major {self.major} != supported {SUPPORTED_MAJOR}")
        self.structs: dict[str, dict] = data["structs"]
        self.frames = data["frames"]
        self.enums: dict[str, type[enum.IntEnum]] = {}
        for name, members in data["enums"].items():
            self.enums[name] = enum.IntEnum(
                name, {m.split()[0]: _int(k) for k, m in members.items()})
        self.enums["error_code"] = enum.IntEnum(
            "error_code", {e["name"]: _int(e["code"]) for e in data["error_codes"]})
        self.enums["dfu_op"] = enum.IntEnum(
            "dfu_op", {o["name"]: _int(o["op"]) for o in data["dfu"]["ops"]})
        self.bitfields: dict[str, type[enum.IntFlag]] = {}
        for name, bits in data["bitfields"].items():
            self.bitfields[name] = enum.IntFlag(
                name, {n: 1 << int(b) for b, n in bits.items()})
        self.commands = [
            Command(_int(c["opcode"]), c["name"], c["devices"], c["magclip_target"],
                    c["owner_auth_required"], c["request"], c["request_size"],
                    c["response"], c["response_size"], c["queue"], c["example"], c)
            for c in data["commands"]]
        self.cmd_by_op = {c.opcode: c for c in self.commands}
        self.cmd_by_name = {c.name: c for c in self.commands}
        self.events = [Event(_int(e["code"]), e["name"], e["sources"], e["fields"],
                             e["size"], e["example_hex"]) for e in data["events"]]
        self.event_by_code = {e.code: e for e in self.events}
        self.event_by_name = {e.name: e for e in self.events}
        self.dfu_ops = [DfuOp(_int(o["op"]), o["name"], o["request"], o["response"],
                              o["example"]) for o in data["dfu"]["ops"]]
        self.dfu_by_op = {o.op: o for o in self.dfu_ops}
        self.dfu_by_name = {o.name: o for o in self.dfu_ops}
        self.state_machine = data["state_machine"]
        self.thresholds = self.state_machine["thresholds"]
        self.timers = self.state_machine["timers_s"]

    # -- convenience -------------------------------------------------
    def E(self, name: str) -> type[enum.IntEnum]:
        return self.enums[name]

    def B(self, name: str) -> type[enum.IntFlag]:
        return self.bitfields[name]

    def char_uuid(self, short: str) -> str:
        """'0x0101' -> full UUID string (upper case)."""
        for s in self.data["services"]:
            for c in s["characteristics"]:
                if c["short"].lower() == short.lower():
                    return c["uuid"].upper()
        raise KeyError(short)

    def lost_interval_for_battery(self, pct: float) -> int:
        for row in self.state_machine["lost_mode_interval_s"]:
            if pct >= row["battery_min_pct"]:
                return row["interval_s"]
        return self.state_machine["lost_mode_interval_s"][-1]["interval_s"]


@lru_cache(maxsize=4)
def _load(path: str) -> Spec:
    with open(path, "r", encoding="utf-8") as fh:
        return Spec(json.load(fh))


def load(path: str | os.PathLike | None = None) -> Spec:
    return _load(str(path or default_path()))
