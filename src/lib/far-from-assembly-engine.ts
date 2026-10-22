/** FAR FROM SAGA — the scroll suit-up's engine chunk (2026-10-22).
 *
 * Loaded by src/lib/far-from-assembly.ts only under the motion gate and
 * never on the startup path: the Rexonance scroll engine
 * (src/lib/rexonance-resonance.js, mountRexonanceAssembly) with FAR FROM's
 * suit (src/lib/far-from-suit.ts, cut from the owner's ミドル cutout) and its
 * differences from Rexonance's suit-up, all of them the engine's own
 * options so Rexonance plays exactly as before:
 *
 * - the palette: ice, gold and white instead of ice, pink and white — the
 *   chips, the mosaic, the pixel squares, the core's rings and glow, the
 *   field's particles and the swarm's batched chips;
 * - the reactor completes like the compound eyes (owner): on FAR FROM
 *   DEUS！ pixel squares fill it, then scatter (`reactorGlow`);
 * - two kinds of nanite, mixed (owner): kit A is Rexonance's hex chips
 *   (src/lib/rexonance-nanites.ts); kit B lands as src/lib/far-from-nanites.ts
 *   (FAR_FROM_NANITE_CELLS, the same layout contract) — until it does, kit A
 *   stands in for it, so the two-kit path (each chip one kit's by its hash)
 *   already runs;
 * - after the seal the suit-up runs ハイ → エックスハイ → マックス
 *   (`forms.chain`), each form overwriting the last with cells from the core
 *   out, and the runway ends on マックス;
 * - the 光輪 open behind the figure as the output ignites
 *   (src/lib/far-from-assembly-accents.ts).
 *
 * The same wearer: the undersuit, the bare head and the uninstalled reactor
 * are Rexonance's, composited into this frame by the build
 * (scripts/build-far-from-suit.mjs). The fire is the shared body fire; its
 * gold end tone is the entry transition's parameter (far-from-transform-
 * entry) and is passed through here once that lands.
 */

import { mountRexonanceAssembly, type RexonanceAssemblyConfig } from "./rexonance-resonance.js";
import {
  FAR_FROM_SUIT_ATLAS,
  FAR_FROM_SUIT_DRIVER,
  FAR_FROM_SUIT_FACE_GLOW,
  FAR_FROM_SUIT_FIGURE,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_GOLD_ATLAS,
  FAR_FROM_SUIT_MARKS,
  FAR_FROM_SUIT_ORNAMENTS,
  FAR_FROM_SUIT_PIECES,
  FAR_FROM_SUIT_REACTOR_GLOW,
  FAR_FROM_SUIT_SIZE,
  FAR_FROM_SUIT_TILE,
  FAR_FROM_SUIT_UNDERSUIT,
} from "./far-from-suit.ts";
import { FAR_FROM_SUIT_GOLD_CELL, FAR_FROM_SUIT_GOLD_CELLS } from "./far-from-suit-gold.ts";
import {
  FAR_FROM_SUIT_GOLD_BOXES,
  FAR_FROM_SUIT_GUIDE,
  FAR_FROM_SUIT_SEAMS,
} from "./far-from-suit-nanites.ts";
import { farFromAccents } from "./far-from-assembly-accents.ts";

/** The stages' lights, as the record's accents (final-stage-data.ts). */
export const FAR_FROM_FORM_TONES = Object.freeze({
  high: "#ffd77a",
  xhigh: "#ff6f8d",
  max: "#c99bff",
});

/** The forms the suit-up runs through after the seal, in order; the runway
 * ends on the last (its data-form). */
export const FAR_FROM_FORM_CHAIN = Object.freeze(["high", "xhigh", "max"] as const);

/** FAR FROM's palette for the scene: 水色 (ice), 黄金 (gold), white. */
export const FAR_FROM_PALETTE = Object.freeze({
  tones: [
    [127, 230, 255],
    [255, 215, 122],
    [244, 251, 255],
  ],
  rings: ["rgb(127 230 255)", "rgb(201 155 255)", "rgb(255 215 122)"],
  reactorMotes: ["rgb(255 215 122)", "rgb(150 236 255)", "rgb(201 155 255)"],
  lightArms: ["rgb(150 236 255)", "rgb(255 215 122)"],
  coreGlow: ["rgb(244 251 255 / 0.9)", "rgb(127 230 255 / 0.45)", "rgb(255 215 122 / 0)"],
  field: {
    ice: [0.5, 0.9, 1],
    pink: [1, 0.84, 0.48],
    white: [0.96, 0.98, 1],
    leads: [
      [0.56, 0.8],
      [0.26, 0.74],
      [0.32, 0.52],
    ],
  },
  nanites: {
    tone: ["rgb(127 230 255)", "rgb(255 215 122)", "rgb(244 251 255)"],
    shade: ["rgb(22 58 74)", "rgb(74 58 22)", "rgb(58 64 76)"],
    touchTone: ["rgb(176 238 255)", "rgb(255 230 170)", "rgb(244 251 255)"],
    touchShade: ["rgb(34 70 90)", "rgb(90 72 34)", "rgb(62 68 82)"],
    // The kit's rows: ice, gold, white (the pink row is never drawn here).
    toneRows: [0, 3, 2],
  },
} as const satisfies NonNullable<RexonanceAssemblyConfig["palette"]>);

/** The reactor's radius in figure px (the chest core's disc). */
export const FAR_FROM_REACTOR_RADIUS = 30;

/** The nanite kits, loaded with the scene's pictures: kit A's chips, comets
 * and effects, kit B's chips (kit A until src/lib/far-from-nanites.ts lands),
 * and FAR FROM's own guide, seams and gold boxes. */
export const loadFarFromNanites = () =>
  import("./rexonance-nanites.ts").then((module) => ({
    cells: module.REXONANCE_NANITE_CELLS,
    // TODO(farfrom-nanite-kit): FAR_FROM_NANITE_CELLS from far-from-nanites.ts.
    cellsB: module.REXONANCE_NANITE_CELLS,
    comets: module.REXONANCE_NANITE_COMETS,
    fx: module.REXONANCE_NANITE_FX,
    guide: FAR_FROM_SUIT_GUIDE,
    seams: FAR_FROM_SUIT_SEAMS,
    goldBoxes: FAR_FROM_SUIT_GOLD_BOXES,
  }));

/** The scene's config: FAR FROM's suit in the Rexonance engine's terms. */
export function farFromAssemblyConfig(): RexonanceAssemblyConfig {
  return {
    figure: FAR_FROM_SUIT_FIGURE,
    undersuit: FAR_FROM_SUIT_UNDERSUIT,
    size: FAR_FROM_SUIT_SIZE,
    maskTile: FAR_FROM_SUIT_TILE,
    pieces: FAR_FROM_SUIT_PIECES.map(({ id, group, x, y, w, h, seat, tiles, ax, ay }) => ({
      id,
      group,
      x,
      y,
      w,
      h,
      seat,
      tiles,
      ax,
      ay,
      // The driver is on the body, finished, from the start.
      preset: FAR_FROM_SUIT_DRIVER.includes(id),
    })),
    ornaments: FAR_FROM_SUIT_ORNAMENTS,
    core: FAR_FROM_SUIT_MARKS.core,
    visor: FAR_FROM_SUIT_MARKS.visor,
    glow: FAR_FROM_SUIT_FACE_GLOW,
    reactorGlow: FAR_FROM_SUIT_REACTOR_GLOW,
    reactorRadius: FAR_FROM_REACTOR_RADIUS,
    atlas: FAR_FROM_SUIT_ATLAS.src,
    gold: {
      atlas: FAR_FROM_SUIT_GOLD_ATLAS.src,
      cell: FAR_FROM_SUIT_GOLD_CELL,
      cells: FAR_FROM_SUIT_GOLD_CELLS,
    },
    palette: FAR_FROM_PALETTE,
    accents: farFromAccents,
    nanites: loadFarFromNanites,
    forms: {
      chain: FAR_FROM_FORM_CHAIN,
      tones: FAR_FROM_FORM_TONES,
      ...FAR_FROM_SUIT_FORMS,
    },
  };
}

/** Mounts the scene on the runway (the engine's disposer back). */
export function mountFarFromAssemblyEngine(
  runway: HTMLElement,
  environment: typeof globalThis = window,
): () => void {
  return mountRexonanceAssembly(runway, farFromAssemblyConfig(), environment);
}
