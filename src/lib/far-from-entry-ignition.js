// FAR FROM SAGA's entry clock and the shared fire's phase (owner,
// 2026-10-22: the transformation is Rexonance's, the fire the same and the
// same at its start, gold at its end). The entry's clock is authored in
// elapsed ms with the fire in it (no hold stretches it, unlike Rexonance's
// entryElapsedTime): the undersuit scan ends at `ignite`, the kindle, the
// engulf and the gold torch run up to the 爆散 at `burst`, and from the
// burst on the fire's shared phase units (NANITE_FIRE_PHASES, t / 2400 from
// the burst) govern the detonation, the material and the fire's end, so
// every fragment's cooling and handoff keep the clocks the nanite engines
// are built on. Monotone, continuous, closed-form.
import { NANITE_FIRE_PHASES } from "./rexonance-ignition.js";

export const FAR_FROM_ENTRY_FIRE = Object.freeze({ ignite: 320, burst: 840 });
const P = NANITE_FIRE_PHASES;
const FLAME_MS = 2400;
const { ignite: IGNITE, burst: BURST } = FAR_FROM_ENTRY_FIRE;

/** The fire's phase at entry `t` ms: 0 up to the scan's end, burstStart at
 * the 爆散, then on at the shared rate. */
export function farFromFlamePhase(t) {
  if (!Number.isFinite(t) || t <= IGNITE) return 0;
  if (t >= BURST) return P.burstStart + (t - BURST) / FLAME_MS;
  return (P.burstStart * (t - IGNITE)) / (BURST - IGNITE);
}

/** The inverse: the entry ms at which the fire reaches `phase` (0 or less:
 * the ignition, at the scan's end). */
export function farFromFlameTime(phase) {
  if (!Number.isFinite(phase) || phase <= 0) return IGNITE;
  if (phase >= P.burstStart) return BURST + (phase - P.burstStart) * FLAME_MS;
  return IGNITE + (phase * (BURST - IGNITE)) / P.burstStart;
}

/** The first fragments have cooled into chips: the earliest any armour forms. */
export const FAR_FROM_ENTRY_MATERIAL = farFromFlameTime(P.materialStart);
/** The last of the fire is gone. */
export const FAR_FROM_ENTRY_FLAME_END = farFromFlameTime(P.flameEnd);

/** A tile's landing time, with the earliest plates' growth moved to start
 * just after the material is there (never under the fire): a plate's
 * landing window [fit − 100, fit] whose start lies before the fire's end
 * (+ 60 ms) is stretched to [material + 60, fit] instead, keeping its fit;
 * the first chips still get 60 ms to fly. The Far From clock's analogue of
 * rexonance-ignition.js naniteMaterialLanding. */
export function farFromMaterialLanding(land, fit) {
  if (!Number.isFinite(land) || !Number.isFinite(fit) || fit <= 0) return land;
  const oldFrom = fit - 100;
  const newFrom =
    oldFrom < FAR_FROM_ENTRY_FLAME_END + 60 ? Math.min(fit, FAR_FROM_ENTRY_MATERIAL + 60) : oldFrom;
  return newFrom === oldFrom ? land : newFrom + ((land - oldFrom) * (fit - newFrom)) / 100;
}
