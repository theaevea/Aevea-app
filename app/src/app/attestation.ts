import { Bytes, concat, utf8Encode } from '../util/bytes';
import { decodeStruct } from '../protocol';
import { AeveaError } from './errors';
import { mockSign, MOCK_CA_KEY_ID } from '../transport/mock/MockDevice';

export interface AttestationVerifier {
  verifyCert(cert: Bytes, expect: { deviceId: bigint; deviceType: number }): Rec;
  verifyChallenge(cert: Rec, appNonce: Bytes, deviceNonce: Bytes, signature: Bytes): void;
}
type Rec = Record<string, any>;

/**
 * Structural checks plus a hash-based stand-in for the signatures. A production verifier MUST check the ECDSA
 * P-256 device-CA signature over the cert and the challenge signature with the cert pubkey. NOT implemented here.
 */
export class MockAttestationVerifier implements AttestationVerifier {
  verifyCert(cert: Bytes, expect: { deviceId: bigint; deviceType: number }) {
    const c = decodeStruct('device_cert', cert);
    if (c.device_id !== expect.deviceId || c.device_type !== expect.deviceType || c.ca_key_id !== MOCK_CA_KEY_ID) {
      throw new AeveaError('ATTESTATION_FAILED', 'certificate does not match device');
    }
    return c;
  }
  verifyChallenge(cert: Rec, appNonce: Bytes, deviceNonce: Bytes, signature: Bytes) {
    const id = new Uint8Array(8);
    new DataView(id.buffer).setBigUint64(0, cert.device_id, true);
    const expect = mockSign(utf8Encode('AEVEA-AUTH'), appNonce, deviceNonce, id);
    if (signature.length !== 64 || signature.some((v, i) => v !== expect[i])) throw new AeveaError('ATTESTATION_FAILED', 'bad challenge signature');
  }
}
void concat;
