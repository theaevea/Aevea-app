# Lost Mode command relay

App -> cloud queue -> Link. Link is on LTE-M and cannot be pushed to; it checks the cloud on its eDRX wake and calls `GET /v1/device/commands`. Per context.md and device-protocol.md 9.2, expect delivery within about 80 s (one eDRX cycle plus connection setup), then positions every 15 s (slowing with battery, protocol 0x17).

## Semantics
- Commands: `lost_mode` (action, cloud-issued u32 `lost_id`, `interval_s` 15-600), `locate_now`, `recall`.
- States: queued -> delivered (returned to device) -> acked | rejected; or expired / superseded.
- At-least-once: delivered but un-acked commands are returned on every poll, so Link must de-duplicate by `lost_id` / `request_id` / `recall_id` (as protocol 12 already requires).
- TTL: lost_mode 30 min, locate_now 5 min, recall 90 s (matches the ~60 s fast-paging window). Expiry is evaluated lazily on each read.
- A newer command of the same kind supersedes older undelivered ones (Lost Mode on then off).
- `expected_delivery_s: 80` is returned so the app can show honest progress.
- Lost mode state on the device record flips only when Link acks. Cloud is authoritative, BLE copy is separate (protocol 9.2).

## Assumptions to confirm with Fiddlie
- Link authenticates with a bearer token (stub); real design needs per-device keys (mTLS or attested token).
- Transport is HTTPS from the nRF9151; CoAP/MQTT may suit LTE-M power better. eDRX/PSM values depend on the network operator and may not give 80 s.
- Payload mirrors protocol fields but is JSON, not the BLE binary format.
