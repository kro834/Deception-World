// Shared by entrance and scroll: the artwork coil grows on the reactor's
// own formation clock and reaches the original, unscaled pose exactly at 1.
const unit = (u) => Math.max(0, Math.min(1, u));

export function reactorFormation(u) {
  const v = unit(u);
  return v * v * (3 - 2 * v);
}

export function reactorCoilAngle(u) {
  return (reactorFormation(u) - 1) * Math.PI * 1.25;
}

export function reactorCoilScale(u) {
  const v = 1 - unit(u);
  return 0.55 + 0.45 * (1 - v * v * v);
}
