# Aevea device BLE protocol (v1.0, DRAFT)

Phone app <-> Torus and Link over Bluetooth LE. MagClip is reached through Torus. Machine-readable twin: [`protocol.json`](protocol.json) (same version; tables and hex below are generated from the same source, so they must match).

Status: draft for review with Fiddlie (firmware owner). Every value marked **[Ax]** is an assumption listed in section 15. Hardware is limited to what `context.md` lists.

## 1. Conventions

- All multi-byte integers are **little-endian**. Types: `u8 u16 u32 u64 i8 i16 i32 bytes[n]`.
- Hex examples are on-air characteristic values, byte by byte.
- Sentinels: `0xFF` (u8) / `0xFFFF` (u16) = unknown, `127` (i8 RSSI) = unknown.
- Example timestamp: Unix 1793880000 (0x6AEC6FC0, bytes `C0 6F EC 6A`) = 2026-11-05 12:00:00 UTC.
- Parsers **must** ignore trailing bytes beyond the fields they know and unknown event codes (forward compatibility, section 13).

## 2. Topology

```
Phone app ──BLE──> Torus ──(contacts / peer link, see Q2)──> MagClip
     │               │
     └──BLE──> Link <┘  Torus-Link peer link: BLE bond + UWB ranging (Fiddlie-owned) [A3]
                 │
                 └── LTE-M ── Cloud (Lost Mode, Locate now, Recall fallback)
```

- The phone holds two independent bonds, one to Torus and one to Link **[A1]**. MagClip has no radio in context; Torus proxies it with `target = 0x03` **[A1]**.
- On Link, BLE terminates on the DWM3001C's nRF52833; commands for GNSS/LTE-M/Wi-Fi are relayed to the nRF9151 **[A2]**.
- The Torus-Link peer link is out of scope; the app only sees its results (Range, TETHER, peer flags) **[A3]**.

## 3. GATT services and characteristics

Aevea base UUID (placeholder, **[A18]**): `AE7E0000-7A1C-4E5A-9D2B-AE7EA0000000`. A 16-bit short ID replaces bytes 3-4: `AE7Exxxx-7A1C-4E5A-9D2B-AE7EA0000000`.

| Service / Characteristic | UUID | Props | Security | Payload |
|---|---|---|---|---|
| **Device Information (SIG)** (TORUS, LINK) | `0000180A-0000-1000-8000-00805F9B34FB` | | | |
| 0x2A29 Manufacturer Name | `00002A29-0000-1000-8000-00805F9B34FB` | read | open | utf8. 'Aevea' |
| 0x2A24 Model Number | `00002A24-0000-1000-8000-00805F9B34FB` | read | open | utf8. 'Torus' / 'Link' |
| 0x2A25 Serial Number | `00002A25-0000-1000-8000-00805F9B34FB` | read | LESC encrypted | utf8. Encrypted only (privacy). |
| 0x2A27 Hardware Revision | `00002A27-0000-1000-8000-00805F9B34FB` | read | open | utf8.  |
| 0x2A26 Firmware Revision | `00002A26-0000-1000-8000-00805F9B34FB` | read | open | utf8. e.g. '0.3.1+112' |
| **Battery (SIG)** (TORUS, LINK) | `0000180F-0000-1000-8000-00805F9B34FB` | | | |
| 0x2A19 Battery Level | `00002A19-0000-1000-8000-00805F9B34FB` | read, notify | LESC encrypted | u8 percent. For OS battery widgets. App uses BATTERY event. |
| **Aevea Identity** (TORUS, LINK) | `AE7E0200-7A1C-4E5A-9D2B-AE7EA0000000` | | | |
| 0x0201 Identity | `AE7E0201-7A1C-4E5A-9D2B-AE7EA0000000` | read | open | struct:identity. Readable before pairing; used to fetch the passkey from cloud. |
| **Aevea Control** (TORUS, LINK) | `AE7E0100-7A1C-4E5A-9D2B-AE7EA0000000` | | | |
| 0x0101 Command | `AE7E0101-7A1C-4E5A-9D2B-AE7EA0000000` | write | LESC encrypted | frame:command. Write with response. One command per write. |
| 0x0102 Response | `AE7E0102-7A1C-4E5A-9D2B-AE7EA0000000` | indicate | LESC encrypted | frame:response. Exactly one response per command. |
| 0x0103 Event | `AE7E0103-7A1C-4E5A-9D2B-AE7EA0000000` | indicate | LESC encrypted | frame:event. Reliable, queued events. |
| 0x0104 Status | `AE7E0104-7A1C-4E5A-9D2B-AE7EA0000000` | read, notify | LESC encrypted | struct:status. Notifies on any field change, max 1 Hz. |
| 0x0105 Range | `AE7E0105-7A1C-4E5A-9D2B-AE7EA0000000` | notify | LESC encrypted | struct:range. Live distance: 4 Hz OFF_LEAD, 1 Hz ON_LEAD, off otherwise. |
| **Aevea DFU** (TORUS, LINK) | `AE7E0300-7A1C-4E5A-9D2B-AE7EA0000000` | | | |
| 0x0301 DFU Control | `AE7E0301-7A1C-4E5A-9D2B-AE7EA0000000` | write, indicate | LESC encrypted | frame:dfu_control. Request: op u8 + payload. Indication: op u8, status u8, payload. |
| 0x0302 DFU Data | `AE7E0302-7A1C-4E5A-9D2B-AE7EA0000000` | write_without_response | LESC encrypted | frame:dfu_data. Image chunks. |

Rules:
- "LESC encrypted" = security mode 1 level 4 (authenticated LE Secure Connections). Unencrypted access returns ATT error Insufficient Authentication.
- Command characteristic uses Write **with** response; one frame per write; no long writes.
- The app must enable indications on Response and Event before its first command.

## 4. Frames

**Command** (write 0x0101), 5 B header + payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Protocol major version (0x01). |
| 1 | `seq` | u8 | App-chosen sequence, echoed in response. Wraps. |
| 2 | `target` | u8 | enum `target`; 0x00 self, 0x03 MagClip via Torus. |
| 3 | `opcode` | u8 | Command opcode. |
| 4 | `len` | u8 | Payload length in bytes. |

**Response** (indicate 0x0102), 6 B header + payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Protocol major version. |
| 1 | `seq` | u8 | Echo of command seq. |
| 2 | `target` | u8 | enum `target`; Echo of command target. |
| 3 | `opcode` | u8 | Echo of command opcode. |
| 4 | `status` | u8 | enum `error_code`; Error code. |
| 5 | `len` | u8 | Payload length. |

**Event** (indicate 0x0103), 10 B header + payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Protocol major version. |
| 1 | `ev_seq` | u16 | Per-device monotonic event sequence (persists across reboot, wraps at 65535). |
| 3 | `source` | u8 | enum `device_type`; Device type the event is about (0x03 = MagClip). |
| 4 | `code` | u8 | Event code. |
| 5 | `time` | u32 | Unix time, s (from SET_TIME; 0 if never set). |
| 9 | `len` | u8 | Payload length. |

- `seq`: the app increments per command. A retried command reuses its `seq`; the device caches the last 8 responses and returns the cached one instead of re-executing.
- One outstanding command per device; the app waits for the Response indication (timeout 3 s, then one retry with same `seq`) before sending the next.
- MagClip: only `GET_INFO`, `GET_STATUS`, `SELF_TEST` accept `target = 0x03`. Other opcodes return `NOT_SUPPORTED`. If MagClip data is unavailable, `TARGET_UNREACHABLE`.

### 4.1 Structs

**`status`** (16 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Struct version. |
| 1 | `device_type` | u8 | enum `device_type` |
| 2 | `activity_state` | u8 | enum `activity_state` |
| 3 | `power_state` | u8 | enum `power_state` |
| 4 | `battery_pct` | u8 | %; 0-100 |
| 5 | `flags` | u16 | bits `status_flags` |
| 7 | `magclip_batt_pct` | u8 | %; 0xFF unknown. |
| 8 | `tether_radius_dm` | u8 | dm; 30-100; Current tether radius. |
| 9 | `tether_level` | u8 | enum `tether_level` |
| 10 | `queued_events` | u16 | Events not yet ACKed. |
| 12 | `walk_id` | u32 | 0 if no walk. |

Example: `01 01 02 00 48 63 00 FF 32 00 00 00 2A 00 00 00`

**`magclip_status`** (8 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Struct version. |
| 1 | `device_type` | u8 | enum `device_type`; Always 0x03. |
| 2 | `battery_pct` | u8 | %; 0-100 |
| 3 | `latched` | u8 | 0-1; 1 latched to collar anchor plate. |
| 4 | `location` | u8 | enum `magclip_location` |
| 5 | `charge_state` | u8 | enum `charge_state` |
| 6 | `last_seen_s` | u16 | s; Age of this data at Torus. |

Example: `01 03 40 01 02 00 04 00`

**`range`** (11 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Struct version. |
| 1 | `seq` | u8 | Sample counter, wraps. |
| 2 | `distance_cm` | u16 | cm; Torus-Link UWB distance; 0xFFFF none. |
| 4 | `dist_err_cm` | u8 | cm; 1-sigma estimate; 0xFF unknown. |
| 5 | `link_rssi_dbm` | i8 | dBm; Torus-Link BLE RSSI; 127 unknown. |
| 6 | `phone_rssi_dbm` | i8 | dBm; Phone RSSI seen by this device; 127 unknown. |
| 7 | `line_out_mm` | u16 | mm; 0-3000; Torus only, from Hall/angle sensor; 0xFFFF n/a. |
| 9 | `tether_level` | u8 | enum `tether_level` |
| 10 | `flags` | u8 | bits `range_flags` |

Example: `01 11 80 02 0A B9 C0 FF FF 00 01`

**`identity`** (17 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `ver` | u8 | Struct version. |
| 1 | `device_type` | u8 | enum `device_type` |
| 2 | `proto_major` | u8 |  |
| 3 | `proto_minor` | u8 |  |
| 4 | `device_id` | u64 | Registry ID. All zero outside pairing window (privacy). |
| 12 | `pairing_nonce` | u32 | Fresh per pairing attempt; input to passkey derivation. |
| 16 | `flags` | u8 | bits `identity_flags` |

Example: `01 01 01 00 23 01 00 00 01 E7 A3 00 E7 D2 41 9C 05`

**`info`** (14 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `proto_major` | u8 |  |
| 1 | `proto_minor` | u8 |  |
| 2 | `device_type` | u8 | enum `device_type` |
| 3 | `hw_rev` | u8 | Board revision. |
| 4 | `fw_major` | u8 |  |
| 5 | `fw_minor` | u8 |  |
| 6 | `fw_patch` | u8 |  |
| 7 | `fw_build` | u16 |  |
| 9 | `capabilities` | u32 | bits `capabilities` |
| 13 | `max_payload` | u8 | Largest command payload accepted (ATT_MTU - 3 - 5, capped 255). |

Example: `01 00 01 02 00 03 01 70 00 8B 3F 00 00 F4`

**`device_cert`** (147 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `cert_ver` | u8 |  |
| 1 | `device_id` | u64 |  |
| 9 | `device_type` | u8 | enum `device_type` |
| 10 | `hw_rev` | u8 |  |
| 11 | `pubkey` | bytes[64] | P-256 public key X||Y. |
| 75 | `issued` | u32 | Unix time. |
| 79 | `ca_key_id` | u32 | Aevea device CA key ID. |
| 83 | `signature` | bytes[64] | ECDSA P-256 r||s by device CA over all prior bytes. |

Example: `01 23 01 00 00 01 E7 A3 00 01 02 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 C0 6F EC 6A 01 00 7E AE 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A`

**`owner_token`** (98 B)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `token_ver` | u8 |  |
| 1 | `purpose` | u8 | 1 bind, 2 unbind. |
| 2 | `device_id` | u64 |  |
| 10 | `owner_id` | bytes[16] | Cloud owner UUID. |
| 26 | `issued` | u32 |  |
| 30 | `expires` | u32 | Max 10 min after issued. |
| 34 | `signature` | bytes[64] | ECDSA P-256 by cloud owner-token key over all prior bytes. |

Example: `01 01 23 01 00 00 01 E7 A3 00 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B C0 6F EC 6A 18 72 EC 6A C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3`

## 5. Advertising, pairing and bonding

### 5.1 Advertising

Advertising payload: Flags, 128-bit Aevea Identity service UUID (`AE7E0200-...`), Manufacturer Specific Data (10 B, fits in 31 B legacy advertising):

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `company_id` | u16 | 0xFFFF test ID until Aevea has a SIG company ID. |
| 2 | `adv_ver` | u8 |  |
| 3 | `device_type` | u8 | enum `device_type` |
| 4 | `activity_state` | u8 | enum `activity_state` |
| 5 | `flags` | u8 | bits `adv_flags` |

Example (AD type 0xFF data): `FF FF 01 01 00 01`

| Situation | Interval | PHY |
|---|---|---|
| Pairing window (300 s) **[A5]** | 100 ms | 1M |
| Bonded, idle | 1000 ms | 1M |
| Walk active, disconnected | 100 ms for 30 s, then 500 ms | 1M (+ Coded on Link) |
| Link AWAY / LOST | 1000 ms | 1M + Coded S8 extended |
| Low battery | 2000 ms | as above |

After bonding the device uses a resolvable private address; the phone resolves it with the IRK from bonding. `device_id` in Identity is zeroed outside the pairing window.

### 5.2 Why passkey entry (not numeric comparison)

Neither Torus nor Link has a display or a yes/no input **[A4]**, so LESC numeric comparison is impossible and Just Works gives no MITM protection. Design: **LESC Passkey Entry**, device IO capability `DisplayOnly`, with a passkey the device computes and the app obtains from the cloud. The user types it into the OS pairing dialog (iOS and Android do not let apps inject it).

```
passkey = u32_le(HMAC-SHA256(K_pair, "AEVEA-PK" || device_id_le || pairing_nonce_le)[0..3]) mod 1_000_000
```

`K_pair`: 256-bit per-device secret injected at factory and stored in the cloud registry **[A6]**. `pairing_nonce` is replaced after **every** attempt (success or failure), because a failed Passkey Entry run leaks passkey bits.

### 5.3 Sequence

1. Device opens pairing window **[A5]**; advertises with `PAIRING_WINDOW_OPEN`.
2. App scans for Identity service UUID, connects, reads Identity (0x0201, open) to get `device_type`, `device_id`, `pairing_nonce`.
3. App -> cloud: claim `device_id` (owner account + QR claim code on packaging/device), sends `pairing_nonce`; cloud returns 6-digit passkey and a signed `owner_token`.
4. App shows the passkey and triggers pairing (access to an encrypted characteristic). OS dialog: user types passkey. LESC P-256 pairing; bond stored (LTK, IRK). Max 4 bonds **[A15]**; 5th returns `STORAGE_FULL` on OWNER_BIND and the app asks to remove one.
5. App exchanges MTU (request 247, require >= 131) and DLE 251.
6. `GET_INFO`, `SET_TIME`.
7. Device attestation: `GET_CERT` (chunked), app verifies against Aevea device CA; `AUTH_CHALLENGE` with fresh nonce, app verifies signature with the cert's public key. Failure -> disconnect, delete bond, report to cloud.
8. `OWNER_BIND` with cloud token. Device checks cloud signature, `device_id`, expiry (uses device clock from step 6; if clock unset, accepts within 10 min of boot **[A9]**). Until bound, only `GET_INFO`, `SET_TIME`, `GET_STATUS`, `GET_EVENTS`, `ACK_EVENTS`, `GET_CERT`, `AUTH_CHALLENGE`, `OWNER_BIND` are allowed; others return `NOT_AUTHORISED`.
9. Repeat 1-8 for the second device, then `BIND_PEER` on both (each gets the other's `device_id` and public key). Torus and Link then form their own bond and UWB STS key (Fiddlie, Q5).
10. Link only: `SET_HOME_WIFI` for each home SSID.

A second family phone: same flow; cloud issues a passkey only if the owner account authorises that phone. Ownership transfer: `OWNER_UNBIND` then `FACTORY_RESET`.

## 6. Device identity and key provisioning

| Key / item | Where made | Stored | Used for |
|---|---|---|---|
| Device identity key pair (P-256) | Generated on device at factory station; private key never leaves | Device (protected storage, Q4) | `AUTH_CHALLENGE`, `BIND_PEER` ECDH |
| Device certificate (`device_cert`, 146 B **[A14]**) | Factory CA signs CSR | Device + cloud registry | Attestation |
| `K_pair` (256-bit) **[A6]** | Factory HSM | Device + cloud registry (encrypted) | Passkey derivation |
| Boot/OTA verification key hash | Aevea signing key ceremony | Device OTP/bootloader | Secure boot, signed OTA **[A7]** |
| BLE LTK / IRK | LESC pairing | Device + phone | Link encryption, privacy |
| Peer key / UWB STS seed | ECDH(Torus key, Link key) + HKDF | Torus, Link | Peer bond, secure UWB ranging (Q5) |
| NTAG 424 DNA AES keys | Factory | Tag + cloud | Signed Pet ID URL per tap (passive, not over BLE) |
| Owner token key (P-256) | Cloud | Cloud (private), device firmware (public) | `OWNER_BIND` / `OWNER_UNBIND` |

`device_id` (u64) is the registry key. No shared/default passwords exist (PSTI, EN 18031).

## 7. Connection parameters (low power)

ATT_MTU: request 247, minimum 131 (largest command, `OWNER_BIND`, is 103 B). DLE 251 B.

| Profile | Use | Interval ms | Latency | Timeout ms | PHY |
|---|---|---|---|---|---|
| ACTIVE | pairing, provisioning, DFU | 15-30 | 0 | 4000 | 2M preferred |
| WALK | ON_LEAD / OFF_LEAD | 30-60 | 3 | 4000 | 1M; Link may switch to Coded S8 |
| IDLE | HOME/AWAY while connected | 480-500 | 2 | 6000 | 1M |

- Device requests the profile on state change via L2CAP Connection Parameter Update; phone may override **[A8]**.
- `ACTIVE` profile only for pairing, attestation and DFU; return to `WALK` or `IDLE` within 5 s of finishing.
- Link may request LE Coded S8 PHY when phone RSSI < -85 dBm in OFF_LEAD (Recall Assist range); falls back to 1M if the phone refuses (Q10).
- Supervision timeout loss during a walk is normal: devices keep running the walk locally (section 12).

## 8. Device state machine

Each of Torus and Link has an **activity state** (`HOME`, `ON_LEAD`, `OFF_LEAD_TETHER`, `AWAY`, `LOST`) and a **power overlay** (`NORMAL`, `CHARGING`, `LOW_BATTERY`). Together they give the seven states in context. Both are in Status and `STATE_CHANGED`. `AWAY` and `LOST` exist only on Link. MagClip has no state machine (passive).

- `HOME` means idle and safe: at home Wi-Fi, or within BLE range of Torus or owner phone with no walk **[A9]**. A dog at home without Torus/phone is not lost.
- `LOST` is only entered by command (app or cloud), never automatically.
- GPS (GNSS) runs only in `LOST`, on `LOCATE_NOW`, or in `AWAY` (= away from Torus AND phone AND home Wi-Fi), per the context design rule.
- `LOW_BATTERY` at <= 15%, exit at >= 20%; `BATTERY_CRITICAL` flag at <= 5% **[A9]**. Safety (lock, Bolt Brake, Pet ID) does not depend on battery.
- Lost Mode report interval vs battery: >= 50% 15 s, >= 20% 30 s, >= 10% 60 s, else 300 s **[A9]**.

| From | To | Trigger | Devices |
|---|---|---|---|
| HOME | ON_LEAD | START_WALK, or MAGCLIP latched with peer linked | TORUS, LINK |
| ON_LEAD | OFF_LEAD_TETHER | MagClip unlatched while walk active Guard: tether_mode=AUTO_ON_UNCLIP arms tether | TORUS, LINK |
| OFF_LEAD_TETHER | ON_LEAD | MagClip latched | TORUS, LINK |
| ON_LEAD|OFF_LEAD_TETHER | HOME | STOP_WALK, or home Wi-Fi seen and no motion 10 min | TORUS, LINK |
| OFF_LEAD_TETHER | AWAY | Peer (Torus) AND phone BLE lost for 60 s | LINK |
| HOME | AWAY | Home Wi-Fi not seen AND peer not seen AND phone not seen for 300 s, motion detected | LINK |
| AWAY | HOME | Home Wi-Fi seen, or peer/phone regained | LINK |
| * | LOST | LOST_MODE on (BLE or cloud). Never automatic. | LINK |
| LOST | HOME|AWAY | LOST_MODE off; re-evaluate home/away | LINK |
| power:NORMAL|LOW_BATTERY | power:CHARGING | Charger detected (USB-C, dock or MagClip contacts) | TORUS, LINK, MAGCLIP |
| power:CHARGING | power:NORMAL|LOW_BATTERY | Charger removed | TORUS, LINK, MAGCLIP |
| power:NORMAL | power:LOW_BATTERY | battery <= 15% | TORUS, LINK |
| power:LOW_BATTERY | power:NORMAL | battery >= 20% (hysteresis) | TORUS, LINK |

### 8.1 Radios and sensors active per state

**Torus**

| State | ble | uwb | line_sensor | halo | lra |
|---|---|---|---|---|---|
| HOME | adv 1000 ms / IDLE conn | off | off (wake on drum movement) | off | on demand |
| ON_LEAD | WALK conn + peer link | off (line sensor gives distance up to 3 m) | on | state colour | on demand |
| OFF_LEAD_TETHER | WALK conn + peer link | on, ~4 Hz ranging with Link | on (retracted) | tether level colour | amber/red alerts |
| CHARGING | adv 1000 ms | off unless walk | off | charge indication | off |
| LOW_BATTERY | as state, adv 2000 ms | as state, 2 Hz | as state | dimmed, low-batt cue | as state |

**Link**

| State | ble | uwb | lte_m | gnss | wifi_scan | accel |
|---|---|---|---|---|---|---|
| HOME | adv 1000 ms | off | PSM/eDRX command check (~80 s) | off | motion-gated | on (~1 uA) |
| ON_LEAD | WALK conn + peer link | off | eDRX | off | off | on |
| OFF_LEAD_TETHER | WALK conn + peer link, Coded PHY ready | on, ~4 Hz with Torus | eDRX; fast paging window on Recall fallback | off | off | on |
| AWAY | adv 1000 ms 1M + Coded | off | eDRX | on (periodic, motion-gated) | periodic, to detect home | on |
| LOST | adv 1000 ms 1M + Coded | off | active, reports each interval | on per interval | off | on |
| CHARGING | as activity | as activity | as activity | as activity | as activity | on |
| LOW_BATTERY | adv 2000 ms | 2 Hz if OFF_LEAD | eDRX | LOST/Locate only | reduced | on |

**MagClip**: No radio in context. Passive except contact sensing and charging. Lock is mechanical.

UWB is off `ON_LEAD` because the line sensor covers 0-3 m **[A17]**. Range rates **[A16]**. LTE-M eDRX command check (~80 s) runs in all Link states so Lost Mode can arrive from the cloud.

## 9. Commands

Opcode ranges: `0x01-0x0F` system, `0x10-0x2F` walk and alerts, `0x40-0x4F` identity, `0x80-0xFF` reserved (vendor/test, disabled in production builds).

#### 0x01 GET_INFO
Versions and capabilities. Always sent first after connect. Devices: TORUS, LINK, MAGCLIP (MagClip via target 0x03). Owner bound: no.

Request payload: none.

Response payload: `info` struct.

```
req  01 01 00 01 00
rsp  01 01 00 01 00 0E 01 00 01 02 00 03 01 70 00 8B 3F 00 00 F4
```

#### 0x02 SET_TIME
Sets device clock for event timestamps. Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `unix_time` | u32 | s |
| 4 | `tz_offset_min` | i16 | min; Local offset. |

Response payload: none.

```
req  01 02 00 02 06 C0 6F EC 6A 00 00
rsp  01 02 00 02 00 00
```

#### 0x03 GET_STATUS
Returns status struct (magclip_status when target=MagClip). Devices: TORUS, LINK, MAGCLIP (MagClip via target 0x03). Owner bound: no.

Request payload: none.

Response payload: `status` struct (or `magclip_status` when target=0x03).

```
req  01 03 00 03 00
rsp  01 03 00 03 00 10 01 01 02 00 48 63 00 FF 32 00 00 00 2A 00 00 00
req  01 30 03 03 00   (MagClip via Torus)
rsp  01 30 03 03 00 08 01 03 40 01 02 00 04 00
```

#### 0x04 GET_EVENTS
Replays queued events on the Event characteristic. Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `from_ev_seq` | u16 | First ev_seq wanted. |
| 2 | `max_count` | u8 | 1-64 |

Response payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `available` | u16 | Events that will be indicated. |
| 2 | `first_ev_seq` | u16 | Oldest still held. |

```
req  01 04 00 04 03 30 01 20
rsp  01 04 00 04 00 04 03 00 30 01
```

#### 0x05 ACK_EVENTS
Frees queued events. Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `up_to_ev_seq` | u16 | Inclusive. |

Response payload: none.

```
req  01 05 00 05 02 32 01
rsp  01 05 00 05 00 00
```

#### 0x06 SELF_TEST
Runs self test; result in SELF_TEST_RESULT event. Devices: TORUS, LINK, MAGCLIP (MagClip via target 0x03). Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `tests` | u16 | bits `self_test`; Bitmap; unsupported bits ignored. |

Response payload: none.

```
req  01 06 00 06 02 3F 00
rsp  01 06 00 06 00 00
```

#### 0x07 FACTORY_RESET
Erases bonds, owner, peers, Wi-Fi slots, event queue. Keeps factory keys. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `magic` | u32 | Must be 0x54455352 ('RSET'). |

Response payload: none.

```
req  01 07 00 07 04 52 53 45 54
rsp  01 07 00 07 00 00
```

#### 0x10 START_WALK
Starts a walk. Sent to both Torus and Link. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `walk_id` | u32 | App-generated, idempotent. |
| 4 | `tether_mode` | u8 | enum `tether_mode` |
| 5 | `tether_radius_dm` | u8 | dm; 30-100; default 50 |

Response payload: none.

```
req  01 10 00 10 06 2A 00 00 00 01 32
rsp  01 10 00 10 00 00
```

#### 0x11 STOP_WALK
Stops walk, returns walk summary. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `walk_id` | u32 |  |

Response payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `duration_s` | u32 | s |
| 4 | `bolt_count` | u8 |  |
| 5 | `max_force_n` | u16 | N |
| 7 | `tether_red_count` | u8 |  |

```
req  01 11 00 11 04 2A 00 00 00
rsp  01 11 00 11 00 08 08 07 00 00 02 54 01 01
```

#### 0x12 SET_TETHER
Configures off-lead tether. Torus is authoritative; Link mirrors for local alerts. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `radius_dm` | u8 | dm; 30-100 |
| 1 | `amber_pct` | u8 | %; 50-95; default 80; [A12]; Amber threshold as % of radius. |
| 2 | `mode` | u8 | enum `tether_mode` |

Response payload: none.

```
req  01 12 00 12 03 50 50 01
rsp  01 12 00 12 00 00
```

#### 0x13 SET_HALO
Overrides Halo. AUTO_STATE returns control to firmware. Devices: TORUS. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `pattern` | u8 | enum `halo_pattern` |
| 1 | `r` | u8 |  |
| 2 | `g` | u8 |  |
| 3 | `b` | u8 |  |
| 4 | `brightness` | u8 | %; 0-100 |
| 5 | `period_ms` | u16 | ms; 100-5000 |
| 7 | `duration_s` | u16 | s; 0 = until changed. |

Response payload: none.

```
req  01 13 00 13 09 02 FF A0 00 3C DC 05 00 00
rsp  01 13 00 13 00 00
```

#### 0x14 BUZZ
One-shot haptic/sound cue. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `actuator` | u8 | bits `actuator`; Torus: LRA only. Link: LRA and/or piezo. |
| 1 | `pattern` | u8 | 1-16; Aevea pattern ID 1-16 (mapped to DRV2605L effects in firmware). |
| 2 | `repeat` | u8 | 1-10 |
| 3 | `intensity` | u8 | %; 0-100 |

Response payload: none.

```
req  01 14 00 14 04 01 03 02 50
rsp  01 14 00 14 00 00
```

#### 0x15 RECALL_ASSIST
Plays recall cue on Link. Devices: LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `action` | u8 | enum `on_off` |
| 1 | `recall_id` | u16 | Idempotent. |
| 3 | `cue` | u8 | bits `actuator` |
| 4 | `pattern` | u8 | 1-16 |
| 5 | `timeout_s` | u8 | s; 1-120; default 30 |

Response payload: none.

```
req  01 15 00 15 06 01 07 00 03 05 1E
rsp  01 15 00 15 00 00
```

#### 0x16 LOCATE_NOW
Requests GNSS fix; result in LOCATION event. Devices: LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `request_id` | u16 |  |
| 2 | `flags` | u8 | bits `locate_flags` |
| 3 | `timeout_s` | u8 | s; 10-180; default 90 |

Response payload: none.

```
req  01 16 00 16 04 09 00 01 5A
rsp  01 16 00 16 00 00
```

#### 0x17 LOST_MODE
Enters/leaves Lost Mode. Devices: LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `action` | u8 | enum `on_off` |
| 1 | `lost_id` | u32 | Cloud-issued. |
| 5 | `interval_s` | u16 | s; 15-600; default 15; Base report interval; firmware slows as battery falls. |

Response payload: none.

```
req  01 17 00 17 07 01 01 10 00 00 0F 00
rsp  01 17 00 17 00 00
```

#### 0x18 SET_HOME_WIFI
Stores a home SSID for scan-only home detection. Devices: LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `slot` | u8 | 0-3 |
| 1 | `ssid_len` | u8 | 0-32; 0 clears slot. |
| 2 | `ssid` | bytes[<=32] | UTF-8 SSID, not NUL-terminated. |

Response payload: none.

```
req  01 18 00 18 0A 00 08 41 65 76 65 61 48 6F 6D
rsp  01 18 00 18 00 00
```

#### 0x19 BIND_PEER
Binds Torus and Link to each other; key for peer BLE bond and UWB STS derivation. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `peer_type` | u8 | enum `device_type` |
| 1 | `peer_id` | u64 |  |
| 9 | `peer_pubkey` | bytes[64] | Peer P-256 public key X||Y (from peer cert, checked by app and cloud). |

Response payload: none.

```
req  01 19 00 19 49 02 56 04 00 00 02 E7 A3 00 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04 04
rsp  01 19 00 19 00 00
```

#### 0x1A UNBIND_PEER
Removes peer. Devices: TORUS, LINK. Owner bound: yes.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `peer_id` | u64 |  |

Response payload: none.

```
req  01 1A 00 1A 08 56 04 00 00 02 E7 A3 00
rsp  01 1A 00 1A 00 00
```

#### 0x40 GET_CERT
Reads device certificate in chunks. Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `offset` | u16 |  |
| 2 | `max_len` | u8 | 1-238 |

Response payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `total_len` | u16 | Size of device_cert struct. |
| 2 | `offset` | u16 |  |
| 4 | `chunk` | bytes[<=238] | Cert bytes. |

```
req  01 40 00 40 03 00 00 10
rsp  01 40 00 40 00 14 92 00 00 00 01 23 01 00 00 01 E7 A3 00 01 02 04 04 04 04 04
```

#### 0x41 AUTH_CHALLENGE
Proves device holds its factory identity key. Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `app_nonce` | bytes[16] | Random. |

Response payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `device_nonce` | bytes[16] | Random. |
| 16 | `signature` | bytes[64] | ECDSA P-256 by device identity key over SHA-256('AEVEA-AUTH'||app_nonce||device_nonce||device_id). |

```
req  01 41 00 41 10 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 A1
rsp  01 41 00 41 00 50 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A 5A
```

#### 0x42 OWNER_BIND
Binds device to an Aevea owner account. Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `token` | bytes[98] | owner_token struct, purpose=1. |

Response payload: none.

```
req  01 42 00 42 62 01 01 23 01 00 00 01 E7 A3 00 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B C0 6F EC 6A 18 72 EC 6A C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3
rsp  01 42 00 42 00 00
```

#### 0x43 OWNER_UNBIND
Releases owner binding (transfer of ownership). Devices: TORUS, LINK. Owner bound: no.

Request payload:

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `token` | bytes[98] | owner_token struct, purpose=2. |

Response payload: none.

```
req  01 43 00 43 62 01 02 23 01 00 00 01 E7 A3 00 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B 7B C0 6F EC 6A 18 72 EC 6A C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3
rsp  01 43 00 43 00 00
```


### 9.1 Recall Assist flow

1. App writes `RECALL_ASSIST` to Link over BLE (Coded PHY if negotiated). Success = Response `OK` + `RECALL_STATUS CUE_STARTED`.
2. If no Response within 2 s or Link not connected: app posts recall to cloud with the same `recall_id`; cloud delivers over LTE-M.
3. LTE-M delivery is fast only while Link is in its fast-paging window (1-2 s paging for ~60 s), opened when MagClip is unclipped and Link loses both Torus and phone BLE, or on Torus tether RED **[A13]** (Q9).
4. Link de-duplicates by `recall_id`; `RECALL_STATUS.path` reports which path won.

### 9.2 Lost Mode and Locate now

Cloud is authoritative for Lost Mode (app -> cloud -> Link within ~80 s, then position every 15 s, slowing with battery). BLE `LOST_MODE` is an extra copy when connected (fast on/off when the dog is found nearby). `LOCATE_NOW` over BLE returns `LOCATION` on the Event characteristic; over cloud the position returns via the cloud API.

## 10. Notifications

Delivered on Event (0x0103, indicate, queued) unless noted. Continuous distance/RSSI is on Range (0x0105, notify, not queued); Status (0x0104) notifies on change.

| Requested item | Where |
|---|---|
| Battery % | `BATTERY` event, Status `battery_pct`, SIG Battery Level |
| MagClip latched | `MAGCLIP_LATCH` event (source 0x03), Status flag `MAGCLIP_LATCHED` |
| Bolt / slip with force estimate | `BOLT` event (Torus) **[A11]** |
| Tether amber / red | `TETHER` event on level change; Range `tether_level` continuous |
| Link RSSI / distance | Range struct `distance_cm`, `link_rssi_dbm`, `phone_rssi_dbm` |

Both Torus and Link may report the same MagClip latch change; the app de-duplicates on (`latched`, time within 2 s).

#### 0x01 BATTERY
On 5% step, charge state change, or threshold crossing. Sources: TORUS, LINK, MAGCLIP.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `pct` | u8 | % |
| 1 | `mv` | u16 | mV |
| 3 | `charge_state` | u8 | enum `charge_state` |
| 4 | `charge_source` | u8 | enum `charge_source` |
| 5 | `temp_c` | i8 | degC |

```
01 30 01 01 01 C0 6F EC 6A 06 48 1E 0F 00 00 15
```

#### 0x02 STATE_CHANGED
Any activity or power state change. Sources: TORUS, LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `old_activity` | u8 | enum `activity_state` |
| 1 | `new_activity` | u8 | enum `activity_state` |
| 2 | `power_state` | u8 | enum `power_state` |
| 3 | `reason` | u8 | enum `state_change_reason` |

```
01 31 01 01 02 C0 6F EC 6A 04 01 02 00 02
```

#### 0x03 MAGCLIP_LATCH
Latch/unlatch sensed through contacts. source=0x03. Sources: MAGCLIP.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `latched` | u8 | 0-1 |
| 1 | `sensed_by` | u8 | enum `device_type`; Device that saw the contact change. |
| 2 | `magclip_batt_pct` | u8 | %; 0xFF unknown. |

```
01 32 01 03 03 C0 6F EC 6A 03 00 02 40
```

#### 0x04 BOLT
Bolt/slip event detected by line Hall/angle sensors. Sources: TORUS.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `walk_id` | u32 |  |
| 4 | `peak_force_n` | u16 | N; Estimate (no load cell). |
| 6 | `slip_mm` | u16 | mm; 0-500; Bolt Brake slip. |
| 8 | `duration_ms` | u16 | ms |
| 10 | `line_out_mm` | u16 | mm; 0-3000 |
| 12 | `flags` | u8 | bits `bolt_flags` |

```
01 33 01 01 04 C0 6F EC 6A 0D 2A 00 00 00 54 01 B4 00 DC 00 5A 0A 05
```

#### 0x05 TETHER
On level change only (continuous values on Range). Sources: TORUS, LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `level` | u8 | enum `tether_level` |
| 1 | `distance_cm` | u16 | cm |
| 3 | `radius_dm` | u8 | dm |
| 4 | `walk_id` | u32 |  |

```
01 34 01 01 05 C0 6F EC 6A 08 01 B2 02 50 2A 00 00 00
```

#### 0x06 LOCATION
Locate now result or Lost Mode fix (when BLE connected). Sources: LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `request_id` | u16 | 0 for Lost Mode periodic. |
| 2 | `lat_e7` | i32 | deg*1e7 |
| 6 | `lon_e7` | i32 | deg*1e7 |
| 10 | `acc_m` | u16 | m |
| 12 | `fix_age_s` | u16 | s |
| 14 | `source` | u8 | enum `location_source` |
| 15 | `sats` | u8 |  |

```
01 35 01 02 06 C0 6F EC 6A 10 09 00 00 60 B3 1E A0 87 EC FF 08 00 03 00 01 09
```

#### 0x07 RECALL_STATUS
Recall Assist progress. Sources: LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `recall_id` | u16 |  |
| 2 | `status` | u8 | enum `recall_status` |
| 3 | `path` | u8 | enum `path` |

```
01 36 01 02 07 C0 6F EC 6A 04 07 00 01 02
```

#### 0x08 LOST_MODE_STATUS
Lost Mode entered/left or interval changed. Sources: LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `active` | u8 | 0-1 |
| 1 | `lost_id` | u32 |  |
| 5 | `interval_s` | u16 | s; Current effective interval. |
| 7 | `path` | u8 | enum `path`; Path the change arrived on. |

```
01 37 01 02 08 C0 6F EC 6A 08 01 01 10 00 00 0F 00 03
```

#### 0x09 SELF_TEST_RESULT
 Sources: TORUS, LINK, MAGCLIP.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `tests_run` | u16 | bits `self_test` |
| 2 | `tests_failed` | u16 | bits `self_test` |
| 4 | `detail` | u8 | enum `error_code`; First failure error code. |

```
01 38 01 01 09 C0 6F EC 6A 05 3F 00 00 00 00
```

#### 0x0A FAULT
Runtime fault. Sources: TORUS, LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `error_code` | u8 | enum `error_code` |
| 1 | `module` | u8 | self_test bit index of failing block. |
| 2 | `detail` | u16 | Vendor detail for Fiddlie. |

```
01 39 01 01 0A C0 6F EC 6A 04 FF 02 11 00
```

#### 0x0B QUEUE_OVERFLOW
Oldest events dropped while offline. Sources: TORUS, LINK.

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `dropped` | u16 |  |
| 2 | `oldest_ev_seq` | u16 |  |

```
01 3A 01 01 0B C0 6F EC 6A 04 0C 00 00 01
```


## 11. Firmware update over BLE

Aevea DFU service 0x0300. Images are signed (ECDSA P-256, MCUboot-style trailer) and verified by the bootloader **[A7]**. Image types: `0x00` main BLE MCU (Torus; Link's DWM3001C), `0x01` Link nRF9151 app (includes nRF7002 firmware), `0x02` Link modem (Q8). MagClip DFU is not supported (Q3).

Flow:

1. App downloads image + metadata from cloud (version, size, sha256). Checks battery: refuse below 30% unless charging (`LOW_BATTERY`) **[A9]**. Switch to `ACTIVE` profile, 2M PHY.
2. `DFU_START` (type, size, version, sha256). Device erases the secondary slot (may answer `BUSY`; retry). `resume_offset > 0` means the same sha256 was partly received: continue from there (**resume**).
3. `DFU_DATA` writes without response, `offset` + up to `max_chunk` bytes (= `min(max_chunk, ATT_MTU - 7)`; 240 at MTU 247). Every 4096 B, `DFU_GET_OFFSET`; compare `offset` and `crc32` with local; on mismatch rewind to the device's offset.
4. After the last byte: `DFU_VERIFY`. Device checks sha256 and signature, security counter (no downgrade, `DFU_DOWNGRADE_REJECTED`). Indication arrives when done (up to 10 s).
5. `DFU_APPLY`: device reboots, bootloader swaps, new image runs in **test** mode.
6. App reconnects, `GET_INFO` (new version), `SELF_TEST`; if pass, `DFU_CONFIRM`.
7. **Rollback**: if no `DFU_CONFIRM` within 600 s or after 3 unconfirmed boots, or watchdog during test boot, the bootloader reverts to the previous image. Status flag `DFU_PENDING_CONFIRM` is set until confirmed.
8. Disconnect at any step before APPLY: state kept; next `DFU_START` with same sha256 resumes. `DFU_ABORT` discards.

DFU is refused (`INVALID_STATE`) while `LOST` or during a walk.

#### 0x01 DFU_START

Request (after op byte):

| Off | Field | Type | Notes |
|---|---|---|---|
| 1 | `image_type` | u8 | enum `dfu_image_type` |
| 2 | `image_size` | u32 | B |
| 6 | `fw_major` | u8 |  |
| 7 | `fw_minor` | u8 |  |
| 8 | `fw_patch` | u8 |  |
| 9 | `fw_build` | u16 |  |
| 11 | `sha256` | bytes[32] | SHA-256 of whole signed image. |

Indication (after op, status):

| Off | Field | Type | Notes |
|---|---|---|---|
| 2 | `resume_offset` | u32 | Non-zero if same sha256 partially received. |
| 6 | `max_chunk` | u16 | Max data bytes per DFU_DATA write. |

```
req  01 00 00 00 03 00 00 04 00 82 00 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F 3F
ind  01 00 00 00 00 00 F0 00
```

#### 0x03 DFU_GET_OFFSET

Indication (after op, status):

| Off | Field | Type | Notes |
|---|---|---|---|
| 2 | `offset` | u32 |  |
| 6 | `crc32` | u32 | CRC-32/ISO-HDLC of bytes 0..offset-1. |

```
req  03
ind  03 00 00 10 00 00 A3 1C 29 1C
```

#### 0x04 DFU_VERIFY

```
req  04
ind  04 00
```

#### 0x05 DFU_APPLY

```
req  05
ind  05 00
```

#### 0x06 DFU_ABORT

```
req  06
ind  06 00
```

#### 0x07 DFU_CONFIRM

```
req  07
ind  07 00
```

#### 0x08 DFU_STATUS

Indication (after op, status):

| Off | Field | Type | Notes |
|---|---|---|---|
| 2 | `dfu_state` | u8 | enum `dfu_state` |
| 3 | `image_type` | u8 | enum `dfu_image_type` |
| 4 | `offset` | u32 |  |
| 8 | `pend_major` | u8 |  |
| 9 | `pend_minor` | u8 |  |
| 10 | `pend_patch` | u8 |  |
| 11 | `pend_build` | u16 |  |

```
req  08
ind  08 00 01 00 00 10 00 00 00 04 00 82 00
```

#### DFU_DATA (0x0302, write without response)

| Off | Field | Type | Notes |
|---|---|---|---|
| 0 | `offset` | u32 | Byte offset in image. |
| 4 | `data` | bytes[<=240] | <= max_chunk. |

```
00 10 00 00 00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF
```


## 12. Offline behaviour and queues

**Device side.** Devices run walks, tether alerts (Torus LRA/Halo), bolt detection and Lost Mode without the phone. Every event gets an `ev_seq` and is stored in a ring buffer (>= 256 events, **[A10]**). On reconnect the app sends `GET_EVENTS(from = last_acked + 1)`, processes indications, then `ACK_EVENTS`. On overflow the oldest are dropped and `QUEUE_OVERFLOW` is queued. Status `queued_events` and adv flag `EVENTS_QUEUED` tell the app there is backlog. Range samples are never queued.

**App side.** Commands issued while disconnected follow this table (TTL counted from user action; expired commands are dropped and the UI told):

| Command | Queue offline? | TTL | Rule |
|---|---|---|---|
| GET_INFO | no | - |  |
| SET_TIME | no | - | Sent automatically on every connect. |
| GET_STATUS | no | - |  |
| GET_EVENTS | no | - |  |
| ACK_EVENTS | no | - |  |
| SELF_TEST | no | - |  |
| FACTORY_RESET | no | - |  |
| START_WALK | yes | 600 s | STOP_WALK with same walk_id cancels a queued START_WALK |
| STOP_WALK | yes | 600 s |  |
| SET_TETHER | yes | 600 s | latest wins |
| SET_HALO | yes | 60 s | latest wins |
| BUZZ | yes | 5 s |  |
| RECALL_ASSIST | no | - | Never queued. If BLE write fails within 2 s, app sends via cloud. |
| LOCATE_NOW | no | - | If not connected, app uses cloud path. |
| LOST_MODE | no | - | Cloud is authoritative; BLE copy sent too when connected. |
| SET_HOME_WIFI | yes | persistent | per slot, latest wins; Persistent until delivered. |
| BIND_PEER | yes | persistent | Persistent until delivered. |
| UNBIND_PEER | yes | persistent |  |
| GET_CERT | no | - |  |
| AUTH_CHALLENGE | no | - |  |
| OWNER_BIND | no | - |  |
| OWNER_UNBIND | no | - |  |

On reconnect the app sends, in order: `GET_INFO`, `SET_TIME`, `GET_STATUS`, event replay, then queued commands oldest first. Commands are idempotent by `walk_id`, `recall_id`, `lost_id`, `request_id` or slot.

## 13. Versioning and compatibility

- `ver` byte in every frame = protocol **major**. Device rejects other majors with `VERSION_MISMATCH` (response header still uses the device's major so the app can read it). Major changes only for breaking changes.
- **Minor** (in `GET_INFO`, Identity): additive only. New opcodes, new events, new enum values, new fields **appended** to payloads/structs. Never reorder or resize fields.
- The app must: ignore unknown event codes and trailing bytes; check `capabilities` before using a feature; treat `UNKNOWN_OPCODE`/`NOT_SUPPORTED` as "feature absent".
- Structs carry their own `ver` byte for independent evolution.
- Compatibility rule: app supports device protocol minor `n-2..current`; cloud blocks pairing of firmware older than the minimum and offers DFU first.
- `protocol.json` `version` equals this document's version; simulator and app load it and must refuse a different major.

## 14. Error codes

| Code | Name | Meaning |
|---|---|---|
| 0x00 | `OK` | Success. |
| 0x01 | `UNKNOWN_OPCODE` | Opcode not known to this firmware. |
| 0x02 | `INVALID_LENGTH` | len does not match the opcode's payload. |
| 0x03 | `OUT_OF_RANGE` | A field value is outside its documented range. |
| 0x04 | `NOT_SUPPORTED` | Opcode valid but not on this device type or target. |
| 0x05 | `BUSY` | Device cannot accept now (flash erase, other op running). Retry after 500 ms. |
| 0x06 | `INVALID_STATE` | Not allowed in current state (e.g. STOP_WALK with no walk). |
| 0x07 | `NOT_AUTHORISED` | Owner not bound, or command needs owner binding. |
| 0x08 | `TARGET_UNREACHABLE` | MagClip not currently reachable through Torus. |
| 0x09 | `LOW_BATTERY` | Refused to protect battery (e.g. DFU below 30% not charging). |
| 0x0A | `VERSION_MISMATCH` | Frame ver (protocol major) not supported. |
| 0x0B | `STORAGE_FULL` | No slot left (bonds, home Wi-Fi slots, peers). |
| 0x0C | `TIMEOUT` | Internal operation timed out (e.g. GNSS no fix). |
| 0x0D | `AUTH_FAILED` | Signature or token check failed. |
| 0x10 | `DFU_INVALID_SIGNATURE` | Image signature does not verify against the boot key. |
| 0x11 | `DFU_INVALID_IMAGE` | Header/type/size wrong for this device. |
| 0x12 | `DFU_OFFSET_MISMATCH` | Data offset not equal to expected offset. |
| 0x13 | `DFU_HASH_MISMATCH` | SHA-256 of received image differs from DFU_START. |
| 0x14 | `DFU_DOWNGRADE_REJECTED` | Security counter lower than running image. |
| 0x15 | `DFU_NOT_STARTED` | DFU op sent before DFU_START. |
| 0xFF | `INTERNAL` | Unexpected firmware error; detail in FAULT event. |

Example, `SET_TETHER` with radius 120 dm (12.0 m, above 10 m):

```
req  01 31 00 12 03 78 50 01
rsp  01 31 00 12 03 00
```

Enums and bitfields:

- `device_type`: 0x01 TORUS, 0x02 LINK, 0x03 MAGCLIP
- `target`: 0x00 SELF, 0x03 MAGCLIP (Torus only, proxied)
- `activity_state`: 0x00 HOME, 0x01 ON_LEAD, 0x02 OFF_LEAD_TETHER, 0x03 AWAY, 0x04 LOST
- `power_state`: 0x00 NORMAL, 0x01 CHARGING, 0x02 LOW_BATTERY
- `state_change_reason`: 0x00 COMMAND, 0x01 MAGCLIP_LATCHED, 0x02 MAGCLIP_UNLATCHED, 0x03 HOME_WIFI_SEEN, 0x04 HOME_WIFI_LOST, 0x05 PEER_LOST, 0x06 PHONE_LOST, 0x07 PEER_OR_PHONE_REGAINED, 0x08 CHARGER_CONNECTED, 0x09 CHARGER_REMOVED, 0x0A BATTERY_THRESHOLD, 0x0B CLOUD_COMMAND, 0x0C BOOT, 0x0D TIMEOUT
- `tether_level`: 0x00 GREEN, 0x01 AMBER, 0x02 RED, 0x03 NO_RANGE
- `tether_mode`: 0x00 OFF, 0x01 AUTO_ON_UNCLIP
- `charge_state`: 0x00 DISCHARGING, 0x01 CHARGING, 0x02 FULL, 0x03 FAULT
- `charge_source`: 0x00 NONE, 0x01 USB_C, 0x02 TORUS_DOCK, 0x03 MAGCLIP_CONTACTS
- `halo_pattern`: 0x00 OFF, 0x01 SOLID, 0x02 BREATHE, 0x03 BLINK, 0x04 SPIN, 0x05 AUTO_STATE
- `on_off`: 0x00 OFF_OR_STOP, 0x01 ON_OR_START
- `recall_status`: 0x01 CUE_STARTED, 0x02 CUE_FINISHED, 0x03 TIMEOUT, 0x04 STOPPED
- `path`: 0x01 BLE_1M, 0x02 BLE_CODED_S8, 0x03 LTE_M
- `location_source`: 0x01 GNSS, 0x02 LAST_KNOWN
- `magclip_location`: 0x00 UNKNOWN, 0x01 DOCKED_IN_TORUS, 0x02 LATCHED_TO_LINK, 0x03 FREE
- `dfu_image_type`: 0x00 MAIN_BLE_MCU (Torus nRF52833 / Link DWM3001C nRF52833), 0x01 LINK_CELLULAR_APP (nRF9151 app core, includes nRF7002 firmware), 0x02 LINK_MODEM (nRF9151 modem firmware)
- `dfu_state`: 0x00 IDLE, 0x01 RECEIVING, 0x02 VERIFIED, 0x03 PENDING_TEST_BOOT, 0x04 CONFIRMED

- bits `capabilities`: b0 HALO, b1 LRA, b2 PIEZO, b3 UWB, b4 GNSS, b5 LTE_M, b6 WIFI_SCAN, b7 LINE_SENSOR, b8 BOLT_DETECT, b9 MAGCLIP_PROXY, b10 CODED_PHY, b11 DFU, b12 TETHER, b13 CONTACT_CHARGING
- bits `status_flags`: b0 WALK_ACTIVE, b1 TETHER_ARMED, b2 MAGCLIP_LATCHED, b3 LOST_MODE, b4 AT_HOME_WIFI, b5 PEER_LINKED, b6 OWNER_BOUND, b7 EVENTS_QUEUED, b8 DFU_PENDING_CONFIRM, b9 BATTERY_CRITICAL
- bits `self_test`: b0 BATTERY_CHARGER, b1 BLE, b2 UWB, b3 LRA, b4 HALO, b5 LINE_SENSOR, b6 ACCELEROMETER, b7 GNSS, b8 LTE_M, b9 WIFI_SCAN, b10 PIEZO, b11 MAGCLIP_CONTACTS
- bits `actuator`: b0 LRA, b1 PIEZO
- bits `locate_flags`: b0 GNSS_FIX, b1 PIEZO_CHIRP, b2 ALSO_REPORT_VIA_LTE_M
- bits `bolt_flags`: b0 FORCE_ESTIMATED, b1 SLIP_SATURATED_500MM, b2 MAGCLIP_STILL_LATCHED
- bits `range_flags`: b0 UWB_VALID, b1 NLOS_SUSPECTED
- bits `identity_flags`: b0 PAIRING_WINDOW_OPEN, b1 OWNER_BOUND, b2 FACTORY_FRESH
- bits `adv_flags`: b0 PAIRING_WINDOW_OPEN, b1 OWNER_BOUND, b2 LOW_BATTERY, b3 LOST_MODE, b4 EVENTS_QUEUED

## 15. Assumptions

- **A1** Phone connects directly to Torus and to Link (both have BLE). MagClip has no radio; its data is proxied by Torus.
- **A2** On Link, BLE terminates on the DWM3001C nRF52833, which relays to the nRF9151 over an internal bus. Inferred from chip list.
- **A3** Torus-Link peer link (BLE bond + UWB ranging) is Fiddlie-owned firmware and not specified here; only its results are exposed.
- **A4** Neither Torus nor Link has a display, keypad or button (none in context), so numeric comparison is not possible.
- **A5** Pairing window opens for 300 s on: first boot, USB-C plug-in (Torus), MagClip latch to Link (Link).
- **A6** Per-device pairing secret K_pair is injected at factory and also held by the cloud registry.
- **A7** Bootloader is MCUboot-style: two slots, ECDSA P-256 signature, test boot then confirm, security counter.
- **A8** Connection profiles follow Apple Accessory Design Guidelines limits; re-check against the current edition.
- **A9** Thresholds (15% low, 5% critical, 30% DFU min, 300 s away timer, 60 s off-lead loss timer) are starting values.
- **A10** Event queue holds >= 256 events per device in RAM+flash; drops oldest on overflow.
- **A11** Bolt force is estimated from slip and drum deceleration; there is no load cell in context. Slip implies ~300 N.
- **A12** Tether amber threshold is a % of radius (default 80%).
- **A13** Link enters LTE-M fast paging (1-2 s, ~60 s) when unclipped and it loses both Torus and phone BLE, or when Torus reports tether RED, so a cloud Recall can land.
- **A14** Device certificate is a compact 146-byte format, not X.509.
- **A15** Max 4 phone bonds per device.
- **A16** Range sample rates: 4 Hz OFF_LEAD, 1 Hz ON_LEAD.
- **A17** UWB is off ON_LEAD; the line sensor covers distance up to 3 m.
- **A18** Base UUID AE7E0000-7A1C-4E5A-9D2B-AE7EA0000000 is a placeholder; Aevea must generate a random v4 base once before production and never change it.

## 16. Open questions for Fiddlie (firmware owner)

1. Does Torus or Link have any button, touch area or capacitive input? It would enable numeric comparison and a manual pairing window.
2. How does Torus reach MagClip while the clip is on the collar (conductors in the line, relay via Link, or only when docked)? Who senses latch: MagClip MCU, Link, or both?
3. Does MagClip have an MCU with updatable firmware? If yes, how is it updated through Torus?
4. Key storage on nRF52833 (no CryptoCell/KMU): is a secure element planned, or protected flash + APPROTECT? Same question for the DWM3001C inside Link.
5. UWB secure ranging: which STS mode (FiRa SP3 static/dynamic STS?) and how should the STS key be derived from the BIND_PEER ECDH secret?
6. Which side is UWB initiator/controller, and what ranging rate is affordable within the 7+ day (Link) and 9-13 day (Torus) battery targets?
7. Bootloader choice: MCUboot + MCUmgr/SMP (which would replace the Aevea DFU service) or custom? Signature algorithm and key ceremony?
8. Is nRF9151 modem firmware update over BLE in scope, or only over LTE-M (FOTA)? Expected image sizes for each image type?
9. Recall Assist fallback trigger: what exactly wakes LTE-M fast paging (A13)? Is 1-2 s paging achievable with the chosen network/eDRX settings?
10. Coded PHY: confirm phone-side support (iOS exposure is uncertain) and Link TX power; else Recall falls back to 1M + cloud.
11. Can Torus derive a usable force estimate from Hall/angle data (A11), and what accuracy should the app show?
12. Flash budget for event queue (A10), dual-slot images and bonds on each MCU.
13. Does Torus need its own clock source or is SET_TIME on connect enough for event timestamps?
14. Bluetooth SIG company ID and Bluetooth qualification (QDID) plan; EN 18031 and PSTI requirements on default passwords/pairing.
