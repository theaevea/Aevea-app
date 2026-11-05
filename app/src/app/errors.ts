import { ENUM_NAME } from '../protocol';

export type ErrorAction = 'retry' | 'retry_later' | 'reconnect' | 'repair' | 'update_firmware' | 'charge' | 'remove_bond' | 'none';

export interface ErrorInfo {
  title: string;
  message: string;
  /** What the UI should offer. */
  action: ErrorAction;
  /** Safe to resend automatically (BUSY only, per spec). */
  autoRetryMs?: number;
}

/** User-facing handling for every error code in the spec (section 14) plus client-side codes. */
export const ERROR_INFO: Record<string, ErrorInfo> = {
  OK: { title: 'OK', message: 'Done.', action: 'none' },
  UNKNOWN_OPCODE: { title: 'Feature not available', message: 'This device firmware does not know that command. Update the firmware to use it.', action: 'update_firmware' },
  INVALID_LENGTH: { title: 'Protocol error', message: 'The device rejected a malformed message. This is an app bug; please export the trial log.', action: 'none' },
  OUT_OF_RANGE: { title: 'Value out of range', message: 'That value is outside what the device accepts. Check the setting and try again.', action: 'none' },
  NOT_SUPPORTED: { title: 'Not supported', message: 'This device does not support that feature.', action: 'none' },
  BUSY: { title: 'Device busy', message: 'The device is busy. Retrying shortly.', action: 'retry_later', autoRetryMs: 500 },
  INVALID_STATE: { title: 'Not allowed right now', message: 'The device cannot do that in its current state (for example, a walk or Lost Mode is active).', action: 'none' },
  NOT_AUTHORISED: { title: 'Device not linked to your account', message: 'The device has not been linked to your account yet. Pair it again.', action: 'repair' },
  TARGET_UNREACHABLE: { title: 'MagClip not reachable', message: 'Torus cannot reach the MagClip right now. Dock or latch it and try again.', action: 'retry_later' },
  LOW_BATTERY: { title: 'Battery too low', message: 'Charge the device before doing this.', action: 'charge' },
  VERSION_MISMATCH: { title: 'App and device are out of date with each other', message: 'Update the app or the device firmware.', action: 'update_firmware' },
  STORAGE_FULL: { title: 'No space left on the device', message: 'The device already has 4 phones paired. Remove one in Settings on that phone, then try again.', action: 'remove_bond' },
  TIMEOUT: { title: 'Device timed out', message: 'The device could not finish in time (for example no GPS fix). Try again outdoors.', action: 'retry' },
  AUTH_FAILED: { title: 'Verification failed', message: 'The device could not verify the request. Try pairing again.', action: 'retry' },
  DFU_INVALID_SIGNATURE: { title: 'Firmware rejected', message: 'The firmware image signature is not valid for this device. Nothing was changed.', action: 'none' },
  DFU_INVALID_IMAGE: { title: 'Wrong firmware image', message: 'That firmware image is not for this device.', action: 'none' },
  DFU_OFFSET_MISMATCH: { title: 'Transfer out of sync', message: 'The firmware transfer went out of step. Resuming.', action: 'retry' },
  DFU_HASH_MISMATCH: { title: 'Firmware corrupted', message: 'The image arrived damaged. Restart the update.', action: 'retry' },
  DFU_DOWNGRADE_REJECTED: { title: 'Older firmware rejected', message: 'The device refuses to go back to an older firmware version.', action: 'none' },
  DFU_NOT_STARTED: { title: 'Update not started', message: 'The update sequence went out of order. Start again.', action: 'retry' },
  INTERNAL: { title: 'Device error', message: 'The device reported an internal error. Try again; if it persists export the trial log.', action: 'retry' },
  // client-side
  COMMAND_TIMEOUT: { title: 'No response from device', message: 'The device did not answer. Check it is nearby and try again.', action: 'retry' },
  DISCONNECTED: { title: 'Disconnected', message: 'Connection to the device was lost.', action: 'reconnect' },
  NOT_CONNECTED: { title: 'Not connected', message: 'The device is not connected.', action: 'reconnect' },
  CLOUD_UNAVAILABLE: { title: 'No connection to Aevea cloud', message: 'Check your internet connection and try again.', action: 'retry' },
  INVALID_CLAIM_CODE: { title: 'Claim code not recognised', message: 'Check the code on the packaging or device and try again.', action: 'retry' },
  NOT_ENCRYPTED: { title: 'Pairing required', message: 'The device needs to be paired first.', action: 'repair' },
  PAIRING_FAILED: { title: 'Pairing failed', message: 'The passkey was not accepted. A new passkey will be generated; try again.', action: 'retry' },
  PAIRING_CANCELLED: { title: 'Pairing cancelled', message: 'Pairing was cancelled before it finished.', action: 'retry' },
  PAIRING_WINDOW_CLOSED: { title: 'Pairing window closed', message: 'Put the device in pairing mode (power cycle or plug in USB-C) and scan again.', action: 'retry' },
  ATTESTATION_FAILED: { title: 'Device could not be verified', message: 'This does not look like a genuine Aevea device. It was disconnected and reported.', action: 'none' },
  WRONG_DEVICE: { title: 'Wrong device', message: 'That is not the device we are looking for.', action: 'retry' },
  BLUETOOTH_OFF: { title: 'Bluetooth is off', message: 'Turn Bluetooth on and try again.', action: 'retry' },
  PERMISSION_DENIED: { title: 'Bluetooth permission needed', message: 'Allow Bluetooth access for Aevea in system settings.', action: 'retry' },
  FIRMWARE_TOO_OLD: { title: 'Firmware update required', message: 'This device must be updated before it can be used.', action: 'update_firmware' },
  PROTOCOL_MISMATCH: { title: 'Incompatible device', message: 'This device speaks a protocol version this app does not support.', action: 'update_firmware' },
};

export class AeveaError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, detail?: string, status?: number) {
    super(detail ?? (ERROR_INFO[code]?.message ?? code));
    this.name = 'AeveaError';
    this.code = code;
    this.status = status;
  }
  get info(): ErrorInfo {
    return ERROR_INFO[this.code] ?? { title: 'Something went wrong', message: this.message, action: 'retry' };
  }
  static fromStatus(status: number): AeveaError {
    const name = ENUM_NAME.error_code[status] ?? 'INTERNAL';
    return new AeveaError(name, undefined, status);
  }
}

export function toAeveaError(e: unknown, fallback = 'INTERNAL'): AeveaError {
  if (e instanceof AeveaError) return e;
  const code = (e as any)?.code;
  if (typeof code === 'string' && ERROR_INFO[code]) return new AeveaError(code, (e as Error).message);
  return new AeveaError(fallback, e instanceof Error ? e.message : String(e));
}
