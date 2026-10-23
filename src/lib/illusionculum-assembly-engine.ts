/** ILLUSIONCULUM SAGA — the scroll suit-up's engine chunk (2026-10-23).
 *
 * Loaded by src/lib/illusionculum-assembly.ts only under the motion gate and
 * never on the startup path: the Rexonance scroll engine
 * (src/lib/rexonance-resonance.js, mountRexonanceAssembly) with this form's
 * suit (src/lib/illusionculum-suit.ts, cut from the owner's cutouts by SAM's
 * masks) and its own differences, every one of them an opt-in option of the
 * engine, so Rexonance and FAR FROM play exactly as before:
 *
 * - `generation`: the armour is PROJECTED (src/lib/illusionculum-
 *   projection.ts) — the ILLUSIONCULUM idea, the observed position and the
 *   real one set apart, then meeting — in place of Rexonance's nanites and
 *   FAR FROM's wireframe;
 * - `fire: false`: no fire (the armour is projected, not forged);
 * - the palette: ice, pink and violet (the light paths), gold;
 * - the reactor completes like the eyes: its disc fills with pixel squares
 *   that scatter (`reactorGlow`, `reactorRadius` 0, as FAR FROM's crystal);
 * - the chain of forms after the seal (the runway's data-form, the selector
 *   after the runway): リアクター・モア deploys the two orbs from above the
 *   shoulders; ウルトラ takes the figure from the reactor out; ウルトラ +
 *   リアクター・モア goes through ウルトラ (`forms.paths`).
 *
 * The same wearer: the undersuit is Rexonance's, set into this frame by the
 * build (scripts/build-illusionculum-suit.mjs).
 */

import { mountRexonanceAssembly, type RexonanceAssemblyConfig } from "./rexonance-resonance.js";
import {
  ILLUSIONCULUM_SUIT_ATLAS,
  ILLUSIONCULUM_SUIT_DRIVER,
  ILLUSIONCULUM_SUIT_FACE_GLOW,
  ILLUSIONCULUM_SUIT_FIGURE,
  ILLUSIONCULUM_SUIT_FORMS,
  ILLUSIONCULUM_SUIT_MARKS,
  ILLUSIONCULUM_SUIT_ORBS,
  ILLUSIONCULUM_SUIT_PIECES,
  ILLUSIONCULUM_SUIT_REACTOR_GLOW,
  ILLUSIONCULUM_SUIT_SIZE,
  ILLUSIONCULUM_SUIT_TILE,
  ILLUSIONCULUM_SUIT_UNDERSUIT,
} from "./illusionculum-suit.ts";
import { createIllusionculumProjection } from "./illusionculum-projection.ts";
import { ILLUSIONCULUM_FORM_CHAIN, ILLUSIONCULUM_FORM_PATHS } from "./illusionculum-assembly.ts";

/** Each form's light (the scene's overwrite tone, unused by the projection
 * but kept for the engine's fallback): ice for the orbs, crimson for ウルトラ. */
export const ILLUSIONCULUM_FORM_TONES = Object.freeze({
  more: "#a6e6ff",
  ultra: "#b81f3a",
  ultraMore: "#d23a52",
});

/** The scene's palette: ice, pink, violet (the light paths) and gold. */
export const ILLUSIONCULUM_PALETTE = Object.freeze({
  tones: [
    [166, 230, 255],
    [255, 143, 210],
    [169, 131, 255],
  ],
  rings: ["rgb(166 230 255)", "rgb(169 131 255)", "rgb(233 184 102)"],
  reactorMotes: ["rgb(230 248 255)", "rgb(166 230 255)", "rgb(255 143 210)"],
  lightArms: ["rgb(166 230 255)", "rgb(255 143 210)"],
  coreGlow: ["rgb(240 250 255 / 0.9)", "rgb(166 230 255 / 0.45)", "rgb(169 131 255 / 0)"],
} as const satisfies NonNullable<RexonanceAssemblyConfig["palette"]>);

/** The plates' atlas, decoded once for the projection's sprites: the
 * scene's nanite loader (called with the pictures, so the still tiers never
 * fetch it) waits on it and hands the engine no kit. */
let atlasImage: HTMLImageElement | null = null;
let atlasLoading: Promise<void> | null = null;
const loadAtlas = () => {
  atlasLoading ??= new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.src = ILLUSIONCULUM_SUIT_ATLAS.src;
    image
      .decode()
      .then(
        () => {
          atlasImage = image;
        },
        () => {
          atlasLoading = null;
        },
      )
      .finally(resolve);
  });
  return atlasLoading;
};

/** The scene's config: this suit in the Rexonance engine's terms. */
export function illusionculumAssemblyConfig(): RexonanceAssemblyConfig {
  return {
    figure: ILLUSIONCULUM_SUIT_FIGURE,
    undersuit: ILLUSIONCULUM_SUIT_UNDERSUIT,
    size: ILLUSIONCULUM_SUIT_SIZE,
    maskTile: ILLUSIONCULUM_SUIT_TILE,
    pieces: ILLUSIONCULUM_SUIT_PIECES.map(({ id, group, x, y, w, h, seat, tiles, ax, ay }) => ({
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
      preset: ILLUSIONCULUM_SUIT_DRIVER.includes(id),
    })),
    core: ILLUSIONCULUM_SUIT_MARKS.core,
    visor: ILLUSIONCULUM_SUIT_MARKS.visor,
    glow: ILLUSIONCULUM_SUIT_FACE_GLOW,
    reactorGlow: ILLUSIONCULUM_SUIT_REACTOR_GLOW,
    reactorRadius: 0,
    fire: false,
    atlas: ILLUSIONCULUM_SUIT_ATLAS.src,
    palette: ILLUSIONCULUM_PALETTE,
    nanites: () => loadAtlas().then(() => null),
    generation: createIllusionculumProjection({
      atlas: () => atlasImage,
      orbs: ILLUSIONCULUM_SUIT_ORBS,
      orbForms: ["more", "ultraMore"],
      ultraForms: ["ultra", "ultraMore"],
    }),
    forms: {
      chain: ILLUSIONCULUM_FORM_CHAIN,
      paths: ILLUSIONCULUM_FORM_PATHS,
      tones: ILLUSIONCULUM_FORM_TONES,
      ...ILLUSIONCULUM_SUIT_FORMS,
    },
  };
}

/** Mounts the scene on the runway (the engine's disposer back). */
export function mountIllusionculumAssemblyEngine(
  runway: HTMLElement,
  environment: typeof globalThis = window,
): () => void {
  return mountRexonanceAssembly(runway, illusionculumAssemblyConfig(), environment);
}
