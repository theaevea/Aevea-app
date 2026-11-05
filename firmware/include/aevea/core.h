/*
 * Aevea firmware core: state machine, queues, power gating, fail-safes, DFU glue.
 * Portable C11, no dynamic allocation. Torus and Link share this core; behaviour differs by
 * aev_config_t.device_type and by which HAL modules are present.
 *
 * *** NOTHING HERE HAS BEEN TESTED ON HARDWARE. Host unit tests with fake HAL only. ***
 */
#ifndef AEVEA_CORE_H
#define AEVEA_CORE_H

#include "aevea/proto.h"
#include "aevea/hal.h"
#include "aevea/dfu.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef AEV_EVQ_DEPTH
#define AEV_EVQ_DEPTH 256          /* A10: >= 256 */
#endif
#define AEV_CMDQ_DEPTH 8
#define AEV_INQ_DEPTH 32
#define AEV_RSP_CACHE 8
#define AEV_FRAME_MAX 260

/* Tunables (placeholders unless protocol.json fixes them; all listed in OPEN_QUESTIONS.md) */
#define AEV_BATT_PERIOD_MS 30000u
#define AEV_BATT_PERIOD_CRIT_MS 5000u
#define AEV_BATT_CUTOFF_MV 3300u
#define AEV_BATT_EMPTY_SAMPLES 3
#define AEV_CRIT_CLEAR_PCT 8
#define AEV_LOW_CLEAR_PCT 20
#define AEV_NO_MOTION_MS (10u * 60u * 1000u)
#define AEV_PAIRING_WINDOW_MS 300000u
#define AEV_FAST_PAGING_MS 60000u
#define AEV_RANGE_STALE_MS 2000u
#define AEV_TETHER_HYST_PCT 5
#define AEV_RED_REALERT_MS 3000u
#define AEV_HOME_SCAN_MIN_MS 60000u
#define AEV_AWAY_SCAN_MS 120000u
#define AEV_AWAY_FIX_MS 120000u
#define AEV_GNSS_JOB_TIMEOUT_S 60u
#define AEV_RECALL_CODED_RSSI (-85)
#define AEV_RECALL_1M_RSSI (-75)
#define AEV_WDT_SAFE_MODE_RESETS 3
#define AEV_HEALTHY_MS 600000u
#define AEV_LINK_MAGCLIP_CHARGE_MAX_PCT 80

/* Fault module ids (FAULT event .module) */
enum { AEV_MOD_WDT = 1, AEV_MOD_DFU = 2, AEV_MOD_BATTERY = 3, AEV_MOD_GNSS = 4, AEV_MOD_FLASH = 5, AEV_MOD_CORE = 6 };

/* GNSS requesters (bitmask) */
enum { AEV_GNSS_LOST = 1, AEV_GNSS_LOCATE = 2, AEV_GNSS_AWAY = 4 };

/* watchdog check-in bits */
enum { AEV_WDT_CORE = 1, AEV_WDT_RADIO = 2, AEV_WDT_SENSORS = 4 };

typedef struct {
    uint8_t device_type;               /* AEV_DEVICE_TYPE_TORUS or _LINK */
    uint64_t device_id;
    uint8_t hw_rev, fw_major, fw_minor, fw_patch;
    uint16_t fw_build;
    bool has_piezo;                    /* Link */
    uint8_t wdt_required;              /* AEV_WDT_* bits that must check in before the HW watchdog is fed */
} aev_config_t;

typedef enum { AEV_SRC_BLE_CMD, AEV_SRC_CLOUD_CMD, AEV_SRC_DFU_CTRL, AEV_SRC_DFU_DATA } aev_src_t;

typedef struct { aev_src_t src; uint16_t len; uint8_t buf[AEV_FRAME_MAX]; } aev_cmdq_item_t;

typedef struct {
    uint16_t ev_seq; uint8_t source, code; uint32_t time; uint8_t len; uint8_t payload[16];
} aev_evrec_t;

/* Persistent settings, A/B sectors in AEV_PART_SETTINGS (power-fail safe by sequence + CRC) */
typedef struct {
    uint32_t magic, seq;
    uint8_t owner_bound, peer_set, peer_type, tether_mode, radius_dm, amber_pct, wdt_resets, lost_active;
    uint8_t owner_id[16];
    uint64_t peer_id;
    uint8_t peer_pubkey[64];
    uint8_t ssid_len[4];
    uint8_t ssid[4][AEV_MAX_SSID];
    uint32_t lost_id;
    uint16_t lost_interval_s, ev_seq_hwm;
    uint8_t dfu_state, dfu_type, dfu_boots, dfu_maj, dfu_min, dfu_patch;
    uint16_t dfu_build;
    uint32_t dfu_size, dfu_offset;
    uint8_t dfu_sha[32];
    uint32_t crc;                      /* must stay last */
} aev_settings_t;

/* What the core wants the hardware to be doing right now (pure function of state). */
typedef struct {
    bool shutdown;
    bool adv_on; uint16_t adv_ms; bool adv_coded;
    uint8_t uwb_hz;
    bool line_on;
    bool accel_on;
    uint8_t wifi_mode;                 /* 0 off, 1 motion-gated, 2 periodic, 3 reduced */
    bool gnss_on;
    aev_modem_mode_t modem;
    aev_led_cmd_t halo;
    bool charge_magclip_ok;            /* Link: accept MagClip contacts charge (< 80 %) */
} aev_plan_t;

typedef struct aev_dev {
    aev_config_t cfg;
    aev_hal_t hal;
    bool is_link;

    /* queues */
    aev_cmdq_item_t cmdq[AEV_CMDQ_DEPTH]; unsigned cmdq_head, cmdq_n; unsigned cmdq_drops;
    aev_in_t inq[AEV_INQ_DEPTH]; unsigned inq_head, inq_n; unsigned inq_drops;
    aev_evrec_t evq[AEV_EVQ_DEPTH]; uint16_t ev_head_seq, ev_tail_seq; unsigned ev_n;
    uint16_t tx_cursor, tx_limit; unsigned ev_dropped_acc; bool in_overflow_emit;
    struct { bool valid; uint8_t seq, target, opcode; uint8_t len; uint8_t data[AEV_FRAME_MAX]; } rsp_cache[AEV_RSP_CACHE];
    unsigned rsp_cache_next;

    aev_settings_t st; bool st_dirty; uint32_t st_seq;

    /* state */
    uint8_t activity, power;           /* AEV_ACTIVITY_STATE_*, AEV_POWER_STATE_* */
    bool low, critical, charging, shutdown, safe_mode;
    uint8_t batt_pct; uint16_t batt_mv; int8_t batt_temp; uint8_t chg_source, chg_state;
    int last_batt_step; uint8_t empty_samples; bool batt_known;
    uint32_t next_batt_ms;

    bool walk_active; uint32_t walk_id, walk_start_ms; uint8_t bolt_count, red_count; uint16_t max_force;
    uint8_t tether_level; uint16_t last_dist_cm; uint32_t last_range_ms; bool range_valid;
    uint8_t range_seq; int8_t phone_rssi; uint16_t line_out_mm; uint32_t next_range_notify_ms; uint32_t last_red_alert_ms;

    bool latched; uint8_t mc_location, mc_batt, mc_charge; bool mc_seen; uint32_t mc_seen_ms;
    bool peer_seen, phone_seen, wifi_seen, wifi_known, moving; uint32_t last_motion_ms;
    bool connected;

    /* timers: *_since valid when *_armed */
    bool absent_armed; uint32_t absent_since;
    bool offlead_lost_armed; uint32_t offlead_lost_since;
    bool still_armed; uint32_t still_since;
    uint32_t last_wifi_scan_ms; bool wifi_scan_pending; bool wifi_ever_scanned; bool motion_since_scan;
    uint32_t fast_paging_until; bool fast_paging;
    uint32_t pairing_until; bool pairing_open;
    uint32_t walk_adv_boost_until;
    uint32_t healthy_since; bool healthy_cleared;
    uint32_t last_status_ms; bool status_dirty;

    /* GNSS jobs */
    uint8_t gnss_mask; bool gnss_running; uint32_t gnss_deadline[3]; uint32_t gnss_start_ms;
    bool have_fix; int32_t fix_lat, fix_lon; uint16_t fix_acc; uint8_t fix_sats; uint32_t fix_ms;
    uint32_t next_lost_fix_ms; uint32_t last_away_fix_ms; bool motion_since_fix;
    bool locate_pending; uint16_t locate_id; uint8_t locate_flags;

    /* recall */
    bool recall_active; uint16_t recall_id; uint32_t recall_end_ms; uint16_t last_recall_id; bool last_recall_valid;

    /* halo override */
    bool halo_override; aev_led_cmd_t halo_cmd; uint32_t halo_end_ms; bool halo_timed;

    /* applied plan (diffed against desired) */
    aev_plan_t applied; bool applied_valid; bool coded_requested;

    /* watchdog */
    uint8_t wdt_checked; uint32_t wdt_feeds, wdt_withheld;

    aev_dfu_t dfu;
    bool reset_requested;
    unsigned boots;
} aev_dev_t;

/* ---- API ---------------------------------------------------------------------- */
/* Initialise from HAL (copies the aev_hal_t, installs the sink). Loads settings/events, applies boot logic. */
void aev_init(aev_dev_t *d, const aev_config_t *cfg, const aev_hal_t *hal);
/* Post an asynchronous input (HAL-side). Returns false if the input queue is full (drop counted). */
bool aev_post(aev_dev_t *d, const aev_in_t *in);
/* Enqueue received bytes (BLE command write, cloud command, DFU control, DFU data). false if queue full. */
bool aev_rx(aev_dev_t *d, aev_src_t src, const uint8_t *data, size_t len);
/* Run the core once: drain queues, timers, plan, watchdog. Call from the main loop at >= 10 Hz and after posts. */
void aev_poll(aev_dev_t *d);
/* ms until the next timer the core knows about (0 = poll now), for RTOS sleep. */
uint32_t aev_next_deadline_ms(const aev_dev_t *d);
/* RTOS threads call this so the hardware watchdog is only fed when every required task is alive. */
void aev_wdt_checkin(aev_dev_t *d, uint8_t bit);

/* Pure helpers, exported for tests */
void aev_compute_plan(const aev_dev_t *d, aev_plan_t *out);
bool aev_gnss_permitted(const aev_dev_t *d, uint8_t who);
uint16_t aev_lost_interval_s(uint8_t batt_pct, uint16_t requested_s);
uint32_t aev_capabilities(const aev_dev_t *d);
void aev_build_status(const aev_dev_t *d, aev_status_t *s);

/* Internal (shared between core.c and dfu.c) */
void aev_emit(aev_dev_t *d, uint8_t source, const aev_evt_t *e);
void aev_settings_save(aev_dev_t *d);
uint32_t aev_now(const aev_dev_t *d);
bool aev_elapsed(const aev_dev_t *d, uint32_t since, uint32_t ms);
void aev_fault(aev_dev_t *d, uint8_t err, uint8_t module, uint16_t detail);

#ifdef __cplusplus
}
#endif
#endif
