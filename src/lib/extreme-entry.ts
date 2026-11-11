/* EXTREME SAGA's entry suit-up: the gate's numbers and the art's address.

   Owner (2026-11-11): 「エクスプリームに変身アニメーションを遷移アニメーション
   のみに追加して。ナノマシンではなく、細かい機械パーツが展開するシステム」 — the
   suit-up plays only in the route transition screen of an in-site
   navigation to /extreme-saga (load-gate.tsx, the "extreme" dive), never as
   a section of the page.

   A light module: the gate reads it on every route, so it carries only
   numbers and paths. The engine (src/lib/extreme-suitup-engine.ts) and the
   owner's suit art (public/extreme-suitup-20261111/) load only when the
   sequence mounts under the cover, i.e. only on the way to /extreme-saga. */

/** The gate's fallback numbers. With the suit-up playing, the cover is held
 * by its playback (src/lib/entry-playback.ts), not by `cover`. */
export const EXTREME_ENTRY_TIMINGS = { cover: 380, reveal: 520 } as const;

/** The owner's suit art (2026-11-11), transparent around the figure,
 * delivered at two widths; the engine picks one for the figure's size. */
export const EXTREME_SUITUP_FOLDER = "/extreme-suitup-20261111";
export const EXTREME_SUITUP_SIZE = { width: 1024, height: 1536 } as const;
export const EXTREME_SUITUP_WIDTHS = [768, 1024] as const;

export function extremeSuitupSource(width: (typeof EXTREME_SUITUP_WIDTHS)[number]): string {
  return `${EXTREME_SUITUP_FOLDER}/expreme-${width}.webp`;
}

/** The art width for a figure shown `figureHeight` CSS px tall at `dpr`. */
export function pickExtremeSuitupWidth(
  figureHeight: number,
  dpr: number,
): (typeof EXTREME_SUITUP_WIDTHS)[number] {
  const needed = figureHeight * dpr;
  return needed <= 900 ? 768 : 1024;
}

/** Device-pixel ratio cap for the suit-up canvas: phones and tablets draw at
 * most 1.5×, other screens at most 2×. */
export function extremeSuitupDpr(dpr: number, coarse: boolean): number {
  const cap = coarse ? 1.5 : 2;
  return Math.max(1, Math.min(cap, Number.isFinite(dpr) && dpr > 0 ? dpr : 1));
}

/** The suit-up's beats, in ms from its first painted frame. */
export const EXTREME_SUITUP_BEATS = Object.freeze({
  core: [0, 420],
  belt: [120, 560],
  chest: [300, 1150],
  hips: [420, 1100],
  shoulders: [760, 1450],
  arms: [900, 1550],
  legs: [980, 1750],
  boots: [1350, 1950],
  gauntlets: [1650, 2200],
  gems: [2150, 2500],
  helmet: [2300, 2900],
  horns: [2780, 3060],
  cape: [2820, 3460],
  sweep: [3300, 3720],
} as const);

/** The last painted beat; the playback completes after a short hold. */
export const EXTREME_SUITUP_END_MS = 3720;
export const EXTREME_SUITUP_HOLD_MS = 120;
