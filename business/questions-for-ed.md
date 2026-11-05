# Questions for Ed Hill (Fiddlie): consolidated list

Status: 2026-11-05. Built from every doc in the repo and the compliance drafts. Ed Hill is at Fiddlie, Aevea's hardware partner. Send this as a list, in priority order, with a short call for the top items. Do not send internal price notes (`docs/bom-notes.md` prices are estimates) and do not send the risk file or the regulatory drafts. Ask only the questions below.

Source key:
- **P** = `docs/device-protocol.md` section 16 (open questions for Fiddlie), numbered Q1 to Q14.
- **A** = `docs/device-protocol.md` section 15 (assumptions A1 to A18).
- **B** = `docs/bom-notes.md` open items (numbered) or gaps.
- **C** = `compliance/certification-checklist.md` section 8 and related sections.
- **R** = `compliance/risk-file.md` open decisions.
- **K** = `business/ip-checklist.md`.

---

## 1. Top priority (answer before the next firmware or hardware freeze)

1. **DWM3001C lead time (B).** The CSR variant shows 0 stock and a 26-week lead time at Avnet. Which distributor and part number do you plan to use, and what is your allocation plan for prototypes and for 1,000 and 5,000 units? Is there an approved alternative?
2. **Coded PHY on iPhone (P Q10, A8, C section 8).** Apple's developer forum says no roadmap is available for CoreBluetooth Coded PHY. Recall Assist depends on Coded PHY first, then 1M. What is your fallback if the iPhone cannot negotiate Coded PHY? Does the Link TX power budget work on 1M alone?
3. **Battery removability (C section 2.5, R H31).** EU Battery Regulation Article 11 requires portable batteries to be removable and replaceable from 18 February 2027, with exceptions. Can Link (IP67, sealed) be designed with a replaceable battery or a documented exception? What is the impact on the 300 mAh cell and the enclosure?
4. **Secure key storage (P Q4, A6, A-items).** nRF52833 has no CryptoCell or KMU. Is a secure element planned for Torus and Link? If not, which protected flash and APPROTECT setup do you use?
5. **Bootloader and DFU (P Q7, Q8, A7).** MCUboot with MCUmgr/SMP or a custom bootloader? Signing algorithm and key ceremony? Is nRF9151 modem FOTA in scope over BLE or only over LTE-M? Expected image sizes.

## 2. Architecture and hardware

6. **MagClip electronics (P Q2, Q3, B item 2).** Does MagClip have an MCU? If yes, is it updatable and how is it updated through Torus? How does Torus reach MagClip while the clip is on the collar: conductors in the line, a relay via Link, or only when docked? Who senses latch: MagClip, Link or both?
7. **MagClip charge path (B item 3).** Confirm BQ25180 and BQ29700 are on MagClip, and whether a fuel gauge is needed. The BOM assumes MagClip charges from the Torus dock. Confirm the charge path. (BQ29700 is a protection IC by part family; verify.)
8. **Torus MCU and sensors (B item 2, item 4).** Does Torus need a separate MCU, or is the DWM3001C enough? How many Hall sensors (BOM assumes 2 for line and slip) and which angle sensor (TMAG5170 was not retrieved)?
9. **Torus input (P Q1).** Does Torus or Link have any button, touch area or capacitive input? It would enable numeric comparison and a manual pairing window (A4, A5).
10. **LED ring count (B item 6).** 12 or 16 LEDs? The BOM costs 16 (about GBP 9 at prototype).
11. **Antennas and SIM (B item 5).** Antennas for BLE, UWB, LTE, GNSS and Wi-Fi: type, count and placement. SIM or eSIM for nRF9151, and the GNSS antenna. None are priced yet.
12. **Clock (P Q13).** Does Torus need its own clock, or is SET_TIME on connect enough for event timestamps (A-items, drift target 5 s/day in acceptance tests)?
13. **Flash budget (P Q12, A10).** Flash and RAM budget for the event queue (at least 256 events), dual-slot images and bonds on each MCU.
14. **Sensing (P Q6, Q11, A11, A17).** UWB ranging rate within the 7+ day Link and 9 to 13 day Torus battery targets. Initiator and controller roles. Can Torus derive a usable force estimate from Hall and angle data (A11 says force is estimated, no load cell), and what accuracy should the app show?
15. **UWB secure ranging (P Q5).** Which STS mode (FiRa SP3 static or dynamic STS?), and how is the STS key derived from the BIND_PEER ECDH secret?
16. **Recall fallback trigger (P Q9, A13).** What exactly wakes LTE-M fast paging (1 to 2 s for about 60 s)? Is that achievable with the chosen network and eDRX settings?

## 3. Power and battery

17. **MagClip charge rate (new check from this review).** The target is MagClip adds at least 10% to Link per 20 minutes. Link is 300 mAh, so 10% is 30 mAh per 20 minutes (about 90 mA average). MagClip is 100 mAh, so that transfer is 30% of MagClip per 20 minutes. Is that the intended design, and what is MagClip's dock recharge cycle?
18. **Link battery life (CTX 7+ days, estimate 10 to 15 days).** What duty profile supports 7+ days on 300 mAh? Give the assumptions (eDRX interval, GNSS duty, Wi-Fi scan duty, LTE-M attach).
19. **Torus battery life (CTX 9 to 13 days on 1,200 mAh).** Same question for Torus.
20. **Battery thresholds (A9).** 15% low, 5% critical, 30% DFU minimum, 300 s away timer and 60 s loss timer are starting values. Which do you want to tune first?

## 4. Mechanical and safety

21. **Bolt Brake vs lead rating (new check).** Bolt Brake slips at about 300 N (A11). The lead, lock and MagClip are rated 490 N working load and 3x ultimate. Confirm the slip value and how it was derived. Is a 300 N slip value safe for a 5 to 20 kg dog, and what neck-load limit do you assume? (The vet will give the final answer.)
22. **Collar breakaway.** Is there a breakaway buckle or release on the collar? What force?
23. **Lead material (B item 21).** UHMWPE guyline (449 kg breaking load) is a camping product price reference only. What is the rated spec for the production line (breaking strength, UV, abrasion, knot strength)?
24. **Magnet (B item 20).** The MagClip magnet is a placeholder (N52, 5 x 1 mm). What is the latch magnet size and grade, pull force, and how is it captive?
25. **Anchor plate (B item 1).** What material and process (stamped steel, die-cast, machined)? Who makes it?
26. **IP67 claim (A-items, CTX).** Which parts are tested to IPX7 and which only to IPX6? Are the seals silicone or TPE? Is the sealing of the gold contacts specified?
27. **Dog weight range (CTX 5 to 20 kg, maybe 25 kg).** Has the lunge trial been run? What result?

## 5. Components and cost (for the BOM)

28. **Price verification (B items 9 and 10).** Can you confirm GBP prices from DigiKey UK, Mouser UK or Farnell UK for nRF9151, DWM3001C, nRF7002, LIS2DW12, DRV2605L? The BOM uses US list prices converted at a fixed rate.
29. **LRA motor (B item 1 in gaps, L08).** Which LRA part? No price retrieved.
30. **Cell sourcing (B items 8 and gaps).** Which cell maker and part for 300 mAh, 1,200 mAh and 100 mAh? Do you have a UN 38.3 summary for each?
31. **NTAG 424 DNA (B gap).** The chip MOQ is 100 to 24,145. Is the tag an inlay or a finished tag? Which supplier?
32. **Pogo pins (B item gap, L19).** Gold plating and contact count (2, 4 or 2)? Confirm the contact count assumptions.
33. **SK6812 LED alternative (B item 17).** Is the 3527 alternative (XINGLIGHT XL-3527RGBC-SK6812B) acceptable? It is about USD 0.10 at 15,000 units.
34. **DRV5056 vs angle sensor (B item 18).** Keep analogue Hall, or move to TMAG5170 for angle?
35. **Mechanics pricing (B item 1).** Bolt Brake, drum, housing, lock, anchor plate, collar, IP67 seals and MagClip latch hardware are not priced. Provide drawings or a parts list so we can request quotes.
36. **Freight and duty assumptions (B method).** The BOM assumes 15% freight and 25% duty. Confirm your assumptions for the production route.

## 6. Compliance and certification

37. **Bluetooth SIG (P Q14).** Company ID and QDID plan. Who submits?
38. **EN 18031 and PSTI (P Q14, C section 2.1 and 1.2).** Default passwords, pairing rules and update policy: which of these are in the firmware today? Which EN 18031 part are you expecting to test to?
39. **Module certifications.** Which FCC, ISED, CE/RED and UKCA reports do you hold for DWM3001C and nRF9151? Which conditions (antenna, labelling, host) apply? Which operator and GCF or PTCRB campaigns are in scope?
40. **UK operators (C section 4.2).** Which UK operator are you planning (EE, Vodafone, O2 or Three)? EE is not on Nordic's list. Do you have their IoT approval requirements?
41. **NFC tag RF approval (C section 2.2).** Does the NTAG 424 DNA inlay need its own RF approval in the product, or is it covered by the supplier?
42. **Wi-Fi scan privacy (R H18, K).** Are SSIDs stored in clear or hashed on the device and in the cloud? What is the retention?
43. **CRA readiness (C section 2.8).** Vulnerability handling, SBOM and support period. Who is the vulnerability contact?
44. **Test support.** Can Fiddlie provide a production test image and test software for the contract manufacturer (see `business/rfq-pack.md` section 9)?

## 7. IP and contracts (raise with the founder before sending)

45. **Fiddlie IP assignment (K section 2).** Is there a signed assignment or development agreement? What background IP does Fiddlie bring (BLE stack, bootloader, test scripts)? What licence terms apply to background IP?
46. **Ownership of protocol and firmware (K section 2.2).** Confirm that protocol and firmware written for Aevea are assigned to Aevea.
47. **Tooling and jigs (K section 2.7).** Who owns the programming jig and test software?
48. **AI-assisted design (K section 2.5).** Which AI tools have Fiddlie or Aevea used in firmware, PCB or CAD? Keep records.

---

## 8. Closing actions

- Send questions 1 to 5 as an email before the call, and go through 6 to 27 on the call.
- Track answers in the repo as a dated list. Each answer changes a document: update `compliance/risk-file.md` (R items), `compliance/acceptance-tests.md` (targets), or `business/rfq-pack.md` (quotes).
- Do not send questions 45 to 48 to Ed until the founder has reviewed them with a solicitor.
