// Typed view over docs/protocol.json (copied to ./protocol.json; keep in sync with the docs).
import raw from './protocol.json';

export interface FieldSpec {
  name: string;
  type: 'u8' | 'u16' | 'u32' | 'u64' | 'i8' | 'i16' | 'i32' | 'bytes';
  size: number | 'var';
  enum?: string;
  bitfield?: string;
  range?: [number, number];
  length_field?: string;
  max?: number;
  unit?: string;
  desc?: string;
}
export interface StructSpec { fields: FieldSpec[]; size: number; example_hex: string }
export interface CommandSpec {
  opcode: string;
  name: string;
  devices: string[];
  magclip_target: boolean;
  owner_auth_required: boolean;
  request: FieldSpec[];
  request_size: number | 'var';
  response: Array<string | FieldSpec>;
  response_size: number | 'var';
  queue: { queueable: boolean; ttl_s?: number; persistent?: boolean; coalesce?: string };
  example: Record<string, string>;
}
export interface EventSpec {
  code: string; name: string; sources: string[]; fields: FieldSpec[]; size: number; example_hex: string;
}
export interface DfuOpSpec {
  op: string; name: string; request: FieldSpec[]; response: FieldSpec[]; example: Record<string, string>;
}
export interface ProtocolSpec {
  version: { major: number; minor: number };
  base_uuid: string;
  uuid_template: string;
  frames: Record<string, any>;
  structs: Record<string, StructSpec>;
  enums: Record<string, Record<string, string>>;
  bitfields: Record<string, Record<string, string>>;
  error_codes: Array<{ code: string; name: string; desc: string }>;
  commands: CommandSpec[];
  error_example: { desc: string; request_hex: string; response_hex: string };
  events: EventSpec[];
  dfu: any;
  state_machine: any;
  offline_queue: any;
  advertising: any;
  services: any[];
  connection: any;
}

export const SPEC = raw as unknown as ProtocolSpec;
export const PROTOCOL_MAJOR = SPEC.version.major;

/** Apps and simulators must refuse a different protocol major (spec section 13). */
export function assertSupportedMajor(major: number): void {
  if (major !== PROTOCOL_MAJOR) {
    throw new Error(`Unsupported protocol major ${major}, app speaks ${PROTOCOL_MAJOR}`);
  }
}

const h = (s: string) => parseInt(s, 16);

export const commandsByName: Record<string, CommandSpec> = {};
export const commandsByOpcode: Record<number, CommandSpec> = {};
for (const c of SPEC.commands) {
  commandsByName[c.name] = c;
  commandsByOpcode[h(c.opcode)] = c;
}
export const eventsByName: Record<string, EventSpec> = {};
export const eventsByCode: Record<number, EventSpec> = {};
for (const e of SPEC.events) {
  eventsByName[e.name] = e;
  eventsByCode[h(e.code)] = e;
}
export const dfuOpsByName: Record<string, DfuOpSpec> = {};
export const dfuOpsByCode: Record<number, DfuOpSpec> = {};
for (const o of SPEC.dfu.ops as DfuOpSpec[]) {
  dfuOpsByName[o.name] = o;
  dfuOpsByCode[h(o.op)] = o;
}

/** enumName -> {name -> number} */
export const ENUM: Record<string, Record<string, number>> = {};
export const ENUM_NAME: Record<string, Record<number, string>> = {};
for (const [en, vals] of Object.entries(SPEC.enums)) {
  ENUM[en] = {};
  ENUM_NAME[en] = {};
  for (const [k, v] of Object.entries(vals)) {
    const n = v.split(' ')[0];
    ENUM[en][n] = h(k);
    ENUM_NAME[en][h(k)] = n;
  }
}
// error_codes is a list rather than a map
ENUM.error_code = {};
ENUM_NAME.error_code = {};
for (const e of SPEC.error_codes) {
  ENUM.error_code[e.name] = h(e.code);
  ENUM_NAME.error_code[h(e.code)] = e.name;
}

export const BIT: Record<string, Record<string, number>> = {};
for (const [bn, vals] of Object.entries(SPEC.bitfields)) {
  BIT[bn] = {};
  for (const [k, v] of Object.entries(vals)) BIT[bn][v] = parseInt(k, 10);
}

export function bitsSet(bitfield: string, value: number): string[] {
  return Object.entries(BIT[bitfield]).filter(([, b]) => (value >>> b) & 1).map(([n]) => n);
}
export function bitMask(bitfield: string, names: string[]): number {
  return names.reduce((m, n) => m | (1 << BIT[bitfield][n]), 0);
}

export function uuid(short16: string): string {
  return SPEC.uuid_template.replace('{short16}', short16.replace(/^0x/i, '').toUpperCase());
}
