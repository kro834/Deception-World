/** The scroll suit-up's playhead (owner, 2026-10-23: 「スクロールに伴ってより
 * 滑らかに変身されるようにし」).
 *
 * A scroll arrives in steps — a wheel's notches, a trackpad's packets, a
 * fling's long frames — and a frame drawn straight at the scroll's progress
 * plays each step as a cut. The engine (rexonance-resonance.js, the
 * Rexonance and FAR FROM runways) draws the playhead instead: a critically
 * damped spring that chases the scroll's progress. Second order, so its
 * velocity is continuous too: one notch after another blends into one
 * motion instead of a sawtooth of fast-then-slow eases, and a notch that
 * lands mid-flight never restarts the motion.
 *
 * The spring is integrated in closed form over each frame's time, so it is
 * exact at any frame rate (two frames of 8 ms land where one of 16 ms
 * does) and settles on the target itself, never a hair short of it. The
 * picture trails a fast fling by at most `lag`: beyond that the head is
 * carried along at that distance, so a fling never feels like rubber and
 * the catch-up after it is one short ease. A jump wider than `cut` is a
 * cut (a link, a restore, a form chosen): the head snaps. A long frame
 * (a hitch) advances the head by at most `dtMax` of motion — the picture
 * slows for that frame instead of jumping.
 *
 * Only the playhead is smoothed: every frame stays a closed-form function
 * of the progress it is drawn at, and the HUD reads the scroll itself.
 * `follow` allocates nothing: a frame's work is a few multiplications on
 * the head's own fields.
 */
export const PLAYHEAD = Object.freeze({
  /** The spring's natural frequency (1/s) for fine pointers: 95% of a notch
   * about 150 ms after it, settled about 170 ms after it. */
  omega: 32,
  /** For touch screens: a finger expects the picture under it. */
  omegaTouch: 44,
  /** The most the picture trails the scroll (progress 0–1). */
  lag: 0.06,
  /** A jump this wide (progress) is a cut: the head snaps to it. */
  cut: 0.2,
  /** Settled: within this of the target (progress, about 2–3 px of a
   * runway's travel: under a tile's own motion) and nearly at rest, the
   * head lands on the target instead of trailing its last thousandth. */
  settle: 0.001,
  /** A frame's time (ms), clamped: a sub-millisecond frame still moves, a
   * hitch advances at most this much. */
  dtMin: 1,
  dtMax: 50,
});

export class ScrollPlayhead {
  constructor(omega = PLAYHEAD.omega) {
    this.omega = omega;
    /** The progress shown (−1: nothing shown yet). */
    this.x = -1;
    /** Its velocity (progress / s). */
    this.v = 0;
    /** The scroll's progress it chases. */
    this.target = -1;
  }

  /** Nothing shown yet: the next frame snaps. */
  reset() {
    this.x = -1;
    this.v = 0;
    this.target = -1;
  }

  /** Shows `target` at once, at rest. */
  snap(target) {
    this.x = target;
    this.target = target;
    this.v = 0;
    return target;
  }

  /** The head rests on its target. */
  get settled() {
    return this.x === this.target;
  }

  /**
   * Advances the head toward `target` over `dtMs` and returns the progress
   * to draw this frame. `omega` is the spring's frequency for this frame
   * (the pointer's).
   */
  follow(target, dtMs, omega = this.omega) {
    this.target = target;
    const gap = target - this.x;
    if (this.x < 0 || !(gap < PLAYHEAD.cut && gap > -PLAYHEAD.cut)) return this.snap(target);
    const dt =
      (dtMs < PLAYHEAD.dtMin ? PLAYHEAD.dtMin : dtMs > PLAYHEAD.dtMax ? PLAYHEAD.dtMax : dtMs) /
      1000;
    // x(t) = (x0 + (v0 + ω x0) t) e^(−ω t), relative to the target: the
    // critically damped spring's exact solution over the frame.
    const x0 = this.x - target;
    const c = this.v + omega * x0;
    const e = Math.exp(-omega * dt);
    const carried = x0 + c * dt;
    let x = carried * e;
    let v = (c - omega * carried) * e;
    if (x < PLAYHEAD.settle && x > -PLAYHEAD.settle) {
      const drift = v / omega;
      if (drift < PLAYHEAD.settle && drift > -PLAYHEAD.settle) {
        x = 0;
        v = 0;
      }
    }
    if (x > PLAYHEAD.lag) x = PLAYHEAD.lag;
    else if (x < -PLAYHEAD.lag) x = -PLAYHEAD.lag;
    this.x = x === 0 ? target : target + x;
    this.v = v;
    return this.x;
  }
}
