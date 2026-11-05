"""Encode / decode every message in protocol.json (little-endian throughout)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .spec import Spec, load

INT_TYPES = {"u8": (1, False), "u16": (2, False), "u32": (4, False), "u64": (8, False),
             "i8": (1, True), "i16": (2, True), "i32": (4, True)}


class CodecError(ValueError):
    pass


def hx(b: bytes) -> str:
    return " ".join(f"{x:02X}" for x in b)


def unhex(s: str) -> bytes:
    return bytes.fromhex(s.replace(" ", ""))


# ---------------------------------------------------------------- fields
def decode_fields(fields: list[dict], data: bytes, offset: int = 0) -> tuple[dict, int]:
    """Decode fields; trailing bytes are ignored (forward compatibility).

    Returns (values, end_offset).  A variable `bytes` field uses `length_field`
    if present, otherwise it takes the rest of the data.
    """
    out: dict[str, Any] = {}
    pos = offset
    for f in fields:
        t, size = f["type"], f["size"]
        if t in INT_TYPES:
            n, signed = INT_TYPES[t]
            if pos + n > len(data):
                raise CodecError(f"short data for {f['name']}: need {n} at {pos}, have {len(data)}")
            out[f["name"]] = int.from_bytes(data[pos:pos + n], "little", signed=signed)
            pos += n
        elif t == "bytes":
            if size == "var":
                if "length_field" in f:
                    n = out[f["length_field"]]
                else:
                    n = len(data) - pos
            else:
                n = size
            if pos + n > len(data):
                raise CodecError(f"short data for {f['name']}: need {n} at {pos}, have {len(data)}")
            out[f["name"]] = bytes(data[pos:pos + n])
            pos += n
        else:
            raise CodecError(f"unknown type {t}")
    return out, pos


def encode_fields(fields: list[dict], values: dict) -> bytes:
    out = bytearray()
    for f in fields:
        name, t = f["name"], f["type"]
        if name not in values:
            raise CodecError(f"missing field {name}")
        v = values[name]
        if t in INT_TYPES:
            n, signed = INT_TYPES[t]
            try:
                out += int(v).to_bytes(n, "little", signed=signed)
            except OverflowError as e:
                raise CodecError(f"{name}={v} does not fit {t}") from e
        else:
            v = bytes(v)
            if f["size"] != "var" and len(v) != f["size"]:
                raise CodecError(f"{name}: need {f['size']} bytes, got {len(v)}")
            if f["size"] == "var" and "max" in f and len(v) > f["max"]:
                raise CodecError(f"{name}: max {f['max']} bytes")
            out += v
    return bytes(out)


def fixed_size(fields: list[dict]) -> int | None:
    if any(f["size"] == "var" for f in fields):
        return None
    return sum(f["size"] for f in fields)


# ---------------------------------------------------------------- structs
class Codec:
    def __init__(self, spec: Spec | None = None):
        self.spec = spec or load()

    # structs ----------------------------------------------------
    def decode_struct(self, name: str, data: bytes) -> dict:
        v, _ = decode_fields(self.spec.structs[name]["fields"], data)
        return v

    def encode_struct(self, name: str, values: dict) -> bytes:
        return encode_fields(self.spec.structs[name]["fields"], values)

    # command frames --------------------------------------------
    def encode_command(self, seq: int, opcode: int | str, fields: dict | bytes | None = None,
                       target: int = 0, ver: int | None = None) -> bytes:
        cmd = self._cmd(opcode)
        if isinstance(fields, (bytes, bytearray)):
            payload = bytes(fields)
        else:
            payload = encode_fields(cmd.request, fields or {})
        ver = self.spec.major if ver is None else ver
        return bytes([ver, seq & 0xFF, target, cmd.opcode, len(payload)]) + payload

    def decode_command(self, data: bytes) -> dict:
        """Header + raw payload + decoded fields (fields is None if undecodable)."""
        if len(data) < 5:
            raise CodecError("command shorter than 5-byte header")
        ver, seq, target, opcode, ln = data[:5]
        payload = bytes(data[5:])
        cmd = self.spec.cmd_by_op.get(opcode)
        fields = None
        if cmd is not None:
            try:
                fields, _ = decode_fields(cmd.request, payload)
            except CodecError:
                fields = None
        return {"ver": ver, "seq": seq, "target": target, "opcode": opcode,
                "name": cmd.name if cmd else None, "len": ln, "payload": payload,
                "length_ok": ln == len(payload), "fields": fields}

    # response frames -------------------------------------------
    def encode_response(self, ver: int, seq: int, target: int, opcode: int, status: int,
                        payload: bytes = b"") -> bytes:
        return bytes([ver, seq & 0xFF, target, opcode, status, len(payload)]) + payload

    def decode_response(self, data: bytes) -> dict:
        if len(data) < 6:
            raise CodecError("response shorter than 6-byte header")
        ver, seq, target, opcode, status, ln = data[:6]
        payload = bytes(data[6:])
        cmd = self.spec.cmd_by_op.get(opcode)
        fields = None
        if cmd is not None and status == 0 and payload:
            try:
                fields = self.decode_response_payload(cmd.name, payload, target)
            except (CodecError, KeyError):
                fields = None
        err = self.spec.E("error_code")
        return {"ver": ver, "seq": seq, "target": target, "opcode": opcode,
                "name": cmd.name if cmd else None, "status": status,
                "status_name": err(status).name if status in set(int(x) for x in err) else None,
                "len": ln, "payload": payload, "length_ok": ln == len(payload), "fields": fields}

    def decode_response_payload(self, cmd_name: str, payload: bytes, target: int = 0) -> dict:
        cmd = self.spec.cmd_by_name[cmd_name]
        structs = cmd.response_structs
        if structs:
            sname = structs[1] if (target == 3 and len(structs) > 1) else structs[0]
            return self.decode_struct(sname, payload)
        v, _ = decode_fields(cmd.response_fields, payload)
        return v

    def encode_response_payload(self, cmd_name: str, values: dict, target: int = 0) -> bytes:
        cmd = self.spec.cmd_by_name[cmd_name]
        structs = cmd.response_structs
        if structs:
            sname = structs[1] if (target == 3 and len(structs) > 1) else structs[0]
            return self.encode_struct(sname, values)
        return encode_fields(cmd.response_fields, values)

    # event frames ----------------------------------------------
    def encode_event(self, ev_seq: int, source: int, code: int | str, time: int,
                     payload: bytes | dict = b"", ver: int | None = None) -> bytes:
        if isinstance(code, str):
            code = self.spec.event_by_name[code].code
        if isinstance(payload, dict):
            payload = encode_fields(self.spec.event_by_code[code].fields, payload)
        ver = self.spec.major if ver is None else ver
        return (bytes([ver]) + (ev_seq & 0xFFFF).to_bytes(2, "little") + bytes([source, code])
                + (time & 0xFFFFFFFF).to_bytes(4, "little") + bytes([len(payload)]) + payload)

    def decode_event(self, data: bytes) -> dict:
        """Unknown codes are returned with name=None and raw payload (not an error)."""
        if len(data) < 10:
            raise CodecError("event shorter than 10-byte header")
        ver = data[0]
        ev_seq = int.from_bytes(data[1:3], "little")
        source, code = data[3], data[4]
        time = int.from_bytes(data[5:9], "little")
        ln = data[9]
        payload = bytes(data[10:10 + ln])
        ev = self.spec.event_by_code.get(code)
        fields = None
        if ev is not None:
            fields, _ = decode_fields(ev.fields, payload)
        return {"ver": ver, "ev_seq": ev_seq, "source": source, "code": code,
                "name": ev.name if ev else None, "time": time, "len": ln,
                "payload": payload, "fields": fields}

    # DFU --------------------------------------------------------
    def encode_dfu_request(self, op: int | str, fields: dict | None = None) -> bytes:
        o = self._dfu(op)
        return bytes([o.op]) + encode_fields(o.request, fields or {})

    def decode_dfu_request(self, data: bytes) -> dict:
        if not data:
            raise CodecError("empty DFU request")
        o = self.spec.dfu_by_op.get(data[0])
        fields = None
        if o is not None:
            fields, _ = decode_fields(o.request, data, 1)
        return {"op": data[0], "name": o.name if o else None, "fields": fields,
                "payload": bytes(data[1:])}

    def encode_dfu_indication(self, op: int | str, status: int, fields: dict | None = None) -> bytes:
        o = self._dfu(op)
        body = encode_fields(o.response, fields) if (fields is not None and status == 0) else b""
        return bytes([o.op, status]) + body

    def decode_dfu_indication(self, data: bytes) -> dict:
        if len(data) < 2:
            raise CodecError("DFU indication shorter than 2 bytes")
        o = self.spec.dfu_by_op.get(data[0])
        fields = None
        if o is not None and o.response and data[1] == 0:
            fields, _ = decode_fields(o.response, data, 2)
        return {"op": data[0], "name": o.name if o else None, "status": data[1],
                "fields": fields, "payload": bytes(data[2:])}

    @staticmethod
    def encode_dfu_data(offset: int, chunk: bytes) -> bytes:
        return offset.to_bytes(4, "little") + bytes(chunk)

    @staticmethod
    def decode_dfu_data(data: bytes) -> dict:
        if len(data) < 4:
            raise CodecError("DFU data shorter than 4-byte offset")
        return {"offset": int.from_bytes(data[:4], "little"), "data": bytes(data[4:])}

    # advertising ------------------------------------------------
    def encode_adv_mfg(self, device_type: int, activity: int, flags: int,
                       adv_ver: int = 1, company_id: int = 0xFFFF) -> bytes:
        return encode_fields(self.spec.data["advertising"]["manufacturer_data"], {
            "company_id": company_id, "adv_ver": adv_ver, "device_type": device_type,
            "activity_state": activity, "flags": flags})

    def decode_adv_mfg(self, data: bytes) -> dict:
        v, _ = decode_fields(self.spec.data["advertising"]["manufacturer_data"], data)
        return v

    # helpers ----------------------------------------------------
    def _cmd(self, opcode):
        return self.spec.cmd_by_name[opcode] if isinstance(opcode, str) else self.spec.cmd_by_op[opcode]

    def _dfu(self, op):
        return self.spec.dfu_by_name[op] if isinstance(op, str) else self.spec.dfu_by_op[op]
