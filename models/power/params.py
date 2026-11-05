"""Component current / charge figures for the Aevea power model.

Every figure has a status:
  DATASHEET  - number taken from a manufacturer datasheet / product spec / product brief (source URL given)
  MEASURED   - number measured by Nordic or a third party and published (blog / forum), not a datasheet limit
  RECALLED   - datasheet figure recalled but NOT re-fetched during this work; verify before relying on it
  ASSUMPTION - engineering estimate (timing, duty cycle, firmware behaviour, field conditions); must be
               replaced by PPK measurements (see ppk_compare.py)

`low`/`high` are the range used by the Monte Carlo / tornado. Units: currents in A, charges in C (A*s),
times in s, capacities in mAh. Checked 2026-11-05.
"""

P = {}


def p(name, value, low, high, unit, status, source, note=""):
    P[name] = dict(value=value, low=low, high=high, unit=unit, status=status, source=source, note=note)


uA, mA = 1e-6, 1e-3
uC, mC = 1e-6, 1e-3

NRF9151_PS = "https://hardware.iot.telekom.com/Document/7302266976854601150/nRF9151_PS_v1.0.pdf (nRF9151 PS v1.0, Features)"
NRF52833_PB = "https://components101.com/sites/default/files/2019-10/nRF52833 Bluetooth 5.1 SoC Datasheet.pdf (nRF52833 brief, DC/DC 3 V)"
DW3000_DS = "https://www.mouser.com/datasheet/2/412/DW3000_Data_Sheet-3532945.pdf (DW3000 family datasheet, Table 5, 3.0 V; DW3110 is a family member)"

# ---------------- nRF9151 (Link) ----------------
p("nrf9151_psm_floor", 2.7 * uA, 2.7 * uA, 4 * uA, "A", "DATASHEET", NRF9151_PS, "PSM floor at 3.7 V")
p("nrf9151_edrx_82s", 18 * uA, 18 * uA, 30 * uA, "A", "DATASHEET", NRF9151_PS,
  "eDRX 81.92 s, Cat-M1, UICC included. High end covers PTW/CE repetitions (ASSUMPTION)")
p("nrf9151_drx_fallback", 0.5 * mA, 0.3 * mA, 0.8 * mA, "A", "ASSUMPTION",
  "https://devzone.nordicsemi.com/f/nordic-q-a/127771/high-current-consumption-670-a-in-edrx-and-psm-on-nrf9151-dk",
  "Idle current when network/SIM refuses eDRX+PSM (plain DRX 1.28 s). Forum report shows ~670 uA on an nRF9151 DK.")
p("lte_rrc_inactivity", 11.0, 5.0, 20.0, "s", "MEASURED",
  "https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/ltem-vs-nbiot-field-test-how-distance-affects-power-consumption",
  "LTE-M network RRC inactivity timer observed 11 s; network-set, UE cannot request it")
p("lte_conn_with_rai", 2.0, 1.0, 4.0, "s", "ASSUMPTION", "", "Time in RRC connected per report if Release Assistance Indication is honoured")
p("lte_conn_avg_current", 6 * mA, 3 * mA, 12 * mA, "A", "ASSUMPTION", "",
  "Average current in RRC connected with cDRX (Nordic OPP shows 44 mA peaks in cDRX paging; average not published)")
p("lte_tx_charge_good", 25 * mC, 12 * mC, 50 * mC, "C", "ASSUMPTION", "",
  "TX/RX burst charge for one ~100-300 B UDP report at good RSRP (>= -95 dBm); scaled up for poor signal")
p("lte_connect_time", 4.0, 3.4, 4.8, "s", "MEASURED",
  "https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/ltem-vs-nbiot-field-test-how-distance-affects-power-consumption",
  "LTE-M time to connect 3.4-4.8 s (used for the Recall fast-paging wake)")
p("gnss_acq_current", 50 * mA, 45 * mA, 55 * mA, "A", "MEASURED",
  "https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/the-benefits-of-assisted-gps-in-asset-tracking-applications",
  "nRF9160: 49.9 mA fix searching (50.6 mA with A-GPS). nRF9151 assumed similar (verify against nRF9151 PS GPS current table)")
p("gnss_track_ps_current", 10 * mA, 10 * mA, 40 * mA, "A", "MEASURED",
  "https://devzone.nordicsemi.com/f/nordic-q-a/115402/nrf9160-gnss-power-saving-mode",
  "nRF9160 PS v2.2 ~10 mA continuous with power saving; forum measured ~40 mA indoors/poor sky (duty cycling does not engage)")
p("gnss_ttff_hot", 2.0, 1.0, 6.0, "s", "MEASURED",
  "https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/the-benefits-of-assisted-gps-in-asset-tracking-applications",
  "A-GPS TTFF 1.4 s avg (1-3 s) open sky; high end = obstructed sky (ASSUMPTION)")
p("gnss_agps_handling", 256 * mC, 100 * mC, 400 * mC, "C", "MEASURED",
  "https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/the-benefits-of-assisted-gps-in-asset-tracking-applications",
  "27.3 mA x 9.4 s A-GPS data handling; paid once per cold start (start of Lost Mode / AWAY episode)")
p("nrf9151_app_sleep", 3 * uA, 2 * uA, 18 * uA, "A", "ASSUMPTION",
  "https://www.emcraft.com/som/nrf9151/SOM-NRF9151-power-consumption.pdf",
  "App core System ON idle. Emcraft SOM calc gives 18 uA for SiP idle (used as high end)")

# ---------------- nRF52833 inside DWM3001C ----------------
p("nrf52_syson_rtc", 2.4 * uA, 1.5 * uA, 5 * uA, "A", "DATASHEET", NRF52833_PB, "System ON, full RAM retention + RTC")
p("nrf52_tx_0dbm", 6.1 * mA, 4.8 * mA, 6.1 * mA, "A", "DATASHEET", NRF52833_PB, "")
p("nrf52_tx_8dbm", 16.1 * mA, 14 * mA, 16.1 * mA, "A", "DATASHEET", NRF52833_PB, "")
p("nrf52_rx_1m", 5.96 * mA, 4.6 * mA, 5.96 * mA, "A", "DATASHEET", NRF52833_PB, "")
p("ble_adv_event_1m", 14 * uC, 10 * uC, 25 * uC, "C", "ASSUMPTION", "",
  "Legacy adv event, 3 ch, 0 dBm, ~31 B incl. HFXO start (derived from TX/RX currents x ~1.5-2 ms)")
p("ble_adv_event_coded", 80 * uC, 40 * uC, 150 * uC, "C", "ASSUMPTION", "",
  "Extended adv on Coded S8 at +8 dBm (primary + AUX, ~5-6 ms airtime at ~16 mA)")
p("ble_conn_event", 6 * uC, 4 * uC, 10 * uC, "C", "ASSUMPTION", "", "One connection event incl. small notification")
p("walk_conn_interval", 0.045, 0.030, 0.060, "s", "ASSUMPTION", "docs/device-protocol.md s7 WALK profile 30-60 ms, latency 3", "")
p("peer_conn_interval", 0.100, 0.050, 0.250, "s", "ASSUMPTION", "docs/device-protocol.md A3 (peer link not specified)",
  "Torus-Link peer link interval on a walk")
p("home_peer_interval", 1.0, 0.5, 2.0, "s", "ASSUMPTION", "", "Torus-Link presence link at home")
p("phone_present_home_frac", 0.6, 0.2, 0.9, "-", "ASSUMPTION", "", "Fraction of home time the phone is connected (IDLE profile)")
p("mcu_walk_torus", 150 * uA, 80 * uA, 400 * uA, "A", "ASSUMPTION", "", "CPU for Hall sampling, bolt detection, Halo updates")
p("mcu_walk_link", 50 * uA, 20 * uA, 150 * uA, "A", "ASSUMPTION", "", "")

# ---------------- DW3110 UWB ----------------
p("dw3110_sleep", 850e-9, 260e-9, 850e-9, "A", "DATASHEET", DW3000_DS, "SLEEP 850 nA; DEEPSLEEP 260 nA")
p("dw3110_tx_frame_avg", 14 * mA, 14 * mA, 17 * mA, "A", "DATASHEET", DW3000_DS, "TX avg over frame ch5 14 mA / ch9 17 mA")
p("dw3110_rx_peak", 75 * mA, 70 * mA, 88 * mA, "A", "DATASHEET", DW3000_DS, "RX ~70-88 mA during preamble/data")
p("dw3110_idle_pll", 18 * mA, 18 * mA, 32 * mA, "A", "DATASHEET", DW3000_DS, "IDLE_PLL ch5 18 mA / ch9 32 mA")
p("uwb_ranging_charge", 60 * uC, 35 * uC, 150 * uC, "C", "ASSUMPTION", DW3000_DS,
  "Per side per DS-TWR exchange: 1 ms osc start @1.5 mA + 1 ms IDLE_PLL @18 mA + 0.4 ms RX @75 mA + 0.17 ms TX + 2 ms MCU @3 mA")
p("uwb_rate_offlead", 4.0, 4.0, 4.0, "Hz", "ASSUMPTION", "docs/device-protocol.md A16", "4 Hz off lead, 2 Hz low battery")

# ---------------- Other ICs ----------------
p("lis2dw12_lp", 1.0 * uA, 0.38 * uA, 2.5 * uA, "A", "DATASHEET", "https://blog.st.com/?p=45925",
  "LP1 12.5 Hz 1 uA; 0.38 uA at 1.6 Hz; LP3 2.5 uA")
p("drv2605l_shutdown", 4 * uA, 4 * uA, 4 * uA, "A", "DATASHEET", "https://www.radiolocman.com/datasheet/data.html?di=291969",
  "Shutdown 4 uA typ; quiescent active 0.5 mA. Gate its supply with a load switch to remove this")
p("lra_drive_current", 80 * mA, 60 * mA, 120 * mA, "A", "ASSUMPTION", "", "LRA + DRV2605L while buzzing")
p("max17048_active", 23 * uA, 23 * uA, 23 * uA, "A", "DATASHEET", "https://www.analog.com/en/products/max17048.html", "")
p("max17048_hib", 3 * uA, 3 * uA, 3 * uA, "A", "DATASHEET", "https://www.analog.com/en/products/max17048.html", "")
p("bq25180_batonly", 3 * uA, 3 * uA, 3 * uA, "A", "DATASHEET", "https://www.ti.com/document-viewer/BQ25180/datasheet", "Battery-only Iq")
p("bq29700_normal", 4 * uA, 4 * uA, 5.5 * uA, "A", "DATASHEET",
  "https://www.digikey.ch/de/htmldatasheets/production/1848130/0/0/1/bq29702dset", "BQ2970x I_NORMAL 4 uA typ, 5.5 uA max")
p("nrf7002_off", 1 * uA, 0.5 * uA, 3 * uA, "A", "ASSUMPTION",
  "https://devzone.nordicsemi.com/f/nordic-q-a/116665/nrf7002-dk-system-shutdown/512328", "nRF7002 with BUCKEN low")
p("wifi_scan_current", 55 * mA, 50 * mA, 60 * mA, "A", "MEASURED",
  "https://developer.nordicsemi.com/nRF_Connect_SDK/doc/latest/nrf/protocols/wifi/scan_mode/scan_operation.html",
  "Default all-band scan 4.6 s at ~55 mA (~0.25 C)")
p("wifi_scan_time", 0.3, 0.15, 4.6, "s", "ASSUMPTION",
  "https://developer.nordicsemi.com/nRF_Connect_SDK/doc/latest/nrf/protocols/wifi/scan_mode/scan_operation.html",
  "Scan restricted to stored home-AP channel(s) (50-130 ms dwell each). High end = default full scan 4.6 s")
p("sk6812_static", 1 * mA, 1 * mA, 1 * mA, "A", "DATASHEET", "https://akizukidenshi.com/goodsaffix/sk6812.pdf",
  "Static IDD 1 mA per LED whenever powered, even if dark")
p("halo_led_drive", 0.6 * mA, 0.2 * mA, 2.0 * mA, "A", "ASSUMPTION", "", "Average lit current per LED at dim state colour")
p("halo_n_leds", 16, 12, 16, "-", "ASSUMPTION", "docs/context.md (12-16)", "")
p("halo_on_frac_walk", 1.0, 0.3, 1.0, "-", "ASSUMPTION", "docs/device-protocol.md s8.1 (state colour on walk)", "Fraction of walk time the ring is powered")
p("drv5056_icc", 6 * mA, 6 * mA, 10 * mA, "A", "RECALLED", "https://ti.com/document-viewer/DRV5056/datasheet",
  "DRV5056 ICC ~6 mA typ (verify SBAS644 s5.5). Two sensors (line + slip)")
p("hall_duty", 0.03, 0.01, 1.0, "-", "ASSUMPTION", "", "Hall sensors power-cycled (~1 kHz, 30 us on). 1.0 = always on")
p("torus_wake_sensor", 1 * uA, 0.5 * uA, 2 * uA, "A", "ASSUMPTION", "", "Low-power Hall switch for drum-movement wake")
p("regulators_leak", 4 * uA, 2 * uA, 10 * uA, "A", "ASSUMPTION", "", "Buck/LDO Iq, pull-ups, leakage")
p("magclip_misc", 1 * uA, 0.5 * uA, 3 * uA, "A", "ASSUMPTION", "", "Contact sense + boost converter shutdown Iq")

# ---------------- Charging chain ----------------
p("eff_contacts", 0.90, 0.85, 0.95, "-", "ASSUMPTION", "brief (~90%)", "")
p("eff_boost", 0.90, 0.85, 0.93, "-", "ASSUMPTION", "", "Source-side boost from cell to contact bus")
p("eff_linear", 0.83, 0.76, 0.88, "-", "ASSUMPTION", "BQ25180 is linear: eff ~ Vbat/Vin, 3.8/4.6 V", "")
p("magclip_to_link_rate", 90 * mA, 60 * mA, 120 * mA, "A", "ASSUMPTION", "", "Charge current into Link (90 mA = 10%/20 min on 300 mAh)")
p("magclip_max_c", 1.0, 1.0, 2.0, "C", "ASSUMPTION", "", "Max continuous discharge of the 100 mAh cell (cell not chosen)")
p("dock_charge_rate", 100 * mA, 50 * mA, 100 * mA, "A", "ASSUMPTION", "", "Torus dock -> MagClip charge current")

# ---------------- Battery ----------------
p("usable_frac", 0.95, 0.90, 0.97, "-", "ASSUMPTION", "", "Usable fraction of rated capacity at 25 C to brown-out cutoff")
p("self_discharge_month", 0.03, 0.02, 0.05, "-", "ASSUMPTION", "", "Li-ion polymer per month incl. protection IC")
p("cold_coeff", 0.012, 0.008, 0.016, "1/K", "ASSUMPTION", "", "Capacity loss per K below 20 C")
p("link_temp_offset", 8.0, 4.0, 12.0, "K", "ASSUMPTION", "", "Link on collar runs above ambient (body heat)")
p("torus_temp_offset", 3.0, 0.0, 8.0, "K", "ASSUMPTION", "", "Torus mostly indoors / in hand")
