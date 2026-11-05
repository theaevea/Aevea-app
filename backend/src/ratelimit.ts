// Small fixed-window limiter (in-memory, per process). Behind several instances use a shared store (Redis).
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private now: () => number) {}
  /** Returns 0 if allowed, else seconds until the window resets. */
  take(key: string, max: number, windowMs: number): number {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || e.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + windowMs });
      if (this.hits.size > 50_000) this.sweep(t);
      return 0;
    }
    if (e.count >= max) return Math.ceil((e.resetAt - t) / 1000);
    e.count++;
    return 0;
  }
  private sweep(t: number) { for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k); }
}
