import { MockDevice, MockDeviceOptions, MockPosition } from './MockDevice';
import { ENUM } from '../../protocol';

export interface ScenarioStep { at: number; label: string; run: (w: MockWorld) => void }
export interface Scenario { name: string; steps: ScenarioStep[] }

/** The simulated physical world: Torus, Link, MagClip, dog position. Scenarios script it over time. */
export class MockWorld {
  readonly torus: MockDevice;
  readonly link: MockDevice;
  bluetoothOff = false;
  cloudOffline = false;
  cloudLatencyMs = 50;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private posIdx = 0;
  positionFn: () => MockPosition = () => {
    // dog wandering north-east of Hyde Park
    const i = this.posIdx++;
    return { lat: 51.5074 + i * 0.0002, lon: -0.1278 + i * 0.00015, accM: 8 };
  };

  constructor(opts: { torus?: Partial<MockDeviceOptions>; link?: Partial<MockDeviceOptions> } = {}) {
    const k = (n: number) => new Uint8Array(32).fill(n);
    this.torus = new MockDevice({ kind: 'torus', deviceId: 0x00a3e70100000123n, kPair: k(1), ...opts.torus } as MockDeviceOptions, () => this.positionFn());
    this.link = new MockDevice({ kind: 'link', deviceId: 0x00a3e70200000456n, kPair: k(2), ...opts.link } as MockDeviceOptions, () => this.positionFn());
  }
  device(kind: 'torus' | 'link') { return kind === 'torus' ? this.torus : this.link; }

  /** Unclip the MagClip: both Torus and Link sense it. */
  unclip() { this.torus.setMagclipLatched(false); this.link.setMagclipLatched(false); }
  clip() { this.torus.setMagclipLatched(true); this.link.setMagclipLatched(true); }
  setDistance(cm: number) { this.torus.setDistance(cm); this.link.setDistance(cm); }
  bolt(forceN = 340, slipMm = 180, ms = 220) { this.torus.bolt(forceN, slipMm, ms); }

  play(s: Scenario) {
    for (const step of s.steps) this.timers.push(setTimeout(() => step.run(this), step.at));
  }
  dispose() { this.timers.forEach(clearTimeout); this.torus.dispose(); this.link.dispose(); }
}

export const SCENARIOS: Record<string, Scenario> = {
  /** Unclip at 1 s, run off to the edge of the tether, slip at 6 s, come back and re-clip. */
  walkWithBolt: {
    name: 'walkWithBolt',
    steps: [
      { at: 1000, label: 'unclip', run: (w) => w.unclip() },
      { at: 2000, label: '2 m', run: (w) => w.setDistance(200) },
      { at: 3000, label: '4.2 m (amber)', run: (w) => w.setDistance(420) },
      { at: 4000, label: '5.5 m (red)', run: (w) => w.setDistance(550) },
      { at: 5000, label: 'bolt', run: (w) => w.bolt(340, 180, 220) },
      { at: 7000, label: 'back to 1 m', run: (w) => w.setDistance(100) },
      { at: 8000, label: 're-clip', run: (w) => w.clip() },
    ],
  },
  lowBatteryTorus: { name: 'lowBatteryTorus', steps: [{ at: 500, label: 'torus 12%', run: (w) => w.torus.setBattery(12) }] },
  dropAndReturn: {
    name: 'dropAndReturn',
    steps: [
      { at: 100, label: 'drop', run: (w) => w.torus.sink?.disconnect('out of range') },
    ],
  },
};
void ENUM;
