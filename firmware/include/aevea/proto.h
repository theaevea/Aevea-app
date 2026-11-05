/*
 * Aevea BLE protocol v1.0 (DRAFT) - pure C encoder/decoder.
 * No HAL, no allocation, no globals. Constants come from proto_gen.h, which is
 * generated from docs/protocol.json. NOT TESTED ON HARDWARE.
 * All multi-byte integers are little-endian on the wire.
 */
#ifndef AEVEA_PROTO_H
#define AEVEA_PROTO_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include "aevea/proto_gen.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---- little-endian primitives ---------------------------------------- */
void aev_put_u16(uint8_t *p, uint16_t v);
void aev_put_u32(uint8_t *p, uint32_t v);
void aev_put_u64(uint8_t *p, uint64_t v);
uint16_t aev_get_u16(const uint8_t *p);
uint32_t aev_get_u32(const uint8_t *p);
uint64_t aev_get_u64(const uint8_t *p);

/* CRC-32/ISO-HDLC (used by DFU_GET_OFFSET). Pass crc=0 to start; chainable. */
uint32_t aev_crc32(uint32_t crc, const uint8_t *data, size_t len);

/* ---- frames --------------------------------------------------------- */
typedef struct {
    uint8_t ver, seq, target, opcode, len;
} aev_cmd_hdr_t;

typedef struct {
    uint8_t ver, seq, target, opcode, status, len;
} aev_rsp_hdr_t;

typedef struct {
    uint8_t ver;
    uint16_t ev_seq;
    uint8_t source, code;
    uint32_t time;
    uint8_t len;
} aev_evt_hdr_t;

/* Decoders return 0 on success, -1 when buffer is shorter than the header. They do NOT
 * check that the payload is complete; use the *_payload helpers for that. */
int aev_cmd_hdr_decode(const uint8_t *buf, size_t n, aev_cmd_hdr_t *h);
int aev_rsp_hdr_decode(const uint8_t *buf, size_t n, aev_rsp_hdr_t *h);
int aev_evt_hdr_decode(const uint8_t *buf, size_t n, aev_evt_hdr_t *h);

/* Encoders return bytes written, or 0 if cap is too small / payload > 255. */
size_t aev_cmd_frame_encode(uint8_t *out, size_t cap, uint8_t seq, uint8_t target,
                            uint8_t opcode, const uint8_t *payload, size_t plen);
size_t aev_rsp_frame_encode(uint8_t *out, size_t cap, uint8_t seq, uint8_t target,
                            uint8_t opcode, uint8_t status, const uint8_t *payload, size_t plen);
size_t aev_evt_frame_encode(uint8_t *out, size_t cap, uint16_t ev_seq, uint8_t source,
                            uint8_t code, uint32_t time, const uint8_t *payload, size_t plen);

/* ---- structs (section 4.1) ------------------------------------------- */
typedef struct {
    uint8_t ver, device_type, activity_state, power_state, battery_pct;
    uint16_t flags;
    uint8_t magclip_batt_pct, tether_radius_dm, tether_level;
    uint16_t queued_events;
    uint32_t walk_id;
} aev_status_t;

typedef struct {
    uint8_t ver, device_type, battery_pct, latched, location, charge_state;
    uint16_t last_seen_s;
} aev_magclip_status_t;

typedef struct {
    uint8_t ver, seq;
    uint16_t distance_cm;
    uint8_t dist_err_cm;
    int8_t link_rssi_dbm, phone_rssi_dbm;
    uint16_t line_out_mm;
    uint8_t tether_level, flags;
} aev_range_t;

typedef struct {
    uint8_t ver, device_type, proto_major, proto_minor;
    uint64_t device_id;
    uint32_t pairing_nonce;
    uint8_t flags;
} aev_identity_t;

typedef struct {
    uint8_t proto_major, proto_minor, device_type, hw_rev, fw_major, fw_minor, fw_patch;
    uint16_t fw_build;
    uint32_t capabilities;
    uint8_t max_payload;
} aev_info_t;

typedef struct {
    uint8_t token_ver, purpose;
    uint64_t device_id;
    uint8_t owner_id[16];
    uint32_t issued, expires;
    uint8_t signature[64];
} aev_owner_token_t;

/* Each encode returns the struct size (AEV_SZ_*) or 0 if cap too small.
 * Each decode returns 0 or -1 if n is smaller than the struct (trailing bytes ignored). */
size_t aev_status_encode(uint8_t *o, size_t cap, const aev_status_t *s);
int aev_status_decode(const uint8_t *b, size_t n, aev_status_t *s);
size_t aev_magclip_status_encode(uint8_t *o, size_t cap, const aev_magclip_status_t *s);
int aev_magclip_status_decode(const uint8_t *b, size_t n, aev_magclip_status_t *s);
size_t aev_range_encode(uint8_t *o, size_t cap, const aev_range_t *s);
int aev_range_decode(const uint8_t *b, size_t n, aev_range_t *s);
size_t aev_identity_encode(uint8_t *o, size_t cap, const aev_identity_t *s);
int aev_identity_decode(const uint8_t *b, size_t n, aev_identity_t *s);
size_t aev_info_encode(uint8_t *o, size_t cap, const aev_info_t *s);
int aev_info_decode(const uint8_t *b, size_t n, aev_info_t *s);
size_t aev_owner_token_encode(uint8_t *o, size_t cap, const aev_owner_token_t *s);
int aev_owner_token_decode(const uint8_t *b, size_t n, aev_owner_token_t *s);

/* ---- advertising manufacturer data (10 B incl. AD header NOT included) ----- */
size_t aev_adv_mfg_encode(uint8_t *o, size_t cap, uint8_t device_type, uint8_t activity, uint8_t adv_flags);

/* ---- command payloads ------------------------------------------------- */
#define AEV_MAX_SSID 32

typedef struct {
    uint8_t opcode;
    union {
        struct { uint32_t unix_time; int16_t tz_offset_min; } set_time;
        struct { uint16_t from_ev_seq; uint8_t max_count; } get_events;
        struct { uint16_t up_to_ev_seq; } ack_events;
        struct { uint16_t tests; } self_test;
        struct { uint32_t magic; } factory_reset;
        struct { uint32_t walk_id; uint8_t tether_mode, tether_radius_dm; } start_walk;
        struct { uint32_t walk_id; } stop_walk;
        struct { uint8_t radius_dm, amber_pct, mode; } set_tether;
        struct { uint8_t pattern, r, g, b, brightness; uint16_t period_ms, duration_s; } set_halo;
        struct { uint8_t actuator, pattern, repeat, intensity; } buzz;
        struct { uint8_t action; uint16_t recall_id; uint8_t cue, pattern, timeout_s; } recall;
        struct { uint16_t request_id; uint8_t flags, timeout_s; } locate;
        struct { uint8_t action; uint32_t lost_id; uint16_t interval_s; } lost;
        struct { uint8_t slot, ssid_len; uint8_t ssid[AEV_MAX_SSID]; } home_wifi;
        struct { uint8_t peer_type; uint64_t peer_id; uint8_t peer_pubkey[64]; } bind_peer;
        struct { uint64_t peer_id; } unbind_peer;
        struct { uint16_t offset; uint8_t max_len; } get_cert;
        struct { uint8_t app_nonce[16]; } auth;
        struct { uint8_t token[98]; } owner;   /* OWNER_BIND / OWNER_UNBIND */
    } u;
} aev_cmd_t;

/* Decode + range-validate a command payload.
 * Returns AEV_ERR_OK, AEV_ERR_UNKNOWN_OPCODE, AEV_ERR_INVALID_LENGTH or AEV_ERR_OUT_OF_RANGE.
 * Payloads shorter than the known size -> INVALID_LENGTH. Trailing bytes beyond the known
 * fields are IGNORED (protocol section 1: forward compatibility). */
uint8_t aev_cmd_decode(uint8_t opcode, const uint8_t *payload, size_t len, aev_cmd_t *out);

/* Encode a command payload (app / simulator / cloud side). Returns bytes written or 0. */
size_t aev_cmd_encode(const aev_cmd_t *c, uint8_t *out, size_t cap);

/* Static properties of an opcode (0 if unknown). */
typedef struct {
    bool known;
    bool owner_required;     /* needs OWNER_BOUND */
    bool torus, link;        /* supported on device type */
    bool magclip_target;     /* accepts target 0x03 */
    bool cloud_ok;           /* may arrive via LTE-M */
} aev_op_info_t;
aev_op_info_t aev_op_info(uint8_t opcode);

/* ---- response payloads ------------------------------------------------ */
typedef struct { uint32_t duration_s; uint8_t bolt_count; uint16_t max_force_n; uint8_t tether_red_count; } aev_walk_summary_t;
size_t aev_walk_summary_encode(uint8_t *o, size_t cap, const aev_walk_summary_t *s);
int aev_walk_summary_decode(const uint8_t *b, size_t n, aev_walk_summary_t *s);
size_t aev_get_events_rsp_encode(uint8_t *o, size_t cap, uint16_t available, uint16_t first_ev_seq);

/* ---- event payloads (section 10) -------------------------------------- */
typedef struct {
    uint8_t code;
    union {
        struct { uint8_t pct; uint16_t mv; uint8_t charge_state, charge_source; int8_t temp_c; } battery;
        struct { uint8_t old_activity, new_activity, power_state, reason; } state;
        struct { uint8_t latched, sensed_by, magclip_batt_pct; } latch;
        struct { uint32_t walk_id; uint16_t peak_force_n, slip_mm, duration_ms, line_out_mm; uint8_t flags; } bolt;
        struct { uint8_t level; uint16_t distance_cm; uint8_t radius_dm; uint32_t walk_id; } tether;
        struct { uint16_t request_id; int32_t lat_e7, lon_e7; uint16_t acc_m, fix_age_s; uint8_t source, sats; } location;
        struct { uint16_t recall_id; uint8_t status, path; } recall;
        struct { uint8_t active; uint32_t lost_id; uint16_t interval_s; uint8_t path; } lost;
        struct { uint16_t tests_run, tests_failed; uint8_t detail; } self_test;
        struct { uint8_t error_code, module; uint16_t detail; } fault;
        struct { uint16_t dropped, oldest_ev_seq; } overflow;
    } u;
} aev_evt_t;

/* Returns payload bytes written (== AEV_EVSZ_*) or 0 on unknown code / small cap. */
size_t aev_evt_payload_encode(const aev_evt_t *e, uint8_t *o, size_t cap);
/* Returns 0 ok, -1 if too short, -2 if code unknown (callers must IGNORE unknown codes). */
int aev_evt_payload_decode(uint8_t code, const uint8_t *b, size_t n, aev_evt_t *e);

/* ---- DFU (service 0x0300) ---------------------------------------------- */
typedef struct {
    uint8_t op;
    union {
        struct { uint8_t image_type; uint32_t image_size; uint8_t fw_major, fw_minor, fw_patch;
                 uint16_t fw_build; uint8_t sha256[32]; } start;
    } u;
} aev_dfu_req_t;

/* 0 ok; AEV_ERR_UNKNOWN_OPCODE / AEV_ERR_INVALID_LENGTH otherwise. */
uint8_t aev_dfu_req_decode(const uint8_t *b, size_t n, aev_dfu_req_t *r);
size_t aev_dfu_req_encode_start(uint8_t *o, size_t cap, const aev_dfu_req_t *r);

/* Indication: op, status, payload. */
size_t aev_dfu_ind_encode(uint8_t *o, size_t cap, uint8_t op, uint8_t status, const uint8_t *payload, size_t plen);

/* DFU_DATA characteristic: offset u32 + data. Returns 0 or -1. data points into b. */
int aev_dfu_data_decode(const uint8_t *b, size_t n, uint32_t *offset, const uint8_t **data, size_t *dlen);
size_t aev_dfu_data_encode(uint8_t *o, size_t cap, uint32_t offset, const uint8_t *data, size_t dlen);

/* Sanity helper used by tests: true when hand-written struct sizes equal protocol.json. */
bool aev_proto_selfcheck(void);

#ifdef __cplusplus
}
#endif
#endif
