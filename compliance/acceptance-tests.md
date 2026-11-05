# Aevea acceptance tests (Torus T, MagClip M, Link L, system S)

Status: draft, 2026-11-05. For engineering and the contract manufacturer. Test IDs are referenced from `compliance/risk-file.md` and `compliance/certification-checklist.md`.

## Conventions

- **Scope tag:** T = Torus, M = MagClip, L = Link, S = whole system (lead plus collar plus app plus cloud). "Every device" means T, M and L each pass the test unless marked otherwise.
- **Target source:** `CTX` = a number stated in `docs/context.md`. `PROT` = a rule or assumption in `docs/device-protocol.md` (section and A-number given). `PROP` = a proposed limit I set for this draft. Every PROP value needs engineering and veterinary sign-off before the test is run for real.
- **Units:** N for force, mm for length, % for battery state, s for time, dB(A) at 1 m for sound.
- **Sample sizes:** pre-production, 5 units per device unless the test says otherwise. Production: sample plan to be set by the contract manufacturer, with at least AQL values agreed in writing.
- **Pass means all criteria met on every unit.** A single failed unit fails the test. Re-run only after a root cause is recorded.
- **Record:** serial, firmware version, hardware revision, test equipment ID and calibration date, operator, date, raw data file.

## A. Mechanical and load

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-001 | S (line, lock, M latch, anchor plate) | Working load hold | Apply 490 N (50 kg, CTX) for 5 min, straight pull and 45 degree angle | Tensile tester, load cell with ±1% accuracy, fixtures to the real anchor | No slip at the lock, no fracture, permanent deformation of any part under 2% of its dimension | CTX load rating |
| AT-002 | S | Ultimate strength | Pull to failure, record peak force | Same as AT-001 | Peak force at least 1,470 N (3 x 490 N, CTX). Break mode is in the line or the fixture, not in the lock or anchor | CTX "at least 3x ultimate" |
| AT-003 | S | Cyclic fatigue of line and lock | 10,000 cycles between 50 N and 300 N at 0.5 Hz | Cyclic tester | No fracture, no lock slip beyond 2 mm, line strength after cycling at least 1,470 N (AT-002 repeated on 1 unit) | PROP |
| AT-004 | T | Bolt Brake slip force | Pull line, record force at which slip starts and holds | Tensile tester on Torus drum | Slip starts at 270 N to 330 N (300 N ±10%) on each unit | CTX ~300 N; PROT A11 |
| AT-005 | T | Bolt Brake slip travel | Measure line paid out during a slip event at 300 N | Tensile tester, linear encoder | Slip travel up to 50 cm (CTX). Brake holds after slip. Line stays retained with no tangle | CTX "up to 50 cm" |
| AT-006 | T | Line length and retraction | Extend to full length, retract, cycle 1,000 times | Test rig, encoder | Full 3 m extension (CTX). Retraction returns the line without jamming in 1,000 cycles | CTX 3 m lead |
| AT-007 | T | Tangle and snag | Run 500 cycles with a 90 degree turn on a rough surface | Rig with rough path | No loop or snag that stops retraction | PROP |
| AT-008 | M | Latch retention | Pull MagClip from anchor plate in X, Y and Z and at 45 degrees | Tensile tester | Release force at least 490 N in every direction. No release under 490 N | CTX 50 kg rating |
| AT-009 | M | Unintended unlatch | Shake latched MagClip on a vibration table, 5 Hz, 2 g, 1 h, then walk on a treadmill with a dog-shaped load | Vibration table, dummy neck | Zero unlatch events. Contacts stay closed | PROP |
| AT-010 | M | User release force | Measure force needed to unlatch by hand | Force gauge | Release by one hand in 20 N to 60 N (PROP), no tool needed | PROP |
| AT-011 | M, L, T | Drop | Drop from 1.5 m onto concrete, 6 faces, 1 drop each per unit | Drop rig | No battery breach, no cracks through to electronics, no loss of latch or Bolt Brake function. Device still passes AT-071 after drop | PROP |
| AT-012 | L, T | Crush | Apply 500 N for 10 s on the top face of L and T | Press with flat plate | No battery leakage, no smoke, no fire, no fault latch. Device passes AT-071 after the test | PROP |
| AT-013 | M, L, T | Chew and small parts | Dog-chew rig (chew load per engineering), 10 min, then screen parts | Chew rig, EN 71-1 style small-parts cylinder (31.7 mm diameter, 57 mm depth) as screening gauge | No part detached that fits the small-parts cylinder. No sharp edges exposed (defined by sharp-edge gauge) | PROP; risk H09 |
| AT-014 | L | Neck pressure and fit | Fit L on a neck fixture simulating 5 kg and 20 kg dogs, apply 300 N line pull through the collar | Neck fixture with pressure film or load cells | Peak pressure under L within the veterinary limit (value to be set by vet, PROP placeholder 0.5 MPa). No pressure point over the spine | PROP; risk H03 |
| AT-015 | S | Collar breakaway | Pull the collar breakaway buckle at fixed rate | Force gauge | Breaks at a force set by vet review (PROP placeholder 150 N to 250 N), then re-engages without tools | PROP; risk H03 |
| AT-016 | L | Skin contact temperature | At 35 degree ambient for 1 h, worst-case charge and LTE TX, measure surface temperature of the back of L | Thermocouple on the contact face, neck fixture | Surface at or below the IEC 62368-1 touch limit for the material and contact time (set by lab; PROP placeholder 43 degree C) | PROP; risk H06 |
| AT-017 | L, M, T | Rounded edges and comfort | Inspect edges with a radius gauge, 30-day wear trial on fixture or pilot dogs | Radius gauge, skin check | All edges at least 1 mm radius (PROP). No skin damage in pilot wear | PROP; risk H04 |

## B. Battery and power

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-018 | T, M, L | Cell certification | Supplier provides IEC 62133-2 and UN 38.3 reports for each cell and pack design | Document review | Reports present, current, and match the cell part number in the BOM | CTX; bom-notes item 7 |
| AT-019 | T, M, L | Capacity | Charge and discharge at 25 degree C at C/5, record delivered capacity | Battery cycler | At least 95% of nominal (T 1,200 mAh; L 300 mAh; M 100 mAh, CTX) | CTX cell sizes |
| AT-020 | T, M, L | Cycle life | Cycle at 25 degree C to 80% of initial capacity | Cycler | At least 300 cycles (PROP) before 80% | PROP |
| AT-021 | T | Torus battery life | Run the defined duty profile (HOME, WALK, retract, alerts) from 100% | Test rig, logging | At least 9 days and at most 13 days of use (CTX 9-13 days). Report the profile used | CTX |
| AT-022 | L | Link battery life | Run the defined profile (HOME with eDRX, ON_LEAD, OFF_LEAD_TETHER, one LOST event per week) from 100% | Test rig, logging | At least 7 days (CTX target 7+; estimate 10 to 15 days in context). Report the profile | CTX; PROT section 8.1 |
| AT-023 | L, M | MagClip charge contribution | Link on lead with MagClip latched, 20 min | Charge logger | Link state of charge rises by at least 10% per 20 min (CTX). Report MagClip state of charge drop | CTX; checklist open item in bom-notes 3 |
| AT-024 | L, M | Charge gate | Charge from MagClip with Link at 79% and then at 80% | Charge logger | Charging starts at 79% and stops by 80% (CTX "only below 80%") | CTX |
| AT-025 | S | Charging paths | Charge T from USB-C, M from T dock, L from M contacts | Charger, logger | Each path reaches full charge and stops. No wireless or NFC charging path exists in hardware | CTX charging rules |
| AT-026 | T, L | Battery thresholds | Discharge slowly, log events at 15%, 20%, 5% | Cycler, event log | LOW_BATTERY at 15% (+/- 2%), exit at 20%, BATTERY_CRITICAL at 5% (+/- 2%). Starting values per A9 | PROT A9 |
| AT-027 | M, L | Contact voltage | Measure voltage and current at the pogo and contact points with the charger connected | Multimeter, probes | Maximum voltage at contacts within a safe extra low voltage limit (verify with the lab; PROP placeholder 5.5 V DC). No exposed voltage above that | PROP; risk H08 |
| AT-028 | L | Battery safety with protection | Overcharge, over-discharge and short-circuit at system level (device, not cell) | Electronic load, supply, short-circuit test bench | No fire, no smoke, no leak. Protection trips and the device recovers after removal of the fault | PROP; risk H05 |
| AT-029 | T, M, L | Thermal cycling | -10 degree C to 45 degree C, 10 cycles, 2 h dwell each | Climatic chamber | No leak, no swelling, all functions pass AT-071 after cycling | PROP |
| AT-030 | T, M, L | Battery swelling and leak | Store at 60 degree C, 85% RH for 7 days, then measure | Climatic chamber | No swelling beyond 2 mm (PROP), no electrolyte | PROP; risk H07 |

## C. Ingress and environment

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-031 | T, M, L | IP67 (IPX7) | Immerse 1 m for 30 min per IEC 60529, assembled and latched | Immersion tank | No water ingress. All functions pass AT-071 after test | CTX IP67 target; IEC 60529 |
| AT-032 | T, M, L | IP6X dust | Talc test per IEC 60529 for 8 h | Dust chamber | No ingress that affects function or battery | IEC 60529 |
| AT-033 | T, L | Repeated immersion | 20 immersions of 30 min at 1 m | Immersion tank | Pass criteria of AT-031 after each set of 5 cycles | PROP |
| AT-034 | L | Wet charging | Charge L and M after wet test with contacts wet and dry | Charger, logger | No charge without drying; no shock to dog; contacts dry and charge correctly | PROP; risk H08 |
| AT-035 | T, M, L | Operating temperature | Run -10 degree C to +45 degree C operating and -20 degree C to +60 degree C storage | Climatic chamber | All functions pass AT-071 in range. Battery performance within 20% of AT-019 at low end (PROP) | PROP |
| AT-036 | Lead | UV and abrasion | 500 h UV, 1,000 cycles abrasion on the line | UV chamber, abrasion tester | Line strength stays at least 1,470 N after test | PROP; risk H01 |
| AT-037 | T, L | Salt spray | Optional for lock and anchor, 48 h | Salt chamber | No corrosion that affects function | PROP |

## D. Radio and RF

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-038 | T, L | BLE range (Coded PHY if the phone supports it, otherwise 1M) | Walk a set path at 0 m to 30 m (PROP), record link | Phone, BLE sniffer | Recall Assist cue reaches the device at the target distance (PROP 30 m). Record Coded PHY support on each phone model used | PROT section 9.1, A8, Q10 |
| AT-039 | L | Recall fallback | Unclip M, drop Torus and phone BLE, trigger cloud Recall | Cloud rig, LTE-M network | Link wakes LTE-M and pages at 1 to 2 s intervals for about 60 s. Cue within the 60 s window | CTX Recall Assist; PROT A13 |
| AT-040 | T, L | Torus-Link UWB ranging | Ranging at 4 Hz off lead, 1 Hz on lead | Reference ruler, UWB reference | Range error at or below a set value (PROP ±30 cm at 3 m to 10 m). Rates per A16 | CTX tether 3-10 m; PROT A16 |
| AT-041 | T | Tether radius | Set radius 3, 6, 10 m. Check amber alert at 80% of radius | Test rig with reference distance | Amber at 80% (+/- 5%). Red at radius. Radii between 3 m and 10 m accepted | CTX tether 3-10 m; PROT A12 |
| AT-042 | S | Tether arm on unclip | Latch and unlatch M, observe state | App, logs | HOME to ON_LEAD on walk start. ON_LEAD to OFF_LEAD_TETHER on unclip during walk. Back to ON_LEAD on latch | PROT section 8 |
| AT-043 | L | Wi-Fi scan | Scan at home SSID and away locations | Wi-Fi test AP | Home SSID seen within the scan window; no false HOME on other SSIDs | CTX home detection |
| AT-044 | L | GNSS only in allowed states | Measure GNSS current and log GNSS on in HOME, ON_LEAD, OFF_LEAD, AWAY, LOST, LOCATE | Current meter, logs | GNSS on only in LOST, LOCATE_NOW, or AWAY | CTX design rule |
| AT-045 | S | Radio compliance smoke | Pre-compliance scan of BLE, UWB, Wi-Fi, LTE-M, NFC before lab booking | Spectrum analyser, lab pre-scan | Within limits with margin (PROP 3 dB) | Checklist 2.1-2.2 |
| AT-046 | L | NFC read | Tap NTAG 424 DNA with phone (iPhone and Android) at 0 mm to 20 mm | Test phones | Read in all tests. Read range recorded | CTX Pet ID NFC |

## E. Connectivity, behaviour and state

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-047 | T, L | Secure boot and signed DFU | Load an unsigned image, a tampered image, and an older signed image | DFU host, debugger | All three rejected. Signed newer image accepted | PROT section 11, A7; CTX signed OTA |
| AT-048 | T, L | Key protection | Attempt debug read of key storage | Debugger | Read blocked. APPROTECT or equivalent set, no fallback | PROT Q4; CTX secure boot |
| AT-049 | S | No default password (PSTI) | Inspect pairing, default credentials, app defaults | Document review, test | No universal default password or easily guessable default. Each device has unique K_pair (A6) | UK PSTI regs (checklist 1.2) |
| AT-050 | S | Vulnerability reporting info | Check app, website and docs | Review | Published page or email for reporting security issues | UK PSTI regs (checklist 1.2) |
| AT-051 | S | Update period published | Check public statement | Review | Minimum security update period published and matched by DFU plan | UK PSTI regs (checklist 1.2); CRA |
| AT-052 | T, L | BLE fuzzing | Fuzz GATT and frame parser (device-protocol section 4) | BLE fuzzer | No crash, hang or reset. Unknown events and trailing bytes ignored (PROT section 1 and 13) | PROT section 13 |
| AT-053 | T, L | Command replay | Replay a captured signed command | BLE sniffer, test host | Replayed command rejected | PROT section 9 |
| AT-054 | T, L | Pairing | Pair with passkey entry. Confirm numeric comparison is not used | App, device | Passkey flow works. Pairing window 300 s. Max 4 phone bonds (A15) | PROT A4, A5, A15 |
| AT-055 | T, L | DFU rollback | Install image, do not confirm; power-cycle 3 times, check rollback | DFU host | Rollback after 600 s without confirmation or after 3 unconfirmed boots (PROT section 11) | PROT section 11 |
| AT-056 | T, L | DFU battery gate | Start DFU at 25% and at 35% battery | DFU host | Refuses below 30% (PROT A9), starts at 30% or more | PROT A9 |
| AT-057 | T, L | Event queue | Disconnect for 4 h with events; reconnect | Event generator | At least 256 events held. Oldest dropped on overflow. Order kept | PROT A10 |
| AT-058 | T, L | Time sync | SET_TIME on connect; measure drift for 24 h | Logger | Drift at or below 5 s per day (PROP) | PROT SET_TIME |
| AT-059 | S | Lost Mode latency | Trigger from app; measure time to Link acting | Cloud rig, LTE-M | Command acted on within about 80 s (CTX, eDRX check). Live position every 15 s at 50% or more battery (CTX) | CTX Lost Mode; PROT section 8 |
| AT-060 | L | Lost Mode reporting schedule | Test battery levels 50%, 20%, 10%, 5% | Simulator | Report interval 15 s, 30 s, 60 s, 300 s respectively (PROT section 8, A9) | PROT section 8 |
| AT-061 | L | Home and away logic | Dog at home with no Torus or phone for 30 min | Test home | Not LOST; no false lost alert. AWAY only after 300 s away (PROT A9) | CTX "a dog at home is not lost" |
| AT-062 | S | Walk flow | Start walk, unclip, tether, latch, stop walk | App, device | State log matches section 8. Events in app match device | PROT section 8, 9 |
| AT-063 | T, M, L | Self-test | Run SELF_TEST on each device | App | All sub-tests pass. Failures show the correct error code | PROT SELF_TEST |
| AT-064 | S | Factory reset | Run FACTORY_RESET | App | Bonds, keys and owner binding cleared; device returns to pairing window | PROT 0x07 |

## F. Sensors, haptics and alerts

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-065 | T | Hall and angle sensing | Move drum through full range at 0.1 m/s and 1 m/s | Rig with encoder | Angle accuracy within PROP ±5 degree, line distance up to 3 m | PROT A17 |
| AT-066 | T | Force estimate | Compare estimated force from drum deceleration with load cell at 50 N, 150 N, 300 N | Load cell | Estimate within PROP ±20% at 150 N and 300 N. App shows it only if within band | PROT A11, Q11 |
| AT-067 | L | Accelerometer wake | Wake on motion, check current in HOME | Current meter | Accelerometer at about 1 uA in HOME (PROT 8.1). Wake on motion within 1 s (PROP) | PROT 8.1 |
| AT-068 | T, L | Halo state colours | Run each state (HOME, ON_LEAD, OFF_LEAD, AWAY, LOST, CHARGING, LOW_BATTERY) | Photometer | Colour matches the app spec for each state. LED count is 12 or 16 per the chosen design (CTX) | CTX Halo 12-16 RGB |
| AT-069 | T, L | LRA and piezo alert level | Measure sound at 1 m for each alert, and vibration acceleration on the LRA | Sound meter, accelerometer | Piezo at or below 70 dB(A) at 1 m (PROP). LRA acceleration within design spec | PROP; risk H14 |
| AT-070 | S | Dog welfare (behaviour) | 10 dogs, 4 weeks, stress indicators logged by ethologist and vet. Alerts at 4 levels | Vet and ethologist, video, cortisol if approved | No increase over baseline in stress markers at the chosen alert settings. Vet sign-off | PROP; risk H14 |

## G. System and functional

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-071 | T, M, L | Functional smoke after each stress test | Run a fixed script: pairing, status, halo, buzz, walk start and stop | App, device | All pass. Used after AT-011 to AT-037 | Process |
| AT-072 | S | Mechanical function with battery at 0% | Discharge to 0%, check lock and Bolt Brake at 300 N and Pet ID tag | Tensile tester, NFC reader | Lock holds, Bolt Brake slips at 300 N (AT-004), NFC tag reads | CTX "safety never depends on battery"; PROT A9 |
| AT-073 | S | Pet ID (NFC, signed URL) | Tap 50 times, check unique signed URL each tap. Clone the tag and attempt to use the cloned URL | NTAG 424 DNA reader, cloud | Each tap gives a fresh signed URL. Cloned or replayed URL rejected | CTX Pet ID |
| AT-074 | S | Data export and deletion | Export trial log, request deletion | App, cloud | Export complete. Deletion removes owner data and location history within the stated period | UK GDPR (checklist 1.3) |
| AT-075 | S | Location privacy | Confirm GNSS data is held only for the stated purpose and retention | Cloud audit | Retention matches the privacy notice. No phone numbers shared through Pet ID relay | CTX Pet ID relay; UK GDPR |
| AT-076 | S | Pen test | External test of app, cloud, relay and BLE | Third-party tester | No critical or high finding left open at launch (PROP) | CRA; RED cyber |
| AT-077 | S | Documentation pack | Confirm DoC, technical file, PSTI statement, battery reports, UN 38.3 summary, SBOM | Document review | All present and version-matched to the build | Checklist |

## H. Charger, dock and shipping

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-078 | Charger, dock | Electrical safety | Apply IEC 62368-1 tests (per lab) | Lab | Pass | Checklist 3.1 |
| AT-079 | Charger, dock | EMC | Pre-compliance then lab | Lab | Pass | Checklist 2.1 |
| AT-080 | S | Shipping packaging drop | Pack per UN packaging and DGR, drop per the lab's method | Drop rig | No leak, no fire, no short. State of charge at 30% (or the value from the DGR at the time) before shipping | Checklist 3.2 |
| AT-081 | S | Substances | XRF screen and supplier declarations for RoHS and REACH | XRF, document review | No restricted substance above limit. SVHC declared above 0.1% w/w | Checklist 2.5 |
| AT-082 | Contacts | Nickel release | EN 1811 on contacts in skin contact | Lab | Release within the REACH limit (lab sets) | Checklist 2.5; risk H13 |

## I. Magnets, human exposure and fit

| ID | Scope | Test | Method | Equipment | Pass criteria | Traces to |
|---|---|---|---|---|---|---|
| AT-083 | M | Magnet captive retention | Pull the magnet from its housing at 50 N and 100 N in each direction, after AT-011 drop and AT-013 chew | Force gauge | Magnet stays captive. No loose magnet after any test | PROP; risk H10 |
| AT-084 | M | Magnet field at distance | Measure stray field at 10 cm, 30 cm and at the implant-warning distance set by the designer (PROP 15 cm) | Gaussmeter | Field at the stated distance below the value in the warning label. Warning text present on product and in the manual | PROP; risk H10 |
| AT-085 | L, T | Human exposure (SAR or MPE) | Evaluate worst-case handling distance for Link and Torus, both transmitters at maximum power | Lab with SAR or MPE system | Within the limits in EN 62311 or EN 62209-2 as applicable (lab sets) | Checklist 2.2; risk H17 |
| AT-086 | Collar | Size and fit guide | Check the sizing chart against fixtures at each size band (5 to 20 kg, and 25 kg if confirmed) | Fit fixture, checklist | Each size passes AT-014 at its band. Fit guide matches the fixtures | CTX dog weight range; risk H28 |

## Coverage notes

- Targets in `docs/context.md` covered: 50 kg lead rating (AT-001, AT-002, AT-008), 3x ultimate (AT-002), Bolt Brake 300 N (AT-004), Bolt Brake 50 cm (AT-005), 3 m lead (AT-006), 3 to 10 m tether (AT-041), Torus 9 to 13 days (AT-021), Link 7+ days (AT-022), MagClip +10% per 20 min (AT-023), Link charging below 80% (AT-024), contact-only charging (AT-025), IP67 (AT-031), Lost Mode 80 s (AT-059), 15 s live position (AT-059), 12 to 16 Halo LEDs (AT-068), GNSS gating (AT-044), home detection (AT-061), NFC Pet ID (AT-046, AT-073), no battery dependence for safety (AT-072), secure boot and signed OTA (AT-047), UK PSTI and EN 18031 link (AT-049 to AT-053).
- Not covered by a test: cost target (GBP 80 to 100 landed), which is a commercial item, not a test.
- Dog weight range: CTX gives 5 to 20 kg (maybe 25 kg after lunge trial). Test fixtures use 5 kg and 20 kg. Add 25 kg fixture if the lunge trial confirms.
