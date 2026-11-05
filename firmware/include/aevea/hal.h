/*
 * Aevea firmware core - Hardware Abstraction Layer (HAL).
 *
 * The core (src/*.c) never touches hardware; it calls the vtables below. A Zephyr / nRF Connect
 * SDK port implements each module with the vendor drivers (see README "Porting"). Host tests use
 * hal_fake/. Any module pointer or function pointer MAY be NULL: the core treats a missing module
 * as "this hardware is not fitted" (e.g. Torus has no gnss/modem/wifi_scan) and clears the matching
 * capability bit.
 *
 * Deliberately ABSENT: there is no lock, latch or Bolt Brake function here. Those are mechanical
 * (context.md) and must never depend on firmware, battery or this HAL.
 *
 * Threading: the core is single threaded. HAL drivers deliver asynchronous results by calling
 * hal->sink(hal->sink_ctx, &evt) (aev_hal_post); in an RTOS port that call must be made from a
 * context that may use the core's inq (see README) - normally a k_msgq / work item hop.
 *
 * NOT TESTED ON HARDWARE.
 */
#ifndef AEVEA_HAL_H
#define AEVEA_HAL_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include "aevea/proto_gen.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---- asynchronous inputs the HAL posts to the core ----------------------- */
typedef enum {
    AEV_IN_NONE = 0,
    AEV_IN_BLE_CONN,          /* a: connected (phone). Also updates phone presence. */
    AEV_IN_PHONE,             /* a: seen; rssi (scan-derived presence / RSSI update) */
    AEV_IN_PEER,              /* a: seen (Torus<->Link peer link up/down) */
    AEV_IN_PEER_ACTIVITY,     /* a: peer's activity_state (peer link result) */
    AEV_IN_MAGCLIP,           /* a: latched; b: location; c: batt_pct (0xFF unknown); d: charge_state */
    AEV_IN_WIFI_RESULT,       /* a: scan ok; b: home SSID seen */
    AEV_IN_MOTION,            /* a: moving (accelerometer wake / still interrupt) */
    AEV_IN_CHARGER,           /* charger state changed; core re-reads charger HAL */
    AEV_IN_UWB_RANGE,         /* a: valid; b: distance_cm; c: err_cm; d: nlos */
    AEV_IN_LINE_OUT,          /* b: line_out_mm (Torus Hall/angle sensor) */
    AEV_IN_BOLT,              /* b: peak_force_n; c: slip_mm; d: duration_ms; e: flags; f: line_out_mm */
    AEV_IN_GNSS_FIX,          /* lat_e7, lon_e7, b: acc_m, c: sats */
    AEV_IN_GNSS_TIMEOUT,      /* GNSS driver gave up (core also has its own deadlines) */
    AEV_IN_MODEM_STATE        /* a: registered on network */
} aev_in_type_t;

typedef struct {
    aev_in_type_t type;
    uint32_t a, b, c, d, e, f;
    int32_t lat_e7, lon_e7;
    int8_t rssi;
} aev_in_t;

typedef struct aev_hal aev_hal_t;
typedef void (*aev_sink_fn)(void *ctx, const aev_in_t *in);

/* ---- radio (BLE on nRF52833) ----------------------------------------------- */
typedef enum { AEV_CH_RESPONSE, AEV_CH_EVENT, AEV_CH_STATUS, AEV_CH_RANGE, AEV_CH_DFU_CTRL, AEV_CH_BATTERY_LEVEL } aev_char_t;
typedef enum { AEV_CONN_ACTIVE, AEV_CONN_WALK, AEV_CONN_IDLE } aev_conn_profile_t;

typedef struct {
    bool enabled;
    uint16_t interval_ms;
    bool coded_phy_extended;     /* also advertise LE Coded S8 extended (Link AWAY/LOST) */
    uint8_t mfg[10];             /* manufacturer data (company id .. flags), mfg_len bytes */
    uint8_t mfg_len;
    bool pairing_window;
} aev_adv_cfg_t;

typedef struct {
    void *ctx;
    int  (*adv_set)(void *ctx, const aev_adv_cfg_t *cfg);
    int  (*conn_profile)(void *ctx, aev_conn_profile_t p);
    int  (*set_coded_phy)(void *ctx, bool want_coded);   /* request; phone may refuse */
    bool (*phy_is_coded)(void *ctx);
    /* send on a characteristic (indicate for RESPONSE/EVENT/DFU_CTRL, notify for STATUS/RANGE/BATTERY).
     * Return 0 on success, negative errno (-EBUSY if an indication is in flight, -ENOTCONN). */
    int  (*send)(void *ctx, aev_char_t ch, const uint8_t *data, size_t len);
    bool (*connected)(void *ctx);
    uint16_t (*att_mtu)(void *ctx);
    unsigned (*bond_count)(void *ctx);
    int  (*erase_bonds)(void *ctx);
    int  (*self_test)(void *ctx, unsigned arg);          /* 0 = pass */
} aev_radio_hal_t;

/* ---- UWB (Qorvo DW3110 in DWM3001C). Stack choice is a Fiddlie decision (OPEN_QUESTIONS Q4). */
typedef struct {
    void *ctx;
    int (*start)(void *ctx, unsigned rate_hz);           /* secure ranging with bound peer */
    int (*stop)(void *ctx);
    int (*set_peer)(void *ctx, uint64_t peer_id, const uint8_t pubkey[64]);   /* derive STS key */
    int (*clear_peer)(void *ctx);
    int (*self_test)(void *ctx, unsigned arg);
} aev_uwb_hal_t;

/* ---- GNSS (nRF9151) ------------------------------------------------------------ */
typedef struct {
    void *ctx;
    int (*start)(void *ctx, unsigned timeout_s);         /* one fix attempt; result via sink */
    int (*stop)(void *ctx);
    int (*self_test)(void *ctx, unsigned arg);
} aev_gnss_hal_t;

/* ---- LTE-M modem (nRF9151) ------------------------------------------------------ */
typedef enum {
    AEV_MODEM_OFF = 0,
    AEV_MODEM_EDRX,          /* eDRX command check, ~80 s worst-case latency */
    AEV_MODEM_FAST_PAGING,   /* 1-2 s paging (Recall fallback window, ~60 s) */
    AEV_MODEM_ACTIVE         /* connected, reports each interval (Lost Mode) */
} aev_modem_mode_t;

typedef struct {
    void *ctx;
    int (*set_mode)(void *ctx, aev_modem_mode_t m);
    int (*send)(void *ctx, const uint8_t *data, size_t len);   /* uplink to cloud (reports, responses) */
    int (*self_test)(void *ctx, unsigned arg);
} aev_modem_hal_t;

/* ---- Wi-Fi scan-only (nRF7002), home detection only. Never associates. --------------- */
typedef struct {
    void *ctx;
    int (*set_known)(void *ctx, uint8_t slot, const uint8_t *ssid, uint8_t len);   /* len 0 clears */
    int (*scan)(void *ctx);                              /* one active/passive scan; result via sink */
    int (*self_test)(void *ctx, unsigned arg);
} aev_wifi_hal_t;

/* ---- accelerometer (LIS2DW12) ------------------------------------------------------ */
typedef struct {
    void *ctx;
    int (*enable)(void *ctx, bool on);                   /* wake-on-motion / still interrupts */
    int (*self_test)(void *ctx, unsigned arg);
} aev_accel_hal_t;

/* ---- haptics / sounder (DRV2605L LRA, Link piezo) ---------------------------------------- */
typedef struct {
    void *ctx;
    int (*play)(void *ctx, uint8_t actuator_mask, uint8_t pattern, uint8_t repeat, uint8_t intensity);
    int (*stop)(void *ctx);
    int (*self_test)(void *ctx, unsigned arg);           /* arg: actuator mask */
} aev_haptics_hal_t;

/* ---- LEDs (Torus Halo ring) ------------------------------------------------------------------ */
typedef struct {
    uint8_t pattern;             /* AEV_HALO_PATTERN_* (never AUTO_STATE here) */
    uint8_t r, g, b, brightness; /* brightness 0-100 % */
    uint16_t period_ms;
} aev_led_cmd_t;

typedef struct {
    void *ctx;
    int (*set)(void *ctx, const aev_led_cmd_t *cmd);
    int (*self_test)(void *ctx, unsigned arg);
} aev_leds_hal_t;

/* ---- fuel gauge / charger --------------------------------------------------------------------- */
typedef struct { uint8_t pct; uint16_t mv; int8_t temp_c; } aev_batt_t;
typedef struct { uint8_t source; uint8_t state; } aev_chg_t;   /* AEV_CHARGE_SOURCE_*, AEV_CHARGE_STATE_* */

typedef struct {
    void *ctx;
    int (*read)(void *ctx, aev_batt_t *out);             /* 0 ok */
    int (*self_test)(void *ctx, unsigned arg);
} aev_fuel_hal_t;

typedef struct {
    void *ctx;
    int (*read)(void *ctx, aev_chg_t *out);
    int (*input_enable)(void *ctx, uint8_t source, bool en);   /* e.g. refuse MagClip charge >= 80 % */
    int (*self_test)(void *ctx, unsigned arg);                /* arg 1 = contacts test */
} aev_charger_hal_t;

/* ---- line sensor (Torus Hall/angle) ------------------------------------------------------------- */
typedef struct {
    void *ctx;
    int (*enable)(void *ctx, bool on);
    int (*self_test)(void *ctx, unsigned arg);
} aev_line_hal_t;

/* ---- flash ------------------------------------------------------------------------------------------ */
typedef enum { AEV_PART_SETTINGS, AEV_PART_EVENTS, AEV_PART_DFU_SLOT, AEV_PART_COUNT } aev_part_t;

typedef struct {
    void *ctx;
    int  (*read)(void *ctx, aev_part_t p, uint32_t off, void *buf, size_t len);
    int  (*write)(void *ctx, aev_part_t p, uint32_t off, const void *buf, size_t len);
    int  (*erase)(void *ctx, aev_part_t p, uint32_t off, size_t len);   /* may return -EBUSY */
    uint32_t (*size)(void *ctx, aev_part_t p);
    uint32_t erase_unit;         /* bytes, e.g. 4096 */
} aev_flash_hal_t;

/* ---- clock -------------------------------------------------------------------------------------------- */
typedef struct {
    void *ctx;
    uint32_t (*uptime_ms)(void *ctx);                    /* wraps at 2^32, core is wrap-safe */
    uint32_t (*unix_time)(void *ctx);                    /* 0 if never set */
    void     (*set_unix)(void *ctx, uint32_t t);
} aev_clock_hal_t;

/* ---- system: watchdog, reset, ship mode ------------------------------------------------------------------ */
typedef enum { AEV_RESET_POWER_ON, AEV_RESET_PIN, AEV_RESET_SOFT, AEV_RESET_WATCHDOG, AEV_RESET_BROWNOUT } aev_reset_reason_t;

typedef struct {
    void *ctx;
    void (*wdt_feed)(void *ctx);
    aev_reset_reason_t (*reset_reason)(void *ctx);
    void (*reset)(void *ctx);
    void (*power_off)(void *ctx);                        /* battery empty: everything off, wake on charger */
} aev_system_hal_t;

/* ---- crypto hooks (key storage is a Fiddlie decision, OPEN_QUESTIONS Q3) ----------------------------- */
#define AEV_SHA256_STATE_MAX 128
typedef enum { AEV_KEY_OWNER_TOKEN = 1 } aev_key_id_t;

typedef struct {
    void *ctx;
    void (*random)(void *ctx, uint8_t *buf, size_t n);
    void (*sha256_init)(void *ctx, void *state);
    void (*sha256_update)(void *ctx, void *state, const uint8_t *d, size_t n);
    void (*sha256_final)(void *ctx, void *state, uint8_t out[32]);
    /* ECDSA P-256 verify over SHA-256(msg). sig = r||s (64 B). */
    bool (*ecdsa_verify)(void *ctx, aev_key_id_t key, const uint8_t *msg, size_t n, const uint8_t sig[64]);
    /* sign SHA-256(msg) with the device identity key (never leaves protected storage). */
    bool (*device_sign)(void *ctx, const uint8_t *msg, size_t n, uint8_t sig[64]);
    size_t (*cert_len)(void *ctx);
    int  (*cert_read)(void *ctx, size_t off, uint8_t *buf, size_t n);
    /* DFU: verify the signature of the image staged in AEV_PART_DFU_SLOT (MCUboot-style trailer). */
    bool (*verify_image)(void *ctx, uint8_t image_type, uint32_t size, const uint8_t sha256[32]);
    /* DFU: anti-rollback (security counter / version policy). */
    bool (*version_allowed)(void *ctx, uint8_t image_type, uint8_t maj, uint8_t min, uint8_t patch, uint16_t build);
} aev_crypto_hal_t;

/* ---- bootloader (MCUboot or custom, OPEN_QUESTIONS Q2) --------------------------------------------------- */
typedef struct {
    void *ctx;
    int (*request_test_boot)(void *ctx, uint8_t image_type);   /* mark slot for test swap on next reset */
    int (*confirm)(void *ctx, uint8_t image_type);             /* make the running image permanent */
    int (*revert)(void *ctx, uint8_t image_type);              /* ask bootloader to roll back at next reset */
} aev_boot_hal_t;

/* ---- aggregate ------------------------------------------------------------------------------------------------ */
struct aev_hal {
    aev_radio_hal_t *radio;
    aev_uwb_hal_t *uwb;
    aev_gnss_hal_t *gnss;
    aev_modem_hal_t *modem;
    aev_wifi_hal_t *wifi_scan;
    aev_accel_hal_t *accel;
    aev_haptics_hal_t *haptics;
    aev_leds_hal_t *leds;
    aev_fuel_hal_t *fuel_gauge;
    aev_charger_hal_t *charger;
    aev_line_hal_t *line_sensor;
    aev_flash_hal_t *flash;
    aev_clock_hal_t *clock;
    aev_system_hal_t *system;
    aev_crypto_hal_t *crypto;
    aev_boot_hal_t *boot;
    /* set by aev_init(); HAL drivers call aev_hal_post() */
    aev_sink_fn sink;
    void *sink_ctx;
};

static inline void aev_hal_post(const aev_hal_t *h, const aev_in_t *in)
{
    if (h && h->sink) h->sink(h->sink_ctx, in);
}

#ifdef __cplusplus
}
#endif
#endif
