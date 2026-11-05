"""Transition tables (device-protocol.md section 8 / protocol.json state_machine).

`TRANSITIONS` is indexed exactly like protocol.json `state_machine.transitions`; the
device calls `check()` before every state change so an undocumented transition
raises IllegalTransition instead of silently happening.  `verify_against_spec`
cross-checks this table with the JSON (used by the tests).
"""
from __future__ import annotations

from dataclasses import dataclass

from .spec import Spec

A_HOME, A_ON, A_OFF, A_AWAY, A_LOST = "HOME", "ON_LEAD", "OFF_LEAD_TETHER", "AWAY", "LOST"
P_NORMAL, P_CHARGING, P_LOW = "NORMAL", "CHARGING", "LOW_BATTERY"


class IllegalTransition(RuntimeError):
    pass


@dataclass(frozen=True)
class Transition:
    idx: int
    kind: str  # "activity" | "power"
    frm: frozenset | None  # None = any
    to: frozenset
    devices: frozenset
    key: str


def _t(idx, kind, frm, to, devices, key):
    return Transition(idx, kind, None if frm is None else frozenset(frm.split("|")),
                      frozenset(to.split("|")), frozenset(devices.split(",")), key)


TR = ("TORUS,LINK")
TRANSITIONS: list[Transition] = [
    _t(0, "activity", A_HOME, A_ON, TR, "start_walk_or_latch"),
    _t(1, "activity", A_ON, A_OFF, TR, "unlatch_during_walk"),
    _t(2, "activity", A_OFF, A_ON, TR, "relatch"),
    _t(3, "activity", f"{A_ON}|{A_OFF}", A_HOME, TR, "stop_walk_or_home_quiet"),
    _t(4, "activity", A_OFF, A_AWAY, "LINK", "peer_and_phone_lost_60s"),
    _t(5, "activity", A_HOME, A_AWAY, "LINK", "all_lost_300s_motion"),
    _t(6, "activity", A_AWAY, A_HOME, "LINK", "home_wifi_or_regained"),
    _t(7, "activity", None, A_LOST, "LINK", "lost_mode_on"),
    _t(8, "activity", A_LOST, f"{A_HOME}|{A_AWAY}", "LINK", "lost_mode_off"),
    _t(9, "power", f"{P_NORMAL}|{P_LOW}", P_CHARGING, "TORUS,LINK,MAGCLIP", "charger_on"),
    _t(10, "power", P_CHARGING, f"{P_NORMAL}|{P_LOW}", "TORUS,LINK,MAGCLIP", "charger_off"),
    _t(11, "power", P_NORMAL, P_LOW, TR, "battery_low"),
    _t(12, "power", P_LOW, P_NORMAL, TR, "battery_recovered"),
]


def find(kind: str, device: str, frm: str, to: str) -> Transition | None:
    for t in TRANSITIONS:
        if (t.kind == kind and device in t.devices and to in t.to
                and (t.frm is None or frm in t.frm)):
            return t
    return None


def check(kind: str, device: str, frm: str, to: str) -> Transition:
    t = find(kind, device, frm, to)
    if t is None:
        raise IllegalTransition(f"{device}: {kind} {frm} -> {to} is not in the transition table")
    return t


def verify_against_spec(spec: Spec) -> list[str]:
    """Return a list of mismatches between TRANSITIONS and protocol.json."""
    problems = []
    js = spec.state_machine["transitions"]
    if len(js) != len(TRANSITIONS):
        problems.append(f"count {len(js)} != {len(TRANSITIONS)}")
    for j, t in zip(js, TRANSITIONS):
        kind = "power" if j["from"].startswith("power:") else "activity"
        strip = lambda s: s.replace("power:", "")
        frm = None if j["from"] == "*" else frozenset(strip(j["from"]).split("|"))
        to = frozenset(strip(j["to"]).split("|"))
        if (kind, frm, to, frozenset(j["devices"])) != (t.kind, t.frm, t.to, t.devices):
            problems.append(f"transition {t.idx} differs: {j} vs {t}")
    return problems
