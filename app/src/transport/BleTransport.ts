/**
 * REAL BLE TRANSPORT (react-native-ble-plx). *** UNTESTED ON HARDWARE *** Requires a custom dev build, not Expo Go.
 * Kept deliberately thin: bytes in, bytes out. All framing lives in DeviceClient / protocol codec.
 * Known unknowns: OS passkey dialog behaviour, Android bond removal, iOS Coded PHY, indication vs notification handling.
 */
import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { Platform } from 'react-native';
import { bytesToBase64, base64ToBytes } from '../util/base64';
import { decodeManufacturerData, uuid } from '../protocol';
import { DeviceLink, DiscoveredDevice, Transport, TransportError, Unsub } from './Transport';

const SVC_IDENTITY = uuid('0200');
const SVC_CONTROL = uuid('0100');
const SVC_DFU = uuid('0300');
const CH = {
  identity: uuid('0201'), command: uuid('0101'), response: uuid('0102'), event: uuid('0103'),
  status: uuid('0104'), range: uuid('0105'), dfuControl: uuid('0301'), dfuData: uuid('0302'),
};
const SIG_BATTERY_SVC = '0000180F-0000-1000-8000-00805F9B34FB';
const SIG_BATTERY_CH = '00002A19-0000-1000-8000-00805F9B34FB'; // LESC-encrypted read: touching it triggers OS pairing

type Cb = (b: Uint8Array) => void;

class BleLink implements DeviceLink {
  mtu = 23;
  connected = true;
  private subs: Subscription[] = [];
  private cbs = {
    response: new Set<Cb>(), event: new Set<Cb>(), status: new Set<Cb>(), range: new Set<Cb>(), dfu: new Set<Cb>(),
  };
  private dc = new Set<(r?: string) => void>();

  constructor(private dev: Device, private mgr: BleManager) {
    this.subs.push(dev.onDisconnected((_e, _d) => { this.connected = false; this.dc.forEach((cb) => cb('disconnected')); }));
  }
  get id() { return this.dev.id; }

  async requestMtu() {
    try { const d = await this.dev.requestMTU(247); this.mtu = d.mtu; } catch { /* iOS negotiates itself */ }
    if (this.mtu < 131) throw new TransportError('PROTOCOL_MISMATCH', `ATT MTU ${this.mtu} < 131`);
  }
  async readIdentity() {
    const c = await this.dev.readCharacteristicForService(SVC_IDENTITY, CH.identity);
    return base64ToBytes(c.value ?? '');
  }
  async pair() {
    try {
      await this.dev.readCharacteristicForService(SIG_BATTERY_SVC, SIG_BATTERY_CH); // triggers OS passkey dialog
      // Android: bonding is explicit. iOS: pairing happens implicitly on first encrypted access.
      if (Platform.OS === 'android' && !(await this.dev.isConnected())) throw new TransportError('PAIRING_FAILED');
    } catch (e: any) {
      if (e instanceof TransportError) throw e;
      throw new TransportError(/cancel/i.test(String(e?.message)) ? 'PAIRING_CANCELLED' : 'PAIRING_FAILED', String(e?.message));
    }
  }
  private monitor(svc: string, ch: string, set: Set<Cb>) {
    this.subs.push(this.dev.monitorCharacteristicForService(svc, ch, (err, c) => {
      if (err || !c?.value) return;
      const b = base64ToBytes(c.value);
      set.forEach((cb) => cb(b));
    }));
  }
  async enableNotifications() {
    this.monitor(SVC_CONTROL, CH.response, this.cbs.response);
    this.monitor(SVC_CONTROL, CH.event, this.cbs.event);
    this.monitor(SVC_CONTROL, CH.status, this.cbs.status);
    this.monitor(SVC_CONTROL, CH.range, this.cbs.range);
    this.monitor(SVC_DFU, CH.dfuControl, this.cbs.dfu);
  }
  async writeCommand(f: Uint8Array) { await this.dev.writeCharacteristicWithResponseForService(SVC_CONTROL, CH.command, bytesToBase64(f)); }
  async writeDfuControl(f: Uint8Array) { await this.dev.writeCharacteristicWithResponseForService(SVC_DFU, CH.dfuControl, bytesToBase64(f)); }
  async writeDfuData(f: Uint8Array) { await this.dev.writeCharacteristicWithoutResponseForService(SVC_DFU, CH.dfuData, bytesToBase64(f)); }
  private on(set: Set<Cb>, cb: Cb): Unsub { set.add(cb); return () => set.delete(cb); }
  onResponse(cb: Cb) { return this.on(this.cbs.response, cb); }
  onEvent(cb: Cb) { return this.on(this.cbs.event, cb); }
  onStatus(cb: Cb) { return this.on(this.cbs.status, cb); }
  onRange(cb: Cb) { return this.on(this.cbs.range, cb); }
  onDfuIndication(cb: Cb) { return this.on(this.cbs.dfu, cb); }
  onDisconnect(cb: (r?: string) => void) { this.dc.add(cb); return () => this.dc.delete(cb); }
  async disconnect() { this.subs.forEach((s) => s.remove()); this.subs = []; try { await this.mgr.cancelDeviceConnection(this.dev.id); } catch { /* already gone */ } }
}

export class BleTransport implements Transport {
  readonly kind = 'ble' as const;
  private mgr = new BleManager();

  scan(onFound: (d: DiscoveredDevice) => void, onError?: (e: TransportError) => void): Unsub {
    let stopped = false;
    const sub = this.mgr.onStateChange((state) => {
      if (stopped) return;
      if (state === State.PoweredOff) onError?.(new TransportError('BLUETOOTH_OFF'));
      if (state === State.Unauthorized) onError?.(new TransportError('PERMISSION_DENIED'));
      if (state === State.PoweredOn) {
        sub.remove();
        this.mgr.startDeviceScan([SVC_IDENTITY], { allowDuplicates: false }, (err, dev) => {
          if (err) { onError?.(new TransportError('PERMISSION_DENIED', err.message)); return; }
          if (!dev?.manufacturerData) return;
          try {
            // ble-plx gives manufacturer data base64 incl. company id first
            const m = decodeManufacturerData(base64ToBytes(dev.manufacturerData));
            onFound({ id: dev.id, name: dev.localName ?? dev.name ?? 'Aevea device', rssi: dev.rssi ?? -100, deviceType: m.device_type, activity: m.activity_state, advFlags: m.flags, pairingWindowOpen: (m.flags & 1) === 1 });
          } catch { /* not ours */ }
        });
      }
    }, true);
    return () => { stopped = true; sub.remove(); this.mgr.stopDeviceScan(); };
  }

  async connect(id: string): Promise<DeviceLink> {
    try {
      const dev = await this.mgr.connectToDevice(id, { requestMTU: 247, timeout: 10000 });
      await dev.discoverAllServicesAndCharacteristics();
      const link = new BleLink(dev, this.mgr);
      await link.requestMtu();
      return link;
    } catch (e: any) {
      if (e instanceof TransportError) throw e;
      throw new TransportError('DISCONNECTED', String(e?.message ?? e));
    }
  }
  async removeBond(id: string) { try { await this.mgr.cancelDeviceConnection(id); } catch { /* ignore */ } }
}
