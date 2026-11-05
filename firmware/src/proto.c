/* Aevea BLE protocol v1.0 (DRAFT) pure C codec. NOT TESTED ON HARDWARE. */
#include <string.h>
#include "aevea/proto.h"

void aev_put_u16(uint8_t *p, uint16_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }
void aev_put_u32(uint8_t *p, uint32_t v) { aev_put_u16(p, (uint16_t)v); aev_put_u16(p + 2, (uint16_t)(v >> 16)); }
void aev_put_u64(uint8_t *p, uint64_t v) { aev_put_u32(p, (uint32_t)v); aev_put_u32(p + 4, (uint32_t)(v >> 32)); }
uint16_t aev_get_u16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
uint32_t aev_get_u32(const uint8_t *p) { return (uint32_t)aev_get_u16(p) | ((uint32_t)aev_get_u16(p + 2) << 16); }
uint64_t aev_get_u64(const uint8_t *p) { return (uint64_t)aev_get_u32(p) | ((uint64_t)aev_get_u32(p + 4) << 32); }

uint32_t aev_crc32(uint32_t crc, const uint8_t *data, size_t len)
{
    crc = ~crc;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
    return ~crc;
}

/* ---- frames ------------------------------------------------------------ */
int aev_cmd_hdr_decode(const uint8_t *b, size_t n, aev_cmd_hdr_t *h)
{
    if (!b || n < AEV_HDR_COMMAND) return -1;
    h->ver = b[0]; h->seq = b[1]; h->target = b[2]; h->opcode = b[3]; h->len = b[4];
    return 0;
}
int aev_rsp_hdr_decode(const uint8_t *b, size_t n, aev_rsp_hdr_t *h)
{
    if (!b || n < AEV_HDR_RESPONSE) return -1;
    h->ver = b[0]; h->seq = b[1]; h->target = b[2]; h->opcode = b[3]; h->status = b[4]; h->len = b[5];
    return 0;
}
int aev_evt_hdr_decode(const uint8_t *b, size_t n, aev_evt_hdr_t *h)
{
    if (!b || n < AEV_HDR_EVENT) return -1;
    h->ver = b[0]; h->ev_seq = aev_get_u16(b + 1); h->source = b[3]; h->code = b[4];
    h->time = aev_get_u32(b + 5); h->len = b[9];
    return 0;
}

static void cpy(uint8_t *d, const uint8_t *s, size_t n) { if (n) memcpy(d, s, n); }

size_t aev_cmd_frame_encode(uint8_t *o, size_t cap, uint8_t seq, uint8_t target, uint8_t opcode,
                            const uint8_t *payload, size_t plen)
{
    if (plen > 255 || cap < AEV_HDR_COMMAND + plen) return 0;
    o[0] = AEV_PROTO_MAJOR; o[1] = seq; o[2] = target; o[3] = opcode; o[4] = (uint8_t)plen;
    cpy(o + 5, payload, plen);
    return AEV_HDR_COMMAND + plen;
}
size_t aev_rsp_frame_encode(uint8_t *o, size_t cap, uint8_t seq, uint8_t target, uint8_t opcode,
                            uint8_t status, const uint8_t *payload, size_t plen)
{
    if (plen > 255 || cap < AEV_HDR_RESPONSE + plen) return 0;
    o[0] = AEV_PROTO_MAJOR; o[1] = seq; o[2] = target; o[3] = opcode; o[4] = status; o[5] = (uint8_t)plen;
    cpy(o + 6, payload, plen);
    return AEV_HDR_RESPONSE + plen;
}
size_t aev_evt_frame_encode(uint8_t *o, size_t cap, uint16_t ev_seq, uint8_t source, uint8_t code,
                            uint32_t time, const uint8_t *payload, size_t plen)
{
    if (plen > 255 || cap < AEV_HDR_EVENT + plen) return 0;
    o[0] = AEV_PROTO_MAJOR; aev_put_u16(o + 1, ev_seq); o[3] = source; o[4] = code;
    aev_put_u32(o + 5, time); o[9] = (uint8_t)plen;
    cpy(o + 10, payload, plen);
    return AEV_HDR_EVENT + plen;
}

/* ---- structs ------------------------------------------------------------ */
size_t aev_status_encode(uint8_t *o, size_t cap, const aev_status_t *s)
{
    if (cap < AEV_SZ_STATUS) return 0;
    o[0] = s->ver; o[1] = s->device_type; o[2] = s->activity_state; o[3] = s->power_state;
    o[4] = s->battery_pct; aev_put_u16(o + 5, s->flags); o[7] = s->magclip_batt_pct;
    o[8] = s->tether_radius_dm; o[9] = s->tether_level; aev_put_u16(o + 10, s->queued_events);
    aev_put_u32(o + 12, s->walk_id);
    return AEV_SZ_STATUS;
}
int aev_status_decode(const uint8_t *b, size_t n, aev_status_t *s)
{
    if (n < AEV_SZ_STATUS) return -1;
    s->ver = b[0]; s->device_type = b[1]; s->activity_state = b[2]; s->power_state = b[3];
    s->battery_pct = b[4]; s->flags = aev_get_u16(b + 5); s->magclip_batt_pct = b[7];
    s->tether_radius_dm = b[8]; s->tether_level = b[9]; s->queued_events = aev_get_u16(b + 10);
    s->walk_id = aev_get_u32(b + 12);
    return 0;
}

size_t aev_magclip_status_encode(uint8_t *o, size_t cap, const aev_magclip_status_t *s)
{
    if (cap < AEV_SZ_MAGCLIP_STATUS) return 0;
    o[0] = s->ver; o[1] = s->device_type; o[2] = s->battery_pct; o[3] = s->latched;
    o[4] = s->location; o[5] = s->charge_state; aev_put_u16(o + 6, s->last_seen_s);
    return AEV_SZ_MAGCLIP_STATUS;
}
int aev_magclip_status_decode(const uint8_t *b, size_t n, aev_magclip_status_t *s)
{
    if (n < AEV_SZ_MAGCLIP_STATUS) return -1;
    s->ver = b[0]; s->device_type = b[1]; s->battery_pct = b[2]; s->latched = b[3];
    s->location = b[4]; s->charge_state = b[5]; s->last_seen_s = aev_get_u16(b + 6);
    return 0;
}

size_t aev_range_encode(uint8_t *o, size_t cap, const aev_range_t *s)
{
    if (cap < AEV_SZ_RANGE) return 0;
    o[0] = s->ver; o[1] = s->seq; aev_put_u16(o + 2, s->distance_cm); o[4] = s->dist_err_cm;
    o[5] = (uint8_t)s->link_rssi_dbm; o[6] = (uint8_t)s->phone_rssi_dbm;
    aev_put_u16(o + 7, s->line_out_mm); o[9] = s->tether_level; o[10] = s->flags;
    return AEV_SZ_RANGE;
}
int aev_range_decode(const uint8_t *b, size_t n, aev_range_t *s)
{
    if (n < AEV_SZ_RANGE) return -1;
    s->ver = b[0]; s->seq = b[1]; s->distance_cm = aev_get_u16(b + 2); s->dist_err_cm = b[4];
    s->link_rssi_dbm = (int8_t)b[5]; s->phone_rssi_dbm = (int8_t)b[6];
    s->line_out_mm = aev_get_u16(b + 7); s->tether_level = b[9]; s->flags = b[10];
    return 0;
}

size_t aev_identity_encode(uint8_t *o, size_t cap, const aev_identity_t *s)
{
    if (cap < AEV_SZ_IDENTITY) return 0;
    o[0] = s->ver; o[1] = s->device_type; o[2] = s->proto_major; o[3] = s->proto_minor;
    aev_put_u64(o + 4, s->device_id); aev_put_u32(o + 12, s->pairing_nonce); o[16] = s->flags;
    return AEV_SZ_IDENTITY;
}
int aev_identity_decode(const uint8_t *b, size_t n, aev_identity_t *s)
{
    if (n < AEV_SZ_IDENTITY) return -1;
    s->ver = b[0]; s->device_type = b[1]; s->proto_major = b[2]; s->proto_minor = b[3];
    s->device_id = aev_get_u64(b + 4); s->pairing_nonce = aev_get_u32(b + 12); s->flags = b[16];
    return 0;
}

size_t aev_info_encode(uint8_t *o, size_t cap, const aev_info_t *s)
{
    if (cap < AEV_SZ_INFO) return 0;
    o[0] = s->proto_major; o[1] = s->proto_minor; o[2] = s->device_type; o[3] = s->hw_rev;
    o[4] = s->fw_major; o[5] = s->fw_minor; o[6] = s->fw_patch; aev_put_u16(o + 7, s->fw_build);
    aev_put_u32(o + 9, s->capabilities); o[13] = s->max_payload;
    return AEV_SZ_INFO;
}
int aev_info_decode(const uint8_t *b, size_t n, aev_info_t *s)
{
    if (n < AEV_SZ_INFO) return -1;
    s->proto_major = b[0]; s->proto_minor = b[1]; s->device_type = b[2]; s->hw_rev = b[3];
    s->fw_major = b[4]; s->fw_minor = b[5]; s->fw_patch = b[6]; s->fw_build = aev_get_u16(b + 7);
    s->capabilities = aev_get_u32(b + 9); s->max_payload = b[13];
    return 0;
}

size_t aev_owner_token_encode(uint8_t *o, size_t cap, const aev_owner_token_t *s)
{
    if (cap < AEV_SZ_OWNER_TOKEN) return 0;
    o[0] = s->token_ver; o[1] = s->purpose; aev_put_u64(o + 2, s->device_id);
    memcpy(o + 10, s->owner_id, 16); aev_put_u32(o + 26, s->issued); aev_put_u32(o + 30, s->expires);
    memcpy(o + 34, s->signature, 64);
    return AEV_SZ_OWNER_TOKEN;
}
int aev_owner_token_decode(const uint8_t *b, size_t n, aev_owner_token_t *s)
{
    if (n < AEV_SZ_OWNER_TOKEN) return -1;
    s->token_ver = b[0]; s->purpose = b[1]; s->device_id = aev_get_u64(b + 2);
    memcpy(s->owner_id, b + 10, 16); s->issued = aev_get_u32(b + 26); s->expires = aev_get_u32(b + 30);
    memcpy(s->signature, b + 34, 64);
    return 0;
}

size_t aev_adv_mfg_encode(uint8_t *o, size_t cap, uint8_t device_type, uint8_t activity, uint8_t adv_flags)
{
    if (cap < 6) return 0;
    aev_put_u16(o, 0xFFFF); o[2] = 1; o[3] = device_type; o[4] = activity; o[5] = adv_flags;
    return 6;
}

/* ---- command payloads ---------------------------------------------------- */
aev_op_info_t aev_op_info(uint8_t op)
{
    aev_op_info_t i = {0};
    i.known = true; i.torus = true; i.link = true;
    switch (op) {
    case AEV_OP_GET_INFO: case AEV_OP_GET_STATUS: i.magclip_target = true; break;
    case AEV_OP_SELF_TEST: i.magclip_target = true; i.owner_required = true; break;
    case AEV_OP_SET_TIME: case AEV_OP_GET_EVENTS: case AEV_OP_ACK_EVENTS:
    case AEV_OP_GET_CERT: case AEV_OP_AUTH_CHALLENGE: case AEV_OP_OWNER_BIND: case AEV_OP_OWNER_UNBIND: break;
    case AEV_OP_FACTORY_RESET: case AEV_OP_START_WALK: case AEV_OP_STOP_WALK: case AEV_OP_SET_TETHER:
    case AEV_OP_BUZZ: case AEV_OP_BIND_PEER: case AEV_OP_UNBIND_PEER: i.owner_required = true; break;
    case AEV_OP_SET_HALO: i.owner_required = true; i.link = false; break;
    case AEV_OP_RECALL_ASSIST: case AEV_OP_LOCATE_NOW: case AEV_OP_LOST_MODE:
        i.owner_required = true; i.torus = false; i.cloud_ok = true; break;
    case AEV_OP_SET_HOME_WIFI: i.owner_required = true; i.torus = false; break;
    default: memset(&i, 0, sizeof i); break;
    }
    return i;
}

#define NEED(n) do { if (len < (size_t)(n)) return AEV_ERR_INVALID_LENGTH; } while (0)
#define RANGE(cond) do { if (!(cond)) return AEV_ERR_OUT_OF_RANGE; } while (0)

uint8_t aev_cmd_decode(uint8_t op, const uint8_t *p, size_t len, aev_cmd_t *c)
{
    memset(c, 0, sizeof *c);
    c->opcode = op;
    switch (op) {
    case AEV_OP_GET_INFO: case AEV_OP_GET_STATUS: return AEV_ERR_OK;
    case AEV_OP_SET_TIME:
        NEED(AEV_REQ_SET_TIME);
        c->u.set_time.unix_time = aev_get_u32(p); c->u.set_time.tz_offset_min = (int16_t)aev_get_u16(p + 4);
        return AEV_ERR_OK;
    case AEV_OP_GET_EVENTS:
        NEED(AEV_REQ_GET_EVENTS);
        c->u.get_events.from_ev_seq = aev_get_u16(p); c->u.get_events.max_count = p[2];
        RANGE(p[2] >= 1 && p[2] <= 64);
        return AEV_ERR_OK;
    case AEV_OP_ACK_EVENTS:
        NEED(AEV_REQ_ACK_EVENTS); c->u.ack_events.up_to_ev_seq = aev_get_u16(p); return AEV_ERR_OK;
    case AEV_OP_SELF_TEST:
        NEED(AEV_REQ_SELF_TEST); c->u.self_test.tests = aev_get_u16(p); return AEV_ERR_OK;
    case AEV_OP_FACTORY_RESET:
        NEED(AEV_REQ_FACTORY_RESET); c->u.factory_reset.magic = aev_get_u32(p);
        RANGE(c->u.factory_reset.magic == 0x54455352u);
        return AEV_ERR_OK;
    case AEV_OP_START_WALK:
        NEED(AEV_REQ_START_WALK);
        c->u.start_walk.walk_id = aev_get_u32(p); c->u.start_walk.tether_mode = p[4];
        c->u.start_walk.tether_radius_dm = p[5];
        RANGE(c->u.start_walk.walk_id != 0 && p[4] <= AEV_TETHER_MODE_AUTO_ON_UNCLIP && p[5] >= 30 && p[5] <= 100);
        return AEV_ERR_OK;
    case AEV_OP_STOP_WALK:
        NEED(AEV_REQ_STOP_WALK); c->u.stop_walk.walk_id = aev_get_u32(p); return AEV_ERR_OK;
    case AEV_OP_SET_TETHER:
        NEED(AEV_REQ_SET_TETHER);
        c->u.set_tether.radius_dm = p[0]; c->u.set_tether.amber_pct = p[1]; c->u.set_tether.mode = p[2];
        RANGE(p[0] >= 30 && p[0] <= 100 && p[1] >= 50 && p[1] <= 95 && p[2] <= AEV_TETHER_MODE_AUTO_ON_UNCLIP);
        return AEV_ERR_OK;
    case AEV_OP_SET_HALO:
        NEED(AEV_REQ_SET_HALO);
        c->u.set_halo.pattern = p[0]; c->u.set_halo.r = p[1]; c->u.set_halo.g = p[2]; c->u.set_halo.b = p[3];
        c->u.set_halo.brightness = p[4]; c->u.set_halo.period_ms = aev_get_u16(p + 5);
        c->u.set_halo.duration_s = aev_get_u16(p + 7);
        RANGE(p[0] <= AEV_HALO_PATTERN_AUTO_STATE && p[4] <= 100 &&
              c->u.set_halo.period_ms >= 100 && c->u.set_halo.period_ms <= 5000);
        return AEV_ERR_OK;
    case AEV_OP_BUZZ:
        NEED(AEV_REQ_BUZZ);
        c->u.buzz.actuator = p[0]; c->u.buzz.pattern = p[1]; c->u.buzz.repeat = p[2]; c->u.buzz.intensity = p[3];
        RANGE((p[0] & 3) != 0 && (p[0] & ~3) == 0 && p[1] >= 1 && p[1] <= 16 && p[2] >= 1 && p[2] <= 10 && p[3] <= 100);
        return AEV_ERR_OK;
    case AEV_OP_RECALL_ASSIST:
        NEED(AEV_REQ_RECALL_ASSIST);
        c->u.recall.action = p[0]; c->u.recall.recall_id = aev_get_u16(p + 1); c->u.recall.cue = p[3];
        c->u.recall.pattern = p[4]; c->u.recall.timeout_s = p[5];
        RANGE(p[0] <= 1);
        if (p[0] == 1) RANGE((p[3] & 3) != 0 && (p[3] & ~3) == 0 && p[4] >= 1 && p[4] <= 16 && p[5] >= 1 && p[5] <= 120);
        return AEV_ERR_OK;
    case AEV_OP_LOCATE_NOW:
        NEED(AEV_REQ_LOCATE_NOW);
        c->u.locate.request_id = aev_get_u16(p); c->u.locate.flags = p[2]; c->u.locate.timeout_s = p[3];
        RANGE((p[2] & ~7) == 0 && p[3] >= 10 && p[3] <= 180);
        return AEV_ERR_OK;
    case AEV_OP_LOST_MODE:
        NEED(AEV_REQ_LOST_MODE);
        c->u.lost.action = p[0]; c->u.lost.lost_id = aev_get_u32(p + 1); c->u.lost.interval_s = aev_get_u16(p + 5);
        RANGE(p[0] <= 1);
        if (p[0] == 1) RANGE(c->u.lost.lost_id != 0 && c->u.lost.interval_s >= 15 && c->u.lost.interval_s <= 600);
        return AEV_ERR_OK;
    case AEV_OP_SET_HOME_WIFI:
        NEED(2);
        c->u.home_wifi.slot = p[0]; c->u.home_wifi.ssid_len = p[1];
        RANGE(p[0] <= 3 && p[1] <= AEV_MAX_SSID);
        NEED(2u + p[1]);
        memcpy(c->u.home_wifi.ssid, p + 2, p[1]);
        return AEV_ERR_OK;
    case AEV_OP_BIND_PEER:
        NEED(AEV_REQ_BIND_PEER);
        c->u.bind_peer.peer_type = p[0]; c->u.bind_peer.peer_id = aev_get_u64(p + 1);
        memcpy(c->u.bind_peer.peer_pubkey, p + 9, 64);
        RANGE(p[0] == AEV_DEVICE_TYPE_TORUS || p[0] == AEV_DEVICE_TYPE_LINK);
        return AEV_ERR_OK;
    case AEV_OP_UNBIND_PEER:
        NEED(AEV_REQ_UNBIND_PEER); c->u.unbind_peer.peer_id = aev_get_u64(p); return AEV_ERR_OK;
    case AEV_OP_GET_CERT:
        NEED(AEV_REQ_GET_CERT); c->u.get_cert.offset = aev_get_u16(p); c->u.get_cert.max_len = p[2];
        RANGE(p[2] >= 1 && p[2] <= 238);
        return AEV_ERR_OK;
    case AEV_OP_AUTH_CHALLENGE:
        NEED(AEV_REQ_AUTH_CHALLENGE); memcpy(c->u.auth.app_nonce, p, 16); return AEV_ERR_OK;
    case AEV_OP_OWNER_BIND: case AEV_OP_OWNER_UNBIND:
        NEED(AEV_REQ_OWNER_BIND); memcpy(c->u.owner.token, p, 98); return AEV_ERR_OK;
    default: return AEV_ERR_UNKNOWN_OPCODE;
    }
}

size_t aev_cmd_encode(const aev_cmd_t *c, uint8_t *o, size_t cap)
{
    uint8_t t[128]; size_t n = 0;
    memset(t, 0, sizeof t);
    switch (c->opcode) {
    case AEV_OP_GET_INFO: case AEV_OP_GET_STATUS: break;
    case AEV_OP_SET_TIME: aev_put_u32(t, c->u.set_time.unix_time); aev_put_u16(t + 4, (uint16_t)c->u.set_time.tz_offset_min); n = 6; break;
    case AEV_OP_GET_EVENTS: aev_put_u16(t, c->u.get_events.from_ev_seq); t[2] = c->u.get_events.max_count; n = 3; break;
    case AEV_OP_ACK_EVENTS: aev_put_u16(t, c->u.ack_events.up_to_ev_seq); n = 2; break;
    case AEV_OP_SELF_TEST: aev_put_u16(t, c->u.self_test.tests); n = 2; break;
    case AEV_OP_FACTORY_RESET: aev_put_u32(t, c->u.factory_reset.magic); n = 4; break;
    case AEV_OP_START_WALK: aev_put_u32(t, c->u.start_walk.walk_id); t[4] = c->u.start_walk.tether_mode; t[5] = c->u.start_walk.tether_radius_dm; n = 6; break;
    case AEV_OP_STOP_WALK: aev_put_u32(t, c->u.stop_walk.walk_id); n = 4; break;
    case AEV_OP_SET_TETHER: t[0] = c->u.set_tether.radius_dm; t[1] = c->u.set_tether.amber_pct; t[2] = c->u.set_tether.mode; n = 3; break;
    case AEV_OP_SET_HALO:
        t[0] = c->u.set_halo.pattern; t[1] = c->u.set_halo.r; t[2] = c->u.set_halo.g; t[3] = c->u.set_halo.b;
        t[4] = c->u.set_halo.brightness; aev_put_u16(t + 5, c->u.set_halo.period_ms);
        aev_put_u16(t + 7, c->u.set_halo.duration_s); n = 9; break;
    case AEV_OP_BUZZ: t[0] = c->u.buzz.actuator; t[1] = c->u.buzz.pattern; t[2] = c->u.buzz.repeat; t[3] = c->u.buzz.intensity; n = 4; break;
    case AEV_OP_RECALL_ASSIST:
        t[0] = c->u.recall.action; aev_put_u16(t + 1, c->u.recall.recall_id); t[3] = c->u.recall.cue;
        t[4] = c->u.recall.pattern; t[5] = c->u.recall.timeout_s; n = 6; break;
    case AEV_OP_LOCATE_NOW: aev_put_u16(t, c->u.locate.request_id); t[2] = c->u.locate.flags; t[3] = c->u.locate.timeout_s; n = 4; break;
    case AEV_OP_LOST_MODE: t[0] = c->u.lost.action; aev_put_u32(t + 1, c->u.lost.lost_id); aev_put_u16(t + 5, c->u.lost.interval_s); n = 7; break;
    case AEV_OP_SET_HOME_WIFI:
        if (c->u.home_wifi.ssid_len > AEV_MAX_SSID) return 0;
        t[0] = c->u.home_wifi.slot; t[1] = c->u.home_wifi.ssid_len;
        memcpy(t + 2, c->u.home_wifi.ssid, c->u.home_wifi.ssid_len); n = 2u + c->u.home_wifi.ssid_len; break;
    case AEV_OP_BIND_PEER:
        t[0] = c->u.bind_peer.peer_type; aev_put_u64(t + 1, c->u.bind_peer.peer_id);
        memcpy(t + 9, c->u.bind_peer.peer_pubkey, 64); n = 73; break;
    case AEV_OP_UNBIND_PEER: aev_put_u64(t, c->u.unbind_peer.peer_id); n = 8; break;
    case AEV_OP_GET_CERT: aev_put_u16(t, c->u.get_cert.offset); t[2] = c->u.get_cert.max_len; n = 3; break;
    case AEV_OP_AUTH_CHALLENGE: memcpy(t, c->u.auth.app_nonce, 16); n = 16; break;
    case AEV_OP_OWNER_BIND: case AEV_OP_OWNER_UNBIND: memcpy(t, c->u.owner.token, 98); n = 98; break;
    default: return 0;
    }
    if (cap < n) return 0;
    cpy(o, t, n);
    return n;
}

/* ---- response payloads ---------------------------------------------------- */
size_t aev_walk_summary_encode(uint8_t *o, size_t cap, const aev_walk_summary_t *s)
{
    if (cap < 8) return 0;
    aev_put_u32(o, s->duration_s); o[4] = s->bolt_count; aev_put_u16(o + 5, s->max_force_n); o[7] = s->tether_red_count;
    return 8;
}
int aev_walk_summary_decode(const uint8_t *b, size_t n, aev_walk_summary_t *s)
{
    if (n < 8) return -1;
    s->duration_s = aev_get_u32(b); s->bolt_count = b[4]; s->max_force_n = aev_get_u16(b + 5); s->tether_red_count = b[7];
    return 0;
}
size_t aev_get_events_rsp_encode(uint8_t *o, size_t cap, uint16_t available, uint16_t first)
{
    if (cap < 4) return 0;
    aev_put_u16(o, available); aev_put_u16(o + 2, first);
    return 4;
}

/* ---- events ------------------------------------------------------------------ */
size_t aev_evt_payload_encode(const aev_evt_t *e, uint8_t *o, size_t cap)
{
    size_t n;
    switch (e->code) {
    case AEV_EVT_BATTERY: n = AEV_EVSZ_BATTERY; if (cap < n) return 0;
        o[0] = e->u.battery.pct; aev_put_u16(o + 1, e->u.battery.mv); o[3] = e->u.battery.charge_state;
        o[4] = e->u.battery.charge_source; o[5] = (uint8_t)e->u.battery.temp_c; return n;
    case AEV_EVT_STATE_CHANGED: n = AEV_EVSZ_STATE_CHANGED; if (cap < n) return 0;
        o[0] = e->u.state.old_activity; o[1] = e->u.state.new_activity; o[2] = e->u.state.power_state; o[3] = e->u.state.reason; return n;
    case AEV_EVT_MAGCLIP_LATCH: n = AEV_EVSZ_MAGCLIP_LATCH; if (cap < n) return 0;
        o[0] = e->u.latch.latched; o[1] = e->u.latch.sensed_by; o[2] = e->u.latch.magclip_batt_pct; return n;
    case AEV_EVT_BOLT: n = AEV_EVSZ_BOLT; if (cap < n) return 0;
        aev_put_u32(o, e->u.bolt.walk_id); aev_put_u16(o + 4, e->u.bolt.peak_force_n); aev_put_u16(o + 6, e->u.bolt.slip_mm);
        aev_put_u16(o + 8, e->u.bolt.duration_ms); aev_put_u16(o + 10, e->u.bolt.line_out_mm); o[12] = e->u.bolt.flags; return n;
    case AEV_EVT_TETHER: n = AEV_EVSZ_TETHER; if (cap < n) return 0;
        o[0] = e->u.tether.level; aev_put_u16(o + 1, e->u.tether.distance_cm); o[3] = e->u.tether.radius_dm;
        aev_put_u32(o + 4, e->u.tether.walk_id); return n;
    case AEV_EVT_LOCATION: n = AEV_EVSZ_LOCATION; if (cap < n) return 0;
        aev_put_u16(o, e->u.location.request_id); aev_put_u32(o + 2, (uint32_t)e->u.location.lat_e7);
        aev_put_u32(o + 6, (uint32_t)e->u.location.lon_e7); aev_put_u16(o + 10, e->u.location.acc_m);
        aev_put_u16(o + 12, e->u.location.fix_age_s); o[14] = e->u.location.source; o[15] = e->u.location.sats; return n;
    case AEV_EVT_RECALL_STATUS: n = AEV_EVSZ_RECALL_STATUS; if (cap < n) return 0;
        aev_put_u16(o, e->u.recall.recall_id); o[2] = e->u.recall.status; o[3] = e->u.recall.path; return n;
    case AEV_EVT_LOST_MODE_STATUS: n = AEV_EVSZ_LOST_MODE_STATUS; if (cap < n) return 0;
        o[0] = e->u.lost.active; aev_put_u32(o + 1, e->u.lost.lost_id); aev_put_u16(o + 5, e->u.lost.interval_s);
        o[7] = e->u.lost.path; return n;
    case AEV_EVT_SELF_TEST_RESULT: n = AEV_EVSZ_SELF_TEST_RESULT; if (cap < n) return 0;
        aev_put_u16(o, e->u.self_test.tests_run); aev_put_u16(o + 2, e->u.self_test.tests_failed); o[4] = e->u.self_test.detail; return n;
    case AEV_EVT_FAULT: n = AEV_EVSZ_FAULT; if (cap < n) return 0;
        o[0] = e->u.fault.error_code; o[1] = e->u.fault.module; aev_put_u16(o + 2, e->u.fault.detail); return n;
    case AEV_EVT_QUEUE_OVERFLOW: n = AEV_EVSZ_QUEUE_OVERFLOW; if (cap < n) return 0;
        aev_put_u16(o, e->u.overflow.dropped); aev_put_u16(o + 2, e->u.overflow.oldest_ev_seq); return n;
    default: return 0;
    }
}

int aev_evt_payload_decode(uint8_t code, const uint8_t *b, size_t n, aev_evt_t *e)
{
    memset(e, 0, sizeof *e);
    e->code = code;
#define CHK(sz) do { if (n < (size_t)(sz)) return -1; } while (0)
    switch (code) {
    case AEV_EVT_BATTERY: CHK(AEV_EVSZ_BATTERY);
        e->u.battery.pct = b[0]; e->u.battery.mv = aev_get_u16(b + 1); e->u.battery.charge_state = b[3];
        e->u.battery.charge_source = b[4]; e->u.battery.temp_c = (int8_t)b[5]; return 0;
    case AEV_EVT_STATE_CHANGED: CHK(AEV_EVSZ_STATE_CHANGED);
        e->u.state.old_activity = b[0]; e->u.state.new_activity = b[1]; e->u.state.power_state = b[2]; e->u.state.reason = b[3]; return 0;
    case AEV_EVT_MAGCLIP_LATCH: CHK(AEV_EVSZ_MAGCLIP_LATCH);
        e->u.latch.latched = b[0]; e->u.latch.sensed_by = b[1]; e->u.latch.magclip_batt_pct = b[2]; return 0;
    case AEV_EVT_BOLT: CHK(AEV_EVSZ_BOLT);
        e->u.bolt.walk_id = aev_get_u32(b); e->u.bolt.peak_force_n = aev_get_u16(b + 4); e->u.bolt.slip_mm = aev_get_u16(b + 6);
        e->u.bolt.duration_ms = aev_get_u16(b + 8); e->u.bolt.line_out_mm = aev_get_u16(b + 10); e->u.bolt.flags = b[12]; return 0;
    case AEV_EVT_TETHER: CHK(AEV_EVSZ_TETHER);
        e->u.tether.level = b[0]; e->u.tether.distance_cm = aev_get_u16(b + 1); e->u.tether.radius_dm = b[3];
        e->u.tether.walk_id = aev_get_u32(b + 4); return 0;
    case AEV_EVT_LOCATION: CHK(AEV_EVSZ_LOCATION);
        e->u.location.request_id = aev_get_u16(b); e->u.location.lat_e7 = (int32_t)aev_get_u32(b + 2);
        e->u.location.lon_e7 = (int32_t)aev_get_u32(b + 6); e->u.location.acc_m = aev_get_u16(b + 10);
        e->u.location.fix_age_s = aev_get_u16(b + 12); e->u.location.source = b[14]; e->u.location.sats = b[15]; return 0;
    case AEV_EVT_RECALL_STATUS: CHK(AEV_EVSZ_RECALL_STATUS);
        e->u.recall.recall_id = aev_get_u16(b); e->u.recall.status = b[2]; e->u.recall.path = b[3]; return 0;
    case AEV_EVT_LOST_MODE_STATUS: CHK(AEV_EVSZ_LOST_MODE_STATUS);
        e->u.lost.active = b[0]; e->u.lost.lost_id = aev_get_u32(b + 1); e->u.lost.interval_s = aev_get_u16(b + 5);
        e->u.lost.path = b[7]; return 0;
    case AEV_EVT_SELF_TEST_RESULT: CHK(AEV_EVSZ_SELF_TEST_RESULT);
        e->u.self_test.tests_run = aev_get_u16(b); e->u.self_test.tests_failed = aev_get_u16(b + 2); e->u.self_test.detail = b[4]; return 0;
    case AEV_EVT_FAULT: CHK(AEV_EVSZ_FAULT);
        e->u.fault.error_code = b[0]; e->u.fault.module = b[1]; e->u.fault.detail = aev_get_u16(b + 2); return 0;
    case AEV_EVT_QUEUE_OVERFLOW: CHK(AEV_EVSZ_QUEUE_OVERFLOW);
        e->u.overflow.dropped = aev_get_u16(b); e->u.overflow.oldest_ev_seq = aev_get_u16(b + 2); return 0;
    default: return -2;
    }
#undef CHK
}

/* ---- DFU --------------------------------------------------------------------- */
uint8_t aev_dfu_req_decode(const uint8_t *b, size_t n, aev_dfu_req_t *r)
{
    memset(r, 0, sizeof *r);
    if (n < 1) return AEV_ERR_INVALID_LENGTH;
    r->op = b[0];
    switch (b[0]) {
    case AEV_DFU_START:
        if (n < 1 + 1 + 4 + 3 + 2 + 32) return AEV_ERR_INVALID_LENGTH;
        r->u.start.image_type = b[1]; r->u.start.image_size = aev_get_u32(b + 2);
        r->u.start.fw_major = b[6]; r->u.start.fw_minor = b[7]; r->u.start.fw_patch = b[8];
        r->u.start.fw_build = aev_get_u16(b + 9); memcpy(r->u.start.sha256, b + 11, 32);
        return AEV_ERR_OK;
    case AEV_DFU_GET_OFFSET: case AEV_DFU_VERIFY: case AEV_DFU_APPLY: case AEV_DFU_ABORT:
    case AEV_DFU_CONFIRM: case AEV_DFU_STATUS: return AEV_ERR_OK;
    default: return AEV_ERR_UNKNOWN_OPCODE;
    }
}
size_t aev_dfu_req_encode_start(uint8_t *o, size_t cap, const aev_dfu_req_t *r)
{
    if (cap < 43) return 0;
    o[0] = AEV_DFU_START; o[1] = r->u.start.image_type; aev_put_u32(o + 2, r->u.start.image_size);
    o[6] = r->u.start.fw_major; o[7] = r->u.start.fw_minor; o[8] = r->u.start.fw_patch;
    aev_put_u16(o + 9, r->u.start.fw_build); memcpy(o + 11, r->u.start.sha256, 32);
    return 43;
}
size_t aev_dfu_ind_encode(uint8_t *o, size_t cap, uint8_t op, uint8_t status, const uint8_t *payload, size_t plen)
{
    if (cap < 2 + plen) return 0;
    o[0] = op; o[1] = status; cpy(o + 2, payload, plen);
    return 2 + plen;
}
int aev_dfu_data_decode(const uint8_t *b, size_t n, uint32_t *offset, const uint8_t **data, size_t *dlen)
{
    if (n < 4) return -1;
    *offset = aev_get_u32(b); *data = b + 4; *dlen = n - 4;
    return 0;
}
size_t aev_dfu_data_encode(uint8_t *o, size_t cap, uint32_t offset, const uint8_t *data, size_t dlen)
{
    if (cap < 4 + dlen) return 0;
    aev_put_u32(o, offset); cpy(o + 4, data, dlen);
    return 4 + dlen;
}

bool aev_proto_selfcheck(void)
{
    /* hand-written packed layouts must equal protocol.json sizes */
    return AEV_SZ_STATUS == 16 && AEV_SZ_MAGCLIP_STATUS == 8 && AEV_SZ_RANGE == 11 && AEV_SZ_IDENTITY == 17 &&
           AEV_SZ_INFO == 14 && AEV_SZ_OWNER_TOKEN == 98 && AEV_HDR_COMMAND == 5 && AEV_HDR_RESPONSE == 6 &&
           AEV_HDR_EVENT == 10 && AEV_PROTO_MAJOR == 1;
}
