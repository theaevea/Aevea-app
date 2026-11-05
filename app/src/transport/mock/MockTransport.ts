import { Bytes } from '../../util/bytes';
import { decodeManufacturerData } from '../../protocol';
import { DeviceLink, DiscoveredDevice, PasskeyPromptRequest, Transport, TransportError, Unsub } from '../Transport';
import { MockDevice, DeviceSink } from './MockDevice';
import { MockWorld } from './MockWorld';

type Cb = (b: Bytes) => void;
class Emitter<T extends (...a: any[]) => void> {
  private s = new Set<T>();
  on(cb: T): Unsub { this.s.add(cb); return () => this.s.delete(cb); }
  emit(...a: Parameters<T>) { [...this.s].forEach((cb) => cb(...a)); }
}

class MockLink implements DeviceLink {
  readonly mtu = 247;
  connected = true;
  private resp = new Emitter<Cb>(); private ev = new Emitter<Cb>(); private st = new Emitter<Cb>();
  private rg = new Emitter<Cb>(); private dfu = new Emitter<Cb>(); private dc = new Emitter<(r?: string) => void>();
  private notifying = false;

  constructor(private t: MockTransport, private dev: MockDevice) {
    const sink: DeviceSink = {
      response: (b) => this.resp.emit(b),
      event: (b) => { if (this.notifying) this.ev.emit(b); },
      status: (b) => { if (this.notifying) this.st.emit(b); },
      range: (b) => { if (this.notifying) this.rg.emit(b); },
      dfu: (b) => this.dfu.emit(b),
      disconnect: (r) => this.drop(r),
    };
    dev.sink = sink;
  }
  get id() { return this.dev.bleId; }
  private drop(reason: string) {
    if (!this.connected) return;
    this.connected = false;
    if (this.dev.sink) this.dev.sink = undefined;
    this.t.links.delete(this.dev.bleId);
    this.dc.emit(reason);
  }
  private guard() {
    if (!this.connected) throw new TransportError('DISCONNECTED');
    if (!this.t.bonded.has(this.id)) throw new TransportError('NOT_ENCRYPTED', 'ATT: insufficient authentication');
  }
  async readIdentity() { if (!this.connected) throw new TransportError('DISCONNECTED'); return this.dev.identity(); }
  async pair() {
    if (!this.connected) throw new TransportError('DISCONNECTED');
    if (this.t.bonded.has(this.id)) return;
    if (!this.dev.pairingWindowOpen) throw new TransportError('PAIRING_WINDOW_CLOSED');
    if (!this.t.prompt) throw new TransportError('PAIRING_CANCELLED');
    let typed: string;
    try { typed = await this.t.prompt({ deviceId: this.id, deviceName: this.dev.kind }); } catch { throw new TransportError('PAIRING_CANCELLED'); }
    const ok = typed === this.dev.expectedPasskey();
    this.dev.rotateNonce(); // after EVERY attempt
    if (!ok) throw new TransportError('PAIRING_FAILED', 'Passkey rejected');
    this.dev.addBond();
    this.t.bonded.add(this.id);
  }
  async enableNotifications() { this.guard(); this.notifying = true; }
  async writeCommand(frame: Bytes) {
    this.guard();
    const out = this.dev.handleCommand(frame);
    if (out) {
      const send = () => { if (this.connected) this.resp.emit(out); };
      if (this.t.latencyMs > 0) setTimeout(send, this.t.latencyMs); else Promise.resolve().then(send);
    }
  }
  async writeDfuControl(frame: Bytes) {
    this.guard();
    const out = this.dev.handleDfuControl(frame);
    Promise.resolve().then(() => { if (this.connected) this.dfu.emit(out); });
  }
  async writeDfuData(frame: Bytes) { this.guard(); this.dev.handleDfuData(frame); }
  onResponse(cb: Cb) { return this.resp.on(cb); }
  onEvent(cb: Cb) { return this.ev.on(cb); }
  onStatus(cb: Cb) { return this.st.on(cb); }
  onRange(cb: Cb) { return this.rg.on(cb); }
  onDfuIndication(cb: Cb) { return this.dfu.on(cb); }
  onDisconnect(cb: (r?: string) => void) { return this.dc.on(cb); }
  async disconnect() { this.drop('local'); }
}

/** In-memory transport backed by a MockWorld (simulated Torus + Link following the spec). */
export class MockTransport implements Transport {
  readonly kind = 'mock' as const;
  readonly bonded = new Set<string>();
  readonly links = new Map<string, MockLink>();
  prompt?: (r: PasskeyPromptRequest) => Promise<string>;
  latencyMs = 0;
  /** Set to make the next connect() calls fail. */
  failConnects = 0;
  constructor(readonly world: MockWorld = new MockWorld()) {}

  setPasskeyPrompt(fn: (r: PasskeyPromptRequest) => Promise<string>) { this.prompt = fn; }

  scan(onFound: (d: DiscoveredDevice) => void, onError?: (e: TransportError) => void): Unsub {
    let stopped = false;
    if (this.world.bluetoothOff) {
      Promise.resolve().then(() => onError?.(new TransportError('BLUETOOTH_OFF')));
      return () => { stopped = true; };
    }
    Promise.resolve().then(() => {
      for (const dev of [this.world.torus, this.world.link]) {
        if (stopped) return;
        const m = decodeManufacturerData(dev.advManufacturerData());
        onFound({
          id: dev.bleId, name: dev.kind === 'torus' ? 'Aevea Torus' : 'Aevea Link', rssi: dev.kind === 'torus' ? -52 : -63,
          deviceType: m.device_type, activity: m.activity_state, advFlags: m.flags, pairingWindowOpen: (m.flags & 1) === 1,
        });
      }
    });
    return () => { stopped = true; };
  }

  async connect(id: string): Promise<DeviceLink> {
    if (this.world.bluetoothOff) throw new TransportError('BLUETOOTH_OFF');
    if (this.failConnects > 0) { this.failConnects--; throw new TransportError('DISCONNECTED', 'connect failed'); }
    const dev = [this.world.torus, this.world.link].find((d) => d.bleId === id);
    if (!dev) throw new TransportError('DISCONNECTED', 'unknown device');
    this.links.get(id)?.disconnect();
    const link = new MockLink(this, dev);
    this.links.set(id, link);
    return link;
  }
  async removeBond(id: string) { this.bonded.delete(id); }
}
