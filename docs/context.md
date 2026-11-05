# Aevea hardware and app context (source of truth for agents)

Aevea (theaevea.com) is a pet tech startup. Three devices plus a phone app and cloud:

- **Torus**: smart control handle for a retractable 3 m lead. Annular drum, 1,200 mAh cell, USB-C charging, Halo LED ring (12-16 RGB), LRA haptics (DRV2605L), Hall/angle sensors for line and slip, Bolt Brake (passive friction slip clutch, slips ~300 N, up to 50 cm), Qorvo UWB + Nordic BLE (DWM3001C module: nRF52833 + DW3110 for prototypes).
- **MagClip**: the lead's buckle. 100 mAh cell, magnet-guided mechanical latch to a metal anchor plate in the collar (load never goes through Link housing), sealed gold contacts. Charges by CONTACTS at both ends: Torus dock -> MagClip, MagClip -> Link. No wireless/NFC charging. Charges Link only when Link is below 80%. Latched/unlatched is sensed through the contacts.
- **Link**: smart collar puck at back of neck. Nordic nRF9151 (LTE-M, GNSS), 300 mAh cell, Qorvo DWM3001C (BLE+UWB), nRF7002 Wi-Fi companion (scan-only for home detection), NTAG 424 DNA passive NFC Pet ID tag, ST LIS2DW12 accelerometer (motion, ~1 uA), LRA + piezo for alerts. IP67 target.
- **App**: Flutter, iPhone + Android. MVP tabs: Today, Walk, Activity (hidden), Find. MVP features: pairing, walk (start, tether radius 3-10 m, live distance, Recall Assist button, Halo state, bolt events), Locate now, basic Lost Mode with live map, Pet ID profile, firmware updates over BLE, device self test, trial log export.
- **Cloud**: device registry, location + alert handling, push notifications, GPS assistance data, firmware hosting, trial data storage, Pet ID finder web page with Aevea Secure Relay (no phone numbers shared).

## Design rules
- GPS only runs in Lost Mode, on Locate now, or when Link is away from Torus AND the owner's phone AND not at home (Wi-Fi scan). All power-hungry features are gated.
- Home detection: known Wi-Fi SSID scan + motion gating. A dog at home without Torus/phone is NOT lost.
- Safety never depends on battery: lock and Bolt Brake are mechanical. Pet ID is passive.
- Tether Mode is an OFF-LEAD feature (UWB, radius 3-10 m), armed when MagClip unclips.
- Recall Assist: BLE long range (Coded PHY) first; if MagClip unclipped, Link also wakes LTE-M and listens with fast paging (every 1-2 s for about a minute) as fallback.
- Lost Mode: app -> cloud -> Link within ~80 s (eDRX command check), then live position every 15 s, slowing as battery falls.
- Pet ID: NFC tap opens a universal link (web page; iPhone App Clip later). NTAG 424 DNA gives a fresh signed URL per tap.
- Dog weight range for prototypes: 5-20 kg (maybe 25 kg after lunge trial). Line, lock, MagClip rated 50 kg working load (~490 N), >=3x ultimate.
- Link target 7+ days (est. 10-15); Torus about 9-13 days; MagClip adds >=10% to Link per 20 min on lead.
- Device states: home, on lead, off lead (tether), away, lost, charging, low battery.
- Security: secure boot, signed OTA, per-device keys, secure UWB ranging, secure pairing.
- Certification: UK PSTI, UKCA/CE, EU RED cybersecurity (EN 18031), cellular approval, battery shipping rules. Modules reduce but do not remove end-product certification.
- Cost target Ed: GBP 80-100 landed at 5,000 units; honest estimate GBP 86-158 landed.
- IP: Aevea owns every design.
