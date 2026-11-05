import type { Bytes } from '../util/bytes';

export type Unsub = () => void;

export interface DiscoveredDevice {
  id: string; // BLE address / OS peripheral id
  name: string;
  rssi: number;
  deviceType: number; // protocol device_type
  activity: number; // protocol activity_state
  advFlags: number; // adv_flags bits
  pairingWindowOpen: boolean;
}

/** Errors raised by transports. `code` values are in ERROR_INFO (app/errors.ts). */
export class TransportError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'TransportError';
  }
}

/** One connected BLE peripheral. Raw bytes only; framing lives in DeviceClient. */
export interface DeviceLink {
  readonly id: string;
  readonly mtu: number;
  readonly connected: boolean;
  /** Identity characteristic 0x0201 (readable before pairing). */
  readIdentity(): Promise<Bytes>;
  /**
   * Triggers OS-level LESC passkey pairing by touching an encrypted characteristic. The OS shows its own
   * dialog where the user types the passkey; apps cannot inject it. Rejects with TransportError.
   */
  pair(): Promise<void>;
  /** Enable indications on Response/Event, notifications on Status/Range (must precede first command). */
  enableNotifications(): Promise<void>;
  writeCommand(frame: Bytes): Promise<void>; // write WITH response
  writeDfuControl(frame: Bytes): Promise<void>;
  writeDfuData(frame: Bytes): Promise<void>; // write WITHOUT response
  onResponse(cb: (b: Bytes) => void): Unsub;
  onEvent(cb: (b: Bytes) => void): Unsub;
  onStatus(cb: (b: Bytes) => void): Unsub;
  onRange(cb: (b: Bytes) => void): Unsub;
  onDfuIndication(cb: (b: Bytes) => void): Unsub;
  onDisconnect(cb: (reason?: string) => void): Unsub;
  disconnect(): Promise<void>;
}

export interface PasskeyPromptRequest { deviceId: string; deviceName: string }

export interface Transport {
  readonly kind: 'mock' | 'ble';
  /** Starts scanning for the Aevea Identity service; returns a stop function. */
  scan(onFound: (d: DiscoveredDevice) => void, onError?: (e: TransportError) => void): Unsub;
  connect(id: string): Promise<DeviceLink>;
  /** Removes the OS bond when we can (Android). Used after failed attestation. */
  removeBond?(id: string): Promise<void>;
  /**
   * Simulated OS pairing dialog; only MockTransport honours it. The UI registers a function that resolves with
   * whatever the user types (or rejects to cancel).
   */
  setPasskeyPrompt?(fn: (req: PasskeyPromptRequest) => Promise<string>): void;
}
