import type { ServerResponse } from 'node:http';

/** Per-device Server-Sent Events fan-out. Single process; use Redis pub/sub or similar to scale out. */
export class SseHub {
  private subs = new Map<string, Set<ServerResponse>>();
  private timers = new Set<NodeJS.Timeout>();

  subscribe(deviceId: string, res: ServerResponse, heartbeatMs = 15_000) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    let set = this.subs.get(deviceId);
    if (!set) this.subs.set(deviceId, (set = new Set()));
    set.add(res);
    const t = setInterval(() => res.write(': hb\n\n'), heartbeatMs);
    this.timers.add(t);
    res.on('close', () => { clearInterval(t); this.timers.delete(t); set!.delete(res); });
  }

  static frame(event: string, data: unknown, id?: number) {
    return `${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  publish(deviceId: string, event: string, data: unknown, id?: number) {
    const f = SseHub.frame(event, data, id);
    this.subs.get(deviceId)?.forEach((r) => r.write(f));
  }
  /** Close streams for a device (ownership change / erasure). */
  dropDevice(deviceId: string) { this.subs.get(deviceId)?.forEach((r) => r.end()); this.subs.delete(deviceId); }
  closeAll() { for (const t of this.timers) clearInterval(t); this.subs.forEach((s) => s.forEach((r) => r.end())); this.subs.clear(); }
}
