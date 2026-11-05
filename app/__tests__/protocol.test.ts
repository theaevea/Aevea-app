import { fromHex, toHex } from '../src/util/bytes';
import { sha256, hmacSha256 } from '../src/util/sha256';
import { crc32 } from '../src/util/crc32';
import { bytesToBase64, base64ToBytes } from '../src/util/base64';
import {
  SPEC, PROTOCOL_MAJOR, assertSupportedMajor, bitMask, bitsSet, uuid,
  decodeCommand, encodeCommand, decodeResponse, encodeResponse, decodeEvent, encodeEvent,
  decodeStruct, encodeStruct, decodeDfuIndication, encodeDfuIndication, decodeDfuRequest, encodeDfuRequest,
  decodeDfuData, encodeDfuData, decodeManufacturerData, encodeManufacturerData, derivePasskey, ERR, ProtocolError,
  encodeFields, decodeFields,
} from '../src/protocol';

const hex = (b: Uint8Array) => toHex(b);
const norm = (s: string) => toHex(fromHex(s));

describe('utilities', () => {
  it('sha256 / hmac known vectors', () => {
    expect(toHex(sha256(new Uint8Array(0)), '')).toBe('E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
    expect(toHex(sha256(new TextEncoder().encode('abc')), '')).toBe('BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
    const mac = hmacSha256(new TextEncoder().encode('key'), new TextEncoder().encode('The quick brown fox jumps over the lazy dog'));
    expect(toHex(mac, '')).toBe('F7BC83F430538424B13298E6AA6FB143EF4D59A14946175997479DBC2D1A3CD8');
  });
  it('crc32 ISO-HDLC check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('base64 roundtrip', () => {
    for (const n of [0, 1, 2, 3, 20, 101]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255);
      expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
    }
    expect(bytesToBase64(new TextEncoder().encode('Aevea'))).toBe('QWV2ZWE=');
  });
});

describe('spec', () => {
  it('is protocol major 1 and rejects other majors', () => {
    expect(PROTOCOL_MAJOR).toBe(1);
    expect(() => assertSupportedMajor(2)).toThrow();
  });
  it('builds UUIDs from the template', () => {
    expect(uuid('0x0101')).toBe('AE7E0101-7A1C-4E5A-9D2B-AE7EA0000000');
  });
  it('bitfield helpers', () => {
    expect(bitsSet('capabilities', 0x3f8b)).toContain('DFU');
    expect(bitMask('actuator', ['LRA', 'PIEZO'])).toBe(3);
  });
});

describe('every command example in protocol.json', () => {
  for (const c of SPEC.commands) {
    const ex = c.example;
    it(`${c.name} request decodes and re-encodes byte-exact`, () => {
      const bytes = fromHex(ex.request_hex);
      const f = decodeCommand(bytes);
      expect(f.name).toBe(c.name);
      expect(f.len).toBe(bytes.length - 5);
      expect(hex(encodeCommand(c.name, f.seq, f.args, f.target))).toBe(norm(ex.request_hex));
    });
    it(`${c.name} response decodes and re-encodes byte-exact`, () => {
      const bytes = fromHex(ex.response_hex);
      const r = decodeResponse(bytes);
      expect(r.name).toBe(c.name);
      expect(r.status).toBe(0);
      expect(hex(encodeResponse(c.name, r.seq, r.target, r.status, r.payload ?? {}))).toBe(norm(ex.response_hex));
    });
    if (ex.magclip_request_hex) {
      it(`${c.name} MagClip-targeted variants`, () => {
        const f = decodeCommand(fromHex(ex.magclip_request_hex));
        expect(f.target).toBe(3);
        const r = decodeResponse(fromHex(ex.magclip_response_hex));
        expect(r.payload?.latched).toBe(1);
        expect(r.payload?.battery_pct).toBe(0x40);
        expect(hex(encodeResponse(c.name, r.seq, r.target, 0, r.payload!))).toBe(norm(ex.magclip_response_hex));
      });
    }
  }
});

describe('selected command values', () => {
  it('GET_INFO payload', () => {
    const r = decodeResponse(fromHex(SPEC.commands[0].example.response_hex));
    expect(r.payload).toMatchObject({ proto_major: 1, device_type: 1, fw_major: 0, fw_minor: 3, fw_patch: 1, fw_build: 0x70, max_payload: 0xf4 });
  });
  it('GET_STATUS payload', () => {
    const r = decodeResponse(fromHex('01 03 00 03 00 10 01 01 02 00 48 63 00 FF 32 00 00 00 2A 00 00 00'));
    expect(r.payload).toMatchObject({ device_type: 1, activity_state: 2, battery_pct: 0x48, magclip_batt_pct: 0xff, tether_radius_dm: 50, walk_id: 42 });
  });
  it('SET_HOME_WIFI uses length_field for ssid', () => {
    const f = decodeCommand(fromHex('01 18 00 18 0A 00 08 41 65 76 65 61 48 6F 6D'));
    expect(new TextDecoder().decode(f.args.ssid)).toBe('AeveaHom');
    expect(hex(encodeCommand('SET_HOME_WIFI', 0x18, { slot: 0, ssid: 'AeveaHom' }))).toBe(norm('01 18 00 18 0A 00 08 41 65 76 65 61 48 6F 6D'));
  });
  it('GET_CERT chunk is the remainder of the frame', () => {
    const r = decodeResponse(fromHex(SPEC.commands.find((c) => c.name === 'GET_CERT')!.example.response_hex));
    expect(r.payload?.total_len).toBe(146);
    expect(r.payload?.chunk.length).toBe(16);
  });
  it('error example: SET_TETHER 12.0 m is OUT_OF_RANGE on the wire; the app refuses to encode it', () => {
    const e = SPEC.error_example;
    const r = decodeResponse(fromHex(e.response_hex));
    expect(r.status).toBe(ERR.OUT_OF_RANGE);
    expect(r.statusName).toBe('OUT_OF_RANGE');
    expect(r.payload).toBeUndefined();
    expect(() => encodeCommand('SET_TETHER', 0x31, { radius_dm: 120, amber_pct: 80, mode: 1 })).toThrow(ProtocolError);
    // the raw frame itself is still decodable (a device must be able to see and reject it)
    expect(decodeCommand(fromHex(e.request_hex)).args.radius_dm).toBe(120);
  });
  it('validates enums on encode', () => {
    expect(() => encodeCommand('SET_TETHER', 1, { radius_dm: 50, amber_pct: 80, mode: 9 })).toThrow();
  });
});

describe('structs, events, DFU, advertising', () => {
  for (const [name, s] of Object.entries(SPEC.structs)) {
    it(`struct ${name} example roundtrips`, () => {
      const bytes = fromHex(s.example_hex);
      const v = decodeStruct(name, bytes);
      expect(bytes.length).toBe(s.size);
      expect(hex(encodeStruct(name, v))).toBe(norm(s.example_hex));
    });
  }
  it('trailing bytes in structs are ignored', () => {
    const v = decodeStruct('range', fromHex('01 11 80 02 0A B9 C0 FF FF 00 01 DE AD'));
    expect(v.distance_cm).toBe(640);
  });
  for (const e of SPEC.events) {
    it(`event ${e.name} example roundtrips`, () => {
      const bytes = fromHex(e.example_hex);
      const f = decodeEvent(bytes);
      expect(f.known).toBe(true);
      expect(f.name).toBe(e.name);
      expect(f.len).toBe(e.size);
      expect(f.time).toBe(1793880000);
      expect(hex(encodeEvent(e.name, f.evSeq, f.source, f.time, f.data))).toBe(norm(e.example_hex));
    });
  }
  it('unknown event codes and trailing event bytes are tolerated', () => {
    const f = decodeEvent(fromHex('01 40 01 01 7F C0 6F EC 6A 02 AA BB'));
    expect(f.known).toBe(false);
    expect(f.name).toBe('UNKNOWN');
    const bat = decodeEvent(fromHex('01 30 01 01 01 C0 6F EC 6A 07 48 1E 0F 00 00 15 EE'));
    expect(bat.data.pct).toBe(0x48);
  });
  it('BOLT event values', () => {
    const f = decodeEvent(fromHex(SPEC.events.find((e) => e.name === 'BOLT')!.example_hex));
    expect(f.data).toMatchObject({ walk_id: 42, peak_force_n: 340, slip_mm: 180, duration_ms: 220, line_out_mm: 2650, flags: 5 });
  });
  it('LOCATION event values', () => {
    const f = decodeEvent(fromHex(SPEC.events.find((e) => e.name === 'LOCATION')!.example_hex));
    expect(f.data.lat_e7 / 1e7).toBeCloseTo(52, 0);
    expect(f.data.request_id).toBe(9);
  });
  for (const o of SPEC.dfu.ops) {
    it(`DFU ${o.name} request and indication examples`, () => {
      const req = fromHex(o.example.request_hex);
      const d = decodeDfuRequest(req);
      expect(d.name).toBe(o.name);
      expect(hex(encodeDfuRequest(o.name, d.args))).toBe(norm(o.example.request_hex));
      const ind = decodeDfuIndication(fromHex(o.example.indication_hex));
      expect(ind.name).toBe(o.name);
      expect(ind.status).toBe(0);
      expect(hex(encodeDfuIndication(o.name, 0, ind.payload))).toBe(norm(o.example.indication_hex));
    });
  }
  it('DFU_START and GET_OFFSET values; DFU_DATA example', () => {
    const start = decodeDfuRequest(fromHex(SPEC.dfu.ops[0].example.request_hex));
    expect(start.args).toMatchObject({ image_type: 0, image_size: 0x30000, fw_minor: 4, fw_build: 0x82 });
    expect(decodeDfuIndication(fromHex(SPEC.dfu.ops[0].example.indication_hex)).payload).toMatchObject({ resume_offset: 0, max_chunk: 240 });
    expect(decodeDfuIndication(fromHex('03 00 00 10 00 00 A3 1C 29 1C')).payload).toMatchObject({ offset: 4096, crc32: 0x1c291ca3 });
    const d = decodeDfuData(fromHex(SPEC.dfu.data_example_hex));
    expect(d.offset).toBe(0x1000);
    expect(d.data.length).toBe(16);
    expect(hex(encodeDfuData(d.offset, d.data))).toBe(norm(SPEC.dfu.data_example_hex));
  });
  it('DFU error indication carries no payload', () => {
    const i = decodeDfuIndication(fromHex('01 13'));
    expect(i.statusName).toBe('DFU_HASH_MISMATCH');
  });
  it('manufacturer data example', () => {
    const ex = 'FF FF 01 01 00 01';
    const v = decodeManufacturerData(fromHex(ex));
    expect(v).toMatchObject({ company_id: 0xffff, adv_ver: 1, device_type: 1, activity_state: 0, flags: 1 });
    expect(hex(encodeManufacturerData(v))).toBe(norm(ex));
  });
  it('frames with the wrong size throw', () => {
    expect(() => decodeResponse(fromHex('01 02'))).toThrow();
    expect(() => decodeFields(SPEC.structs.range.fields, fromHex('01 02'))).toThrow();
    expect(() => encodeFields(SPEC.structs.range.fields, {})).toThrow();
  });
});

describe('passkey derivation', () => {
  it('is deterministic, six digits, and changes with the nonce', () => {
    const k = new Uint8Array(32).fill(7);
    const a = derivePasskey(k, 0x00a3e701000001_23n, 1);
    expect(a).toMatch(/^\d{6}$/);
    expect(derivePasskey(k, 0x00a3e701000001_23n, 1)).toBe(a);
    expect(derivePasskey(k, 0x00a3e701000001_23n, 2)).not.toBe(a);
  });
});
