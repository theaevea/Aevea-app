import type { Bytes } from '../util/bytes';
import type { Unsub } from '../transport/Transport';

export class CloudError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'CloudError';
  }
}

export interface Position {
  lat: number;
  lon: number;
  accM: number;
  time: number; // unix s
  source: 'ble' | 'cloud';
  requestId?: number;
}

export interface FirmwareOffer {
  deviceType: number; // 1 Torus, 2 Link
  imageType: number; // dfu_image_type
  version: { major: number; minor: number; patch: number; build: number };
  size: number;
  sha256: Bytes;
  download(): Promise<Bytes>;
}

/** The slice of the Aevea cloud the MVP app needs. The real HTTP client is not part of this task. */
export interface CloudApi {
  /** Spec 5.3 step 3: claim device_id, get 6-digit passkey and a signed owner_token (purpose bind). */
  claimDevice(req: { deviceId: bigint; deviceType: number; pairingNonce: number; claimCode: string }): Promise<{ passkey: string; ownerToken: Bytes }>;
  reportAttestationFailure(deviceId: bigint, reason: string): Promise<void>;
  /** Device CA certificate check key id etc. is resolved inside AttestationVerifier. */
  getFirmwareOffer(deviceType: number, current: { major: number; minor: number; patch: number; build: number }): Promise<FirmwareOffer | null>;
  /** Recall Assist fallback over LTE-M (spec 9.1 step 2). */
  postRecall(recallId: number): Promise<void>;
  requestLocate(requestId: number): Promise<void>;
  /** Cloud is authoritative for Lost Mode (spec 9.2). */
  setLostMode(active: boolean, lostId: number): Promise<void>;
  subscribePositions(cb: (p: Position) => void): Unsub;
}
