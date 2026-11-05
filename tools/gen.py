#!/usr/bin/env python3
"""Generates docs/protocol.json and the generated tables of docs/device-protocol.md.
Single source of truth so the JSON and Markdown cannot drift."""
import json, struct, sys, datetime, re

OUT_JSON = "/home/claude/aevea-app/docs/protocol.json"
OUT_MD = "/home/claude/aevea-app/docs/device-protocol.md"
TEMPLATE = sys.argv[1]

BASE = "AE7E0000-7A1C-4E5A-9D2B-AE7EA0000000"
def uuid(short): return f"AE7E{short:04X}-7A1C-4E5A-9D2B-AE7EA0000000"

TYPES = {"u8": ("<B", 1), "u16": ("<H", 2), "u32": ("<I", 4), "u64": ("<Q", 8),
         "i8": ("<b", 1), "i16": ("<h", 2), "i32": ("<i", 4)}

def F(name, type_, ex, desc="", **kw):
    d = {"name": name, "type": type_}
    if type_ in TYPES:
        d["size"] = TYPES[type_][1]
    else:
        d["size"] = kw.pop("size")
    for k in ("unit", "scale", "range", "enum", "bitfield", "length_field", "max", "default", "assumption"):
        if k in kw: d[k] = kw.pop(k)
    assert not kw, kw
    d["desc"] = desc
    d["_ex"] = ex
    return d

def enc(fields, overrides=None):
    out = b""
    vals = {f["name"]: f["_ex"] for f in fields}
    if overrides: vals.update(overrides)
    for f in fields:
        v = vals[f["name"]]
        if f["type"] in TYPES:
            out += struct.pack(TYPES[f["type"]][0], v)
        else:
            b = bytes.fromhex(v) if isinstance(v, str) else v
            if f["size"] != "var": assert len(b) == f["size"], (f["name"], len(b))
            out += b
    return out

def hx(b): return " ".join(f"{x:02X}" for x in b)
def clean(fields): return [{k: v for k, v in f.items() if k != "_ex"} for f in fields]

EX_TIME = int(datetime.datetime(2026, 11, 5, 12, 0, 0, tzinfo=datetime.timezone.utc).timestamp())

# ---------------------------------------------------------------- enums
ENUMS = {
  "device_type": {"0x01": "TORUS", "0x02": "LINK", "0x03": "MAGCLIP"},
  "target": {"0x00": "SELF", "0x03": "MAGCLIP (Torus only, proxied)"},
  "activity_state": {"0x00": "HOME", "0x01": "ON_LEAD", "0x02": "OFF_LEAD_TETHER", "0x03": "AWAY", "0x04": "LOST"},
  "power_state": {"0x00": "NORMAL", "0x01": "CHARGING", "0x02": "LOW_BATTERY"},
  "state_change_reason": {"0x00": "COMMAND", "0x01": "MAGCLIP_LATCHED", "0x02": "MAGCLIP_UNLATCHED",
      "0x03": "HOME_WIFI_SEEN", "0x04": "HOME_WIFI_LOST", "0x05": "PEER_LOST", "0x06": "PHONE_LOST",
      "0x07": "PEER_OR_PHONE_REGAINED", "0x08": "CHARGER_CONNECTED", "0x09": "CHARGER_REMOVED",
      "0x0A": "BATTERY_THRESHOLD", "0x0B": "CLOUD_COMMAND", "0x0C": "BOOT", "0x0D": "TIMEOUT"},
  "tether_level": {"0x00": "GREEN", "0x01": "AMBER", "0x02": "RED", "0x03": "NO_RANGE"},
  "tether_mode": {"0x00": "OFF", "0x01": "AUTO_ON_UNCLIP"},
  "charge_state": {"0x00": "DISCHARGING", "0x01": "CHARGING", "0x02": "FULL", "0x03": "FAULT"},
  "charge_source": {"0x00": "NONE", "0x01": "USB_C", "0x02": "TORUS_DOCK", "0x03": "MAGCLIP_CONTACTS"},
  "halo_pattern": {"0x00": "OFF", "0x01": "SOLID", "0x02": "BREATHE", "0x03": "BLINK", "0x04": "SPIN", "0x05": "AUTO_STATE"},
  "on_off": {"0x00": "OFF_OR_STOP", "0x01": "ON_OR_START"},
  "recall_status": {"0x01": "CUE_STARTED", "0x02": "CUE_FINISHED", "0x03": "TIMEOUT", "0x04": "STOPPED"},
  "path": {"0x01": "BLE_1M", "0x02": "BLE_CODED_S8", "0x03": "LTE_M"},
  "location_source": {"0x01": "GNSS", "0x02": "LAST_KNOWN"},
  "magclip_location": {"0x00": "UNKNOWN", "0x01": "DOCKED_IN_TORUS", "0x02": "LATCHED_TO_LINK", "0x03": "FREE"},
  "dfu_image_type": {"0x00": "MAIN_BLE_MCU (Torus nRF52833 / Link DWM3001C nRF52833)",
                     "0x01": "LINK_CELLULAR_APP (nRF9151 app core, includes nRF7002 firmware)",
                     "0x02": "LINK_MODEM (nRF9151 modem firmware)"},
  "dfu_state": {"0x00": "IDLE", "0x01": "RECEIVING", "0x02": "VERIFIED", "0x03": "PENDING_TEST_BOOT", "0x04": "CONFIRMED"},
}

ERRORS = [
  ("0x00", "OK", "Success."),
  ("0x01", "UNKNOWN_OPCODE", "Opcode not known to this firmware."),
  ("0x02", "INVALID_LENGTH", "len does not match the opcode's payload."),
  ("0x03", "OUT_OF_RANGE", "A field value is outside its documented range."),
  ("0x04", "NOT_SUPPORTED", "Opcode valid but not on this device type or target."),
  ("0x05", "BUSY", "Device cannot accept now (flash erase, other op running). Retry after 500 ms."),
  ("0x06", "INVALID_STATE", "Not allowed in current state (e.g. STOP_WALK with no walk)."),
  ("0x07", "NOT_AUTHORISED", "Owner not bound, or command needs owner binding."),
  ("0x08", "TARGET_UNREACHABLE", "MagClip not currently reachable through Torus."),
  ("0x09", "LOW_BATTERY", "Refused to protect battery (e.g. DFU below 30% not charging)."),
  ("0x0A", "VERSION_MISMATCH", "Frame ver (protocol major) not supported."),
  ("0x0B", "STORAGE_FULL", "No slot left (bonds, home Wi-Fi slots, peers)."),
  ("0x0C", "TIMEOUT", "Internal operation timed out (e.g. GNSS no fix)."),
  ("0x0D", "AUTH_FAILED", "Signature or token check failed."),
  ("0x10", "DFU_INVALID_SIGNATURE", "Image signature does not verify against the boot key."),
  ("0x11", "DFU_INVALID_IMAGE", "Header/type/size wrong for this device."),
  ("0x12", "DFU_OFFSET_MISMATCH", "Data offset not equal to expected offset."),
  ("0x13", "DFU_HASH_MISMATCH", "SHA-256 of received image differs from DFU_START."),
  ("0x14", "DFU_DOWNGRADE_REJECTED", "Security counter lower than running image."),
  ("0x15", "DFU_NOT_STARTED", "DFU op sent before DFU_START."),
  ("0xFF", "INTERNAL", "Unexpected firmware error; detail in FAULT event."),
]
ENUMS["error_code"] = {c: n for c, n, _ in ERRORS}

BITFIELDS = {
  "capabilities": {"0": "HALO", "1": "LRA", "2": "PIEZO", "3": "UWB", "4": "GNSS", "5": "LTE_M",
                   "6": "WIFI_SCAN", "7": "LINE_SENSOR", "8": "BOLT_DETECT", "9": "MAGCLIP_PROXY",
                   "10": "CODED_PHY", "11": "DFU", "12": "TETHER", "13": "CONTACT_CHARGING"},
  "status_flags": {"0": "WALK_ACTIVE", "1": "TETHER_ARMED", "2": "MAGCLIP_LATCHED", "3": "LOST_MODE",
                   "4": "AT_HOME_WIFI", "5": "PEER_LINKED", "6": "OWNER_BOUND", "7": "EVENTS_QUEUED",
                   "8": "DFU_PENDING_CONFIRM", "9": "BATTERY_CRITICAL"},
  "self_test": {"0": "BATTERY_CHARGER", "1": "BLE", "2": "UWB", "3": "LRA", "4": "HALO", "5": "LINE_SENSOR",
                "6": "ACCELEROMETER", "7": "GNSS", "8": "LTE_M", "9": "WIFI_SCAN", "10": "PIEZO",
                "11": "MAGCLIP_CONTACTS"},
  "actuator": {"0": "LRA", "1": "PIEZO"},
  "locate_flags": {"0": "GNSS_FIX", "1": "PIEZO_CHIRP", "2": "ALSO_REPORT_VIA_LTE_M"},
  "bolt_flags": {"0": "FORCE_ESTIMATED", "1": "SLIP_SATURATED_500MM", "2": "MAGCLIP_STILL_LATCHED"},
  "range_flags": {"0": "UWB_VALID", "1": "NLOS_SUSPECTED"},
  "identity_flags": {"0": "PAIRING_WINDOW_OPEN", "1": "OWNER_BOUND", "2": "FACTORY_FRESH"},
  "adv_flags": {"0": "PAIRING_WINDOW_OPEN", "1": "OWNER_BOUND", "2": "LOW_BATTERY", "3": "LOST_MODE", "4": "EVENTS_QUEUED"},
}

# ---------------------------------------------------------------- frames
CMD_HDR = [F("ver", "u8", 1, "Protocol major version (0x01)."),
           F("seq", "u8", 0, "App-chosen sequence, echoed in response. Wraps."),
           F("target", "u8", 0, "0x00 self, 0x03 MagClip via Torus.", enum="target"),
           F("opcode", "u8", 0, "Command opcode."),
           F("len", "u8", 0, "Payload length in bytes.")]
RSP_HDR = [F("ver", "u8", 1, "Protocol major version."),
           F("seq", "u8", 0, "Echo of command seq."),
           F("target", "u8", 0, "Echo of command target.", enum="target"),
           F("opcode", "u8", 0, "Echo of command opcode."),
           F("status", "u8", 0, "Error code.", enum="error_code"),
           F("len", "u8", 0, "Payload length.")]
EVT_HDR = [F("ver", "u8", 1, "Protocol major version."),
           F("ev_seq", "u16", 0, "Per-device monotonic event sequence (persists across reboot, wraps at 65535)."),
           F("source", "u8", 1, "Device type the event is about (0x03 = MagClip).", enum="device_type"),
           F("code", "u8", 0, "Event code."),
           F("time", "u32", EX_TIME, "Unix time, s (from SET_TIME; 0 if never set)."),
           F("len", "u8", 0, "Payload length.")]

# ---------------------------------------------------------------- structs
STATUS = [F("ver", "u8", 1, "Struct version."),
          F("device_type", "u8", 1, "", enum="device_type"),
          F("activity_state", "u8", 2, "", enum="activity_state"),
          F("power_state", "u8", 0, "", enum="power_state"),
          F("battery_pct", "u8", 72, "", unit="%", range=[0, 100]),
          F("flags", "u16", 0x0063, "", bitfield="status_flags"),
          F("magclip_batt_pct", "u8", 0xFF, "0xFF unknown.", unit="%"),
          F("tether_radius_dm", "u8", 50, "Current tether radius.", unit="dm", range=[30, 100]),
          F("tether_level", "u8", 0, "", enum="tether_level"),
          F("queued_events", "u16", 0, "Events not yet ACKed."),
          F("walk_id", "u32", 42, "0 if no walk.")]
MAGCLIP_STATUS = [F("ver", "u8", 1, "Struct version."),
          F("device_type", "u8", 3, "Always 0x03.", enum="device_type"),
          F("battery_pct", "u8", 64, "", unit="%", range=[0, 100]),
          F("latched", "u8", 1, "1 latched to collar anchor plate.", range=[0, 1]),
          F("location", "u8", 2, "", enum="magclip_location"),
          F("charge_state", "u8", 0, "", enum="charge_state"),
          F("last_seen_s", "u16", 4, "Age of this data at Torus.", unit="s")]
RANGE = [F("ver", "u8", 1, "Struct version."),
         F("seq", "u8", 17, "Sample counter, wraps."),
         F("distance_cm", "u16", 640, "Torus-Link UWB distance; 0xFFFF none.", unit="cm"),
         F("dist_err_cm", "u8", 10, "1-sigma estimate; 0xFF unknown.", unit="cm"),
         F("link_rssi_dbm", "i8", -71, "Torus-Link BLE RSSI; 127 unknown.", unit="dBm"),
         F("phone_rssi_dbm", "i8", -64, "Phone RSSI seen by this device; 127 unknown.", unit="dBm"),
         F("line_out_mm", "u16", 0xFFFF, "Torus only, from Hall/angle sensor; 0xFFFF n/a.", unit="mm", range=[0, 3000]),
         F("tether_level", "u8", 0, "", enum="tether_level"),
         F("flags", "u8", 0x01, "", bitfield="range_flags")]
IDENTITY = [F("ver", "u8", 1, "Struct version."),
            F("device_type", "u8", 1, "", enum="device_type"),
            F("proto_major", "u8", 1, ""),
            F("proto_minor", "u8", 0, ""),
            F("device_id", "u64", 0x00A3E70100000123, "Registry ID. All zero outside pairing window (privacy)."),
            F("pairing_nonce", "u32", 0x9C41D2E7, "Fresh per pairing attempt; input to passkey derivation."),
            F("flags", "u8", 0x05, "", bitfield="identity_flags")]
INFO = [F("proto_major", "u8", 1, ""), F("proto_minor", "u8", 0, ""),
        F("device_type", "u8", 1, "", enum="device_type"),
        F("hw_rev", "u8", 2, "Board revision."),
        F("fw_major", "u8", 0, ""), F("fw_minor", "u8", 3, ""), F("fw_patch", "u8", 1, ""),
        F("fw_build", "u16", 112, ""),
        F("capabilities", "u32", 0x00003F8B, "", bitfield="capabilities"),
        F("max_payload", "u8", 244, "Largest command payload accepted (ATT_MTU - 3 - 5, capped 255).")]
CERT = [F("cert_ver", "u8", 1, ""), F("device_id", "u64", 0x00A3E70100000123, ""),
        F("device_type", "u8", 1, "", enum="device_type"), F("hw_rev", "u8", 2, ""),
        F("pubkey", "bytes", "04" * 64, "P-256 public key X||Y.", size=64),
        F("issued", "u32", EX_TIME, "Unix time."), F("ca_key_id", "u32", 0xAE7E0001, "Aevea device CA key ID."),
        F("signature", "bytes", "5A" * 64, "ECDSA P-256 r||s by device CA over all prior bytes.", size=64)]
OWNER_TOKEN = [F("token_ver", "u8", 1, ""), F("purpose", "u8", 1, "1 bind, 2 unbind."),
        F("device_id", "u64", 0x00A3E70100000123, ""),
        F("owner_id", "bytes", "7B" * 16, "Cloud owner UUID.", size=16),
        F("issued", "u32", EX_TIME, ""), F("expires", "u32", EX_TIME + 600, "Max 10 min after issued."),
        F("signature", "bytes", "C3" * 64, "ECDSA P-256 by cloud owner-token key over all prior bytes.", size=64)]
STRUCTS = {"status": STATUS, "magclip_status": MAGCLIP_STATUS, "range": RANGE, "identity": IDENTITY,
           "info": INFO, "device_cert": CERT, "owner_token": OWNER_TOKEN}

# ---------------------------------------------------------------- commands
T, L, M = "TORUS", "LINK", "MAGCLIP"
def C(op, name, devices, req, rsp, auth, queue, desc, seq, target=0, rsp_ex=None, req_ex=None):
    return dict(opcode=op, name=name, devices=devices, request=req, response=rsp, owner_auth=auth,
                queue=queue, desc=desc, _seq=seq, _target=target, _rsp_ex=rsp_ex, _req_ex=req_ex)

Q_NEVER = {"queueable": False}
def Q(ttl, coalesce=None, note=None):
    d = {"queueable": True, "ttl_s": ttl}
    if coalesce: d["coalesce"] = coalesce
    if note: d["note"] = note
    return d

COMMANDS = [
 C(0x01, "GET_INFO", [T, L, M], [], INFO, False, Q_NEVER, "Versions and capabilities. Always sent first after connect.", 0x01),
 C(0x02, "SET_TIME", [T, L], [F("unix_time", "u32", EX_TIME, "", unit="s"), F("tz_offset_min", "i16", 0, "Local offset.", unit="min")],
   [], False, {"queueable": False, "note": "Sent automatically on every connect."}, "Sets device clock for event timestamps.", 0x02),
 C(0x03, "GET_STATUS", [T, L, M], [], STATUS, False, Q_NEVER, "Returns status struct (magclip_status when target=MagClip).", 0x03),
 C(0x04, "GET_EVENTS", [T, L], [F("from_ev_seq", "u16", 0x0130, "First ev_seq wanted."), F("max_count", "u8", 32, "", range=[1, 64])],
   [F("available", "u16", 3, "Events that will be indicated."), F("first_ev_seq", "u16", 0x0130, "Oldest still held.")],
   False, Q_NEVER, "Replays queued events on the Event characteristic.", 0x04),
 C(0x05, "ACK_EVENTS", [T, L], [F("up_to_ev_seq", "u16", 0x0132, "Inclusive.")], [], False, Q_NEVER, "Frees queued events.", 0x05),
 C(0x06, "SELF_TEST", [T, L, M], [F("tests", "u16", 0x003F, "Bitmap; unsupported bits ignored.", bitfield="self_test")], [],
   True, Q_NEVER, "Runs self test; result in SELF_TEST_RESULT event.", 0x06),
 C(0x07, "FACTORY_RESET", [T, L], [F("magic", "u32", 0x54455352, "Must be 0x54455352 ('RSET').")], [], True, Q_NEVER,
   "Erases bonds, owner, peers, Wi-Fi slots, event queue. Keeps factory keys.", 0x07),
 C(0x10, "START_WALK", [T, L], [F("walk_id", "u32", 42, "App-generated, idempotent."), F("tether_mode", "u8", 1, "", enum="tether_mode"),
   F("tether_radius_dm", "u8", 50, "", unit="dm", range=[30, 100], default=50)], [], True,
   Q(600, "STOP_WALK with same walk_id cancels a queued START_WALK"), "Starts a walk. Sent to both Torus and Link.", 0x10),
 C(0x11, "STOP_WALK", [T, L], [F("walk_id", "u32", 42, "")],
   [F("duration_s", "u32", 1800, "", unit="s"), F("bolt_count", "u8", 2, ""), F("max_force_n", "u16", 340, "", unit="N"), F("tether_red_count", "u8", 1, "")],
   True, Q(600), "Stops walk, returns walk summary.", 0x11),
 C(0x12, "SET_TETHER", [T, L], [F("radius_dm", "u8", 80, "", unit="dm", range=[30, 100]),
   F("amber_pct", "u8", 80, "Amber threshold as % of radius.", unit="%", range=[50, 95], default=80, assumption="A12"),
   F("mode", "u8", 1, "", enum="tether_mode")], [], True, Q(600, "latest wins"), "Configures off-lead tether. Torus is authoritative; Link mirrors for local alerts.", 0x12),
 C(0x13, "SET_HALO", [T], [F("pattern", "u8", 2, "", enum="halo_pattern"), F("r", "u8", 0xFF, ""), F("g", "u8", 0xA0, ""), F("b", "u8", 0x00, ""),
   F("brightness", "u8", 60, "", unit="%", range=[0, 100]), F("period_ms", "u16", 1500, "", unit="ms", range=[100, 5000]),
   F("duration_s", "u16", 0, "0 = until changed.", unit="s")], [], True, Q(60, "latest wins"), "Overrides Halo. AUTO_STATE returns control to firmware.", 0x13),
 C(0x14, "BUZZ", [T, L], [F("actuator", "u8", 0x01, "Torus: LRA only. Link: LRA and/or piezo.", bitfield="actuator"),
   F("pattern", "u8", 3, "Aevea pattern ID 1-16 (mapped to DRV2605L effects in firmware).", range=[1, 16]),
   F("repeat", "u8", 2, "", range=[1, 10]), F("intensity", "u8", 80, "", unit="%", range=[0, 100])], [], True, Q(5), "One-shot haptic/sound cue.", 0x14),
 C(0x15, "RECALL_ASSIST", [L], [F("action", "u8", 1, "", enum="on_off"), F("recall_id", "u16", 7, "Idempotent."),
   F("cue", "u8", 0x03, "", bitfield="actuator"), F("pattern", "u8", 5, "", range=[1, 16]),
   F("timeout_s", "u8", 30, "", unit="s", range=[1, 120], default=30)], [], True,
   {"queueable": False, "note": "Never queued. If BLE write fails within 2 s, app sends via cloud."}, "Plays recall cue on Link.", 0x15),
 C(0x16, "LOCATE_NOW", [L], [F("request_id", "u16", 9, ""), F("flags", "u8", 0x01, "", bitfield="locate_flags"),
   F("timeout_s", "u8", 90, "", unit="s", range=[10, 180], default=90)], [], True,
   {"queueable": False, "note": "If not connected, app uses cloud path."}, "Requests GNSS fix; result in LOCATION event.", 0x16),
 C(0x17, "LOST_MODE", [L], [F("action", "u8", 1, "", enum="on_off"), F("lost_id", "u32", 0x00001001, "Cloud-issued."),
   F("interval_s", "u16", 15, "Base report interval; firmware slows as battery falls.", unit="s", range=[15, 600], default=15)], [], True,
   {"queueable": False, "note": "Cloud is authoritative; BLE copy sent too when connected."}, "Enters/leaves Lost Mode.", 0x17),
 C(0x18, "SET_HOME_WIFI", [L], [F("slot", "u8", 0, "", range=[0, 3]), F("ssid_len", "u8", 8, "0 clears slot.", range=[0, 32]),
   F("ssid", "bytes", b"AeveaHom", "UTF-8 SSID, not NUL-terminated.", size="var", length_field="ssid_len", max=32)], [], True,
   Q(None, "per slot, latest wins", "Persistent until delivered."), "Stores a home SSID for scan-only home detection.", 0x18),
 C(0x19, "BIND_PEER", [T, L], [F("peer_type", "u8", 2, "", enum="device_type"), F("peer_id", "u64", 0x00A3E70200000456, ""),
   F("peer_pubkey", "bytes", "04" * 64, "Peer P-256 public key X||Y (from peer cert, checked by app and cloud).", size=64)], [], True,
   Q(None, None, "Persistent until delivered."), "Binds Torus and Link to each other; key for peer BLE bond and UWB STS derivation.", 0x19),
 C(0x1A, "UNBIND_PEER", [T, L], [F("peer_id", "u64", 0x00A3E70200000456, "")], [], True, Q(None), "Removes peer.", 0x1A),
 C(0x40, "GET_CERT", [T, L], [F("offset", "u16", 0, ""), F("max_len", "u8", 16, "", range=[1, 238])],
   [F("total_len", "u16", 146, "Size of device_cert struct."), F("offset", "u16", 0, ""),
    F("chunk", "bytes", "CERT16", "Cert bytes.", size="var", max=238)],
   False, Q_NEVER, "Reads device certificate in chunks.", 0x40),
 C(0x41, "AUTH_CHALLENGE", [T, L], [F("app_nonce", "bytes", "A1" * 16, "Random.", size=16)],
   [F("device_nonce", "bytes", "D2" * 16, "Random.", size=16),
    F("signature", "bytes", "5A" * 64, "ECDSA P-256 by device identity key over SHA-256('AEVEA-AUTH'||app_nonce||device_nonce||device_id).", size=64)],
   False, Q_NEVER, "Proves device holds its factory identity key.", 0x41),
 C(0x42, "OWNER_BIND", [T, L], [F("token", "bytes", "", "owner_token struct, purpose=1.", size=98)], [], False, Q_NEVER,
   "Binds device to an Aevea owner account.", 0x42),
 C(0x43, "OWNER_UNBIND", [T, L], [F("token", "bytes", "", "owner_token struct, purpose=2.", size=98)], [], False, Q_NEVER,
   "Releases owner binding (transfer of ownership).", 0x43),
]
for c in COMMANDS:
    if c["name"] == "GET_CERT": c["response"][2]["_ex"] = enc(CERT)[:16].hex()
tok_bind = enc(OWNER_TOKEN)
tok_unbind = enc(OWNER_TOKEN, {"purpose": 2})
assert len(tok_bind) == 98
COMMANDS[-2]["request"][0]["_ex"] = tok_bind.hex()
COMMANDS[-1]["request"][0]["_ex"] = tok_unbind.hex()

MAGCLIP_OPS = {"GET_INFO", "GET_STATUS", "SELF_TEST"}

# ---------------------------------------------------------------- events
def E(code, name, sources, fields, desc, evseq, source=1):
    return dict(code=code, name=name, sources=sources, fields=fields, desc=desc, _evseq=evseq, _source=source)
EVENTS = [
 E(0x01, "BATTERY", [T, L, M], [F("pct", "u8", 72, "", unit="%"), F("mv", "u16", 3870, "", unit="mV"),
   F("charge_state", "u8", 0, "", enum="charge_state"), F("charge_source", "u8", 0, "", enum="charge_source"),
   F("temp_c", "i8", 21, "", unit="degC")], "On 5% step, charge state change, or threshold crossing.", 0x0130),
 E(0x02, "STATE_CHANGED", [T, L], [F("old_activity", "u8", 1, "", enum="activity_state"), F("new_activity", "u8", 2, "", enum="activity_state"),
   F("power_state", "u8", 0, "", enum="power_state"), F("reason", "u8", 2, "", enum="state_change_reason")], "Any activity or power state change.", 0x0131),
 E(0x03, "MAGCLIP_LATCH", [M], [F("latched", "u8", 0, "", range=[0, 1]), F("sensed_by", "u8", 2, "Device that saw the contact change.", enum="device_type"),
   F("magclip_batt_pct", "u8", 64, "0xFF unknown.", unit="%")], "Latch/unlatch sensed through contacts. source=0x03.", 0x0132, source=3),
 E(0x04, "BOLT", [T], [F("walk_id", "u32", 42, ""), F("peak_force_n", "u16", 340, "Estimate (no load cell).", unit="N"),
   F("slip_mm", "u16", 180, "Bolt Brake slip.", unit="mm", range=[0, 500]), F("duration_ms", "u16", 220, "", unit="ms"),
   F("line_out_mm", "u16", 2650, "", unit="mm", range=[0, 3000]), F("flags", "u8", 0x05, "", bitfield="bolt_flags")],
   "Bolt/slip event detected by line Hall/angle sensors.", 0x0133),
 E(0x05, "TETHER", [T, L], [F("level", "u8", 1, "", enum="tether_level"), F("distance_cm", "u16", 690, "", unit="cm"),
   F("radius_dm", "u8", 80, "", unit="dm"), F("walk_id", "u32", 42, "")], "On level change only (continuous values on Range).", 0x0134),
 E(0x06, "LOCATION", [L], [F("request_id", "u16", 9, "0 for Lost Mode periodic."), F("lat_e7", "i32", 515072000, "", unit="deg*1e7"),
   F("lon_e7", "i32", -1276000, "", unit="deg*1e7"), F("acc_m", "u16", 8, "", unit="m"), F("fix_age_s", "u16", 3, "", unit="s"),
   F("source", "u8", 1, "", enum="location_source"), F("sats", "u8", 9, "")], "Locate now result or Lost Mode fix (when BLE connected).", 0x0135, source=2),
 E(0x07, "RECALL_STATUS", [L], [F("recall_id", "u16", 7, ""), F("status", "u8", 1, "", enum="recall_status"),
   F("path", "u8", 2, "", enum="path")], "Recall Assist progress.", 0x0136, source=2),
 E(0x08, "LOST_MODE_STATUS", [L], [F("active", "u8", 1, "", range=[0, 1]), F("lost_id", "u32", 0x00001001, ""),
   F("interval_s", "u16", 15, "Current effective interval.", unit="s"), F("path", "u8", 3, "Path the change arrived on.", enum="path")],
   "Lost Mode entered/left or interval changed.", 0x0137, source=2),
 E(0x09, "SELF_TEST_RESULT", [T, L, M], [F("tests_run", "u16", 0x003F, "", bitfield="self_test"),
   F("tests_failed", "u16", 0x0000, "", bitfield="self_test"), F("detail", "u8", 0x00, "First failure error code.", enum="error_code")], "", 0x0138),
 E(0x0A, "FAULT", [T, L], [F("error_code", "u8", 0xFF, "", enum="error_code"), F("module", "u8", 2, "self_test bit index of failing block."),
   F("detail", "u16", 0x0011, "Vendor detail for Fiddlie.")], "Runtime fault.", 0x0139),
 E(0x0B, "QUEUE_OVERFLOW", [T, L], [F("dropped", "u16", 12, ""), F("oldest_ev_seq", "u16", 0x0100, "")], "Oldest events dropped while offline.", 0x013A),
]

# ---------------------------------------------------------------- DFU
DFU_OPS = [
 dict(op=0x01, name="DFU_START", request=[F("image_type", "u8", 0, "", enum="dfu_image_type"), F("image_size", "u32", 196608, "", unit="B"),
   F("fw_major", "u8", 0, ""), F("fw_minor", "u8", 4, ""), F("fw_patch", "u8", 0, ""), F("fw_build", "u16", 130, ""),
   F("sha256", "bytes", "3F" * 32, "SHA-256 of whole signed image.", size=32)],
   response=[F("resume_offset", "u32", 0, "Non-zero if same sha256 partially received."), F("max_chunk", "u16", 240, "Max data bytes per DFU_DATA write.")]),
 dict(op=0x03, name="DFU_GET_OFFSET", request=[], response=[F("offset", "u32", 4096, ""), F("crc32", "u32", 0x1C291CA3, "CRC-32/ISO-HDLC of bytes 0..offset-1.")]),
 dict(op=0x04, name="DFU_VERIFY", request=[], response=[]),
 dict(op=0x05, name="DFU_APPLY", request=[], response=[]),
 dict(op=0x06, name="DFU_ABORT", request=[], response=[]),
 dict(op=0x07, name="DFU_CONFIRM", request=[], response=[]),
 dict(op=0x08, name="DFU_STATUS", request=[], response=[F("dfu_state", "u8", 1, "", enum="dfu_state"), F("image_type", "u8", 0, "", enum="dfu_image_type"),
   F("offset", "u32", 4096, ""), F("pend_major", "u8", 0, ""), F("pend_minor", "u8", 4, ""), F("pend_patch", "u8", 0, ""), F("pend_build", "u16", 130, "")]),
]
DFU_DATA = [F("offset", "u32", 4096, "Byte offset in image."), F("data", "bytes", "00112233445566778899AABBCCDDEEFF", "<= max_chunk.", size="var", max=240)]

# ---------------------------------------------------------------- services
def CH(short, name, props, sec, payload, desc):
    return {"name": name, "short": f"0x{short:04X}", "uuid": uuid(short), "properties": props, "security": sec, "payload": payload, "desc": desc}
ENC = "encrypted_authenticated_lesc"
SERVICES = [
 {"name": "Device Information (SIG)", "uuid": "0000180A-0000-1000-8000-00805F9B34FB", "short": "0x180A", "devices": [T, L],
  "characteristics": [
   {"name": "Manufacturer Name", "short": "0x2A29", "uuid": "00002A29-0000-1000-8000-00805F9B34FB", "properties": ["read"], "security": "open", "payload": "utf8", "desc": "'Aevea'"},
   {"name": "Model Number", "short": "0x2A24", "uuid": "00002A24-0000-1000-8000-00805F9B34FB", "properties": ["read"], "security": "open", "payload": "utf8", "desc": "'Torus' / 'Link'"},
   {"name": "Serial Number", "short": "0x2A25", "uuid": "00002A25-0000-1000-8000-00805F9B34FB", "properties": ["read"], "security": ENC, "payload": "utf8", "desc": "Encrypted only (privacy)."},
   {"name": "Hardware Revision", "short": "0x2A27", "uuid": "00002A27-0000-1000-8000-00805F9B34FB", "properties": ["read"], "security": "open", "payload": "utf8", "desc": ""},
   {"name": "Firmware Revision", "short": "0x2A26", "uuid": "00002A26-0000-1000-8000-00805F9B34FB", "properties": ["read"], "security": "open", "payload": "utf8", "desc": "e.g. '0.3.1+112'"}]},
 {"name": "Battery (SIG)", "uuid": "0000180F-0000-1000-8000-00805F9B34FB", "short": "0x180F", "devices": [T, L],
  "characteristics": [{"name": "Battery Level", "short": "0x2A19", "uuid": "00002A19-0000-1000-8000-00805F9B34FB", "properties": ["read", "notify"], "security": ENC, "payload": "u8 percent", "desc": "For OS battery widgets. App uses BATTERY event."}]},
 {"name": "Aevea Identity", "uuid": uuid(0x0200), "short": "0x0200", "devices": [T, L], "characteristics": [
   CH(0x0201, "Identity", ["read"], "open", "struct:identity", "Readable before pairing; used to fetch the passkey from cloud.")]},
 {"name": "Aevea Control", "uuid": uuid(0x0100), "short": "0x0100", "devices": [T, L], "characteristics": [
   CH(0x0101, "Command", ["write"], ENC, "frame:command", "Write with response. One command per write."),
   CH(0x0102, "Response", ["indicate"], ENC, "frame:response", "Exactly one response per command."),
   CH(0x0103, "Event", ["indicate"], ENC, "frame:event", "Reliable, queued events."),
   CH(0x0104, "Status", ["read", "notify"], ENC, "struct:status", "Notifies on any field change, max 1 Hz."),
   CH(0x0105, "Range", ["notify"], ENC, "struct:range", "Live distance: 4 Hz OFF_LEAD, 1 Hz ON_LEAD, off otherwise.")]},
 {"name": "Aevea DFU", "uuid": uuid(0x0300), "short": "0x0300", "devices": [T, L], "characteristics": [
   CH(0x0301, "DFU Control", ["write", "indicate"], ENC, "frame:dfu_control", "Request: op u8 + payload. Indication: op u8, status u8, payload."),
   CH(0x0302, "DFU Data", ["write_without_response"], ENC, "frame:dfu_data", "Image chunks.")]},
]

ADV = {"interval_ms": {"pairing_window": 100, "bonded_idle": 1000, "walk_disconnected_first_30s": 100, "walk_disconnected": 500, "lost_mode_link": 1000},
       "pairing_window_s": 300, "phy": ["LE_1M legacy", "LE_Coded_S8 extended (Link, when OFF_LEAD/AWAY/LOST)"],
       "service_uuid": uuid(0x0200),
       "manufacturer_data": [F("company_id", "u16", 0xFFFF, "0xFFFF test ID until Aevea has a SIG company ID."), F("adv_ver", "u8", 1, ""),
                             F("device_type", "u8", 1, "", enum="device_type"), F("activity_state", "u8", 0, "", enum="activity_state"),
                             F("flags", "u8", 0x01, "", bitfield="adv_flags")],
       "address": "Resolvable private address after bonding (IRK shared at bonding)."}

CONN = {"min_att_mtu": 131, "requested_att_mtu": 247, "data_length_bytes": 251,
  "profiles": [
   {"name": "ACTIVE", "use": "pairing, provisioning, DFU", "interval_ms": [15, 30], "latency": 0, "timeout_ms": 4000, "phy": "2M preferred"},
   {"name": "WALK", "use": "ON_LEAD / OFF_LEAD", "interval_ms": [30, 60], "latency": 3, "timeout_ms": 4000, "phy": "1M; Link may switch to Coded S8"},
   {"name": "IDLE", "use": "HOME/AWAY while connected", "interval_ms": [480, 500], "latency": 2, "timeout_ms": 6000, "phy": "1M"}],
  "note": "Peripheral requests via L2CAP connection parameter update; phone OS may override. Profiles chosen to satisfy Apple Accessory Design Guidelines formulas (A8)."}

STATES = {
 "activity": ["HOME", "ON_LEAD", "OFF_LEAD_TETHER", "AWAY", "LOST"], "power_overlay": ["NORMAL", "CHARGING", "LOW_BATTERY"],
 "thresholds": {"low_battery_pct": 15, "critical_pct": 5, "dfu_min_pct": 30, "link_charge_from_magclip_below_pct": 80},
 "lost_mode_interval_s": [{"battery_min_pct": 50, "interval_s": 15}, {"battery_min_pct": 20, "interval_s": 30},
                          {"battery_min_pct": 10, "interval_s": 60}, {"battery_min_pct": 0, "interval_s": 300}],
 "timers_s": {"away_confirm": 300, "peer_and_phone_lost_off_lead": 60},
 "transitions": [
  {"from": "HOME", "to": "ON_LEAD", "trigger": "START_WALK, or MAGCLIP latched with peer linked", "devices": [T, L]},
  {"from": "ON_LEAD", "to": "OFF_LEAD_TETHER", "trigger": "MagClip unlatched while walk active", "guard": "tether_mode=AUTO_ON_UNCLIP arms tether", "devices": [T, L]},
  {"from": "OFF_LEAD_TETHER", "to": "ON_LEAD", "trigger": "MagClip latched", "devices": [T, L]},
  {"from": "ON_LEAD|OFF_LEAD_TETHER", "to": "HOME", "trigger": "STOP_WALK, or home Wi-Fi seen and no motion 10 min", "devices": [T, L]},
  {"from": "OFF_LEAD_TETHER", "to": "AWAY", "trigger": "Peer (Torus) AND phone BLE lost for 60 s", "devices": [L]},
  {"from": "HOME", "to": "AWAY", "trigger": "Home Wi-Fi not seen AND peer not seen AND phone not seen for 300 s, motion detected", "devices": [L]},
  {"from": "AWAY", "to": "HOME", "trigger": "Home Wi-Fi seen, or peer/phone regained", "devices": [L]},
  {"from": "*", "to": "LOST", "trigger": "LOST_MODE on (BLE or cloud). Never automatic.", "devices": [L]},
  {"from": "LOST", "to": "HOME|AWAY", "trigger": "LOST_MODE off; re-evaluate home/away", "devices": [L]},
  {"from": "power:NORMAL|LOW_BATTERY", "to": "power:CHARGING", "trigger": "Charger detected (USB-C, dock or MagClip contacts)", "devices": [T, L, M]},
  {"from": "power:CHARGING", "to": "power:NORMAL|LOW_BATTERY", "trigger": "Charger removed", "devices": [T, L, M]},
  {"from": "power:NORMAL", "to": "power:LOW_BATTERY", "trigger": "battery <= 15%", "devices": [T, L]},
  {"from": "power:LOW_BATTERY", "to": "power:NORMAL", "trigger": "battery >= 20% (hysteresis)", "devices": [T, L]}],
 "active": {
  "TORUS": {
   "HOME": {"ble": "adv 1000 ms / IDLE conn", "uwb": "off", "line_sensor": "off (wake on drum movement)", "halo": "off", "lra": "on demand"},
   "ON_LEAD": {"ble": "WALK conn + peer link", "uwb": "off (line sensor gives distance up to 3 m)", "line_sensor": "on", "halo": "state colour", "lra": "on demand"},
   "OFF_LEAD_TETHER": {"ble": "WALK conn + peer link", "uwb": "on, ~4 Hz ranging with Link", "line_sensor": "on (retracted)", "halo": "tether level colour", "lra": "amber/red alerts"},
   "CHARGING": {"ble": "adv 1000 ms", "uwb": "off unless walk", "line_sensor": "off", "halo": "charge indication", "lra": "off"},
   "LOW_BATTERY": {"ble": "as state, adv 2000 ms", "uwb": "as state, 2 Hz", "line_sensor": "as state", "halo": "dimmed, low-batt cue", "lra": "as state"}},
  "LINK": {
   "HOME": {"ble": "adv 1000 ms", "uwb": "off", "lte_m": "PSM/eDRX command check (~80 s)", "gnss": "off", "wifi_scan": "motion-gated", "accel": "on (~1 uA)"},
   "ON_LEAD": {"ble": "WALK conn + peer link", "uwb": "off", "lte_m": "eDRX", "gnss": "off", "wifi_scan": "off", "accel": "on"},
   "OFF_LEAD_TETHER": {"ble": "WALK conn + peer link, Coded PHY ready", "uwb": "on, ~4 Hz with Torus", "lte_m": "eDRX; fast paging window on Recall fallback", "gnss": "off", "wifi_scan": "off", "accel": "on"},
   "AWAY": {"ble": "adv 1000 ms 1M + Coded", "uwb": "off", "lte_m": "eDRX", "gnss": "on (periodic, motion-gated)", "wifi_scan": "periodic, to detect home", "accel": "on"},
   "LOST": {"ble": "adv 1000 ms 1M + Coded", "uwb": "off", "lte_m": "active, reports each interval", "gnss": "on per interval", "wifi_scan": "off", "accel": "on"},
   "CHARGING": {"ble": "as activity", "uwb": "as activity", "lte_m": "as activity", "gnss": "as activity", "wifi_scan": "as activity", "accel": "on"},
   "LOW_BATTERY": {"ble": "adv 2000 ms", "uwb": "2 Hz if OFF_LEAD", "lte_m": "eDRX", "gnss": "LOST/Locate only", "wifi_scan": "reduced", "accel": "on"}},
  "MAGCLIP": {"note": "No radio in context. Passive except contact sensing and charging. Lock is mechanical."}},
}

ASSUMPTIONS = [
 ("A1", "Phone connects directly to Torus and to Link (both have BLE). MagClip has no radio; its data is proxied by Torus."),
 ("A2", "On Link, BLE terminates on the DWM3001C nRF52833, which relays to the nRF9151 over an internal bus. Inferred from chip list."),
 ("A3", "Torus-Link peer link (BLE bond + UWB ranging) is Fiddlie-owned firmware and not specified here; only its results are exposed."),
 ("A4", "Neither Torus nor Link has a display, keypad or button (none in context), so numeric comparison is not possible."),
 ("A5", "Pairing window opens for 300 s on: first boot, USB-C plug-in (Torus), MagClip latch to Link (Link)."),
 ("A6", "Per-device pairing secret K_pair is injected at factory and also held by the cloud registry."),
 ("A7", "Bootloader is MCUboot-style: two slots, ECDSA P-256 signature, test boot then confirm, security counter."),
 ("A8", "Connection profiles follow Apple Accessory Design Guidelines limits; re-check against the current edition."),
 ("A9", "Thresholds (15% low, 5% critical, 30% DFU min, 300 s away timer, 60 s off-lead loss timer) are starting values."),
 ("A10", "Event queue holds >= 256 events per device in RAM+flash; drops oldest on overflow."),
 ("A11", "Bolt force is estimated from slip and drum deceleration; there is no load cell in context. Slip implies ~300 N."),
 ("A12", "Tether amber threshold is a % of radius (default 80%)."),
 ("A13", "Link enters LTE-M fast paging (1-2 s, ~60 s) when unclipped and it loses both Torus and phone BLE, or when Torus reports tether RED, so a cloud Recall can land."),
 ("A14", "Device certificate is a compact 146-byte format, not X.509."),
 ("A15", "Max 4 phone bonds per device."),
 ("A16", "Range sample rates: 4 Hz OFF_LEAD, 1 Hz ON_LEAD."),
 ("A17", "UWB is off ON_LEAD; the line sensor covers distance up to 3 m."),
 ("A18", "Base UUID AE7E0000-7A1C-4E5A-9D2B-AE7EA0000000 is a placeholder; Aevea must generate a random v4 base once before production and never change it."),
]

OPEN_QUESTIONS = [
 "Does Torus or Link have any button, touch area or capacitive input? It would enable numeric comparison and a manual pairing window.",
 "How does Torus reach MagClip while the clip is on the collar (conductors in the line, relay via Link, or only when docked)? Who senses latch: MagClip MCU, Link, or both?",
 "Does MagClip have an MCU with updatable firmware? If yes, how is it updated through Torus?",
 "Key storage on nRF52833 (no CryptoCell/KMU): is a secure element planned, or protected flash + APPROTECT? Same question for the DWM3001C inside Link.",
 "UWB secure ranging: which STS mode (FiRa SP3 static/dynamic STS?) and how should the STS key be derived from the BIND_PEER ECDH secret?",
 "Which side is UWB initiator/controller, and what ranging rate is affordable within the 7+ day (Link) and 9-13 day (Torus) battery targets?",
 "Bootloader choice: MCUboot + MCUmgr/SMP (which would replace the Aevea DFU service) or custom? Signature algorithm and key ceremony?",
 "Is nRF9151 modem firmware update over BLE in scope, or only over LTE-M (FOTA)? Expected image sizes for each image type?",
 "Recall Assist fallback trigger: what exactly wakes LTE-M fast paging (A13)? Is 1-2 s paging achievable with the chosen network/eDRX settings?",
 "Coded PHY: confirm phone-side support (iOS exposure is uncertain) and Link TX power; else Recall falls back to 1M + cloud.",
 "Can Torus derive a usable force estimate from Hall/angle data (A11), and what accuracy should the app show?",
 "Flash budget for event queue (A10), dual-slot images and bonds on each MCU.",
 "Does Torus need its own clock source or is SET_TIME on connect enough for event timestamps?",
 "Bluetooth SIG company ID and Bluetooth qualification (QDID) plan; EN 18031 and PSTI requirements on default passwords/pairing.",
]

# ---------------------------------------------------------------- build examples
def payload_size(fields):
    if any(f["size"] == "var" for f in fields): return "var"
    return sum(f["size"] for f in fields)

def cmd_examples(c):
    req = enc(c["request"]) if c["request"] else b""
    hdr = enc(CMD_HDR, {"seq": c["_seq"], "target": c["_target"], "opcode": c["opcode"], "len": len(req)})
    rp = enc(c["response"]) if c["response"] else b""
    rh = enc(RSP_HDR, {"seq": c["_seq"], "target": c["_target"], "opcode": c["opcode"], "status": 0, "len": len(rp)})
    return hdr + req, rh + rp

def evt_example(e):
    p = enc(e["fields"])
    return enc(EVT_HDR, {"ev_seq": e["_evseq"], "source": e["_source"], "code": e["code"], "len": len(p)}) + p

js_cmds = []
for c in COMMANDS:
    rq, rs = cmd_examples(c)
    c["_rq"], c["_rs"] = rq, rs
    assert len(rq) - 5 <= 128, c["name"]
    js_cmds.append({"opcode": f"0x{c['opcode']:02X}", "name": c["name"], "devices": c["devices"],
        "magclip_target": c["name"] in MAGCLIP_OPS, "owner_auth_required": c["owner_auth"], "desc": c["desc"],
        "request": clean(c["request"]), "request_size": payload_size(c["request"]),
        "response": (["struct:status", "struct:magclip_status (target=MagClip)"] if c["name"] == "GET_STATUS" else
                     (["struct:info"] if c["name"] == "GET_INFO" else clean(c["response"]))),
        "response_size": payload_size(c["response"]), "queue": c["queue"],
        "example": {"request_hex": hx(rq), "response_hex": hx(rs)}})
# MagClip example for GET_STATUS
mc_rq = enc(CMD_HDR, {"seq": 0x30, "target": 3, "opcode": 0x03, "len": 0})
mcp = enc(MAGCLIP_STATUS)
mc_rs = enc(RSP_HDR, {"seq": 0x30, "target": 3, "opcode": 0x03, "status": 0, "len": len(mcp)}) + mcp
for j in js_cmds:
    if j["name"] == "GET_STATUS":
        j["example"]["magclip_request_hex"] = hx(mc_rq); j["example"]["magclip_response_hex"] = hx(mc_rs)
err_rq = enc(CMD_HDR, {"seq": 0x31, "opcode": 0x12, "len": 3}) + bytes([0x78, 80, 1])
err_rs = enc(RSP_HDR, {"seq": 0x31, "opcode": 0x12, "status": 0x03, "len": 0})

js_evts = []
for e in EVENTS:
    e["_hex"] = evt_example(e)
    js_evts.append({"code": f"0x{e['code']:02X}", "name": e["name"], "sources": e["sources"], "desc": e["desc"],
                    "fields": clean(e["fields"]), "size": payload_size(e["fields"]), "example_hex": hx(e["_hex"])})

js_dfu = []
for d in DFU_OPS:
    rq = bytes([d["op"]]) + (enc(d["request"]) if d["request"] else b"")
    rs = bytes([d["op"], 0]) + (enc(d["response"]) if d["response"] else b"")
    d["_rq"], d["_rs"] = rq, rs
    js_dfu.append({"op": f"0x{d['op']:02X}", "name": d["name"], "request": clean(d["request"]), "response": clean(d["response"]),
                   "example": {"request_hex": hx(rq), "indication_hex": hx(rs)}})
dfu_data_ex = enc(DFU_DATA)

struct_ex = {k: hx(enc(v)) for k, v in STRUCTS.items()}
adv_ex = enc(ADV["manufacturer_data"])

doc = {
 "$comment": "Machine-readable Aevea BLE protocol. Generated together with docs/device-protocol.md; keep in sync. DRAFT.",
 "protocol": "aevea-ble", "version": {"major": 1, "minor": 0}, "status": "draft", "date": "2026-11-05",
 "endianness": "little", "base_uuid": BASE, "uuid_template": "AE7E{short16}-7A1C-4E5A-9D2B-AE7EA0000000", "base_uuid_is_placeholder": True,
 "types": {k: {"size": v[1], "signed": k.startswith("i")} for k, v in TYPES.items()} | {"bytes": {"size": "field.size or var (length_field or rest of frame)"}},
 "assumptions": [{"id": i, "text": t} for i, t in ASSUMPTIONS],
 "advertising": ADV | {"manufacturer_data": clean(ADV["manufacturer_data"]), "manufacturer_data_example_hex": hx(adv_ex)},
 "connection": CONN,
 "services": SERVICES,
 "frames": {"command": {"characteristic": "0x0101", "header": clean(CMD_HDR), "header_size": 5},
            "response": {"characteristic": "0x0102", "header": clean(RSP_HDR), "header_size": 6},
            "event": {"characteristic": "0x0103", "header": clean(EVT_HDR), "header_size": 10},
            "dfu_control_request": {"characteristic": "0x0301", "header": [{"name": "op", "type": "u8", "size": 1}]},
            "dfu_control_indication": {"characteristic": "0x0301", "header": [{"name": "op", "type": "u8", "size": 1}, {"name": "status", "type": "u8", "size": 1, "enum": "error_code"}]},
            "dfu_data": {"characteristic": "0x0302", "fields": clean(DFU_DATA)}},
 "structs": {k: {"fields": clean(v), "size": payload_size(v), "example_hex": struct_ex[k]} for k, v in STRUCTS.items()},
 "enums": ENUMS, "bitfields": BITFIELDS,
 "error_codes": [{"code": c, "name": n, "desc": d} for c, n, d in ERRORS],
 "commands": js_cmds,
 "error_example": {"desc": "SET_TETHER radius 12.0 m rejected", "request_hex": hx(err_rq), "response_hex": hx(err_rs)},
 "events": js_evts,
 "dfu": {"service": "0x0300", "ops": js_dfu, "data_example_hex": hx(dfu_data_ex),
         "chunk_size": "min(max_chunk, ATT_MTU - 3 - 4)", "offset_check_every_bytes": 4096,
         "confirm_deadline_s": 600, "max_unconfirmed_boots": 3, "min_battery_pct": 30},
 "state_machine": STATES,
 "offline_queue": {"device_event_queue_min": 256, "replay": "GET_EVENTS from last ACKed ev_seq+1, then ACK_EVENTS",
                   "app_commands": {c["name"]: c["queue"] for c in COMMANDS}},
 "open_questions": OPEN_QUESTIONS,
}
with open(OUT_JSON, "w") as f:
    json.dump(doc, f, indent=2, ensure_ascii=False); f.write("\n")

# ---------------------------------------------------------------- markdown generation
def ftable(fields, base=0):
    rows = ["| Off | Field | Type | Notes |", "|---|---|---|---|"]
    off = base
    for f in fields:
        t = f["type"] if f["type"] in TYPES else (f"bytes[{f['size']}]" if f["size"] != "var" else f"bytes[<={f.get('max','')}]")
        notes = []
        if f.get("unit"): notes.append(f["unit"])
        if f.get("range"): notes.append(f"{f['range'][0]}-{f['range'][1]}")
        if f.get("default") is not None: notes.append(f"default {f['default']}")
        if f.get("enum"): notes.append(f"enum `{f['enum']}`")
        if f.get("bitfield"): notes.append(f"bits `{f['bitfield']}`")
        if f.get("assumption"): notes.append(f"[{f['assumption']}]")
        if f["desc"]: notes.append(f["desc"])
        rows.append(f"| {off if isinstance(off, int) else '-'} | `{f['name']}` | {t} | {'; '.join(notes)} |")
        off = off + f["size"] if isinstance(off, int) and f["size"] != "var" else "-"
    return "\n".join(rows)

gen = {}
r = ["| Service / Characteristic | UUID | Props | Security | Payload |", "|---|---|---|---|---|"]
for s in SERVICES:
    r.append(f"| **{s['name']}** ({', '.join(s['devices'])}) | `{s['uuid']}` | | | |")
    for c in s["characteristics"]:
        r.append(f"| {c['short']} {c['name']} | `{c['uuid']}` | {', '.join(c['properties'])} | {'open' if c['security']=='open' else 'LESC encrypted'} | {c['payload']}. {c['desc']} |")
gen["uuids"] = "\n".join(r)

gen["frames"] = ("**Command** (write 0x0101), 5 B header + payload:\n\n" + ftable(CMD_HDR) +
  "\n\n**Response** (indicate 0x0102), 6 B header + payload:\n\n" + ftable(RSP_HDR) +
  "\n\n**Event** (indicate 0x0103), 10 B header + payload:\n\n" + ftable(EVT_HDR))

gen["structs"] = "\n\n".join(f"**`{k}`** ({payload_size(v)} B)\n\n{ftable(v)}\n\nExample: `{struct_ex[k]}`" for k, v in STRUCTS.items())

out = []
for c in COMMANDS:
    devs = ", ".join(c["devices"]) + ("" if c["name"] not in MAGCLIP_OPS else " (MagClip via target 0x03)")
    out.append(f"#### 0x{c['opcode']:02X} {c['name']}\n{c['desc']} Devices: {devs}. Owner bound: {'yes' if c['owner_auth'] else 'no'}.\n")
    if c["request"]: out.append("Request payload:\n\n" + ftable(c["request"]) + "\n")
    else: out.append("Request payload: none.\n")
    if c["name"] == "GET_INFO": out.append("Response payload: `info` struct.\n")
    elif c["name"] == "GET_STATUS": out.append("Response payload: `status` struct (or `magclip_status` when target=0x03).\n")
    elif c["response"]: out.append("Response payload:\n\n" + ftable(c["response"]) + "\n")
    else: out.append("Response payload: none.\n")
    ex = f"```\nreq  {hx(c['_rq'])}\nrsp  {hx(c['_rs'])}\n"
    if c["name"] == "GET_STATUS": ex += f"req  {hx(mc_rq)}   (MagClip via Torus)\nrsp  {hx(mc_rs)}\n"
    out.append(ex + "```\n")
gen["commands"] = "\n".join(out)
gen["error_example"] = f"```\nreq  {hx(err_rq)}\nrsp  {hx(err_rs)}\n```"

out = []
for e in EVENTS:
    out.append(f"#### 0x{e['code']:02X} {e['name']}\n{e['desc']} Sources: {', '.join(e['sources'])}.\n\n{ftable(e['fields'])}\n\n```\n{hx(e['_hex'])}\n```\n")
gen["events"] = "\n".join(out)

r = ["| Code | Name | Meaning |", "|---|---|---|"] + [f"| {c} | `{n}` | {d} |" for c, n, d in ERRORS]
gen["errors"] = "\n".join(r)

out = []
for d in DFU_OPS:
    out.append(f"#### 0x{d['op']:02X} {d['name']}\n")
    if d["request"]: out.append("Request (after op byte):\n\n" + ftable(d["request"], 1) + "\n")
    if d["response"]: out.append("Indication (after op, status):\n\n" + ftable(d["response"], 2) + "\n")
    out.append(f"```\nreq  {hx(d['_rq'])}\nind  {hx(d['_rs'])}\n```\n")
out.append("#### DFU_DATA (0x0302, write without response)\n\n" + ftable(DFU_DATA) + f"\n\n```\n{hx(dfu_data_ex)}\n```\n")
gen["dfu"] = "\n".join(out)

gen["enums"] = "\n".join(f"- `{k}`: " + ", ".join(f"{c} {n}" for c, n in v.items()) for k, v in ENUMS.items() if k != "error_code") + "\n\n" + \
               "\n".join(f"- bits `{k}`: " + ", ".join(f"b{b} {n}" for b, n in v.items()) for k, v in BITFIELDS.items())
gen["adv"] = ftable(ADV["manufacturer_data"]) + f"\n\nExample (AD type 0xFF data): `{hx(adv_ex)}`"

r = ["| From | To | Trigger | Devices |", "|---|---|---|---|"] + \
    [f"| {t['from']} | {t['to']} | {t['trigger']}{(' Guard: ' + t['guard']) if t.get('guard') else ''} | {', '.join(t['devices'])} |" for t in STATES["transitions"]]
gen["transitions"] = "\n".join(r)
def radio_table(dev):
    st = STATES["active"][dev]; cols = list(next(iter(st.values())).keys())
    rr = ["| State | " + " | ".join(cols) + " |", "|---" * (len(cols) + 1) + "|"]
    for s, v in st.items(): rr.append(f"| {s} | " + " | ".join(v[c] for c in cols) + " |")
    return "\n".join(rr)
gen["radios"] = "**Torus**\n\n" + radio_table("TORUS") + "\n\n**Link**\n\n" + radio_table("LINK") + "\n\n**MagClip**: " + STATES["active"]["MAGCLIP"]["note"]

r = ["| Command | Queue offline? | TTL | Rule |", "|---|---|---|---|"]
for c in COMMANDS:
    q = c["queue"]
    r.append(f"| {c['name']} | {'yes' if q['queueable'] else 'no'} | {q.get('ttl_s') if q.get('ttl_s') else ('none' if q['queueable'] else '-')} s | {'; '.join(x for x in [q.get('coalesce'), q.get('note')] if x)} |".replace("| none s |", "| persistent |").replace("| - s |", "| - |"))
gen["queue"] = "\n".join(r)
gen["conn"] = "\n".join(["| Profile | Use | Interval ms | Latency | Timeout ms | PHY |", "|---|---|---|---|---|---|"] +
    [f"| {p['name']} | {p['use']} | {p['interval_ms'][0]}-{p['interval_ms'][1]} | {p['latency']} | {p['timeout_ms']} | {p['phy']} |" for p in CONN["profiles"]])
gen["assumptions"] = "\n".join(f"- **{i}** {t}" for i, t in ASSUMPTIONS)
gen["open"] = "\n".join(f"{n}. {q}" for n, q in enumerate(OPEN_QUESTIONS, 1))

tpl = open(TEMPLATE).read()
def sub(m):
    return gen[m.group(1)]
md = re.sub(r"<!-- GEN:(\w+) -->", sub, tpl)
assert "GEN:" not in md
open(OUT_MD, "w").write(md)
print("ok", len(md), "chars md;", len(json.dumps(doc)), "chars json")
