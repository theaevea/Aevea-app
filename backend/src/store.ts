// In-memory adapter. Everything the API persists goes through this object so a
// SQLite (better-sqlite3) implementation can replace it later without touching routes.
// Data is lost on restart. See README "Persistence".

export type DeviceKind = 'torus' | 'link';
export interface User { id: string; email: string; created_at: number }
export interface Device {
  id: string; kind: DeviceKind; claim_code_hash: string; owner_id: string | null;
  name?: string; fw_version?: string; hw_rev?: string; provisioned_at: number; claimed_at?: number;
  last_seen_at?: number; lost_mode: { active: boolean; lost_id: number | null; interval_s: number | null };
  lost_id_counter: number;
}
export type CommandKind = 'lost_mode' | 'locate_now' | 'recall';
export type CommandStatus = 'queued' | 'delivered' | 'acked' | 'rejected' | 'expired' | 'superseded';
export interface Command {
  id: string; device_id: string; kind: CommandKind; payload: Record<string, any>;
  status: CommandStatus; created_at: number; expires_at: number; delivered_at?: number; acked_at?: number;
  attempts: number; result?: Record<string, any>; created_by: string;
}
export interface Position {
  seq: number; device_id: string; ts: number; received_at: number; lat: number; lon: number;
  acc_m?: number; source?: string; sats?: number; batt_pct?: number; lost_id?: number;
}
export interface Alert { id: string; device_id: string; type: string; ts: number; data: Record<string, any>; received_at: number; pushed: boolean }
export interface Consent { id: string; user_id: string; purpose: string; granted: boolean; policy_version: string; at: number }
export interface Trial { id: string; device_id: string; user_id: string; label?: string; started_at?: number; uploaded_at: number; records: Record<string, any>[] }
export interface FirmwareRelease {
  id: string; device_kind: DeviceKind; image_type: 0 | 1 | 2; version: string; security_counter: number; channel: 'stable' | 'beta';
  size: number; sha256: string; signature: string; signature_alg: 'ECDSA-P256-SHA256'; signer_key_id: string;
  signature_verified_by_cloud: boolean; notes?: string; min_battery_pct: number; created_at: number; data: Buffer;
}
export interface PetProfile {
  device_id: string; owner_id: string; slug: string;
  public: { name: string; species?: string; breed?: string; colour?: string; size?: string; notes?: string; medical_alert?: string; owner_first_name?: string; photo_url?: string };
  updated_at: number;
}
export interface Tag { uid: string; device_id: string; file_read_key_hex: string; last_ctr: number; created_at: number }
export interface RelayMessage {
  id: string; pet_device_id: string; owner_id: string; body: string; created_at: number; reply_token_hash: string;
  replies: { at: number; body: string }[]; read: boolean; tap_verified: boolean;
}

export class Store {
  users = new Map<string, User>();
  devices = new Map<string, Device>();
  commands = new Map<string, Command>();
  positions: Position[] = [];
  positionSeq = 0;
  alerts: Alert[] = [];
  consents: Consent[] = [];
  trials = new Map<string, Trial>();
  firmware = new Map<string, FirmwareRelease>();
  pets = new Map<string, PetProfile>(); // by device_id
  petsBySlug = new Map<string, string>();
  tags = new Map<string, Tag>(); // by uid hex
  relay = new Map<string, RelayMessage>();
  pushTokens = new Map<string, Set<string>>(); // user_id -> tokens
  deletionReceipts: { id: string; user_hash: string; at: number }[] = [];

  userByEmail(email: string) { return [...this.users.values()].find((u) => u.email === email); }
  devicesOf(userId: string) { return [...this.devices.values()].filter((d) => d.owner_id === userId); }
}
