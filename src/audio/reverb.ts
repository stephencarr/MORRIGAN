/** MORRIGAN's wet-only stereo Schroeder reverb, fixed at the engine's 44.1 kHz.
 * Four damped combs per side and two allpasses. All memory is allocated at creation.
 * Original implementation, GPL-3.0-only. No inputs from effect returns: no routing feedback.
 */
export interface ReverbConfig { on: boolean; room: number; damping: number }
export const defaultReverb = (): ReverbConfig => ({ on: false, room: 0.55, damping: 0.45 });
const unit = (v: number, fallback: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
class Comb {
  readonly buf: Float32Array;
  index = 0;
  low = 0;
  constructor(size: number) { this.buf = new Float32Array(size); }
  run(x: number, feedback: number, damping: number): number {
    const y = this.buf[this.index]!;
    this.low = y * (1 - damping) + this.low * damping;
    this.buf[this.index] = x + this.low * feedback;
    if (++this.index === this.buf.length) this.index = 0;
    return y;
  }
  clear(): void { this.buf.fill(0); this.index = 0; this.low = 0; }
}
class Allpass {
  readonly buf: Float32Array;
  index = 0;
  constructor(size: number) { this.buf = new Float32Array(size); }
  run(x: number): number {
    const y = this.buf[this.index]!;
    const out = y - 0.5 * x;
    this.buf[this.index] = x + 0.5 * out;
    if (++this.index === this.buf.length) this.index = 0;
    return out;
  }
  clear(): void { this.buf.fill(0); this.index = 0; }
}
export class ReverbProcessor {
  private combs = [1117, 1277, 1423, 1559, 1140, 1300, 1446, 1582].map(n => new Comb(n));
  private passes = [225, 556, 248, 579].map(n => new Allpass(n));
  private on = false;
  private feedback = 0.72;
  private damping = 0.45;
  set(config?: ReverbConfig): void {
    if (!config?.on && this.on) this.clear();
    this.on = !!config?.on;
    // Strictly below unity even at the maximum room setting.
    this.feedback = 0.5 + unit(config?.room ?? 0.55, 0.55) * 0.44;
    this.damping = unit(config?.damping ?? 0.45, 0.45) * 0.9;
  }
  /** Replace send buffers with wet-only return. Disabled output is exactly zero. */
  process(left: Float32Array, right: Float32Array, n: number): void {
    if (!this.on) { left.fill(0, 0, n); right.fill(0, 0, n); return; }
    for (let i = 0; i < n; i++) {
      const l = left[i]!, r = right[i]!;
      const inL = (l * 0.8 + r * 0.2) * 0.18;
      const inR = (r * 0.8 + l * 0.2) * 0.18;
      let outL = 0, outR = 0;
      for (let c = 0; c < 4; c++) {
        outL += this.combs[c]!.run(inL, this.feedback, this.damping);
        outR += this.combs[c + 4]!.run(inR, this.feedback, this.damping);
      }
      left[i] = this.passes[1]!.run(this.passes[0]!.run(outL * 0.5));
      right[i] = this.passes[3]!.run(this.passes[2]!.run(outR * 0.5));
    }
  }
  clear(): void { for (const c of this.combs) c.clear(); for (const p of this.passes) p.clear(); }
}
