# Aevea IP checklist: making sure Aevea owns every design

Status: working checklist, 2026-11-05. Not legal advice. A solicitor (IP and contracts) and a patent attorney must review every clause and search before anything is signed or filed. A trade mark attorney should check the names.

Scope: hardware (Torus, MagClip, Link, dock and charger), firmware, app (Flutter), cloud, mechanical design, PCB layouts, documentation, and the pet ID and location features. The hardware partner is Fiddlie (firmware owner, contact Ed Hill). Contract manufacturers and freelancers are covered too.

Aevea's stated position (from `docs/context.md`): "IP: Aevea owns every design." This checklist shows what must exist on paper to make that true. I have not seen any signed agreement with Fiddlie or any contractor in the repo. Treat every item below as "not yet verified" until a signed copy is on file.

---

## 1. Current position and what to find out first

| Item | Status | Owner | Notes |
|---|---|---|---|
| Signed NDA with Fiddlie | Not verified | Founder | Needed before firmware or protocol specs were shared. Check date and scope. |
| Signed IP assignment or development agreement with Fiddlie | Not verified | Founder and solicitor | Core item. Without it, copyright in firmware and layouts may sit with Fiddlie or its staff. |
| Background IP list from Fiddlie | Not verified | Ed Hill / Fiddlie | Which libraries, drivers, reference designs and tools were already theirs. |
| Signed agreements with each freelancer or contractor (CAD, industrial design, app, PCB layout) | Not verified | Founder | Check every person who has committed a file. |
| Employee contracts (if any employees) | Not verified | Founder | Need an invention and copyright clause. |
| Git or file history showing authors of firmware, CAD and PCB files | Not verified | Founder | Build a contributor list from source history before drafting assignments. |
| AI tool use in design (code, CAD, PCB, copy) | Not verified | Founder | See section 2.5. |
| Public disclosures so far (website, decks, shows, crowdfunding, videos) | Not verified | Founder | Matters for patent novelty. Any public disclosure can start a clock (section 3.4). |
| Existing trade mark applications or registrations for Torus, MagClip, Link, Aevea | Not verified | Founder | Section 4. |

First step: produce a "who made what" register (person or company, date range, file set, agreement on file yes or no). Every row without a signed agreement is an action.

---

## 2. Agreements with Fiddlie and contractors

### 2.1 Assignment clause: points that must be in the document

1. **Present assignment, not promise.** Wording such as "hereby assigns" with effect on creation, not "agrees to assign" (a promise leaves the title with the creator until a later step).
2. **Scope of assigned IP.** All intellectual property in Foreground IP (section 2.2), including: schematics, PCB layouts, gerbers and BOM work, mechanical CAD and drawings, firmware and source code, protocol and API specs, documentation, test scripts and data, app code and UI assets, inventions and improvements, and all rights in them.
3. **Rights covered.** Copyright, design rights (registered and unregistered), patents and patent applications, database rights, trade secrets and know-how, trade marks where any name is created by the contractor (unlikely, but say so), and all rights to sue for past infringement.
4. **Worldwide and for the full term.** Including future rights and renewals.
5. **Form.** In writing and signed by the assignor. In UK law, copyright assignment must be in writing signed by the owner (CDPA 1988 s.90(3)), and a patent assignment must be in writing signed by the assignor (Patents Act 1977 s.30). [C] Verify section numbers with the solicitor.
6. **Further assurance.** The contractor signs whatever Aevea needs to register rights, and appoints Aevea as attorney to sign if it refuses.
7. **Deliverables.** Native source files (CAD, EDA, firmware source, build scripts, test scripts), not only PDFs. Deliver them on request and on termination.
8. **No joint ownership by default.** Avoid "jointly owned" foreground IP. In UK law, co-owners of a patent can each exploit it without the other's consent, which weakens Aevea's position. Make Aevea the sole owner.
9. **Improvements.** Improvements to Aevea's designs made by the contractor are foreground IP and are assigned.
10. **Moral rights.** See section 2.3.
11. **Warranties.** Original work; no third-party IP infringement; no open-source with copyleft terms unless listed (see 2.6); no use of AI tools that impose ownership or licence conditions on outputs (see 2.5); no prior assignment to another person.
12. **Tooling and jigs.** Aevea owns tooling and test jigs it pays for, and the design data for them. See section 2.7.
13. **Survival.** Assignment and confidentiality survive termination.
14. **Governing law and disputes.** Chosen law (for example England and Wales), courts or arbitration, and the seat. Same law for each agreement where possible.

### 2.2 Background IP versus foreground IP

| Term | Meaning | What Aevea needs |
|---|---|---|
| Background IP | Owned by the contractor before the project, or created outside it. Example: Fiddlie's existing BLE stack, drivers, bootloader, test scripts, protocol templates | Scheduled list (a schedule attached to the agreement). Licence to Aevea: perpetual, irrevocable, worldwide, royalty-free, sub-licensable to manufacturers and to end users as needed for the products. Exclusive for the Aevea product field if possible |
| Foreground IP | Created in the project, paid for by Aevea | Assigned to Aevea (section 2.1) |
| Third-party IP | Owned by someone else, such as an SDK, a library or a module vendor's software | Check licence terms; record the licence; confirm it covers commercial use and the hardware it runs on |
| Open source | Used in firmware or app | Record in an SBOM (section 2.6) |

Points to settle with Fiddlie:
- Which firmware pieces are background (for example the Nordic SDK, the Qorvo UWB library, MCUboot) and which are written for Aevea.
- Whether Fiddlie's libraries have any licence fee, source disclosure or change-back requirement.
- How background improvements made during the project are treated (keep them in Fiddlie's background or assign them to Aevea with a licence back to Fiddlie).

### 2.3 Moral rights waiver

- In UK law, creators of copyright works have paternity and integrity rights (CDPA 1988 ss.77 to 80). [C] These cannot be assigned, but can be waived in writing (s.87). [C]
- Include a written waiver in favour of Aevea, its successors, licensees and customers, covering all works created in the project, for each named creator.
- Some EU countries do not allow full waiver of moral rights. For contractors outside the UK, add a covenant not to assert moral rights against Aevea and its licensees, where the law allows.
- List each creator by name, role and date range.

### 2.4 Confidentiality and NDA terms (used in the RFQ pack too)

Draft terms for mutual NDAs (suppliers, Fiddlie, contractors):
- Definition: all information disclosed in any form, including drawings, specifications, firmware, protocol documents, cost and volume data, and roadmaps. Marked or not.
- Use: only for the stated purpose.
- Duration: term of the relationship plus 5 years. Trade secrets for as long as they remain secret.
- Standard exclusions: already public, independently developed, lawfully received from a third party without restriction.
- No "residuals" clause.
- Return or destruction on request, with written confirmation.
- Permitted disclosure to employees and advisers on a need-to-know basis, bound by equal terms.
- Compelled disclosure: notify and cooperate.
- No licence granted by disclosure. No warranty about accuracy.
- Injunctive relief clause.
- Share minimum information per supplier (rfq-pack section 1).

### 2.5 AI-assisted design records

Why it matters: copyright and inventorship depend on human authorship. In the UK, the Supreme Court held that an AI system cannot be named as an inventor (Thaler v Comptroller-General [2023] UKSC 49). [C] The UK rule for computer-generated works (CDPA 1988 s.9(3)) has been under review, with the Data (Use and Access) Act 2025 consultation discussing its removal. [C] Verify the current position.

Keep a design record for each artifact produced with an AI tool (code, CAD, PCB layout suggestions, documentation, UI copy, images):
- Date, person who used the tool, tool name, version, plan or account type.
- Prompt or input (or a reference to the saved input).
- Output saved as a file with a version hash.
- What the human changed, reviewed and decided.
- Which person is the human author or inventor for each element.
- The tool's terms of service on output ownership, training on inputs, and confidentiality. Check whether inputs are used for training and whether the enterprise tier applies.
- Code: run a licence and similarity scan on AI-generated firmware or app code before it is merged.

For patent inventorship: name only humans who conceived the claimed features. Keep dated notebooks, Git history and review records.

### 2.6 Employee and contractor agreements

- **Employees (if any).** Patents Act 1977 ss.39 to 43 deal with employee inventions. [C] An invention made in the course of duties usually belongs to the employer, but employee compensation rights exist. The contract should state the assignment and the compensation approach. Include copyright and design assignment, confidentiality, and a requirement to disclose inventions.
- **Contractors.** No automatic employer rule applies. Without a written assignment, the contractor owns what they create. Get the assignment in writing before work starts.
- **Status.** Check contractor status (UK: off-payroll rules) with an accountant. This is separate from IP but affects whether the agreement is a contract for services or service.
- **Open source policy.** Approved licences list (permissive: MIT, BSD, Apache-2.0 with notice; copyleft such as GPL or AGPL requires review before use in firmware or cloud). Require disclosure of any open-source component in each deliverable.
- **SBOM.** Keep a software bill of materials for each firmware image and app release. The EU CRA requires one for products with digital elements from 2027 onward and reporting from September 2026 (see `compliance/certification-checklist.md` section 2.8). [S: McCann FitzGerald page]

### 2.7 Tooling, jigs and test fixtures

- Aevea owns any tooling, mould, die, test jig, load-test fixture or programming fixture it pays for.
- Contract manufacturers and die-casters must hold tooling for Aevea only, mark it as Aevea property, and return or scrap it on request.
- Design data for tooling (CAD, toolpaths, mould flow files) goes to Aevea on request.
- Include a step-in right for production files if the supplier stops or fails.

### 2.8 Hardware-specific points

- PCB layouts, schematics and BOM notes: foreground, assigned to Aevea.
- Pack designs (battery protection and cell-pack layout): check whether the battery supplier retains rights in its pack design. Aevea should own the Aevea-specific layout and get a licence to any supplier standard design.
- Chip vendor reference designs (Nordic, Qorvo, TI): record the licence or terms of use.

---

## 3. Patent search and filing

Patent counsel must review. This section gives starting points only.

### 3.1 Search sources (free)
- Espacenet (EPO) - https://worldwide.espacenet.com
- Google Patents - https://patents.google.com
- WIPO PATENTSCOPE - https://patentscope.wipo.int
- UK IPO search - https://www.ipo.gov.uk
- USPTO Patent Public Search - https://ppubs.uspto.gov

These are the usual databases. URLs are from general knowledge and were not fetched in this session. [C]

### 3.2 Search keywords (starting list)
- "smart leash" retractable brake, "leash brake" slip clutch, "retractable leash" tether control
- "dog collar" location tracking, "pet tracker" UWB, "pet tether" ultra-wideband
- magnetic leash clip, magnetic latch leash, leash buckle release
- pet ID NFC signed URL, NFC pet tag dynamic link
- lost pet mode, animal recall wireless, collar haptic recall
- Bluetooth coded PHY pet, LTE-M collar

### 3.3 CPC classes to check (starting points, verify each at subgroup level)
- **Animal identification and tracking:** A01K 11/00 (marking, identification tags), with A01K 11/006 (automatic identification, electronic transponders). [C]
- **Leads and collars:** A01K 27/00 (leads or collars for animals), with subgroups for retractable leads and electronic collars. [C]
- **Animal husbandry apparatus and monitoring:** A01K 29/00 and A01K 29/005 (monitoring). [C]
- **Positioning by radio:** G01S 5/02 (positioning by radio waves), G01S 13/76 (distance by pulsed radio, relevant to UWB). [C]
- **Location-based and short-range wireless:** H04W 4/02 (location services), H04W 4/80 (short-range communication). [C]
- **Alarms for lost persons or animals:** G08B 21/02 family. [C]
- **Authentication and secure pairing:** H04W 12/06, H04L 9/32. [C]
- **Magnetic fasteners:** F16B 1/00 family and H01F 7/02 (permanent magnets). [C]
- **Buckles and lead securing:** A44B 11/25 (buckles) and F16G 11/00 (securing or connecting lines). [C]
- **UWB:** H04B 1/7163 (spread-spectrum UWB transmitters or receivers). [C]

### 3.4 Novelty and timing
- Once any detail is disclosed publicly (website, deck, video, crowdfunding, shows, emails to many people), the clock matters. The UK and EU have no general grace period for own disclosures, so patent filing must come before public disclosure. The US has a one-year grace period for the inventor's own disclosure. [C] Verify with a patent attorney.
- List every public disclosure with date and content before filing.
- Priority filing: a UK application or PCT application in the first year gives priority rights. [C]

### 3.5 Freedom to operate (FTO)
- A patentability search is not an FTO search. An FTO opinion needs a patent attorney to review claims in the target markets (UK, EU, US) for Torus, MagClip, Link and the app features.
- Priority FTO areas: retractable leash braking, magnetic latch to collar, UWB tethering, LTE-M pet trackers, NFC pet ID.

### 3.6 What to file first (for attorney to decide)
- Candidate inventions: the Bolt Brake slip clutch for a retractable line; the magnetic-guided latch with contact-sensed state; the tether mode arming on unclip; Recall Assist with BLE then LTE-M fallback; the NFC Pet ID signed-URL approach.

---

## 4. Trade mark checks

### 4.1 Names
- Torus, MagClip, Link, Aevea.
- "Link" and "Torus" are common words and are likely to have many existing users in technology. Expect conflicts. Check early.

### 4.2 Classes (Nice classification, starting points)
- **Class 9:** wearable devices, GPS and tracking apparatus, downloadable apps, electronic sensors, battery chargers.
- **Class 42:** software as a service, cloud services.
- **Class 18 or 28:** dog leads and collars (leather goods, animal accessories). Check the exact class for leads and collars. [C]
- **Class 31:** pet goods (optional, depending on the brand plan). [C]

### 4.3 Where to search
- UK IPO register - https://www.ipo.gov.uk
- EUIPO eSearch plus - https://euipo.europa.eu
- USPTO trademark search (if US sales are planned)
- Companies House and domain checks for each name
- App stores (Apple App Store, Google Play) for app name conflicts
- Common-law search (web, social media, trade press)

### 4.4 Filing
- File UK and EU marks first if sales are UK and EU first. Use an attorney for the classes and specification wording.
- Check domain names (theaevea.com and any product domains) and social handles.

---

## 5. Professional review required

| Area | Who | Scope |
|---|---|---|
| Contracts and assignments | Solicitor (IP and technology) | Fiddlie agreement, contractor agreements, NDA, moral rights waiver, employee contracts |
| Patents | Patent attorney | Search, FTO, filing strategy, claims |
| Trade marks | Trade mark attorney | Clearance, filing |
| Regulatory overlap | Product compliance lawyer | Links to `compliance/certification-checklist.md` |

---

## 6. Action list

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 | Build "who made what" register from source history and files | Founder | Before any new agreement | Open |
| 2 | Find or sign NDA with Fiddlie; check scope and dates | Founder | Now | Open |
| 3 | Send assignment and background IP schedule to Fiddlie for review | Founder and solicitor | Before next firmware drop | Open |
| 4 | Collect signed agreements for each contractor; sign missing ones | Founder and solicitor | Now | Open |
| 5 | Moral rights waiver from each named creator | Solicitor | With item 3 and 4 | Open |
| 6 | Start AI design record for each design artifact from now on | Founder | Now | Open |
| 7 | Public disclosure log with dates | Founder | Now | Open |
| 8 | Patent search and FTO brief to patent attorney | Patent attorney | Before any public launch | Open |
| 9 | Trade mark clearance for Torus, MagClip, Link, Aevea | TM attorney | Before branding spend | Open |
| 10 | SBOM for current firmware and app | Fiddlie and founder | Before first certification | Open |
| 11 | Tooling and jig ownership clause in supplier POs | Founder | With RFQ responses | Open |

## Sources and status

- Repo context: `docs/context.md` ("IP: Aevea owns every design").
- CRA dates: https://www.mccannfitzgerald.com/knowledge/data-privacy-and-cyber-risk/cyber-resilience-act-reporting-obligations-apply-from-11-september-2026
- Thaler v Comptroller-General [2023] UKSC 49; CDPA 1988 ss.9(3), 77 to 80, 87, 90(3); Patents Act 1977 ss.30, 39 to 43. Cited from knowledge, not fetched in this session. Verify.
- Search and classification URLs in section 3.1 are general references, not fetched in this session.
- No legal opinion is given. A solicitor and a patent attorney must review before action.
