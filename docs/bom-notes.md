# Aevea BOM notes (Torus, MagClip, Link)

Checked: 2026-11-05. Files: `docs/bom.csv` (lines and per-device totals), this file (method, gaps, open items).
Source of truth for the design: `docs/context.md`.

## Method
- Prices pulled from distributor listings via findchips.com snapshots (Mouser, Newark, Avnet, Arrow, Verical, TME, Rochester, Farnell). Snapshot time is not stated on the page; "date checked" is the day of retrieval, not the price date.
- DigiKey UK, Mouser UK and LCSC product pages do not render prices to the fetch tool (JS-only). Mouser UK fetch failed. **No GBP DigiKey UK or Mouser UK price was verified.** Most verified prices are US-list USD.
- USD converted to GBP at 1 GBP = 1.3559 USD (bestexchangerates.com, undated) -> factor 0.73753. Replace with the day's rate before use.
- Native GBP rows: Farnell SK6812 (GBP) and the ABRA/ultralight-outdoor listings. VAT status not stated on the Farnell or outdoor pages; treat as ex VAT only if confirmed.
- Currencies not labelled on several Mouser/Braemac/TME/Verical rows ("$" only). Treated as USD.
- Totals are per device, GBP ex VAT, sum of qty x unit price. Freight and duties are shown as +15% and +25%.
- Prototype column = qty-1 price. Production column = 5,000-unit break (p5000), where a 5,000 break existed or was estimated.

## Status key (price_status in bom.csv)
- VERIFIED: distributor list price seen for the stated qty breaks (US list).
- PARTIAL: some cells verified, others proxied or estimated (listed in `estimate_cells`).
- ESTIMATE: no distributor price retrieved; the number is a placeholder and must not be quoted.
- NOT PRICED: nothing retrieved.

## Totals (GBP ex VAT, components only)
| Device | Prototype (qty 1) | 5,000 units | 5,000 + 15% | 5,000 + 25% |
|---|---|---|---|---|
| Torus | 71.05 | 41.99 | 48.29 | 52.49 |
| MagClip | 8.90 | 4.09 | 4.70 | 5.11 |
| Link | 78.19 | 44.07 | 50.68 | 55.09 |

Caveat: these are electronics components only. They exclude PCBs, enclosures, the mechanical lead hardware (Bolt Brake, drum, lock, anchor plate, collar), assembly, test, certification and cell pack assembly. They are not comparable with the context target (GBP 80-100 landed at 5,000 units), whose scope (per device or system) is not stated in context.md.

## Gaps (ESTIMATE or not priced)
- LRA motor (L08): no price retrieved. All cells ESTIMATE. Size and part not chosen.
- LiPo 300 mAh (L10), 100 mAh (L11), 1,200 mAh (L12): no price retrieved. The ABRA 300 mAh page is confirmed (51x20x3.5 mm, in stock) but its price was not visible. All cells ESTIMATE. Get quotes from a cell maker (UN38.3 transport cert needed).
- DW3110 (L04): not priced. It is inside DWM3001C and not bought separately, so qty 0.
- DWM3001C at 1,000 and 5,000: 1,000 uses an Avnet 1,600-break proxy (34.90), 5,000 is an extrapolated ESTIMATE (31.00). The CSR variant shows stock 0 and a 26-week lead time at Avnet. Lead time is the main risk for this part.
- NTAG 424 DNA (L05): chip MOQ is 100 to 24,145. The 1-unit prototype price (4.00 USD) is an ESTIMATE for a finished tag/inlay. The 5,000 price (0.23) is an ESTIMATE.
- Piezo (L09), USB-C (L16), charger (L15), protection (L13), LIS2DW12 (L06), nRF7002 (L02), nRF9151 (L01): stock and lead times are not verified.
- Gold plating on the Mill-Max pogo pin (L19) is not verified. Contact counts (2 / 4 / 2) are assumptions.
- MagClip magnet (L20): N52 5x1 mm is a placeholder (price from a US pack). Latch magnet size and grade are not engineered.
- UHMWPE (L21): price is from a camping guyline (449 kg breaking load, VAT not stated). Production line needs a rated spec. 5,000 and 1,000 prices are ESTIMATE.
- SK6812 (L17): ring of 16 costed (context says 12-16). p1000 and p5000 are ESTIMATE. A cheaper 3527 alternative (XINGLIGHT XL-3527RGBC-SK6812B) is seen at DigiKey USD 0.103 @15,000 with no qty-1 price.
- DRV5056 Hall (L18): analog Hall. Angle sensing (TMAG5170) was not retrieved. Mouser stock is 95.

## Open items (not in the BOM, need a decision or a quote)
1. Mechanics: Bolt Brake (friction slip clutch, ~300 N), drum, housing, lock, anchor plate, collar, IP67 seals, MagClip latch hardware. None priced.
2. MCU/radio on Torus and MagClip: the context names DWM3001C (nRF52833 + DW3110) on Torus and Link. Confirm whether MagClip has any MCU or radio (assumed none). Confirm if Torus needs a separate MCU.
3. Chargers and fuel gauges on MagClip: BQ25180 and BQ29700 are included on MagClip on the assumption that MagClip's own cell is charged from the Torus dock. Confirm the charge path; the fuel gauge is omitted on MagClip.
4. Torus Hall count (2 for line and slip) and angle sensor type.
5. Antennas (BLE/UWB/LTE/GNSS/Wi-Fi), SIM/eSIM for nRF9151, and the GNSS antenna. None priced.
6. LED ring: 12 or 16 pcs. 16 costed. Each LED at GBP 0.56 makes the ring about GBP 9 at prototype.
7. Battery shipping: UN38.3 and the transport status of each cell need confirmation before shipping prototypes.
8. Certification costs (UKCA/CE, RED cybersecurity EN 18031, PSTI, cellular approval) are excluded from the BOM and are not in context.md figures.
9. Confirm the DigiKey UK and Mouser UK GBP prices for the critical path (nRF9151, DWM3001C, nRF7002, LIS2DW12, DRV2605L). These were not retrieved; the US USD listings above are the best available.
10. Re-run the price pull before any order: findchips snapshots show no date.

## Sources (main)
- https://www.findchips.com/search/NRF9151
- https://www.findchips.com/search/NRF7002
- https://www.findchips.com/search/DWM3001CTR13
- https://www.findchips.com/search/NT4H2421TT
- https://www.findchips.com/search/LIS2DW12
- https://www.findchips.com/search/DRV2605L
- https://www.findchips.com/search/TP094003-1
- https://www.findchips.com/search/BQ29700
- https://www.findchips.com/search/MAX17048
- https://www.findchips.com/search/BQ25180
- https://www.findchips.com/search/USB4125-GF-A
- https://www.findchips.com/search/SK6812
- https://www.findchips.com/search/DRV5056A4QDBZR
- https://www.findchips.com/search/0906-2-15-20-75-14-11-0
- https://totalelement.com/collections/metric-size-disc-magnets/products/5-x-1-mm-neodymium-rare-earth-permanent-disc-magnets-n52-350-pack
- https://ultralightoutdoorgear.co.uk/3mm-uhmwpe-core-reflective-guyline-sold-by-the-metre/
- https://abra-electronics.com/batteries-holders/batteries-polymer-lithium-ion/bat-lipo-3.7-300.html
- https://uk.pi-supply.com/collections/lithium-batteries/products/lithium-ion-polymer-battery-3-7v-2000mah
- FX: https://bestexchangerates.com/rates/gbp-to-usd/?mybank=XE
