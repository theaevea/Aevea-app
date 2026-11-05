// In-memory simulated Torus / Link following docs/device-protocol.md. Not firmware; a test double.
import { Bytes, concat } from '../../util/bytes';
import { sha256 } from '../../util/sha256';
import { crc32 } from '../../util/crc32';
import {
  SPEC, PROTOCOL_MAJOR, ENUM, BIT, commandsByOpcode, parseCommandHeader, decodeFields, encodeFields, encodeStruct,
  encodeEvent, encodeDfuIndication, decodeDfuRequest, decodeDfuData, derivePasskey, findOutOfRange, decodeStruct,
  FieldSpec, Rec, ERR, TARGET, bitMask, dfuOpsByCode,
} from '../../protocol';

export type DeviceKind = 'torus' | 'link';
const TYPE = { torus: ENUM.device_type.TORUS, link: ENUM.device_type.LINK, magclip: ENUM.device_type.MAGCLIP };
const A = ENUM.activity_state;

export const MOCK_CA_KEY_ID = 0xae7e0001;
/** Stand-in for ECDSA: a deterministic hash both sides can compute. NOT cryptography. */
export function mockSign(...parts: Bytes[]): Bytes {
  const h = sha256(concat(...parts));
  return concat(h, h);
}

export interface MockDeviceOptions {
  kind: DeviceKind;
  deviceId: bigint;
  kPair: Uint8Array;
  battery?: number;
  fw?: { major: number; minor: number; patch: number; build: number };
  faults?: {
    /** attestation outcome for this device */
    attestation?: 'ok' | 'bad-cert' | 'bad-signature';
    /** DFU_START answers BUSY this many times first (flash erase) */
    dfuBusy?: number;
    /** self test bits that fail */
    selfTestFail?: number;
    /** OWNER_BIND answers STORAGE_FULL (4 bonds already) */
    storageFull?: boolean;
    /** MagClip not reachable through Torus */
    magclipUnreachable?: boolean;
    /** Never answers commands with this opcode (to test timeouts) */
    silentOpcode?: number;
    /** GNSS gives no fix on LOCATE_NOW */
    noFix?: boolean;
    /** Corrupt DFU image bytes on receive (hash mismatch) */
    dfuCorrupt?: boolean;
  };
}

export interface DeviceSink {
  response(b: Bytes): void;
  event(b: Bytes): void;
  status(b: Bytes): void;
  range(b: Bytes): void;
  dfu(b: Bytes): void;
  disconnect(reason: string): void;
}

const CAPS = {
  torus: ['HALO', 'LRA', 'UWB', 'LINE_SENSOR', 'BOLT_DETECT', 'MAGCLIP_PROXY', 'DFU', 'TETHER', 'CONTACT_CHARGING'],
  link: ['LRA', 'PIEZO', 'UWB', 'GNSS', 'LTE_M', 'WIFI_SCAN', 'CODED_PHY', 'DFU', 'TETHER', 'CONTACT_CHARGING'],
};
const ALLOWED_UNBOUND = new Set(['GET_INFO', 'SET_TIME', 'GET_STATUS', 'GET_EVENTS', 'ACK_EVENTS', 'GET_CERT', 'AUTH_CHALLENGE', 'OWNER_BIND']);

export interface MockPosition { lat: number; lon: number; accM: number }

export class MockDevice {
  readonly kind: DeviceKind;
  readonly deviceId: bigint;
  readonly bleId: string;
  readonly typeCode: number;
  sink?: DeviceSink;
  // identity / pairing
  nonce = 0x9c41d2e7;
  pairingWindowOpen = true;
  ownerBound = false;
  ownerId = new Uint8Array(16);
  bonds = 0;
  // runtime state
  activity: number = A.HOME;
  charging = false;
  battery: number;
  fw: { major: number; minor: number; patch: number; build: number };
  walkId = 0;
  tetherRadiusDm = 50;
  amberPct = 80;
  tetherMode = 1;
  tetherLevel = 0;
  magclip = { latched: false, battery: 64, location: 1, charge: 0, reachable: true };
  distanceCm = 0xffff;
  lineOutMm = 0xffff;
  peerId: bigint | undefined;
  peerKey?: Bytes;
  homeWifi: Array<string | undefined> = [undefined, undefined, undefined, undefined];
  lost = { active: false, lostId: 0, intervalS: 15 };
  walkStats = { startedAt: 0, bolts: 0, maxForce: 0, red: 0 };
  // logs for tests
  buzzLog: Rec[] = [];
  haloLog: Rec[] = [];
  recallLog: number[] = [];
  commandLog: string[] = [];
  // events
  private events: Array<{ seq: number; bytes: Bytes }> = [];
  private nextEv = 0x0130;
  private clockOffset: number | undefined;
  private respCache = new Map<number, Bytes>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private rangeTimer?: ReturnType<typeof setInterval>;
  private lostTimer?: ReturnType<typeof setInterval>;
  private seenRecall = new Set<number>();
  private dfu = {
    state: 0, imageType: 0, size: 0, fw: { major: 0, minor: 0, patch: 0, build: 0 }, sha: new Uint8Array(32),
    received: new Uint8Array(0), offset: 0, busyLeft: 0, pendingConfirm: false,
  };
  private position: () => MockPosition;
  private posCount = 0;
  onCloudPosition?: (p: MockPosition & { time: number }) => void;
  onRecallCue?: (id: number) => void;

  constructor(private opts: MockDeviceOptions, position?: () => MockPosition) {
    this.kind = opts.kind;
    this.deviceId = opts.deviceId;
    this.typeCode = TYPE[opts.kind];
    this.bleId = `mock-${opts.kind}-${(opts.deviceId & 0xffffn).toString(16)}`;
    this.battery = opts.battery ?? (opts.kind === 'torus' ? 72 : 88);
    this.fw = opts.fw ?? { major: 0, minor: 3, patch: 1, build: 0x70 };
    this.dfu.busyLeft = opts.faults?.dfuBusy ?? 0;
    this.position = position ?? (() => ({ lat: 51.5074, lon: -0.1278, accM: 8 }));
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timers.clear();
    this.intervals.clear();
    if (this.rangeTimer) clearInterval(this.rangeTimer);
    if (this.lostTimer) clearInterval(this.lostTimer);
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  // ------------------------------------------------------------ advertising / identity
  get faults() { return this.opts.faults ?? {}; }
  advManufacturerData(): Bytes {
    const flags = (this.pairingWindowOpen ? 1 : 0) | (this.ownerBound ? 2 : 0) | (this.battery <= 15 ? 4 : 0) | (this.lost.active ? 8 : 0) | (this.events.length ? 16 : 0);
    return encodeFields(SPEC.advertising.manufacturer_data as FieldSpec[], { company_id: 0xffff, adv_ver: 1, device_type: this.typeCode, activity_state: this.activity, flags });
  }
  identity(): Bytes {
    const open = this.pairingWindowOpen;
    return encodeStruct('identity', {
      ver: 1, device_type: this.typeCode, proto_major: PROTOCOL_MAJOR, proto_minor: SPEC.version.minor,
      device_id: open ? this.deviceId : 0n, pairing_nonce: this.nonce,
      flags: (open ? 1 : 0) | (this.ownerBound ? 2 : 0) | (this.ownerBound ? 0 : 4),
    });
  }
  expectedPasskey(): string { return derivePasskey(this.opts.kPair, this.deviceId, this.nonce); }
  /** Spec 5.2: nonce replaced after every attempt, success or failure. */
  rotateNonce() { this.nonce = (Math.imul(this.nonce, 1664525) + 1013904223) >>> 0; }
  addBond() { this.bonds++; }

  // ------------------------------------------------------------ clock / events
  private nowUnix(): number { return this.clockOffset === undefined ? 0 : Math.floor(Date.now() / 1000) + this.clockOffset; }
  emit(name: string, data: Rec, source = this.typeCode) {
    const seq = this.nextEv;
    this.nextEv = (this.nextEv + 1) & 0xffff;
    const bytes = encodeEvent(name, seq, source, this.nowUnix(), data);
    this.events.push({ seq, bytes });
    if (this.events.length > 256) {
      const dropped = this.events.length - 256;
      const oldest = this.events[dropped].seq;
      this.events.splice(0, dropped);
      const s2 = this.nextEv; this.nextEv = (this.nextEv + 1) & 0xffff;
      this.events.push({ seq: s2, bytes: encodeEvent('QUEUE_OVERFLOW', s2, this.typeCode, this.nowUnix(), { dropped, oldest_ev_seq: oldest }) });
    }
    this.sink?.event(bytes);
    this.pushStatus();
  }

  // ------------------------------------------------------------ status / range
  flags(): number {
    const f = (n: string, on: boolean) => (on ? 1 << BIT.status_flags[n] : 0);
    return f('WALK_ACTIVE', this.walkId !== 0) | f('TETHER_ARMED', this.activity === A.OFF_LEAD_TETHER) | f('MAGCLIP_LATCHED', this.magclip.latched) |
      f('LOST_MODE', this.lost.active) | f('PEER_LINKED', this.peerId !== undefined) | f('OWNER_BOUND', this.ownerBound) |
      f('EVENTS_QUEUED', this.events.length > 0) | f('DFU_PENDING_CONFIRM', this.dfu.pendingConfirm) | f('BATTERY_CRITICAL', this.battery <= 5);
  }
  powerState(): number { return this.charging ? 1 : this.battery <= 15 ? 2 : 0; }
  statusStruct(): Rec {
    return {
      ver: 1, device_type: this.typeCode, activity_state: this.activity, power_state: this.powerState(), battery_pct: this.battery,
      flags: this.flags(), magclip_batt_pct: this.kind === 'torus' ? this.magclip.battery : 0xff, tether_radius_dm: this.tetherRadiusDm,
      tether_level: this.tetherLevel, queued_events: this.events.length, walk_id: this.walkId,
    };
  }
  pushStatus() { if (this.sink) this.sink.status(encodeStruct('status', this.statusStruct())); }

  private rangeSeq = 0;
  private pushRange() {
    if (!this.sink || this.activity === A.HOME) return;
    const off = this.activity === A.OFF_LEAD_TETHER;
    this.sink.range(encodeStruct('range', {
      ver: 1, seq: this.rangeSeq++ & 255, distance_cm: this.distanceCm, dist_err_cm: off ? 12 : 0xff, link_rssi_dbm: -58, phone_rssi_dbm: -61,
      line_out_mm: this.kind === 'torus' ? this.lineOutMm : 0xffff, tether_level: this.tetherLevel, flags: off ? 1 : 0,
    }));
  }
  private syncRangeTimer() {
    if (this.rangeTimer) { clearInterval(this.rangeTimer); this.rangeTimer = undefined; }
    if (this.activity === A.ON_LEAD || this.activity === A.OFF_LEAD_TETHER) {
      const period = this.activity === A.OFF_LEAD_TETHER ? 250 : 1000;
      this.rangeTimer = setInterval(() => this.pushRange(), period);
    }
  }
  /** Called when the world moves the dog. */
  setDistance(cm: number) {
    this.distanceCm = cm;
    this.lineOutMm = Math.min(cm * 10, 3000);
    if (this.activity !== A.OFF_LEAD_TETHER || this.walkId === 0) return;
    const pct = (cm / (this.tetherRadiusDm * 10)) * 100;
    const level = pct >= 100 ? 2 : pct >= this.amberPct ? 1 : 0;
    if (level !== this.tetherLevel) {
      this.tetherLevel = level;
      if (level === 2) this.walkStats.red++;
      this.emit('TETHER', { level, distance_cm: cm, radius_dm: this.tetherRadiusDm, walk_id: this.walkId });
    }
  }

  private setActivity(next: number, reason: number) {
    const old = this.activity;
    if (old === next) return;
    this.activity = next;
    this.tetherLevel = 0;
    this.emit('STATE_CHANGED', { old_activity: old, new_activity: next, power_state: this.powerState(), reason });
    this.syncRangeTimer();
    this.pushRange();
  }
  /** Scenario hook: arbitrary state change. */
  forceActivity(next: number, reason: number = ENUM.state_change_reason.COMMAND) { this.setActivity(next, reason); }

  setBattery(pct: number) {
    this.battery = pct;
    this.emit('BATTERY', { pct, mv: 3300 + pct * 9, charge_state: this.charging ? 1 : 0, charge_source: this.charging ? 1 : 0, temp_c: 21 });
  }
  setCharging(on: boolean) {
    this.charging = on;
    this.emit('BATTERY', { pct: this.battery, mv: 3300 + this.battery * 9, charge_state: on ? 1 : 0, charge_source: on ? 1 : 0, temp_c: 21 });
  }
  setMagclipLatched(latched: boolean, battery = this.magclip.battery) {
    this.magclip.latched = latched;
    this.magclip.battery = battery;
    this.magclip.location = latched ? 2 : 3;
    this.emit('MAGCLIP_LATCH', { latched: latched ? 1 : 0, sensed_by: this.typeCode, magclip_batt_pct: battery }, TYPE.magclip);
    if (this.walkId !== 0) {
      if (!latched && this.tetherMode === 1 && this.activity === A.ON_LEAD) this.setActivity(A.OFF_LEAD_TETHER, ENUM.state_change_reason.MAGCLIP_UNLATCHED);
      if (latched && this.activity === A.OFF_LEAD_TETHER) this.setActivity(A.ON_LEAD, ENUM.state_change_reason.MAGCLIP_LATCHED);
    }
  }
  /** Torus only: slip event from the Bolt Brake. */
  bolt(peakForceN: number, slipMm: number, durationMs: number) {
    if (this.kind !== 'torus') return;
    this.walkStats.bolts++;
    this.walkStats.maxForce = Math.max(this.walkStats.maxForce, peakForceN);
    this.emit('BOLT', {
      walk_id: this.walkId, peak_force_n: peakForceN, slip_mm: slipMm, duration_ms: durationMs, line_out_mm: Math.min(this.lineOutMm, 3000),
      flags: 1 | (this.magclip.latched ? 4 : 0) | (slipMm >= 500 ? 2 : 0),
    });
  }

  // ------------------------------------------------------------ command handling
  private resp(ver: number, seq: number, target: number, opcode: number, status: number, payload: Bytes = new Uint8Array(0)): Bytes {
    return concat(Uint8Array.from([ver, seq, target, opcode, status, payload.length]), payload);
  }

  /** Returns the response bytes (also cached by seq), or undefined if the device stays silent. */
  handleCommand(frame: Bytes): Bytes | undefined {
    if (frame.length < 5) return undefined;
    const h = parseCommandHeader(frame);
    const cached = this.respCache.get(h.seq);
    if (cached && cached[3] === h.opcode) return cached; // retried command: replay, do not re-execute
    if (this.faults.silentOpcode === h.opcode) return undefined;
    const out = this.execute(frame, h);
    this.respCache.set(h.seq, out);
    if (this.respCache.size > 8) this.respCache.delete(this.respCache.keys().next().value as number);
    return out;
  }

  private execute(frame: Bytes, h: ReturnType<typeof parseCommandHeader>): Bytes {
    const r = (status: number, payload?: Bytes) => this.resp(PROTOCOL_MAJOR, h.seq, h.target, h.opcode, status, payload);
    if (h.ver !== PROTOCOL_MAJOR) return r(ERR.VERSION_MISMATCH);
    const spec = commandsByOpcode[h.opcode];
    if (!spec) return r(ERR.UNKNOWN_OPCODE);
    this.commandLog.push(spec.name);
    if (frame.length - 5 !== h.len) return r(ERR.INVALID_LENGTH);
    if (!spec.devices.includes(this.kind.toUpperCase())) return r(ERR.NOT_SUPPORTED);
    if (h.target !== TARGET.SELF && h.target !== TARGET.MAGCLIP) return r(ERR.OUT_OF_RANGE);
    if (h.target === TARGET.MAGCLIP) {
      if (this.kind !== 'torus' || !spec.magclip_target) return r(ERR.NOT_SUPPORTED);
      if (this.faults.magclipUnreachable) return r(ERR.TARGET_UNREACHABLE);
    }
    if (spec.owner_auth_required && !this.ownerBound) return r(ERR.NOT_AUTHORISED);
    if (!this.ownerBound && !ALLOWED_UNBOUND.has(spec.name) && spec.name !== 'OWNER_UNBIND') return r(ERR.NOT_AUTHORISED);
    const payload = frame.slice(5, 5 + h.len);
    if (typeof spec.request_size === 'number' && payload.length !== spec.request_size) return r(ERR.INVALID_LENGTH);
    let args: Rec;
    try { args = decodeFields(spec.request, payload).values; } catch { return r(ERR.INVALID_LENGTH); }
    if (findOutOfRange(spec.request, args)) return r(ERR.OUT_OF_RANGE);
    for (const f of spec.request) {
      if (f.enum && f.type !== 'bytes' && ENUM[f.enum] && !Object.values(ENUM[f.enum]).includes(args[f.name])) return r(ERR.OUT_OF_RANGE);
    }
    const handler = (this as any)[`cmd_${spec.name}`] as ((a: Rec, t: number) => number | Rec | Bytes) | undefined;
    if (!handler) return r(ERR.NOT_SUPPORTED);
    const out = handler.call(this, args, h.target);
    if (typeof out === 'number') return r(out);
    if (out instanceof Uint8Array) return r(ERR.OK, out);
    const fields = spec.response as any[];
    if (!fields.length) return r(ERR.OK);
    const payloadOut = typeof fields[0] === 'string'
      ? encodeStruct(h.target === TARGET.MAGCLIP && spec.name === 'GET_STATUS' ? 'magclip_status' : (fields[0] as string).split(':')[1].split(' ')[0], out)
      : encodeFields(fields as FieldSpec[], out, { sentinels: true });
    return r(ERR.OK, payloadOut);
  }

  // --- system
  cmd_GET_INFO(_a: Rec, target: number) {
    const mag = target === TARGET.MAGCLIP;
    return {
      proto_major: PROTOCOL_MAJOR, proto_minor: SPEC.version.minor, device_type: mag ? TYPE.magclip : this.typeCode, hw_rev: 1,
      fw_major: mag ? 0 : this.fw.major, fw_minor: mag ? 1 : this.fw.minor, fw_patch: mag ? 0 : this.fw.patch, fw_build: mag ? 1 : this.fw.build,
      capabilities: bitMask('capabilities', mag ? ['CONTACT_CHARGING'] : CAPS[this.kind]), max_payload: 244,
    };
  }
  cmd_SET_TIME(a: Rec) { this.clockOffset = a.unix_time - Math.floor(Date.now() / 1000); return {}; }
  cmd_GET_STATUS(_a: Rec, target: number) {
    if (target === TARGET.MAGCLIP) {
      return { ver: 1, device_type: TYPE.magclip, battery_pct: this.magclip.battery, latched: this.magclip.latched ? 1 : 0, location: this.magclip.location, charge_state: this.magclip.charge, last_seen_s: 4 };
    }
    return this.statusStruct();
  }
  cmd_GET_EVENTS(a: Rec) {
    const list = this.events.filter((e) => e.seq >= a.from_ev_seq).slice(0, a.max_count);
    this.later(0, () => list.forEach((e) => this.sink?.event(e.bytes)));
    return { available: list.length, first_ev_seq: this.events[0]?.seq ?? this.nextEv };
  }
  cmd_ACK_EVENTS(a: Rec) { this.events = this.events.filter((e) => e.seq > a.up_to_ev_seq); this.pushStatus(); return {}; }
  cmd_SELF_TEST(a: Rec, target: number) {
    const supported = target === TARGET.MAGCLIP ? 1 << BIT.self_test.MAGCLIP_CONTACTS : 0xffff;
    const run = a.tests & supported;
    const failed = run & (this.faults.selfTestFail ?? 0);
    this.later(1500, () => this.emit('SELF_TEST_RESULT', { tests_run: run, tests_failed: failed, detail: failed ? ERR.INTERNAL : 0 }, target === TARGET.MAGCLIP ? TYPE.magclip : this.typeCode));
    return {};
  }
  cmd_FACTORY_RESET(a: Rec) {
    if (a.magic !== 0x54455352) return ERR.OUT_OF_RANGE;
    this.ownerBound = false; this.peerId = undefined; this.homeWifi = [undefined, undefined, undefined, undefined]; this.events = [];
    this.bonds = 0; this.walkId = 0; this.lost.active = false; this.activity = A.HOME; this.pairingWindowOpen = true;
    this.later(50, () => this.sink?.disconnect('factory reset'));
    return {};
  }
  // --- walk
  cmd_START_WALK(a: Rec) {
    if (this.lost.active || this.dfu.pendingConfirm) return ERR.INVALID_STATE;
    if (this.walkId === a.walk_id) return {}; // idempotent
    if (this.walkId !== 0) return ERR.INVALID_STATE;
    this.walkId = a.walk_id;
    this.tetherMode = a.tether_mode;
    this.tetherRadiusDm = a.tether_radius_dm;
    this.walkStats = { startedAt: Date.now(), bolts: 0, maxForce: 0, red: 0 };
    this.setActivity(A.ON_LEAD, ENUM.state_change_reason.COMMAND);
    return {};
  }
  cmd_STOP_WALK(a: Rec) {
    if (this.walkId === 0 || this.walkId !== a.walk_id) return ERR.INVALID_STATE;
    const s = this.walkStats;
    const out = { duration_s: Math.round((Date.now() - s.startedAt) / 1000), bolt_count: s.bolts, max_force_n: s.maxForce, tether_red_count: s.red };
    this.walkId = 0;
    this.setActivity(A.HOME, ENUM.state_change_reason.COMMAND);
    return out;
  }
  cmd_SET_TETHER(a: Rec) { this.tetherRadiusDm = a.radius_dm; this.amberPct = a.amber_pct; this.tetherMode = a.mode; this.pushStatus(); return {}; }
  cmd_SET_HALO(a: Rec) { this.haloLog.push(a); return {}; }
  cmd_BUZZ(a: Rec) {
    if (this.kind === 'torus' && (a.actuator & 2)) return ERR.OUT_OF_RANGE; // Torus has LRA only
    this.buzzLog.push(a);
    return {};
  }
  cmd_RECALL_ASSIST(a: Rec) {
    if (a.action === 0) { this.emit('RECALL_STATUS', { recall_id: a.recall_id, status: 4, path: 1 }); return {}; }
    if (this.seenRecall.has(a.recall_id)) return {}; // de-duplicate by recall_id
    this.seenRecall.add(a.recall_id);
    this.recallLog.push(a.recall_id);
    this.onRecallCue?.(a.recall_id);
    this.emit('RECALL_STATUS', { recall_id: a.recall_id, status: 1, path: 1 });
    this.later(a.timeout_s * 1000, () => this.emit('RECALL_STATUS', { recall_id: a.recall_id, status: 3, path: 1 }));
    return {};
  }
  /** Same effect when the recall arrives via LTE-M (cloud path). */
  recallViaCloud(recallId: number) {
    if (this.seenRecall.has(recallId)) return;
    this.seenRecall.add(recallId);
    this.recallLog.push(recallId);
    this.emit('RECALL_STATUS', { recall_id: recallId, status: 1, path: ENUM.path.LTE_M });
  }
  private fix(requestId: number, source = 1) {
    const p = this.position();
    this.posCount++;
    const t = this.nowUnix() || Math.floor(Date.now() / 1000);
    this.emit('LOCATION', { request_id: requestId, lat_e7: Math.round(p.lat * 1e7), lon_e7: Math.round(p.lon * 1e7), acc_m: p.accM, fix_age_s: 0, source, sats: 9 });
    this.onCloudPosition?.({ ...p, time: t });
  }
  cmd_LOCATE_NOW(a: Rec) {
    this.later(3000, () => this.fix(a.request_id, this.faults.noFix ? 2 : 1));
    return {};
  }
  private lostIntervalS(): number {
    const table = SPEC.state_machine.lost_mode_interval_s as Array<{ battery_min_pct: number; interval_s: number }>;
    const row = table.find((x) => this.battery >= x.battery_min_pct) ?? table[table.length - 1];
    return Math.max(row.interval_s, this.lost.intervalS);
  }
  private startLostTimer() {
    if (this.lostTimer) clearInterval(this.lostTimer);
    this.lostTimer = setInterval(() => this.fix(0), this.lostIntervalS() * 1000);
  }
  setLostMode(active: boolean, lostId: number, intervalS = 15, path = ENUM.path.BLE_1M) {
    if (active === this.lost.active && lostId === this.lost.lostId) return;
    this.lost = { active, lostId, intervalS };
    if (active) { this.setActivity(A.LOST, ENUM.state_change_reason.COMMAND); this.startLostTimer(); this.later(0, () => this.fix(0)); }
    else { if (this.lostTimer) clearInterval(this.lostTimer); this.lostTimer = undefined; this.setActivity(A.HOME, ENUM.state_change_reason.COMMAND); }
    this.emit('LOST_MODE_STATUS', { active: active ? 1 : 0, lost_id: lostId, interval_s: this.lostIntervalS(), path });
  }
  cmd_LOST_MODE(a: Rec) { this.setLostMode(a.action === 1, a.lost_id, a.interval_s, ENUM.path.BLE_1M); return {}; }
  cmd_SET_HOME_WIFI(a: Rec) {
    if (a.ssid_len === 0) this.homeWifi[a.slot] = undefined;
    else this.homeWifi[a.slot] = new TextDecoder().decode(a.ssid);
    return {};
  }
  cmd_BIND_PEER(a: Rec) {
    const want = this.kind === 'torus' ? TYPE.link : TYPE.torus;
    if (a.peer_type !== want) return ERR.OUT_OF_RANGE;
    if (this.peerId !== undefined && this.peerId !== a.peer_id) return ERR.STORAGE_FULL;
    this.peerId = a.peer_id; this.peerKey = a.peer_pubkey; this.pushStatus();
    return {};
  }
  cmd_UNBIND_PEER(a: Rec) { if (this.peerId !== a.peer_id) return ERR.INVALID_STATE; this.peerId = undefined; return {}; }

  // --- identity
  certBytes(): Bytes {
    const bad = this.faults.attestation === 'bad-cert';
    return encodeStruct('device_cert', {
      cert_ver: 1, device_id: this.deviceId, device_type: this.typeCode, hw_rev: 1, pubkey: new Uint8Array(64).fill(4),
      issued: 1793880000, ca_key_id: bad ? 0xdeadbeef : MOCK_CA_KEY_ID, signature: new Uint8Array(64).fill(0x5a),
    });
  }
  cmd_GET_CERT(a: Rec) {
    const cert = this.certBytes();
    if (a.offset > cert.length) return ERR.OUT_OF_RANGE;
    const chunk = cert.slice(a.offset, a.offset + a.max_len);
    return { total_len: cert.length, offset: a.offset, chunk };
  }
  cmd_AUTH_CHALLENGE(a: Rec) {
    const deviceNonce = new Uint8Array(16).fill(0xd2);
    const id = new Uint8Array(8);
    new DataView(id.buffer).setBigUint64(0, this.deviceId, true);
    const sig = this.faults.attestation === 'bad-signature'
      ? new Uint8Array(64).fill(0x11)
      : mockSign(new TextEncoder().encode('AEVEA-AUTH'), a.app_nonce, deviceNonce, id);
    return { device_nonce: deviceNonce, signature: sig };
  }
  private checkToken(tokenBytes: Bytes, purpose: number): number {
    const t = decodeStruct('owner_token', tokenBytes);
    if (t.purpose !== purpose) return ERR.AUTH_FAILED;
    if (t.device_id !== this.deviceId) return ERR.AUTH_FAILED;
    const expect = mockSign(new TextEncoder().encode('MOCK-CLOUD-OWNER-KEY'), tokenBytes.slice(0, 34));
    if (t.signature.some((v: number, i: number) => v !== expect[i])) return ERR.AUTH_FAILED;
    const now = this.nowUnix();
    if (now !== 0 && (now > t.expires || t.expires - t.issued > 600)) return ERR.AUTH_FAILED;
    return ERR.OK;
  }
  cmd_OWNER_BIND(a: Rec) {
    if (this.faults.storageFull) return ERR.STORAGE_FULL;
    const s = this.checkToken(a.token, 1);
    if (s !== ERR.OK) return s;
    this.ownerBound = true;
    this.ownerId = decodeStruct('owner_token', a.token).owner_id;
    this.pairingWindowOpen = false;
    this.pushStatus();
    return {};
  }
  cmd_OWNER_UNBIND(a: Rec) {
    const s = this.checkToken(a.token, 2);
    if (s !== ERR.OK) return s;
    this.ownerBound = false;
    return {};
  }

  // ------------------------------------------------------------ DFU
  handleDfuControl(frame: Bytes): Bytes {
    let req: ReturnType<typeof decodeDfuRequest>;
    try { req = decodeDfuRequest(frame); } catch { return Uint8Array.from([frame[0] ?? 0, ERR.UNKNOWN_OPCODE]); }
    const ind = (status: number, payload: Rec = {}) => encodeDfuIndication(req.name, status, payload);
    const d = this.dfu;
    if (!this.ownerBound) return ind(ERR.NOT_AUTHORISED);
    switch (req.name) {
      case 'DFU_START': {
        const a = req.args;
        if (this.lost.active || this.walkId !== 0) return ind(ERR.INVALID_STATE);
        if (this.battery < SPEC.dfu.min_battery_pct && !this.charging) return ind(ERR.LOW_BATTERY);
        if (d.busyLeft > 0) { d.busyLeft--; return ind(ERR.BUSY); }
        if (a.image_type > 2 || (this.kind === 'torus' && a.image_type !== 0)) return ind(ERR.DFU_INVALID_IMAGE);
        const sameImage = d.state === 1 && d.sha.every((v, i) => v === a.sha256[i]);
        if (!sameImage) {
          d.received = new Uint8Array(a.image_size); d.offset = 0;
        }
        const newer = [a.fw_major, a.fw_minor, a.fw_patch, a.fw_build];
        const cur = [this.fw.major, this.fw.minor, this.fw.patch, this.fw.build];
        for (let i = 0; i < 4; i++) { if (newer[i] > cur[i]) break; if (newer[i] < cur[i]) return ind(ERR.DFU_DOWNGRADE_REJECTED); }
        d.state = 1; d.imageType = a.image_type; d.size = a.image_size; d.sha = a.sha256;
        d.fw = { major: a.fw_major, minor: a.fw_minor, patch: a.fw_patch, build: a.fw_build };
        return ind(ERR.OK, { resume_offset: d.offset, max_chunk: 240 });
      }
      case 'DFU_GET_OFFSET':
        if (d.state !== 1) return ind(ERR.DFU_NOT_STARTED);
        return ind(ERR.OK, { offset: d.offset, crc32: crc32(d.received.slice(0, d.offset)) });
      case 'DFU_VERIFY': {
        if (d.state !== 1) return ind(ERR.DFU_NOT_STARTED);
        if (d.offset !== d.size) return ind(ERR.DFU_OFFSET_MISMATCH);
        const h = sha256(d.received);
        if (h.some((v, i) => v !== d.sha[i])) return ind(ERR.DFU_HASH_MISMATCH);
        d.state = 2;
        return ind(ERR.OK);
      }
      case 'DFU_APPLY':
        if (d.state !== 2) return ind(ERR.DFU_NOT_STARTED);
        d.state = 3;
        this.later(100, () => {
          this.fw = { ...d.fw };
          d.pendingConfirm = true;
          this.sink?.disconnect('reboot into test image');
        });
        return ind(ERR.OK);
      case 'DFU_CONFIRM':
        if (d.state !== 3) return ind(ERR.DFU_NOT_STARTED);
        d.state = 4; d.pendingConfirm = false;
        return ind(ERR.OK);
      case 'DFU_ABORT': d.state = 0; d.offset = 0; return ind(ERR.OK);
      case 'DFU_STATUS':
        return ind(ERR.OK, { dfu_state: d.state, image_type: d.imageType, offset: d.offset, pend_major: d.fw.major, pend_minor: d.fw.minor, pend_patch: d.fw.patch, pend_build: d.fw.build });
      default: return ind(ERR.UNKNOWN_OPCODE);
    }
  }
  handleDfuData(frame: Bytes) {
    const { offset, data } = decodeDfuData(frame);
    const d = this.dfu;
    if (d.state !== 1) return;
    if (offset !== d.offset) return; // device drops it; app finds out at the next GET_OFFSET
    const chunk = this.faults.dfuCorrupt && offset === 0 ? data.map((v) => v ^ 0xff) : data;
    d.received.set(chunk.slice(0, d.size - offset), offset);
    d.offset += Math.min(chunk.length, d.size - offset);
  }
  get dfuState() { return this.dfu; }
}

void dfuOpsByCode;
