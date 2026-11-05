# Aevea certification checklist (Torus, MagClip, Link, dock/charger, app)

Status: working draft, prepared 2026-11-05. Not legal advice. Review by a UK/EU product compliance lawyer and an accredited lab before any submission or sales claim.

Scope: Torus (smart handle), MagClip (lead buckle), Link (smart collar puck), the USB-C charger and Torus dock, and the Flutter app plus cloud. Design basis: `docs/context.md`, `docs/device-protocol.md`, `docs/bom-notes.md`.

Key to evidence:
- **[S]** = source read in this session (URL given).
- **[C]** = my knowledge of the instrument, not re-read this session; verify the current text before relying on it.
- **EST** = estimate with no source. Do not quote to suppliers or investors.

---

## 0. Device-to-regime map

| Regime | Torus | MagClip | Link | Charger / dock | App / cloud |
|---|---|---|---|---|---|
| UK Radio Equipment Regs 2017 (CE or UKCA) | Yes (BLE, UWB) | No radio | Yes (BLE, UWB, LTE-M, GNSS, Wi-Fi, NFC) | No radio | n/a |
| EU RED 2014/53/EU | Yes | No | Yes | No | n/a |
| UK PSTI Act 2022 + 2023 Regs | Yes (connectable) | Not on its own (no network link) | Yes | No | n/a (cloud is the vendor's service) |
| EU RED 3(3)(d)-(f) cyber (EN 18031) | Yes | No | Yes | No | n/a |
| EU CRA 2024/2847 | Yes (product with digital elements) | Only if it has firmware | Yes | Only if it has firmware | Cloud is a service, not a product |
| EU/UK batteries | Yes (1,200 mAh) | Yes (100 mAh) | Yes (300 mAh) | Not a battery | n/a |
| LVD / EMC (non-radio parts) | Partly (USB 5 V is below LVD) | No | Partly | Yes (mains adapter) | n/a |
| EU GPSR 2023/988 / GB product safety | Yes | Yes | Yes | Yes | n/a |
| UK GDPR / EU GDPR (location, pet ID) | Via Link | Via Link | Yes | No | Yes |
| RoHS, REACH, WEEE (EU and UK) | Yes | Yes | Yes | Yes | No |
| Cellular operator approval | No | No | Yes | No | No |
| Shipping of Li cells (UN38.3, IATA DGR) | Yes | Yes | Yes | Yes (cells in pack) | No |

---

## 1. United Kingdom

### 1.1 Radio equipment (UKCA or CE)
- **Rule.** The Radio Equipment Regulations 2017 apply. In Great Britain, the UK government says legislation in force on 1 October 2024 continues recognition of CE marking, and businesses may use UKCA or CE. In Northern Ireland, CE or UKNI marking applies. [S] https://www.gov.uk/government/publications/product-regulations-by-sector-and-current-approaches-to-product-marking-ukca-and-ce-regimes/product-regulations-by-sector-and-current-approaches-to-product-marking-ukca-and-ce-regimes
- **Statutory text.** [S] https://legislation.gov.uk/uksi/2017/1206/body/made/data.pdf (read for the conformity route and declaration; verify the current consolidated version).
- **Action.** Use one technical file for GB and EU. Put CE on the product and a UK declaration of conformity. UKCA is optional under the current position, but confirm before printing labels.
- **Gap.** I did not find a separate UK radio-equipment cybersecurity requirement. PSTI (section 1.2) is the UK cyber regime for these devices. Confirm with OPSS or the lawyer.

### 1.2 Product Security and Telecommunications Infrastructure Act 2022 (PSTI)
- **Rule.** The PSTI regime came into effect on 29 April 2024. It applies to relevant consumer products that can connect to the internet or a network. Torus and Link are in scope. MagClip has no radio and is not in scope on its own. [S] https://www.gov.uk/guidance/regulations-consumer-connectable-product-security
- **Security requirements (three named).** (a) Ban universal default and easily guessable passwords. (b) Publish information on how to report security issues. (c) Publish information on minimum security update periods. [S] Same URL.
- **Duties.** Statement of compliance, investigate potential failures, keep records, act on failures. Enforcement by OPSS, risk-based. The gov.uk page does not set out fines; check the OPSS enforcement policy. [S] Same URL.
- **Regulations.** The Product Security and Telecommunications Infrastructure (Security Requirements for Relevant Connectable Products) Regulations 2023, SI 2023/1007. [S] https://legislation.gov.uk/uksi/2023/1007/body/made/data.html
- **Mapping to Aevea.** Default pairing secret per device (device-protocol A6, pairing passkey on Torus and Link, no default app password). Vulnerability disclosure page. Published support period for Link and Torus (set this before launch, it drives cost in section 5).
- **Test link.** AT-049 to AT-051 in `compliance/acceptance-tests.md`.

### 1.3 UK GDPR, Data Protection Act 2018, Data (Use and Access) Act 2025
- **Rule.** Location data about an owner, and the owner's Wi-Fi SSID, phone and account details, are personal data. [S] https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/ (the page covers the definition; the pet's own data is not personal data, but the owner's is).
- **Rule on DPIA.** Systematic location tracking is normally high risk under UK GDPR Article 35. Expect a DPIA to be required before launch. [C]
- **Amendments.** The Data (Use and Access) Act 2025 has staged commencement through 2025 and 2026, with further ICO guidance planned. [S] https://www.kennedyslaw.com/en/thought-leadership/article/2026/the-data-use-and-access-act-2025-commencement-dates-and-planned-guidance-for-2026
- **Mapping.** Home Wi-Fi SSID scan (device-protocol section 8, `AT_HOME_WIFI`), GNSS only in LOST / LOCATE / AWAY, Pet ID relay (no phone numbers), trial log export. Each needs a lawful basis, retention period, and deletion route. Store the Wi-Fi SSID hashed on device and in cloud if possible (design choice, not yet decided).
- **PECR.** Cookies or similar on the Pet ID web page need consent under PECR regulation 6. [C]

### 1.4 UK batteries
- **Rule.** The Waste Batteries and Accumulators Regulations 2009 (as amended) are the main obligation. The producer is the first manufacturer or importer to place batteries on the UK market, including batteries inside products. [S] https://www.gov.uk/guidance/regulations-batteries-and-waste-batteries
- **Actions.**
  - Register with the National Packaging Waste Database (NPDB), through the environmental regulator for each nation (EA in England, equivalents in Wales, Scotland and NI). [S] Same URL.
  - Record tonnage and chemistry each year. Above 1 tonne a year on the market, join a Battery Compliance Scheme. [S] Same URL.
  - Pay for collection and treatment through an approved operator. [S] Same URL.
- **Labelling.** The gov.uk page does not cover labels. The Batteries and Accumulators (Placing on the Market) Regulations 2008 do; this was not read in this session. [C] Verify.
- **Battery removability.** No UK equivalent of EU Article 11 (below) was found in this session. Verify.

### 1.5 UK electrical, EMC, RoHS, REACH, WEEE, general product safety (non-radio parts)
- **Electrical Equipment (Safety) Regulations 2016** and **Electromagnetic Compatibility Regulations 2016** (charger, dock, any mains-side part). Torus is USB 5 V and is below the LVD voltage range. [C]
- **RoHS:** Restriction of Hazardous Substances in Electrical and Electronic Equipment Regulations 2012. [C]
- **REACH (UK):** UK REACH, including the SVHC list and any Article 33-equivalent communication duty. [C]
- **WEEE:** WEEE Regulations 2013 (UK); register as a producer. [C]
- **General Product Safety Regulations 2005** (GB). Applies to the collar and lead as consumer products, with a hazard-based risk assessment. [C] Verify current GB status after the 2024 changes.

---

## 2. European Union

### 2.1 Radio Equipment Directive (RED) 2014/53/EU
- **Rule.** Article 3(1)(a) health and EMF, 3(1)(b) EMC, 3(2) radio spectrum, 3(3)(d) network protection, 3(3)(e) personal data and privacy, 3(3)(f) fraud and financial. [C]
- **Cyber requirements (RED Article 3(3)(d)-(f)).** Applied from 1 August 2025. The Commission listed the EN 18031 series in the Official Journal on 30 January 2025. [S] https://www.nemko.com/blog/cybersecurity-in-europe-en-18031-is-now-a-harmonized-standard
- **Which EN 18031 part.** For an internet-connected device such as Link and Torus, EN 18031-1 is the usual part (from memory: -2 covers childcare and toys, -3 covers financial value). Confirm with the lab. An EN 18031-X:2024 variant has been published; ask the lab which one they test to. [C] [S: the Nemko page gives the August 2024 publication date.]
- **Conformity route.** Usually self-declaration (Module A) when the harmonised standards are applied in full. Confirm the route for the cyber part with the lab. [C]
- **Test link.** AT-045 (radio smoke), AT-047 to AT-053 (cyber) in `compliance/acceptance-tests.md`.

### 2.2 Radio-specific standards per technology [C]
These are the usual harmonised standards. Check each against the module datasheet and the lab's scope.

| Technology | Torus / Link | Likely EN standard [C] |
|---|---|---|
| BLE (2.4 GHz) | Both | EN 300 328 |
| UWB (6-8.5 GHz) | Both (DWM3001C) | EN 302 065 |
| Wi-Fi 2.4 GHz / 5 GHz (nRF7002) | Link | EN 300 328; EN 301 893 |
| LTE-M (nRF9151) | Link | EN 301 908-1 and -13 |
| GNSS receive | Link | Receiver; covered by module; check |
| NFC 13.56 MHz (NTAG 424 DNA) | Link (passive tag) | EN 300 330; check whether the tag/inlay carries its own approval |
| Human exposure (SAR, MPE) | Link, when handled | EN 62311, EN 62209-2 (for body-worn), check |

### 2.3 Cellular and operator approval
See section 4.

### 2.4 Ultra-wideband (UWB) spectrum
- **EU.** Harmonised standard EN 302 065 under RED. [C]
- **UK.** Ofcom's UWB licence-exemption instrument is the Wireless Telegraphy (Ultra-Wideband Equipment) (Exemption) Regulations 2015, per Ofcom's 2015 statement. That statement covers location tracking systems as permitted (Part 3) and mentions outdoor use provided the device is not fixed (Regulation 5). Power limits are in the regulations, not the statement. [S] https://www.ofcom.org.uk/siteassets/resources/documents/consultations/7890-uwb-regulations/statement/statement.pdf
- **Caveat.** Ofcom consulted in 2025 on updating wireless telegraphy licence exemptions. The outcome was not read. [S] https://www.ispreview.co.uk/index.php/2025/01/ofcom-propose-to-make-more-wireless-devices-licence-exempt.html . Check whether the UWB instrument has been replaced.
- **Module status.** Qorvo says DWM3001C is now certified with ISED (Canada) and listed on the ISED REL, after a pending period. The thread does not confirm FCC or CE/RED status for the module. [S] https://forum.qorvo.com/t/dwm3001c-ised-certification/20434 . Ask Qorvo for the module's FCC, ISED, CE/RED and UKCA reports and the integration conditions.
- **Prototype note.** DWM3001C is in the BOM with a 26-week lead time at one distributor (Avnet). That is not a certification issue, but it sets the earliest date for a certified build. [bom-notes, S from prior snapshot]

### 2.5 RoHS, REACH, WEEE, batteries (EU)
- **RoHS 2011/65/EU.** Declare compliance per product; get supplier declarations for the cells, PCBs, connectors, and the pogo pins. [C]
- **REACH (EC) 1907/2006.** SVHC above 0.1% w/w requires communication (Article 33). Annex XVII entry 27 restricts nickel release for articles in prolonged skin contact; check the pogo pins and any metal in the collar. [C]
- **WEEE 2012/19/EU.** Producer registration in each Member State where sold. [C]
- **Battery Regulation (EU) 2023/1542.** [S] https://www.compliancegate.com/eu-batteries-regulation-timeline-and-dates/ (third-party summary; verify on EUR-Lex: https://eur-lex.europa.eu/eli/reg/2023/1542/oj )
  - 18 Feb 2024: general application.
  - 18 Aug 2025: separate-collection symbol on batteries; Chapter VIII (EPR for waste batteries) applies.
  - 18 Aug 2026: general information label (Annex VI Part A) and capacity label for rechargeable portable batteries.
  - **18 Feb 2027: removability and replaceability of portable batteries (Article 11). Central issue for Link (IP67, sealed) and possibly Torus.** Article 11 has exceptions, which I did not confirm against the text. Get legal advice on whether Link or Torus qualifies for an exception before design freeze.
  - 18 Feb 2027: QR code marking on batteries (Annex VI Part C); battery passport scope per the summary is LMT, industrial above 2 kWh and EV, so probably not consumer portable.
  - 18 Aug 2027: battery due diligence obligations (Article 48), per the summary. Verify, because the summary did not discuss postponement.
- **Action.** Register as a battery producer in each Member State (EPR), and keep chemistry and tonnage records.

### 2.6 CE for the non-radio parts
- **EMC Directive 2014/30/EU.** Dock and charger. [C]
- **Low Voltage Directive 2014/35/EU.** Mains adapter (USB 5 V output is outside the LVD range). Use a certified adapter, or buy a CE-marked one from a supplier. [C]

### 2.7 General Product Safety Regulation (EU) 2023/988
- **Application.** EUR-Lex lists the entry-into-force date as 13 December 2024. [S] https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng . The GPSR applies to consumer products including pet accessories. Obligations include a risk analysis, technical documentation, traceability, instructions and warnings, and an EU responsible person when the maker is outside the EU. [C] (I could not read the article numbers from the EUR-Lex page.)
- **Pet products.** I found no harmonised standard for electronic pet collars or leads in this session. Use a documented hazard-based risk analysis (risk-file.md) and test to recognised methods (for example, EN 71-1 small-parts screening as a method reference). [C] Verify with the lab.

### 2.8 Cyber Resilience Act (EU) 2024/2847
- **Dates.** Reporting obligations apply from **11 September 2026**, which is already in force. Most obligations apply from **11 December 2027**. [S] https://www.mccannfitzgerald.com/knowledge/data-privacy-and-cyber-risk/cyber-resilience-act-reporting-obligations-apply-from-11-september-2026
- **Reporting.** Actively exploited vulnerabilities and severe incidents. Early warning within 24 hours; notification within 72 hours; final report within 14 days of a fix (vulnerabilities) or within 1 month of notification (incidents). Notify the CSIRT and ENISA via the Single Reporting Platform. [S] Same URL.
- **Action.** Name the person who receives vulnerability reports. Set an internal reporting procedure. Produce an SBOM for firmware (Link: nRF9151 modem, DWM3001C, nRF7002; Torus: nRF52833). Set the support period before launch. Check how RED cyber and CRA essential requirements overlap, because a product can fall under both. [C]

### 2.9 Data Act (EU) 2023/2854 [C]
- Connected products from 12 September 2025: data access and information for users. Torus and Link generate data, so check the user data access and information duties.

---

## 3. Battery safety and transport

### 3.1 Cells and packs
- **IEC 62133-2** (portable sealed secondary lithium cells and batteries). Cells and packs from suppliers should carry a test report. [C]
- **IEC 62368-1** (AV and ICT equipment safety). Battery and thermal sections apply to the finished product. [C]
- **UN 38.3** test summary for every cell and pack. Manufacturers and distributors must make it available. [C] and [S: the transport article below]
- **Protection.** The BOM lists BQ29700 on MagClip. From its part family it is a battery protection IC, not a fuel gauge (verify on the TI datasheet). Cell protection and fault testing must be shown at system level, not only in the IC datasheet. The BOM has no fuel gauge on MagClip (see bom-notes open item 3).

### 3.2 Shipping (air, road, sea)
- **IATA Dangerous Goods Regulations.** A secondary article says the 67th edition applies in 2026. [S] https://goodhopefreight.com/dg/dgr-67th-lithium-battery.html (search snippet only) . Verify against the official DGR.
- **Packed with equipment (PI 966) and installed (PI 967).** A secondary article reports that from 1 January 2026, PI 966 Section I batteries must be offered at no more than 30% of rated capacity. It also says Section II can apply to cells up to 20 Wh and batteries up to 100 Wh, subject to conditions. Verify both points against the official DGR before shipping. [S] https://www.large-battery.com/blog/shipping-lithium-ion-batteries-packed-with-equipment-2026/
- **Road and sea.** ADR (road) and IMDG (sea) apply to Li cells. [C]
- **Prototype shipping.** Ship through a carrier with dangerous goods training. Set state of charge at 30% for air unless the carrier agrees otherwise. [S for 30%, see above; verify]

---

## 4. Cellular (LTE-M, nRF9151)

### 4.1 What is pre-certified
- Nordic publishes PTCRB and GCF status for nRF9151 and operator certifications by firmware build. [S] https://docs.nordicsemi.com/r/bundle/comp_matrix_nrf9151/page/comp/nrf9151/nrf9151_operator_certifications.html
- A PTCRB certificate for nRF9151 is posted by Nordic. [S] https://cm.nordicsemi.com/-/media/Software-and-other-downloads/Certifications/nRF91-Series-certifications/nRF9151-Certifications/nRF9151---PTCRB-Certified-Certificate-2026.pdf
- Nordic's own page says: "Most operators do not require other certifications than GCF or PTCRB." [S] (same Nordic operator page)

### 4.2 Operator requirements from the Nordic page (summary)
- **Verizon.** A0A build with modem firmware 2.0.1 or 2.0.2, or A1A with 2.0.4. LwM2M carrier library mandatory. [S]
- **T-Mobile US.** Same build options. LwM2M library optional if FOTA for modem firmware is implemented. [S]
- **AT&T.** A0A (2.0.1 or 2.0.2), A1A (2.0.4), plus NTN firmware 1.0.0 for A1A. [S]
- **Europe.** Deutsche Telekom and Vodafone are listed with A0A and A1A builds. Deutsche Telekom and Spark NZ certificates cover Power Class 3 and 5 only. [S]
- **UK gap.** EE is not listed. Vodafone is listed generically. O2 and Three are not on the page. Confirm each UK operator's IoT device approval and IMEI requirements directly. [S: gap]

### 4.3 What a module approval does not cover
- Module approval conditions: antenna type and gain, host labelling, power settings, "unchanged RF". [S: the Nordic page does not list them; they must come from the module's regulatory document]
- Product-level EMC, electrical safety, mechanical, IP, battery, pet safety, PSTI, EN 18031, CRA, data protection, labelling, declaration of conformity. [C]
- Operator-specific checks such as IMEI registration, SIM provisioning, and firmware build lock. [C]

### 4.4 Plan
1. Lock the modem firmware build (A0A or A1A) for each target operator.
2. Ask Nordic and the lab which GCF or PTCRB campaign is needed for the final host design.
3. Confirm UK operator approvals in writing (EE, Vodafone, O2, Three).
4. Keep the LwM2M or FOTA decision on record for the T-Mobile and Verizon paths.

---

## 5. Indicative lab cost and lead time (ESTIMATES, not sourced)

These are my estimates for planning only. They are not quotes. Get written quotes from at least two accredited labs. Lead times depend on lab booking queues.

| Item | Scope | Cost range (GBP) EST | Lead time EST |
|---|---|---|---|
| Radio RF testing (BLE, UWB, Wi-Fi, LTE-M, NFC) and EMC | Link, Torus, dock | 15,000 to 40,000 | 6 to 12 weeks |
| Cellular GCF or PTCRB (product level, if required) | Link | 10,000 to 30,000 | 8 to 16 weeks |
| RED cyber (EN 18031) assessment and report | Link, Torus | 8,000 to 25,000 | 6 to 10 weeks |
| PSTI documentation and statement of compliance | Link, Torus | 2,000 to 6,000 (plus legal) | 2 to 4 weeks |
| IEC 62133-2 cell and pack report (per design) | Each battery | 4,000 to 10,000 | 4 to 8 weeks |
| UN 38.3 test (per cell or pack design) | Each battery | 2,000 to 6,000 | 3 to 6 weeks |
| IEC 62368-1 safety for dock and charger | Dock, charger | 5,000 to 12,000 | 4 to 8 weeks |
| IEC 60529 ingress: IPX7 and IP6X | Link, Torus, MagClip | 1,000 to 3,000 per test set | 1 to 2 weeks |
| Pet product safety test set (pull, neck, small parts, drop, chew, skin) | Collar, lead, MagClip | 3,000 to 10,000 | 3 to 6 weeks |
| Nickel release (EN 1811) if skin contact metal | Contacts | 500 to 1,500 | 1 to 2 weeks |
| SAR or MPE evaluation (human handling) | Link | 2,000 to 6,000 | 2 to 4 weeks |
| Legal review (UK and EU product, battery, data, CRA) | Whole product | 5,000 to 15,000 | 4 to 8 weeks |
| Bluetooth SIG qualification (QDID) | Torus, Link | SIG fee schedule (not fetched) | Depends on test plan |

Total for the full set: planning figure EST GBP 60,000 to 160,000 before reruns. Use this only for internal budgeting.

---

## 6. What modules do and do not cover

| Module (nRF9151, DWM3001C, nRF7002, nRF52833) | Covers | Does not cover |
|---|---|---|
| Radio emissions | Module RF performance within stated conditions | Host design, antenna changes, enclosure effects |
| Module approvals (FCC, ISED, CE, PTCRB, GCF where held) | Modular approval within the stated conditions | Product EMC, safety, mechanical, IP, battery, pet safety |
| Security features (secure boot, crypto blocks) | Hardware building blocks | Your key management, firmware design, PSTI and EN 18031 evidence |
| Cellular firmware | Certified build | Your operator-specific provisioning and FOTA design |

Modules reduce radio test scope. They do not remove end-product certification. This matches `docs/context.md`.

---

## 7. Ingress, mechanical and safety

- **IP67 (IEC 60529).** IPX7 is temporary immersion, 1 m for 30 min. IP6X is dust-tight. Test the assembled Link and MagClip, latched and unlatched, plus Torus. A dog that swims beyond IPX7 conditions is outside the test; state this in the instructions. [C for definition; verify]
- **Load.** 50 kg working load (about 490 N), at least 3x ultimate (about 1,470 N), per `docs/context.md`. Test plan in `compliance/acceptance-tests.md`.
- **Bolt Brake.** Slips at about 300 N per `docs/context.md`. The lead and lock are rated 490 N working load. The neck-load threshold for a 5-20 kg dog is not settled. Get veterinary input before the figure is fixed.

---

## 8. Open items and conflicts to resolve

1. Battery removability (EU Article 11, 18 Feb 2027) against the IP67 sealed Link design. Legal opinion needed.
2. Coded PHY on iOS. Apple's developer forum says no roadmap or timeline can be shared and recommends a feedback report. [S] https://developer.apple.com/forums/thread/804458 . The "removed in iOS 14" thread also exists. [S] https://developer.apple.com/forums/thread/665542 . Recall Assist depends on this (context design rule), so an iPhone workaround or a fallback must be confirmed.
3. UK operator approval for EE, O2 and Three.
4. Which EN 18031 part and which harmonised version the lab uses.
5. Ofcom UWB exemption status after the 2025 consultation.
6. Whether Link's cell and Torus's cell need UN 38.3 per design, and the supplier's test summary.
7. Pet collar standard: no harmonised standard found. Confirm the method with the lab.

---

## 9. Sources read in this session

- https://www.gov.uk/guidance/regulations-consumer-connectable-product-security
- https://legislation.gov.uk/uksi/2023/1007/body/made/data.html
- https://www.gov.uk/government/publications/product-regulations-by-sector-and-current-approaches-to-product-marking-ukca-and-ce-regimes/product-regulations-by-sector-and-current-approaches-to-product-marking-ukca-and-ce-regimes
- https://www.nemko.com/blog/cybersecurity-in-europe-en-18031-is-now-a-harmonized-standard
- https://www.compliancegate.com/eu-batteries-regulation-timeline-and-dates/
- https://www.gov.uk/guidance/regulations-batteries-and-waste-batteries
- https://www.mccannfitzgerald.com/knowledge/data-privacy-and-cyber-risk/cyber-resilience-act-reporting-obligations-apply-from-11-september-2026
- https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng
- https://www.ofcom.org.uk/siteassets/resources/documents/consultations/7890-uwb-regulations/statement/statement.pdf
- https://www.ispreview.co.uk/index.php/2025/01/ofcom-propose-to-make-more-wireless-devices-licence-exempt.html
- https://forum.qorvo.com/t/dwm3001c-ised-certification/20434
- https://docs.nordicsemi.com/r/bundle/comp_matrix_nrf9151/page/comp/nrf9151/nrf9151_operator_certifications.html
- https://cm.nordicsemi.com/-/media/Software-and-other-downloads/Certifications/nRF91-Series-certifications/nRF9151-Certifications/nRF9151---PTCRB-Certified-Certificate-2026.pdf
- https://goodhopefreight.com/dg/dgr-67th-lithium-battery.html (search snippet)
- https://www.large-battery.com/blog/shipping-lithium-ion-batteries-packed-with-equipment-2026/
- https://developer.apple.com/forums/thread/804458
- https://developer.apple.com/forums/thread/665542 (title seen in search only)
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/ (search snippet)
- https://www.kennedyslaw.com/en/thought-leadership/article/2026/the-data-use-and-access-act-2025-commencement-dates-and-planned-guidance-for-2026 (search snippet)

Not read in this session and to be verified on the official text: EUR-Lex texts of RED, the Battery Regulation, CRA, Data Act, GPSR; UK Radio Equipment Regulations 2017 full text; Batteries 2008 Regulations; IATA DGR 2026 edition; IEC 62133-2; IEC 62368-1; IEC 60529; EN 18031-1; EN 302 065; EN 300 328; Ofcom UWB 2015 Regulations text.
