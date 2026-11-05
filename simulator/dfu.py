"""Signed DFU simulation (device-protocol.md section 11).

The spec does not define the image container, so this module defines a minimal
MCUboot-style one (header | payload | 64-byte signature trailer); see SPEC_ISSUES.md.
"""
from __future__ import annotations

import hashlib
import struct
from typing import TYPE_CHECKING

from . import crypto

if TYPE_CHECKING:  # pragma: no cover
    from .device import AeveaDevice, Connection

MAGIC = b"AIMG"
HDR = struct.Struct("<4sBBBBHIIH")  # magic type maj min patch build sec_counter payload_len pad
HDR_SIZE = HDR.size


def build_image(image_type: int, version: tuple[int, int, int, int], sec_counter: int,
                payload: bytes, boot_key: crypto.SimKey) -> bytes:
    hdr = HDR.pack(MAGIC, image_type, version[0], version[1], version[2], version[3],
                   sec_counter, len(payload), 0)
    return hdr + payload + boot_key.sign(hdr + payload)


def parse_image(blob: bytes) -> dict | None:
    if len(blob) < HDR_SIZE + 64:
        return None
    magic, itype, ma, mi, pa, bu, sc, plen, _ = HDR.unpack_from(blob)
    if magic != MAGIC or HDR_SIZE + plen + 64 != len(blob):
        return None
    return {"image_type": itype, "version": (ma, mi, pa, bu), "sec_counter": sc,
            "payload_len": plen}


class DfuEngine:
    def __init__(self, dev: "AeveaDevice"):
        self.dev = dev
        self.spec = dev.spec
        self.codec = dev.codec
        self.E = dev.spec.E
        self.err = dev.spec.E("error_code")
        self.state = self.E("dfu_state").IDLE
        self.reset_transfer()
        self.prev_version = None
        self.prev_sec = None
        self.unconfirmed_boots = 0
        self.confirm_deadline = None
        self._erase_done_at = None
        self._verifying = False
        self.fail_next_verify: int | None = None  # test hook

    # -- helpers ----------------------------------------------------
    def reset_transfer(self):
        self.image_type = 0
        self.size = 0
        self.version = (0, 0, 0, 0)
        self.sha = b""
        self.buf = bytearray()
        self.skipped_chunks = 0

    @property
    def pending_confirm(self) -> bool:
        return self.state == self.E("dfu_state").PENDING_TEST_BOOT

    def _ind(self, conn, op, status, fields=None):
        data = self.codec.encode_dfu_indication(op, int(status), fields)
        self.dev._push(conn, self.dev.uuid("0x0301"), data, "indicate")

    def _supported_image_types(self):
        return (0,) if self.dev.TYPE_NAME == "TORUS" else (0, 1, 2)

    # -- control point ---------------------------------------------
    def control(self, conn: "Connection", data: bytes) -> None:
        if not data:
            raise_att = self.dev.AttError(0x0D)
            raise raise_att
        op = data[0]
        o = self.spec.dfu_by_op.get(op)
        if o is None:
            self._ind(conn, op, self.err.UNKNOWN_OPCODE)
            return
        body = data[1:]
        want = sum(f["size"] for f in o.request)
        if len(body) != want:
            self._ind(conn, op, self.err.INVALID_LENGTH)
            return
        if self._verifying and o.name not in ("DFU_STATUS", "DFU_ABORT"):
            self._ind(conn, op, self.err.BUSY)
            return
        getattr(self, "_op_" + o.name.lower())(conn, self.codec.decode_dfu_request(data)["fields"])

    def _op_dfu_start(self, conn, r):
        D = self.E("dfu_state")
        dev = self.dev
        if dev.walk is not None or dev.activity == "LOST":
            return self._ind(conn, "DFU_START", self.err.INVALID_STATE)
        if self.state == D.PENDING_TEST_BOOT:
            return self._ind(conn, "DFU_START", self.err.INVALID_STATE)
        if dev.battery_pct < self.spec.thresholds["dfu_min_pct"] and dev.power != "CHARGING":
            return self._ind(conn, "DFU_START", self.err.LOW_BATTERY)
        if r["image_type"] not in self._supported_image_types() or r["image_size"] == 0 \
                or r["image_size"] > dev.cfg.dfu_slot_size:
            return self._ind(conn, "DFU_START", self.err.DFU_INVALID_IMAGE)
        same = (self.state in (D.RECEIVING, D.VERIFIED) and self.sha == r["sha256"]
                and self.image_type == r["image_type"] and self.size == r["image_size"])
        if not same:
            if dev.cfg.dfu_erase_delay_s > 0:
                if self._erase_done_at is None:
                    self._erase_done_at = dev.now + dev.cfg.dfu_erase_delay_s
                    return self._ind(conn, "DFU_START", self.err.BUSY)
                if dev.now < self._erase_done_at:
                    return self._ind(conn, "DFU_START", self.err.BUSY)
                self._erase_done_at = None
            self.reset_transfer()
            self.image_type = r["image_type"]
            self.size = r["image_size"]
            self.version = (r["fw_major"], r["fw_minor"], r["fw_patch"], r["fw_build"])
            self.sha = r["sha256"]
            self.state = D.RECEIVING
        dev.request_profile("ACTIVE")
        self._ind(conn, "DFU_START", self.err.OK, {
            "resume_offset": len(self.buf), "max_chunk": self.max_chunk(conn)})

    def max_chunk(self, conn) -> int:
        return max(0, min(self.dev.cfg.dfu_max_chunk, conn.mtu - 7))

    def _op_dfu_get_offset(self, conn, r):
        if self.state == self.E("dfu_state").IDLE or self.state == self.E("dfu_state").CONFIRMED:
            return self._ind(conn, "DFU_GET_OFFSET", self.err.DFU_NOT_STARTED)
        self._ind(conn, "DFU_GET_OFFSET", self.err.OK, {
            "offset": len(self.buf), "crc32": crypto.crc32(bytes(self.buf))})

    def _op_dfu_verify(self, conn, r):
        D = self.E("dfu_state")
        if self.state in (D.IDLE, D.CONFIRMED):
            return self._ind(conn, "DFU_VERIFY", self.err.DFU_NOT_STARTED)
        if self.state != D.RECEIVING:
            return self._ind(conn, "DFU_VERIFY", self.err.INVALID_STATE)
        if len(self.buf) != self.size:
            return self._ind(conn, "DFU_VERIFY", self.err.DFU_OFFSET_MISMATCH)
        self._verifying = True
        self.dev.schedule(self.dev.cfg.dfu_verify_delay_s, lambda: self._finish_verify(conn))

    def _finish_verify(self, conn):
        D = self.E("dfu_state")
        self._verifying = False
        status = self.err.OK
        blob = bytes(self.buf)
        info = parse_image(blob)
        if self.fail_next_verify is not None:
            status = self.err(self.fail_next_verify)
            self.fail_next_verify = None
        elif hashlib.sha256(blob).digest() != self.sha:
            status = self.err.DFU_HASH_MISMATCH
        elif (info is None or info["image_type"] != self.image_type
              or info["version"] != self.version):
            status = self.err.DFU_INVALID_IMAGE
        elif not crypto.verify(self.dev.boot_pub, blob[:HDR_SIZE + info["payload_len"]], blob[-64:]):
            status = self.err.DFU_INVALID_SIGNATURE
        elif info["sec_counter"] < self.dev.sec_counter:
            status = self.err.DFU_DOWNGRADE_REJECTED
        if status == self.err.OK:
            self.sec_new = info["sec_counter"]
            self.state = D.VERIFIED
        else:
            self.state = D.IDLE
            self.reset_transfer()
        if conn.connected:
            self._ind(conn, "DFU_VERIFY", status)

    def _op_dfu_apply(self, conn, r):
        D = self.E("dfu_state")
        if self.state != D.VERIFIED:
            return self._ind(conn, "DFU_APPLY", self.err.INVALID_STATE)
        self._ind(conn, "DFU_APPLY", self.err.OK)
        self.prev_version, self.prev_sec = self.dev.fw, self.dev.sec_counter
        self.dev.fw = self.version
        self.dev.sec_counter = self.sec_new
        self.state = D.PENDING_TEST_BOOT
        self.unconfirmed_boots = 0
        self.confirm_deadline = None
        self.dev.reboot(reason="dfu_apply")

    def _op_dfu_abort(self, conn, r):
        D = self.E("dfu_state")
        if self.state == D.PENDING_TEST_BOOT:
            return self._ind(conn, "DFU_ABORT", self.err.INVALID_STATE)
        self.state = D.IDLE
        self.reset_transfer()
        self._verifying = False
        self._erase_done_at = None
        self._ind(conn, "DFU_ABORT", self.err.OK)

    def _op_dfu_confirm(self, conn, r):
        D = self.E("dfu_state")
        if self.state != D.PENDING_TEST_BOOT:
            return self._ind(conn, "DFU_CONFIRM", self.err.INVALID_STATE)
        self.state = D.CONFIRMED
        self.prev_version = self.prev_sec = None
        self.confirm_deadline = None
        self.unconfirmed_boots = 0
        self.dev._status_changed()
        self._ind(conn, "DFU_CONFIRM", self.err.OK)

    def _op_dfu_status(self, conn, r):
        v = self.version
        self._ind(conn, "DFU_STATUS", self.err.OK, {
            "dfu_state": int(self.state), "image_type": self.image_type, "offset": len(self.buf),
            "pend_major": v[0], "pend_minor": v[1], "pend_patch": v[2], "pend_build": v[3]})

    # -- data point ---------------------------------------------------
    def data(self, conn: "Connection", data: bytes) -> None:
        """Write-without-response: bad chunks are dropped silently (no error path in the spec)."""
        d = self.codec.decode_dfu_data(data) if len(data) >= 4 else None
        D = self.E("dfu_state")
        if d is None or self.state != D.RECEIVING or self._verifying:
            self.skipped_chunks += 1
            return
        if (d["offset"] != len(self.buf) or len(d["data"]) > self.max_chunk(conn)
                or len(self.buf) + len(d["data"]) > self.size):
            self.skipped_chunks += 1
            return
        self.buf += d["data"]

    # -- boot logic (called by device.reboot) ---------------------------
    def on_boot(self, watchdog: bool = False) -> None:
        D = self.E("dfu_state")
        if self.state != D.PENDING_TEST_BOOT:
            return
        self.unconfirmed_boots += 1
        if watchdog or self.unconfirmed_boots > self.spec.data["dfu"]["max_unconfirmed_boots"]:
            self.rollback("watchdog" if watchdog else "unconfirmed_boots")
            return
        self.confirm_deadline = self.dev.now + self.spec.data["dfu"]["confirm_deadline_s"]

    def tick(self):
        if self.confirm_deadline is not None and self.dev.now >= self.confirm_deadline:
            self.rollback("confirm_timeout")

    def rollback(self, why: str) -> None:
        D = self.E("dfu_state")
        self.dev.fw, self.dev.sec_counter = self.prev_version, self.prev_sec
        self.prev_version = self.prev_sec = None
        self.state = D.IDLE
        self.reset_transfer()
        self.confirm_deadline = None
        self.unconfirmed_boots = 0
        self.dev.log("dfu_rollback", reason=why, fw=list(self.dev.fw))
        if self.dev._booting:
            return
        self.dev.reboot(reason="dfu_rollback")
