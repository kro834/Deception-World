/** META UNITAS SAGA — the scroll suit-up's engine chunk (2026-10-23).
 *
 * Owner: 「メタ・ウニタスはレクソナンスと同じ装着です」. The Rexonance scroll
 * engine (src/lib/rexonance-resonance.js, mountRexonanceAssembly) plays Meta
 * Unitas' suit (src/lib/meta-unitas-rx-suit.ts, built by
 * scripts/build-meta-unitas-rx-suit.mjs from SAM's cut of the owner's ミドル),
 * the way it played FAR FROM's before its wireframe: the undersuit scanned,
 * the fire engulfing it and bursting into the nanites, the plates landing
 * group by group on each call, the seal, the ignition, the helix and the
 * eyes filling with pixel squares, then ウルトラ (the owner's cutout, the same
 * frame) overwriting it from the core out when the selector chose it. Only
 * the engine's own options are passed (the palette, the reactor's outline,
 * the form chain): Rexonance, FAR FROM and ILLUSIONCULUM play exactly as before.
 */

import { mountRexonanceAssembly, type RexonanceAssemblyConfig } from "./rexonance-resonance.js";
import {
  META_UNITAS_RX_ATLAS,
  META_UNITAS_RX_DRIVER,
  META_UNITAS_RX_FACE_GLOW,
  META_UNITAS_RX_FIGURE,
  META_UNITAS_RX_FORMS,
  META_UNITAS_RX_GOLD_ATLAS,
  META_UNITAS_RX_MARKS,
  META_UNITAS_RX_ORNAMENTS,
  META_UNITAS_RX_PIECES,
  META_UNITAS_RX_REACTOR_GLOW,
  META_UNITAS_RX_SIZE,
  META_UNITAS_RX_TILE,
  META_UNITAS_RX_UNDERSUIT,
} from "./meta-unitas-rx-suit.ts";
import { META_UNITAS_RX_GOLD_CELL, META_UNITAS_RX_GOLD_CELLS } from "./meta-unitas-rx-suit-gold.ts";
import {
  META_UNITAS_RX_GOLD_BOXES,
  META_UNITAS_RX_GUIDE,
  META_UNITAS_RX_SEAMS,
} from "./meta-unitas-rx-suit-nanites.ts";
import { farFromAccents } from "./far-from-assembly-accents.ts";

/** The form after ミドル: ウルトラ, in its crystal's pale light. */
export const META_UNITAS_FORM_CHAIN = Object.freeze(["ultra"] as const);
export const META_UNITAS_FORM_TONES = Object.freeze({ ultra: "#f0deff" });

/** Meta Unitas' palette: teal scale, orange light paths, white-silver. */
export const META_UNITAS_PALETTE = Object.freeze({
  tones: [
    [70, 206, 200],
    [255, 158, 84],
    [244, 248, 250],
  ],
  rings: ["rgb(70 206 200)", "rgb(255 158 84)", "rgb(255 214 150)"],
  reactorMotes: ["rgb(255 158 84)", "rgb(120 226 220)", "rgb(255 214 150)"],
  lightArms: ["rgb(255 170 96)", "rgb(120 226 220)"],
  coreGlow: ["rgb(255 236 210 / 0.9)", "rgb(255 158 84 / 0.45)", "rgb(70 206 200 / 0)"],
  field: {
    ice: [0.36, 0.84, 0.8],
    pink: [1, 0.62, 0.34],
    white: [0.96, 0.98, 1],
    leads: [
      [0.56, 0.8],
      [0.26, 0.74],
      [0.32, 0.52],
    ],
  },
  nanites: {
    tone: ["rgb(70 206 200)", "rgb(255 158 84)", "rgb(244 248 250)"],
    shade: ["rgb(16 56 58)", "rgb(82 44 18)", "rgb(58 64 70)"],
    touchTone: ["rgb(150 236 230)", "rgb(255 200 150)", "rgb(244 248 250)"],
    touchShade: ["rgb(24 70 72)", "rgb(96 56 26)", "rgb(62 68 78)"],
    toneRows: [0, 3, 2],
  },
} as const satisfies NonNullable<RexonanceAssemblyConfig["palette"]>);

/** The kit: Rexonance's hex chips; Meta Unitas' own guide, seams and gold. */
export const loadMetaUnitasNanites = () =>
  import("./rexonance-nanites.ts").then((kit) => ({
    cells: kit.REXONANCE_NANITE_CELLS,
    comets: kit.REXONANCE_NANITE_COMETS,
    fx: kit.REXONANCE_NANITE_FX,
    guide: META_UNITAS_RX_GUIDE,
    seams: META_UNITAS_RX_SEAMS,
    goldBoxes: META_UNITAS_RX_GOLD_BOXES,
  }));

export function metaUnitasAssemblyConfig(): RexonanceAssemblyConfig {
  return {
    figure: META_UNITAS_RX_FIGURE,
    undersuit: META_UNITAS_RX_UNDERSUIT,
    size: META_UNITAS_RX_SIZE,
    maskTile: META_UNITAS_RX_TILE,
    pieces: META_UNITAS_RX_PIECES.map(({ id, group, x, y, w, h, seat, tiles, ax, ay }) => ({
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
      preset: META_UNITAS_RX_DRIVER.includes(id),
    })),
    ornaments: META_UNITAS_RX_ORNAMENTS,
    core: META_UNITAS_RX_MARKS.core,
    visor: META_UNITAS_RX_MARKS.visor,
    glow: META_UNITAS_RX_FACE_GLOW,
    reactorGlow: META_UNITAS_RX_REACTOR_GLOW,
    // The helix is a chest plate landing with the rest (no Rexonance coil).
    reactorRadius: 0,
    atlas: META_UNITAS_RX_ATLAS.src,
    gold: {
      atlas: META_UNITAS_RX_GOLD_ATLAS.src,
      cell: META_UNITAS_RX_GOLD_CELL,
      cells: META_UNITAS_RX_GOLD_CELLS,
    },
    palette: META_UNITAS_PALETTE,
    accents: farFromAccents,
    nanites: loadMetaUnitasNanites,
    forms: {
      chain: META_UNITAS_FORM_CHAIN,
      tones: META_UNITAS_FORM_TONES,
      ...META_UNITAS_RX_FORMS,
    },
  };
}

export function mountMetaUnitasAssemblyEngine(
  runway: HTMLElement,
  environment: typeof globalThis = window,
  options: { eager?: boolean } = {},
): () => void {
  return mountRexonanceAssembly(
    runway,
    { ...metaUnitasAssemblyConfig(), eager: options.eager },
    environment,
  );
}
