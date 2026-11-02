// The glass's springs, as CSS linear() curves (src/styles-liquid-glass.css).
//
// SwiftUI documents its three named springs by a perceptual duration and a
// bounce: smooth (0.5 s, bounce 0), snappy (0.5 s, base bounce 0.15) and
// bouncy (0.5 s, base bounce 0.3) (developer.apple.com: Spring.smooth /
// snappy(duration:extraBounce:) / bouncy(duration:extraBounce:)). WWDC23
// "Animate with springs" gives the physics behind them: mass 1, stiffness
// (2π / duration)², damping 4π(1 − bounce) / duration (bounce ≥ 0), so the
// damping ratio is 1 − bounce (Spring(duration: 0.5, bounce: 0.3) has
// stiffness 157.9 and damping 17.6, as the Spring page says). These are
// those curves, sampled from rest (0) to the target (1), each with the time
// it takes to settle within SETTLE_EPSILON. The sheet holds the strings; the
// test (tests/liquid-glass-springs.test.ts) checks they match.

/** How close to the target counts as settled (the curve ends there). */
export const SETTLE_EPSILON = 0.002;

export type SpringSpec = { duration: number; bounce: number };

export const SPRING_SMOOTH: SpringSpec = { duration: 0.5, bounce: 0 };
export const SPRING_SNAPPY: SpringSpec = { duration: 0.5, bounce: 0.15 };
export const SPRING_BOUNCY: SpringSpec = { duration: 0.5, bounce: 0.3 };

/** Position (0 → 1) of a unit spring released from rest at time t (s). */
export function springPosition({ duration, bounce }: SpringSpec, t: number) {
  const w0 = (2 * Math.PI) / duration;
  const zeta = 1 - bounce;
  if (zeta >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}

/** Seconds until the spring stays within SETTLE_EPSILON of its target. */
export function springSettle(spec: SpringSpec) {
  const step = 1 / 600;
  let last = 0;
  for (let t = 0; t < 4; t += step) {
    if (Math.abs(1 - springPosition(spec, t)) > SETTLE_EPSILON) last = t;
  }
  return Math.ceil((last + step) * 100) / 100;
}

/** The spring as a CSS linear() easing over its settle time. */
export function springLinear(spec: SpringSpec, stops = 32) {
  const total = springSettle(spec);
  const points: string[] = ["0"];
  for (let i = 1; i < stops; i++) {
    const p = i / stops;
    const v = springPosition(spec, p * total);
    points.push(`${+v.toFixed(3)} ${+(p * 100).toFixed(2)}%`);
  }
  points.push("1");
  return { css: `linear(${points.join(", ")})`, ms: Math.round(total * 1000) };
}
