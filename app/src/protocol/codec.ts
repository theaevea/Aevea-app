// Generic, spec-driven codec. Every message is described in protocol.json; nothing here hard-codes a layout.
import { Bytes, concat, utf8Decode, utf8Encode } from '../util/bytes';
import {
  SPEC, FieldSpec, CommandSpec, ENUM, ENUM_NAME, PROTOCOL_MAJOR,
  commandsByName, commandsByOpcode, eventsByName, eventsByCode, dfuOpsByName, dfuOpsByCode,
} from './spec';

export type Value = number | bigint | Bytes;
export type Rec = Record<string, any>;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

const SENTINELS = new Set<number>([0xff, 0xffff, 127, 0xffffffff]);

function view(b: Bytes): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

// ---------------------------------------------------------------- fields

export function decodeFields(fields: FieldSpec[], buf: Bytes, start = 0): { values: Rec; next: number } {
  const dv = view(buf);
  const out: Rec = {};
  let o = start;
  for (const f of fields) {
    if (f.type === 'bytes') {
      let n: number;
      if (typeof f.size === 'number') n = f.size;
      else if (f.length_field) n = Number(out[f.length_field]);
      else n = buf.length - o;
      if (o + n > buf.length) throw new ProtocolError(`short buffer for ${f.name}`);
      out[f.name] = buf.slice(o, o + n);
      o += n;
      continue;
    }
    const size = f.size as number;
    if (o + size > buf.length) throw new ProtocolError(`short buffer for ${f.name}`);
    switch (f.type) {
      case 'u8': out[f.name] = dv.getUint8(o); break;
      case 'i8': out[f.name] = dv.getInt8(o); break;
      case 'u16': out[f.name] = dv.getUint16(o, true); break;
      case 'i16': out[f.name] = dv.getInt16(o, true); break;
      case 'u32': out[f.name] = dv.getUint32(o, true); break;
      case 'i32': out[f.name] = dv.getInt32(o, true); break;
      case 'u64': out[f.name] = dv.getBigUint64(o, true); break;
    }
    o += size;
  }
  return { values: out, next: o };
}

export function encodeFields(fields: FieldSpec[], values: Rec, opts: { sentinels?: boolean } = {}): Bytes {
  const sentinels = opts.sentinels === true;
  const parts: Bytes[] = [];
  const vals: Rec = { ...values };
  for (const f of fields) {
    if (f.type === 'bytes' && f.length_field && vals[f.length_field] === undefined) {
      const raw = vals[f.name];
      vals[f.length_field] = typeof raw === 'string' ? utf8Encode(raw).length : (raw as Bytes).length;
    }
  }
  for (const f of fields) {
    let v = vals[f.name];
    if (v === undefined) throw new ProtocolError(`missing field ${f.name}`);
    if (f.type === 'bytes') {
      if (typeof v === 'string') v = utf8Encode(v);
      const b = v as Bytes;
      if (typeof f.size === 'number' && b.length !== f.size) throw new ProtocolError(`${f.name} must be ${f.size} bytes`);
      if (f.max !== undefined && b.length > f.max) throw new ProtocolError(`${f.name} longer than ${f.max}`);
      parts.push(b);
      continue;
    }
    validateScalar(f, v, sentinels);
    const out = new Uint8Array(f.size as number);
    const dv = view(out);
    switch (f.type) {
      case 'u8': dv.setUint8(0, Number(v)); break;
      case 'i8': dv.setInt8(0, Number(v)); break;
      case 'u16': dv.setUint16(0, Number(v), true); break;
      case 'i16': dv.setInt16(0, Number(v), true); break;
      case 'u32': dv.setUint32(0, Number(v), true); break;
      case 'i32': dv.setInt32(0, Number(v), true); break;
      case 'u64': dv.setBigUint64(0, BigInt(v as any), true); break;
    }
    parts.push(out);
  }
  return concat(...parts);
}

function validateScalar(f: FieldSpec, v: Value, sentinels: boolean): void {
  if (typeof v === 'bigint') return;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ProtocolError(`${f.name} not a number`);
  if (f.range && !(n >= f.range[0] && n <= f.range[1]) && !(sentinels && SENTINELS.has(n))) {
    throw new ProtocolError(`${f.name}=${n} outside ${f.range[0]}..${f.range[1]}`);
  }
  if (f.enum && ENUM_NAME[f.enum] && ENUM_NAME[f.enum][n] === undefined) {
    throw new ProtocolError(`${f.name}=${n} is not a valid ${f.enum}`);
  }
}

/** Range check used by the simulated device to answer OUT_OF_RANGE. */
export function findOutOfRange(fields: FieldSpec[], values: Rec): string | undefined {
  for (const f of fields) {
    const v = values[f.name];
    if (f.range && typeof v === 'number' && !(v >= f.range[0] && v <= f.range[1])) return f.name;
  }
  return undefined;
}

// ---------------------------------------------------------------- structs

export function decodeStruct(name: string, buf: Bytes): Rec {
  const s = SPEC.structs[name];
  if (!s) throw new ProtocolError(`unknown struct ${name}`);
  return decodeFields(s.fields, buf).values; // trailing bytes ignored (spec section 1)
}
export function encodeStruct(name: string, values: Rec): Bytes {
  const s = SPEC.structs[name];
  if (!s) throw new ProtocolError(`unknown struct ${name}`);
  return encodeFields(s.fields, values, { sentinels: true });
}

// ---------------------------------------------------------------- command / response

export const TARGET = ENUM.target; // SELF, MAGCLIP
export const ERR = ENUM.error_code;
export const errorName = (code: number) => ENUM_NAME.error_code[code] ?? `UNKNOWN_0x${code.toString(16)}`;

export interface CommandFrame {
  ver: number; seq: number; target: number; opcode: number; name: string; len: number; args: Rec; raw: Bytes;
}
export interface ResponseFrame {
  ver: number; seq: number; target: number; opcode: number; name: string; status: number;
  statusName: string; len: number; payload: Rec | undefined; raw: Bytes;
}

export function requestSpec(name: string): CommandSpec {
  const c = commandsByName[name];
  if (!c) throw new ProtocolError(`unknown command ${name}`);
  return c;
}

export function encodeCommand(
  name: string, seq: number, args: Rec = {}, target = TARGET.SELF, ver = PROTOCOL_MAJOR,
): Bytes {
  const c = requestSpec(name);
  const payload = encodeFields(c.request, args);
  if (payload.length > 255) throw new ProtocolError('payload too long');
  return concat(Uint8Array.from([ver, seq & 255, target, parseInt(c.opcode, 16), payload.length]), payload);
}

/** Header-only parse, used by devices that must answer even for unknown opcodes. */
export function parseCommandHeader(buf: Bytes) {
  if (buf.length < 5) throw new ProtocolError('short command frame');
  return { ver: buf[0], seq: buf[1], target: buf[2], opcode: buf[3], len: buf[4] };
}

export function decodeCommand(buf: Bytes): CommandFrame {
  const h = parseCommandHeader(buf);
  const c = commandsByOpcode[h.opcode];
  if (!c) throw new ProtocolError(`unknown opcode 0x${h.opcode.toString(16)}`);
  if (buf.length - 5 < h.len) throw new ProtocolError('truncated command payload');
  const payload = buf.slice(5, 5 + h.len);
  const args = decodeFields(c.request, payload).values;
  return { ...h, name: c.name, args, raw: buf };
}

function responseFields(c: CommandSpec, target: number): FieldSpec[] {
  const r = c.response;
  if (r.length === 0) return [];
  if (typeof r[0] === 'string') {
    // e.g. ["struct:status", "struct:magclip_status (target=MagClip)"]
    const names = (r as string[]).map((s) => s.split(':')[1].split(' ')[0]);
    const pick = target === TARGET.MAGCLIP && names.length > 1 ? names[1] : names[0];
    return SPEC.structs[pick].fields;
  }
  return r as FieldSpec[];
}

export function encodeResponse(
  name: string, seq: number, target: number, status: number, payloadValues: Rec | Bytes = {}, ver = PROTOCOL_MAJOR,
): Bytes {
  const c = requestSpec(name);
  let payload: Bytes = new Uint8Array(0);
  if (status === ERR.OK) {
    payload = payloadValues instanceof Uint8Array ? payloadValues : encodeFields(responseFields(c, target), payloadValues, { sentinels: true });
  }
  return concat(Uint8Array.from([ver, seq & 255, target, parseInt(c.opcode, 16), status, payload.length]), payload);
}

export function decodeResponse(buf: Bytes): ResponseFrame {
  if (buf.length < 6) throw new ProtocolError('short response frame');
  const [ver, seq, target, opcode, status, len] = buf;
  const c = commandsByOpcode[opcode];
  const name = c ? c.name : `OP_0x${opcode.toString(16)}`;
  let payload: Rec | undefined;
  if (c && status === ERR.OK) {
    const body = buf.slice(6, 6 + len);
    const fields = responseFields(c, target);
    payload = fields.length ? decodeFields(fields, body).values : {};
  }
  return { ver, seq, target, opcode, name, status, statusName: errorName(status), len, payload, raw: buf };
}

// ---------------------------------------------------------------- events

export interface EventFrame {
  ver: number; evSeq: number; source: number; code: number; name: string; time: number; len: number;
  data: Rec; known: boolean; raw: Bytes;
}

export function decodeEvent(buf: Bytes): EventFrame {
  const hdr = SPEC.frames.event.header as FieldSpec[];
  if (buf.length < 10) throw new ProtocolError('short event frame');
  const { values: h } = decodeFields(hdr, buf);
  const spec = eventsByCode[h.code];
  const body = buf.slice(10, 10 + h.len);
  let data: Rec = {};
  let known = false;
  if (spec) {
    data = decodeFields(spec.fields, body).values; // trailing bytes ignored
    known = true;
  } else {
    data = { raw: body }; // unknown event codes are ignored by logic but kept for logs
  }
  return {
    ver: h.ver, evSeq: h.ev_seq, source: h.source, code: h.code, name: spec ? spec.name : 'UNKNOWN',
    time: h.time, len: h.len, data, known, raw: buf,
  };
}

export function encodeEvent(name: string, evSeq: number, source: number, time: number, data: Rec): Bytes {
  const spec = eventsByName[name];
  if (!spec) throw new ProtocolError(`unknown event ${name}`);
  const payload = encodeFields(spec.fields, data, { sentinels: true });
  const hdr = encodeFields(SPEC.frames.event.header as FieldSpec[], {
    ver: PROTOCOL_MAJOR, ev_seq: evSeq, source, code: parseInt(spec.code, 16), time, len: payload.length,
  });
  return concat(hdr, payload);
}

// ---------------------------------------------------------------- DFU

export interface DfuIndication { op: number; name: string; status: number; statusName: string; payload: Rec; raw: Bytes }

export function encodeDfuRequest(name: string, args: Rec = {}): Bytes {
  const o = dfuOpsByName[name];
  if (!o) throw new ProtocolError(`unknown dfu op ${name}`);
  return concat(Uint8Array.from([parseInt(o.op, 16)]), encodeFields(o.request, args));
}
export function decodeDfuRequest(buf: Bytes): { op: number; name: string; args: Rec } {
  const o = dfuOpsByCode[buf[0]];
  if (!o) throw new ProtocolError(`unknown dfu op 0x${buf[0]?.toString(16)}`);
  return { op: buf[0], name: o.name, args: decodeFields(o.request, buf, 1).values };
}
export function encodeDfuIndication(name: string, status: number, payload: Rec = {}): Bytes {
  const o = dfuOpsByName[name];
  const body = status === ERR.OK ? encodeFields(o.response, payload) : new Uint8Array(0);
  return concat(Uint8Array.from([parseInt(o.op, 16), status]), body);
}
export function decodeDfuIndication(buf: Bytes): DfuIndication {
  if (buf.length < 2) throw new ProtocolError('short dfu indication');
  const o = dfuOpsByCode[buf[0]];
  const status = buf[1];
  const payload = o && status === ERR.OK ? decodeFields(o.response, buf, 2).values : {};
  return { op: buf[0], name: o ? o.name : 'UNKNOWN', status, statusName: errorName(status), payload, raw: buf };
}
export function encodeDfuData(offset: number, data: Bytes): Bytes {
  return concat(encodeFields([{ name: 'offset', type: 'u32', size: 4 }], { offset }), data);
}
export function decodeDfuData(buf: Bytes): { offset: number; data: Bytes } {
  const { values, next } = decodeFields([{ name: 'offset', type: 'u32', size: 4 }], buf);
  return { offset: values.offset, data: buf.slice(next) };
}

// ---------------------------------------------------------------- advertising

export function decodeManufacturerData(buf: Bytes): Rec {
  return decodeFields(SPEC.advertising.manufacturer_data as FieldSpec[], buf).values;
}
export function encodeManufacturerData(v: Rec): Bytes {
  return encodeFields(SPEC.advertising.manufacturer_data as FieldSpec[], v);
}

export { utf8Decode };
