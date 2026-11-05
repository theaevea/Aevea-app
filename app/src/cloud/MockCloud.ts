import { concat, utf8Encode } from '../util/bytes';
import { sha256 } from '../util/sha256';
import { CloudApi, CloudError, FirmwareOffer, Position } from './CloudApi';
import { MockWorld } from '../transport/mock/MockWorld';
import { mockSign } from '../transport/mock/MockDevice';
import { encodeStruct, derivePasskey, ENUM } from '../protocol';
import type { Unsub } from '../transport/Transport';

const OWNER_ID = new Uint8Array(16).fill(0x7b);

export class MockCloud implements CloudApi {
  offline = false;
  reports: Array<{ deviceId: bigint; reason: string }> = [];
  recalls: number[] = [];
  private subs = new Set<(p: Position) => void>();
  constructor(private world: MockWorld) {
    world.link.onCloudPosition = (p) => {
      setTimeout(() => this.subs.forEach((cb) => cb({ lat: p.lat, lon: p.lon, accM: p.accM, time: p.time, source: 'cloud' })), this.world.cloudLatencyMs);
    };
  }
  private async net() {
    if (this.offline || this.world.cloudOffline) throw new CloudError('CLOUD_UNAVAILABLE');
    await new Promise((r) => setTimeout(r, 0));
  }
  async claimDevice(req: { deviceId: bigint; deviceType: number; pairingNonce: number; claimCode: string }) {
    await this.net();
    if (!/^AEV-(TORUS|LINK)-\d{4}$/.test(req.claimCode)) throw new CloudError('INVALID_CLAIM_CODE');
    const dev = [this.world.torus, this.world.link].find((d) => d.deviceId === req.deviceId);
    if (!dev || dev.typeCode !== req.deviceType) throw new CloudError('INVALID_CLAIM_CODE');
    const kPair = (dev as any).opts.kPair as Uint8Array;
    const passkey = derivePasskey(kPair, req.deviceId, req.pairingNonce);
    const issued = Math.floor(Date.now() / 1000);
    const unsigned = encodeStruct('owner_token', {
      token_ver: 1, purpose: 1, device_id: req.deviceId, owner_id: OWNER_ID, issued, expires: issued + 600, signature: new Uint8Array(64),
    }).slice(0, 34);
    const signature = mockSign(utf8Encode('MOCK-CLOUD-OWNER-KEY'), unsigned);
    return { passkey, ownerToken: concat(unsigned, signature) };
  }
  async reportAttestationFailure(deviceId: bigint, reason: string) { this.reports.push({ deviceId, reason }); }
  async getFirmwareOffer(deviceType: number, cur: { major: number; minor: number; patch: number; build: number }): Promise<FirmwareOffer | null> {
    await this.net();
    const version = { ...cur, minor: cur.minor + 1, build: cur.build + 1 };
    const size = 12 * 1024;
    const image = Uint8Array.from({ length: size }, (_, i) => (i * 31 + deviceType) & 255);
    return { deviceType, imageType: ENUM.dfu_image_type.MAIN_BLE_MCU, version, size, sha256: sha256(image), download: async () => image };
  }
  async postRecall(recallId: number) {
    await this.net();
    this.recalls.push(recallId);
    setTimeout(() => this.world.link.recallViaCloud(recallId), this.world.cloudLatencyMs);
  }
  async requestLocate(requestId: number) {
    await this.net();
    setTimeout(() => this.world.link.fix(requestId), this.world.cloudLatencyMs);
  }
  async setLostMode(active: boolean, lostId: number) {
    await this.net();
    setTimeout(() => this.world.link.setLostMode(active, lostId, 15, ENUM.path.LTE_M), this.world.cloudLatencyMs);
  }
  subscribePositions(cb: (p: Position) => void): Unsub { this.subs.add(cb); return () => this.subs.delete(cb); }
}
