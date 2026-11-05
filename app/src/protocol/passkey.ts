import { hmacSha256 } from '../util/sha256';
import { utf8Encode, concat } from '../util/bytes';

/** passkey = u32_le(HMAC-SHA256(K_pair, "AEVEA-PK" || device_id_le || pairing_nonce_le)[0..3]) mod 1_000_000 (spec 5.2) */
export function derivePasskey(kPair: Uint8Array, deviceId: bigint, nonce: number): string {
  const id = new Uint8Array(8);
  new DataView(id.buffer).setBigUint64(0, deviceId, true);
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, nonce >>> 0, true);
  const mac = hmacSha256(kPair, concat(utf8Encode('AEVEA-PK'), id, n));
  const v = new DataView(mac.buffer, mac.byteOffset, 4).getUint32(0, true);
  return String(v % 1_000_000).padStart(6, '0');
}
