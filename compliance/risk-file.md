# Aevea risk file: Torus, MagClip, Link, lead and app

Status: draft, 2026-11-05. Working hazard analysis for design review. Needs review by a veterinary adviser, a product safety engineer, and a UK or EU product compliance lawyer. Test IDs refer to `compliance/acceptance-tests.md`.

## Scope and method

- Covers Torus (handle with 3 m retractable lead, Bolt Brake), MagClip (lead buckle with magnet latch to the collar anchor plate), Link (collar puck with LTE-M, BLE, UWB, Wi-Fi scan, NFC Pet ID), the charger and dock, the app and the cloud.
- Basis: `docs/context.md`, `docs/device-protocol.md`, `docs/bom-notes.md`, and the regulatory draft in `compliance/certification-checklist.md`.
- Method: hazard list by device and by use phase (fitting, walking, tether, LOST, charging, storage, shipping, end of life), then severity, likelihood, mitigation, and test.
- Animal and human harm are both in scope. The dog is the primary user of the product, but owner and bystander harm counts.

## Scales (PROP, to be agreed with engineering and the vet)

**Severity (S)**

| Score | Meaning |
|---|---|
| 1 | Negligible. No injury. Nuisance only. |
| 2 | Minor. Discomfort or short-term distress. No treatment. |
| 3 | Moderate. Injury needing a vet or first aid for the animal or owner, or property damage. |
| 4 | Serious. Permanent injury, loss of the animal, road or traffic involvement, serious owner injury. |
| 5 | Critical. Death of the animal, serious injury to a person, or fire. |

**Likelihood (L)**, over the product life for each unit sold

| Score | Meaning (PROP) |
|---|---|
| 1 | Remote. Not expected in the fleet over life. |
| 2 | Unlikely. Could happen across the fleet. |
| 3 | Possible. Expected in some units or users. |
| 4 | Likely. Expected in many units. |
| 5 | Frequent. Expected in most units. |

**Score** = S x L (before mitigation, and after). Action: 1 to 6 accept with record. 7 to 12 mitigate and test. 13 or more must be mitigated before design freeze.

---

## Hazard table

| ID | Hazard (cause and effect) | Device | S | L | Score | Mitigation (design, process) | Residual S / L / score | Tests |
|---|---|---|---|---|---|---|---|---|
| H01 | Lead, line or lock fails under load, dog escapes or runs into traffic | Lead, T | 4 | 2 | 8 | Lock and line rated 490 N working load and at least 3x ultimate (CTX). Mechanical lock independent of electronics. Bolt Brake slips below the line break load. Line material with UV and abrasion resistance. Inspection and replacement guidance in manual. | 4 / 1 / 4 | AT-001, AT-002, AT-003, AT-036 |
| H02 | MagClip or anchor plate detaches from collar on lunge; lead drops or collar comes off | M, L anchor | 4 | 2 | 8 | Latch retention at least 490 N. Anchor plate fixed to collar with two independent features (no single screw). Latch state sensed (contacts) and reported to app. | 4 / 1 / 4 | AT-008, AT-009, AT-011 |
| H03 | Neck injury from collar tension (throat, spine), breakaway fails, Bolt Brake slip force too high for the dog | Collar, lead, T | 5 | 2 | 10 | Bolt Brake slips near 300 N (CTX) to limit peak neck load; neck threshold to be set by vet. Collar breakaway buckle. Fit guide per size band. Pad under the Link puck. No pinch points. Manual warning against using the lead as a tether to fixed objects. Lunge trial to set max dog weight (CTX 25 kg maybe). | 5 / 1 / 5 (accept with vet sign-off) | AT-004, AT-014, AT-015, AT-086 |
| H04 | Pressure sore, rubbing or hair loss under Link at back of neck | L | 3 | 3 | 9 | Rounded edges (PROP at least 1 mm radius). Soft backing. Mass and balance set by engineering (PROP limit to be set). Breathable backing. Daily check instruction. | 2 / 2 / 4 | AT-017, AT-086 |
| H05 | Lithium cell thermal runaway (Link 300 mAh, Torus 1,200 mAh, MagClip 100 mAh) causes fire or burns | T, M, L, charger | 5 | 1 | 5 | IEC 62133-2 cells. Cell protection on each pack (BQ29700 on MagClip per BOM; Link protection to be confirmed). Fuse or PTC. Charge termination in firmware and in the protection IC. Cells sealed in pouch with mechanical protection. Charge temperature limits. Supplier process controls. | 5 / 1 / 5 (accept after test) | AT-012, AT-018, AT-019, AT-028, AT-029 |
| H06 | Skin burn from a hot surface (Link during LTE TX, charging or sun) | L | 3 | 2 | 6 | Surface temperature limit per IEC 62368-1 at the contact time. Limit transmit duty by eDRX. Reduce charge current at high temperature. | 2 / 2 / 4 | AT-016, AT-035 |
| H07 | Battery swelling, leak or electrolyte contact with skin or dog's mouth | T, M, L | 3 | 2 | 6 | Pouch cells with vent design. Leak-resistant sealing. Battery not in direct contact with neck skin (design check). | 2 / 1 / 2 | AT-012, AT-030 |
| H08 | Shock or irritation at charging contacts (dog licks wet contacts while charging) | M, L | 2 | 3 | 6 | Extra low voltage on contacts (PROP at or below 5.5 V DC). Sealed gold contacts. No charging while wet (test). No exposed mains. | 1 / 2 / 2 | AT-027, AT-034 |
| H09 | Choking or intestinal blockage from a small part (screw, LED, MagClip part, Pet ID insert) | M, L, T | 5 | 2 | 10 | Captive fasteners. No part that fits the small-parts cylinder once detached. Chew-resistant housings. Bonded LEDs. Manual advice to remove electronics from chewing dogs. | 5 / 1 / 5 | AT-013, AT-083 |
| H10 | Magnet ingestion (intestinal damage), or magnet field affecting an implanted device or cards; finger pinch from latch | M | 5 | 2 | 10 | Magnet captive in sealed housing (pull-out test). Field at stated distance below warning level. Implant warning on product and in manual. Latch geometry with no pinch point; release force 20 N to 60 N (PROP). | 4 / 1 / 4 | AT-010, AT-083, AT-084 |
| H11 | Entanglement: lead wraps legs, neck, objects or another dog. Whip or tangle | T, lead | 4 | 3 | 12 | Bolt Brake limits pull-through. 3 m maximum length (CTX). Bright lead colour. Tether alert before line fully extends. Snag and tangle test. Manual on lead use. | 3 / 2 / 6 | AT-005, AT-006, AT-007, AT-041, AT-042 |
| H12 | Collar comes off or breaks while lead is on; dog escapes | Collar, L | 4 | 2 | 8 | Breakaway buckle set by vet. NFC Pet ID tag and Lost Mode for recovery. Locate only when requested (privacy). | 3 / 2 / 6 | AT-015, AT-059, AT-073 |
| H13 | Skin allergy or irritation: nickel on contacts, coatings, adhesives, UHMWPE finish | T, M, L | 2 | 3 | 6 | Nickel-free contacts or gold over a nickel barrier (REACH). Material declarations. Skin-contact screening (PROP, to ISO 10993-10 level). | 2 / 1 / 2 | AT-081, AT-082 |
| H14 | Sound or vibration stress: piezo beep and LRA buzz at high levels cause startle or chronic stress (dog hearing reaches about 45 kHz) | L, T | 2 | 3 | 6 | Vibration first. Sound off at night (PROP). Piezo at or below 70 dB(A) at 1 m (PROP). User-set levels. No sound alerts in HOME state. Welfare trial with vet and ethologist. | 2 / 2 / 4 | AT-069, AT-070 |
| H15 | Halo LED too bright or distracting at night, or visible to other animals | T, L | 1 | 2 | 2 | Night dimming. Brightness limit. | 1 / 1 / 1 | AT-068 |
| H16 | Finger pinch or crush when latching MagClip to anchor plate or fitting the collar | M, collar | 2 | 3 | 6 | Latch geometry with guards. Magnet snap force limit. Instruction on handling. | 1 / 2 / 2 | AT-008, AT-010 |
| H17 | RF exposure to owner who handles Link (human SAR or MPE) | L | 2 | 1 | 2 | Power limits per module. Human exposure evaluation. | 2 / 1 / 2 | AT-085, AT-045 |
| H18 | Privacy: location exposure, owner identity via Pet ID, account takeover, stalking risk from shared location data | Cloud, app, L | 4 | 2 | 8 | No phone numbers shared (Aevea Secure Relay). Location only in LOST, LOCATE_NOW, or AWAY (CTX). Retention limit. Encryption in transit and at rest. Per-device keys (A6). Access logging. DPIA (UK GDPR Art 35). | 3 / 1 / 3 | AT-049, AT-074, AT-075, AT-076 |
| H19 | Cyber attack: forged LOST_MODE or DFU, bond takeover, command replay, tampering with tether | L, T, cloud | 4 | 2 | 8 | Secure boot, signed DFU, anti-rollback (A7, PROT 11). Passkey pairing (A4). Replay protection. Key storage protection (PROT Q4). No default passwords (PSTI). Pen test. CRA reporting process. | 3 / 1 / 3 | AT-047 to AT-053, AT-076 |
| H20 | False LOST or false HOME (Wi-Fi miss, GNSS error, UWB error). Owner misled, lost dog not found | L, app | 3 | 3 | 9 | Multi-signal home logic (CTX). 60 s off-lead loss timer and 300 s away timer (A9). Lost Mode only by command (PROT section 8). Clear app messages. | 2 / 2 / 4 | AT-043, AT-059, AT-061 |
| H21 | Battery empty: no alert, no tether, false sense of security | T, L | 3 | 3 | 9 | LOW_BATTERY at 15% (A9). Push alert. Lock and Bolt Brake work at 0% (CTX). Manual says charge before walk. | 2 / 2 / 4 | AT-026, AT-072 |
| H22 | Water beyond IP67 (swimming, pond, sink), causing short, corrosion, battery damage | T, M, L | 3 | 3 | 9 | IP67 target (CTX). Sealed gold contacts. Manual: no swimming unless tested. | 2 / 2 / 4 | AT-031, AT-033 |
| H23 | Operation or storage out of range (hot car, cold yard) | T, M, L | 3 | 2 | 6 | Operating and storage range declared. Battery derate at temperature. Storage advice. | 2 / 2 / 4 | AT-029, AT-035 |
| H24 | False tether stop or red alert from UWB error. Sudden stop startles or hurts dog | T, L | 3 | 3 | 9 | Ranging filter and hysteresis. Line sensor (up to 3 m, A17) as primary on lead. Amber before red (A12). | 2 / 2 / 4 | AT-040, AT-041 |
| H25 | Recall Assist fails; dog not recalled; runs into road | L, T, app | 4 | 2 | 8 | Mechanical lock always works. BLE Coded PHY then 1M then LTE-M fallback (PROT 9.1, A13). Manual says not to rely on Recall alone. | 3 / 2 / 6 | AT-038, AT-039 |
| H26 | Counterfeit or non-conforming cells from supplier | T, M, L | 5 | 2 | 10 | Approved supplier list. Incoming inspection and certificate check. Lot traceability. | 5 / 1 / 5 | AT-018, AT-019 |
| H27 | Battery fire in transit or storage | All | 4 | 2 | 8 | UN 38.3 summary per cell and pack. Packing per IATA PI 966 or 967. State of charge at or below 30% for air (verify DGR). Carrier with dangerous goods training. | 4 / 1 / 4 | AT-080 |
| H28 | Wrong size or fit for the dog (5 to 20 kg, lunge dogs above 20 kg) | Collar, lead | 3 | 3 | 9 | Size guide. Fit fixtures per band. Max weight set after lunge trial (CTX 25 kg maybe). | 2 / 2 / 4 | AT-014, AT-086 |
| H29 | Restricted substances or coatings in lead, colours or housings | All | 2 | 2 | 4 | REACH, RoHS declarations. XRF screen. | 1 / 2 / 2 | AT-081 |
| H30 | Misuse: tethering to fixed objects, leaving dog unattended on lead, use on other animals, restraint for long periods | Lead, collar | 4 | 3 | 12 | Manual warnings. In-app "do not leave unattended" note. Breakaway and Bolt Brake give some protection. Instruction review. | 3 / 2 / 6 | AT-077 (instructions review) |
| H31 | Sealed Link battery cannot be replaced, so the end-of-life battery is handled badly; EU Battery Regulation Article 11 issue from 18 Feb 2027 | L, T | 3 | 3 | 9 | Decide before design freeze: removable battery design, or a documented exception under Article 11 (legal advice). Disposal guidance and take-back route. | To be set after decision (2 / 2 / 4 target) | AT-077 plus new removal test when design is set |
| H32 | Firmware update fails and leaves device unusable | T, L | 3 | 2 | 6 | Two-slot bootloader with rollback (PROT 11, A7). Battery gate at 30% (A9). Confirm after test boot. | 2 / 1 / 2 | AT-055, AT-056 |
| H33 | Dog chews the device and exposes the cell | T, M, L | 5 | 2 | 10 | Chew test. Cell in protected pouch. Housing with no thin walls near cells. Manual says remove device for chewing dogs. | 5 / 1 / 5 | AT-012, AT-013 |

---

## Summary

- **Above threshold before mitigation (13 or more):** none. Highest pre-mitigation scores are H03, H09, H10, H26, H33 at 10 and H11, H30 at 12 (mitigate and test).
- **Residual at 5 (accept after test and sign-off):** H03 (vet sign-off on neck load), H05 and H26 and H33 (cell and chew risk; accepted only with IEC 62133-2 evidence and chew test pass), H09 (small parts after chew test).
- **Open decisions that change the risk picture:**
  1. Link battery removability (H31). Affects end-of-life and compliance.
  2. Neck-load limit and Bolt Brake slip value (H03). Needs vet input before fixing 300 N.
  3. Maximum dog weight (H28, H03). CTX gives 5 to 20 kg, maybe 25 kg.
  4. Link battery protection circuit (H05). BOM lists BQ29700 on MagClip only. Link protection is not identified.
  5. Recall Assist fallback reliability (H25) depends on Coded PHY on iOS. Apple's developer forum says no roadmap is available. [S] https://developer.apple.com/forums/thread/804458
- **Veterinary and welfare input needed on:** H03, H04, H14, and the sound and vibration levels (AT-069, AT-070). None of the proposed limits here are veterinary-approved.

## Sources used

- Regulatory dates and rules: see `compliance/certification-checklist.md`.
- Coded PHY: https://developer.apple.com/forums/thread/804458
- Design targets: `docs/context.md` and `docs/device-protocol.md` (section 8, 9, 11, 15 and 16).
