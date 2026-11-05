# Aevea RFQ pack: die-casting, CNC prototype, injection moulding, PCB fab and assembly, battery packs, contract manufacturer

Status: draft, 2026-11-05. Prepared for Aevea (Torus, MagClip, Link). Sign-off by the founder before any email goes out.

## 1. Ground rules before anything is sent

1. **NDA first.** Send a mutual NDA to every supplier before any drawing, firmware, protocol or BOM goes out. Draft NDA terms are in `business/ip-checklist.md` section 2.4.
2. **Share the minimum.** Mechanical suppliers get geometry, materials and tolerances only. They do not get `docs/device-protocol.md`, firmware, cloud design or the risk file. PCB and battery suppliers get only what they need.
3. **Do not send internal BOM notes.** `docs/bom.csv` and `docs/bom-notes.md` contain internal price estimates, status flags and gaps. Send a clean BOM export with part numbers, quantities and reference designators only, no prices and no notes.
4. **Quantities to ask for.** Prototype: 5, 20, 50 units. Pilot: 100 and 500. Production: 1,000 and 5,000 (5,000 matches the BOM break and context target).
5. **Quotes must state assumptions.** Ask every supplier to say what they assume about VAT, freight, duty, currency, and payment terms. Ask for prices in GBP and in USD where the supplier only quotes USD. Do not treat any unit price as final until the supplier confirms it in writing.
6. **Tooling ownership.** Aevea should own all tooling it pays for, plus all design files. Put this in the RFQ and the PO.
7. **Verify dates.** Lead times in replies are the supplier's claims. Check each against a written commitment.

Known facts to mention to suppliers only where relevant:
- DWM3001C (Qorvo UWB + BLE module) shows 0 stock and a 26-week lead time at one distributor in the BOM snapshot (bom-notes). Ask every PCB assembler about allocation.
- Link battery and Torus battery sizes: 300 mAh, 1,200 mAh; MagClip 100 mAh. Cell sourcing is not yet chosen (bom-notes gaps).

---

## 2. Common RFQ template (use for every supplier, with the section for that supplier)

```
Subject: RFQ: [Part or service] for [Aevea project name]: [Supplier name]

Dear [Name],

Aevea Technologies is developing a pet tech product (smart dog lead handle, lead buckle and collar unit). We are looking for a quote for [scope] and would welcome your response by [date, 10 working days from send].

1. Company and contact
   - Aevea Technologies, [registered address], [company number if formed]
   - Contact: [Name, title, email, phone]
   - NDA: [signed on DATE / attached]

2. Parts or services
   [Table: Part name | Internal ID | Material | Process | Tolerance class | Finish | Qty per device]

3. Quantities and timing
   - Prototype: 5, 20, 50 units, price and lead time for each
   - Pilot: 100 and 500 units
   - Production: 1,000 and 5,000 units per year (indicative, not a commitment)
   - Target delivery for first samples: [date]

4. Tooling and NRE
   - Tooling cost, ownership, and what happens to it if we stop ordering
   - Tool lead time and tool life (shots or parts)

5. Quality and documents
   - Your quality system (ISO 9001 or equivalent), first article inspection, material certificates, process control
   - Inspection plan and sample size (AQL) you propose
   - Traceability (lot or serial)

6. Commercial terms
   - Price in GBP (and USD if quoted in USD), VAT status, incoterms, freight and duty assumptions
   - Payment terms, MOQ, validity of quote
   - Confirm tooling and design files stay with Aevea

7. Attachments
   [See the attachment table for this supplier]

8. Questions
   [Numbered list from the supplier section below]

Please reply with your quotation and any questions. We appreciate your time.

Kind regards,
[Name]
[Title], Aevea Technologies
theaevea.com
```

---

## 3. Attachment matrix

| Supplier | Attach (after NDA) | Do not attach |
|---|---|---|
| Die-casting | 3D STEP files for each cast part; 2D drawings with GD&T; material and finish spec; wall thickness and leak-test requirement (IP67 target, CTX); weight limit per part | Firmware, protocol, risk file, internal BOM with notes |
| CNC prototype | 3D STEP files; 2D drawings; material spec; finish spec; quantities | Anything about the cloud, protocol or electronics beyond fit envelope |
| Injection moulding | 3D STEP files; 2D drawings with GD&T and draft notes; material and colour spec; IP67 seal geometry; UL 94 requirement if applicable | Firmware, protocol, BOM |
| PCB fab and assembly | Gerber and ODB++ files per board; drill file; stack-up; clean BOM (no prices); pick-and-place file; assembly drawing; test points; programming instructions and firmware image (only under NDA and only what is needed to program) | Protocol document; cloud design; risk file |
| Battery pack suppliers | Cell and pack requirements sheet (capacity, size, chemistry options, temperature range, cycle life, charge and discharge rates); required reports (IEC 62133-2, UN 38.3); PCM requirement; shipping class | Device firmware; protocol; full product design |
| Contract manufacturer | Clean BOM; assembly drawings; work instructions (to be written); test specification (only the sections relevant to production: from `compliance/acceptance-tests.md`, production tests only) | Protocol document; internal risk file; design rationale |

Files to prepare before sending (none exist in the repo yet):
- STEP and 2D drawings for the Torus housing and drum carrier, MagClip latch housing, anchor plate, Link housing, and lead end caps.
- Gerber and ODB++ outputs for Torus, MagClip and Link PCBs (not in repo).
- A clean BOM export from `docs/bom.csv` (strip price columns and notes).
- A production test specification (subset of `compliance/acceptance-tests.md`).

---

## 4. Die-casting

**Scope.** Candidate parts (Aevea to confirm which are die-cast): Torus housing and drum carrier, MagClip latch housing, anchor plate if zinc or aluminium. Not yet decided in context.md. Mention to the supplier that the parts are candidates.

**Questions to ask.**
1. Alloys available (for example ADC12 aluminium, Zamak 3 or 5 zinc) and the alloy you recommend for a sealed housing.
2. Porosity control and leak-test method. We need IP67 at the housing seams (CTX target).
3. Minimum and typical wall thickness, draft angle, and the rib and boss guidance you give.
4. Machining allowances and locating features for CNC finishing.
5. Surface finish options (shot blast, powder coat, anodise where suitable) and colour matching.
6. Tooling cost, tool life (shots), tool lead time, and who owns the tool.
7. Price at 1,000 and 5,000 per year, with and without machining.
8. First article inspection, dimensional report and material certificates.
9. Lead time for T1 samples and for production.
10. Whether you can support a salt spray or corrosion test for the anchor plate.

**Email draft.**

> Subject: RFQ: die-cast housings for a pet tech device (Aevea)
>
> Dear [Name],
>
> Aevea Technologies is developing a small consumer device for dog leads. We are looking for a die-casting quote for three candidate housings: a handle housing about the size of a small coffee cup, a latch housing about the size of a thumb, and an anchor plate. The housings need to be sealed to IP67, so porosity control and leak testing matter.
>
> We have an NDA ready to sign. Once it is in place, we will send STEP files, drawings and a materials spec. Please let us know whether you can quote at 1,000 and 5,000 units per year, the tooling cost and tool lead time, and your recommended alloy for a sealed housing.
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 5. CNC prototype

**Scope.** Prototype parts for the Torus housing and drum, MagClip latch housing, anchor plate, lock and Bolt Brake parts (steel or hardened parts where the load path is), and fit-check housings for Link. Quantities 5, 20 and 50.

**Questions to ask.**
1. Material options for each part (6061-T6 aluminium, 303 or 316 stainless for load-bearing parts, POM or PA for slide parts, PC or ABS for fit-check housings). Confirm certificates.
2. Tolerance capability on the critical dimensions (GD&T as in the drawings).
3. Finish options and their lead time (anodise, passivate, bead blast).
4. Price per part at 5, 20 and 50 units, and setup charges.
5. Lead time for each batch.
6. Inspection: CMM report on first article, and what you provide for critical features.
7. Whether you can make a load-test fixture or a sample for the 490 N load test.
8. Confidentiality and file handling: do you keep the STEP files after the job is done?

**Email draft.**

> Subject: RFQ: CNC prototype parts for a wearable pet device (Aevea)
>
> Dear [Name],
>
> We need a short run of CNC prototype parts (5, 20 and 50 units) for a dog lead and collar product. The load-bearing parts must hold a 490 N working load with margin, so material certificates and dimensional reports are important.
>
> Once we have an NDA in place, we will share STEP files and 2D drawings. Please quote each batch with lead time, finish options, and inspection you provide.
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 6. Injection moulding

**Scope.** Link housing (PC or PC-ABS with UV stabilisers), Torus overmould (TPU or similar), lead end caps, IP67 seals (silicone or TPE). Prototype tooling first (aluminium soft tool, quantity per supplier) and production tooling later (steel).

**Questions to ask.**
1. Recommended resin for each part, with UV stabilisation and a flame rating (UL 94 HB or V-0) if the supplier can support it. Ask for RoHS and REACH declarations.
2. Tool materials and life for prototype and production tooling. Price for each.
3. DFM review: draft, wall thickness, gate position, weld-line risk, ejector marks, and cosmetic class.
4. How the supplier handles seal geometry and overmolding for IP67.
5. Colour options and colour matching. Lead time for colour approval.
6. Minimum order quantity and price at 1,000 and 5,000 units.
7. Sample lead time for T0 and T1 shots.
8. Inspection plan: dimensional, cosmetic, and leak test support.
9. Who owns tooling and the design data, and what happens if we move production.

**Email draft.**

> Subject: RFQ: injection moulding for a pet tech collar housing (Aevea)
>
> Dear [Name],
>
> We are developing a collar housing and a handle overmould for a small pet device. We need prototype tooling first, then production tooling at 1,000 and 5,000 units per year. The housings must be sealed to IP67, and the material needs UV stability for outdoor use.
>
> After NDA, we will send STEP files, drawings and a materials spec. Please quote the prototype tooling, the production tool, unit prices, and lead times, and tell us what DFM feedback you provide.
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 7. PCB fabrication and assembly

**Scope.** Three boards: Torus, MagClip, Link. Key parts from the BOM (see `docs/bom.csv` for the clean list): Qorvo DWM3001C (UWB and BLE module, nRF52833 plus DW3110), nRF9151 (LTE-M and GNSS), nRF7002 (Wi-Fi), ST LIS2DW12 accelerometer, TI BQ-series chargers and protection (BQ25180, BQ29700 on MagClip), Mill-Max-style pogo pins, USB-C connector, LED ring (SK6812 or similar), piezo, DRV2605L LRA driver, DRV5056 Hall sensor, NTAG 424 DNA.

**Questions to ask.**
1. Fab: stack-up options, RF layer requirements, impedance control, surface finish (ENIG recommended for RF and contacts), IPC class.
2. Assembly: which component package types you can place (LGA, QFN, BGA), and whether you can place RF modules with keep-out areas and shielding cans.
3. Allocation and lead time for DWM3001C, nRF9151, nRF7002 and other critical parts. Do you buy from authorised distributors only? Ask for a written allocation commitment.
4. Alternative parts you propose if a critical part is unavailable, and who approves a change.
5. Test: flying probe or ICT, functional test jig, SWD programming, RF test (BLE and UWB basic check), and fixture cost.
6. Conformal coating options and whether the coating affects the antenna.
7. Traceability: barcode or UID per board, and retention of test data.
8. Prototype quantities and cost at 5, 20, 100 and 1,000 boards.
9. NRE and stencil costs.
10. Whether you can provide DFM and DFA feedback before the first build.
11. Export or import: where do you ship from, and who handles duties?

**Email draft.**

> Subject: RFQ: PCB fabrication and assembly for three small wearable boards (Aevea)
>
> Dear [Name],
>
> We are building a small pet device with three boards: a handle board with UWB and BLE, a small latch board, and a collar board with LTE-M, GNSS and Wi-Fi scanning. We need fabrication, component sourcing and assembly for prototypes (5, 20, 100) and production (1,000, 5,000).
>
> We have an NDA ready. Once it is in place, we will send Gerbers, a clean BOM, pick-and-place files and test instructions. Please tell us your allocation and lead time for the Qorvo DWM3001C module, which is a critical part for us, and what you propose as alternatives.
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 8. Battery pack suppliers

**Scope.** Three packs: Link (300 mAh, current listing candidate is a small LiPo), Torus (1,200 mAh), MagClip (100 mAh). Cell chemistry and format not yet fixed (bom-notes: no price retrieved). Each pack needs IEC 62133-2 and UN 38.3 reports and a protection circuit.

**Questions to ask.**
1. Cell chemistry, format, dimensions and capacity at C/5, and the datasheet.
2. Temperature range for charge and discharge, and for storage.
3. Cycle life to 80% capacity and the test method.
4. Protection circuit (PCM) and fuse or PTC options. Who designs them, and what certifications the PCM has.
5. Test reports available now: IEC 62133-2 (cell and pack), UN 38.3 test summary, and any UL or other reports. Report dates and the cell part number tested.
6. Dangerous goods classification of the pack and the packing options for air, road and sea. Whether you can ship samples by air.
7. Whether you manufacture the cell or buy from a cell maker. Name the cell maker if you are a pack assembler.
8. Price at 100, 1,000 and 5,000 packs, with MOQ and sample lead time.
9. Process controls: incoming cell inspection, traceability per cell, and end-of-line test.
10. Whether you support a removable or replaceable pack design (EU Battery Regulation Article 11, from 18 Feb 2027; see `compliance/certification-checklist.md`).

**Email draft.**

> Subject: RFQ: custom lithium pack for a small pet wearable (Aevea)
>
> Dear [Name],
>
> We need three small custom lithium packs: 300 mAh, 1,200 mAh and 100 mAh. They go inside a dog collar and a dog lead handle, so safety evidence matters as much as price.
>
> Please send your IEC 62133-2 and UN 38.3 reports for the cells and packs you propose, the protection circuit options, the dangerous goods classification, and a price at 100, 1,000 and 5,000 packs. We will sign an NDA first if you need one.
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 9. Contract manufacturer (final assembly and test)

**Scope.** Full box build for Torus, MagClip, Link, the charger and dock (if in Aevea scope). Includes mechanical lead assembly (line, Bolt Brake, lock), anchor and collar assembly, IP67 test, load test, DFU and programming, functional test, serial labelling, packing and dangerous goods packing.

**Questions to ask.**
1. Do you have IP67 test capability (IEC 60529 IPX7 1 m for 30 min, IPX6 dust)? Show equipment and calibration.
2. Load test capability for 490 N, with a calibrated load cell.
3. Functional test: BLE, UWB and LTE-M test capability, or a plan to use an external test house. Who writes and owns the test jig and the test software?
4. Programming: SWD and DFU flow, per-device keys (injected at factory, see device-protocol A6), and secure key handling.
5. Traceability: serial, MAC, UID, test log per device, and retention period.
6. Dangerous goods packing and shipping training for lithium products.
7. Component sourcing: do you buy parts, or work on consignment from Aevea? Who owns inventory?
8. Experience with wearable or pet product builds. Name two relevant references (no confidential names needed).
9. Quality: process controls, AQL, rework rules, and the change control process.
10. Capacity for a pilot run of 100 to 500 units in [timeframe], and a path to 5,000 units.
11. Location of production, lead time, duties, and Incoterms (DDP, DAP or EXW).
12. Confidentiality and IP: how you handle design files, test software and jig designs. Who owns the jig.

**Email draft.**

> Subject: RFQ: final assembly, test and packing for a pet tech device (Aevea)
>
> Dear [Name],
>
> We are looking for a contract manufacturer for a pilot run of about 100 to 500 units, with a path to 5,000 units per year, for a small wearable pet device with a sealed housing, an IP67 target, a 490 N load-rated mechanical lead, and lithium batteries.
>
> Please tell us about your IP67, load and functional test capability, your traceability approach, your dangerous goods packing, and your price and lead time for the pilot. After NDA, we will share the clean BOM, assembly drawings and the production test scope.
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 10. NDA request (send first)

> Subject: Mutual NDA for a hardware project (Aevea)
>
> Dear [Name],
>
> Before we share drawings and specifications for a quote, could you please sign our mutual NDA? I can send the document today. Please let me know who should sign for [company].
>
> Kind regards,
> [Name], [Title], Aevea Technologies, theaevea.com

---

## 11. Tracking

| Supplier | Stage | NDA | Quote due | Lead time confirmed | Notes |
|---|---|---|---|---|---|
| Die-casting | Not sent | No | | | |
| CNC prototype | Not sent | No | | | |
| Injection moulding | Not sent | No | | | |
| PCB fab and assembly | Not sent | No | | | |
| Battery packs | Not sent | No | | | |
| Contract manufacturer | Not sent | No | | | |

## Sources

- Internal: `docs/bom-notes.md` (DWM3001C 26-week lead time, gaps), `docs/context.md` (targets), `docs/device-protocol.md` (keys, DFU).
- Regulatory points referenced: `compliance/certification-checklist.md`.
- Estimates and assumptions in the BOM are not repeated here. Any price must come from a supplier quote.
