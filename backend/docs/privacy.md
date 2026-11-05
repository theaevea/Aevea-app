# UK GDPR notes (engineering view, not legal advice)

- Consent: append-only records per purpose (`trial_data`, `analytics`, `marketing`, `location_history`) with policy version and time; withdrawal is a new record. Trial upload is blocked without current consent. Location for Lost Mode is treated as part of providing the service, not consent based: confirm with counsel.
- Access/portability: `GET /v1/me/export` (JSON). Trials also as CSV.
- Erasure: `DELETE /v1/me` (confirm body), `DELETE /v1/devices/:id/data`, `DELETE /v1/devices/:id/owner`. A hash-only deletion receipt is kept. Backups and logs are not covered by the in-memory scaffold; define retention when persistence exists.
- Aevea Secure Relay: owner phone/email are never stored in public fields (writes with phone/email patterns are rejected) and are not in any public response. Finder IP and details are not stored with messages.
- Push bodies never carry coordinates.
- Not done: data retention schedules, DPA with push/SMS providers, breach process, rectification endpoints beyond PATCH/PUT, family sharing.
