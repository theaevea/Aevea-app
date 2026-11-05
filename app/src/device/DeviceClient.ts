import { Bytes, toHex } from '../util/bytes';
import {
  encodeCommand, decodeResponse, decodeEvent, decodeDfuIndication, decodeStruct, ERR, ResponseFrame, EventFrame,
  DfuIndication, Rec, TARGET, encodeDfuRequest, encodeDfuData,
} from '../protocol';
import { AeveaError, toAeveaError } from '../app/errors';
import type { DeviceLink, Unsub } from '../transport/Transport';

export type FrameLog = (entry: { dir: 'tx' | 'rx'; kind: string; hex: string; summary?: string }) => void;

export interface RequestOptions {
  target?: number;
  timeoutMs?: number;
  /** BUSY is retried after 500 ms up to this many times (spec 14). */
  busyRetries?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Command/response layer for one device (spec section 4): one outstanding command, 3 s timeout, one retry with
 * the SAME seq (device returns its cached response), BUSY retry, error status -> AeveaError.
 */
export class DeviceClient {
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private pending?: { seq: number; resolve: (r: ResponseFrame) => void };
  private unsubs: Unsub[] = [];
  private eventCbs = new Set<(e: EventFrame) => void>();
  private statusCbs = new Set<(s: Rec) => void>();
  private rangeCbs = new Set<(r: Rec) => void>();
  private dfuCbs = new Set<(i: DfuIndication) => void>();
  private disconnectCbs = new Set<(reason?: string) => void>();
  private dfuWaiter?: { resolve: (i: DfuIndication) => void; reject: (e: Error) => void };
  connected = true;

  constructor(readonly link: DeviceLink, private log?: FrameLog) {
    this.unsubs.push(
      link.onResponse((b) => this.handleResponse(b)),
      link.onEvent((b) => {
        this.log?.({ dir: 'rx', kind: 'event', hex: toHex(b) });
        try {
          const e = decodeEvent(b);
          this.eventCbs.forEach((cb) => cb(e));
        } catch { /* malformed event: ignore (forward compatibility) */ }
      }),
      link.onStatus((b) => {
        try { const s = decodeStruct('status', b); this.statusCbs.forEach((cb) => cb(s)); } catch { /* ignore */ }
      }),
      link.onRange((b) => {
        try { const r = decodeStruct('range', b); this.rangeCbs.forEach((cb) => cb(r)); } catch { /* ignore */ }
      }),
      link.onDfuIndication((b) => {
        this.log?.({ dir: 'rx', kind: 'dfu', hex: toHex(b) });
        try {
          const i = decodeDfuIndication(b);
          this.dfuCbs.forEach((cb) => cb(i));
          const w = this.dfuWaiter;
          this.dfuWaiter = undefined;
          w?.resolve(i);
        } catch { /* ignore */ }
      }),
      link.onDisconnect((reason) => this.handleDisconnect(reason)),
    );
  }

  onEvent(cb: (e: EventFrame) => void): Unsub { this.eventCbs.add(cb); return () => this.eventCbs.delete(cb); }
  onStatus(cb: (s: Rec) => void): Unsub { this.statusCbs.add(cb); return () => this.statusCbs.delete(cb); }
  onRange(cb: (r: Rec) => void): Unsub { this.rangeCbs.add(cb); return () => this.rangeCbs.delete(cb); }
  onDfu(cb: (i: DfuIndication) => void): Unsub { this.dfuCbs.add(cb); return () => this.dfuCbs.delete(cb); }
  onDisconnect(cb: (reason?: string) => void): Unsub { this.disconnectCbs.add(cb); return () => this.disconnectCbs.delete(cb); }

  private handleDisconnect(reason?: string) {
    if (!this.connected) return;
    this.connected = false;
    this.pending = undefined;
    this.dfuWaiter?.reject(new AeveaError('DISCONNECTED'));
    this.dfuWaiter = undefined;
    this.disconnectCbs.forEach((cb) => cb(reason));
  }

  private handleResponse(b: Bytes) {
    let r: ResponseFrame;
    try { r = decodeResponse(b); } catch { return; }
    this.log?.({ dir: 'rx', kind: 'response', hex: toHex(b), summary: `${r.name} ${r.statusName}` });
    if (this.pending && this.pending.seq === r.seq) {
      const p = this.pending;
      this.pending = undefined;
      p.resolve(r);
    }
  }

  /** Sends a command and returns the OK response; throws AeveaError for any non-OK status. */
  request(name: string, args: Rec = {}, opts: RequestOptions = {}): Promise<ResponseFrame> {
    const run = async () => {
      const retries = opts.busyRetries ?? 5;
      for (let attempt = 0; ; attempt++) {
        const r = await this.exchange(name, args, opts);
        if (r.status === ERR.OK) return r;
        if (r.status === ERR.BUSY && attempt < retries) { await sleep(500); continue; }
        throw AeveaError.fromStatus(r.status);
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async exchange(name: string, args: Rec, opts: RequestOptions): Promise<ResponseFrame> {
    if (!this.connected) throw new AeveaError('NOT_CONNECTED');
    const seq = this.seq;
    this.seq = (this.seq + 1) & 255;
    const frame = encodeCommand(name, seq, args, opts.target ?? TARGET.SELF);
    const timeout = opts.timeoutMs ?? 3000;
    for (let attempt = 0; attempt < 2; attempt++) { // original + one retry with the same seq
      const waiting = new Promise<ResponseFrame>((resolve) => { this.pending = { seq, resolve }; });
      this.log?.({ dir: 'tx', kind: 'command', hex: toHex(frame), summary: name });
      try {
        await this.link.writeCommand(frame);
      } catch (e) {
        this.pending = undefined;
        throw toAeveaError(e, 'NOT_CONNECTED');
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), timeout); });
      const res = await Promise.race([waiting, timedOut]);
      clearTimeout(timer);
      if (res !== 'timeout') return res;
      this.pending = undefined;
      if (!this.connected) throw new AeveaError('DISCONNECTED');
    }
    throw new AeveaError('COMMAND_TIMEOUT');
  }

  // ---- DFU (service 0x0300)

  async dfuRequest(name: string, args: Rec = {}, timeoutMs = 12000): Promise<DfuIndication> {
    if (!this.connected) throw new AeveaError('NOT_CONNECTED');
    const frame = encodeDfuRequest(name, args);
    const waiting = new Promise<DfuIndication>((resolve, reject) => { this.dfuWaiter = { resolve, reject }; });
    this.log?.({ dir: 'tx', kind: 'dfu', hex: frame.length > 48 ? toHex(frame.slice(0, 48)) + ' ...' : toHex(frame), summary: name });
    await this.link.writeDfuControl(frame);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new AeveaError('COMMAND_TIMEOUT')), timeoutMs); });
    try {
      const ind = await Promise.race([waiting, timedOut]);
      if (ind.status !== ERR.OK) throw AeveaError.fromStatus(ind.status);
      return ind;
    } finally {
      clearTimeout(timer);
      this.dfuWaiter = undefined;
    }
  }
  dfuData(offset: number, data: Bytes): Promise<void> {
    return this.link.writeDfuData(encodeDfuData(offset, data));
  }

  async close(): Promise<void> {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.handleDisconnect('closed');
    await this.link.disconnect().catch(() => undefined);
  }
}
