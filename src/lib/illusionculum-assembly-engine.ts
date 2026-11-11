/** ILLUSIONCULUM SAGA — the scroll suit-up's engine chunk (2026-10-23).
 *
 * Loaded by src/lib/illusionculum-assembly.ts only under the motion gate and
 * never on the startup path: the Rexonance scroll engine
 * (src/lib/rexonance-resonance.js, mountRexonanceAssembly) with this form's
 * suit (src/lib/illusionculum-suit.ts, cut from the owner's cutouts by SAM's
 * masks) and its own differences, every one of them an opt-in option of the
 * engine, so Rexonance and FAR FROM play exactly as before:
 *
 * - the armour grows as a nanite skin (owner, 2026-11-11: 「ナノマシン感が
 *   全くない」; `generation`, src/lib/nanite-skin.ts): one liquid front from
 *   the reactor over the body, crystallising into hexagonal cells that click
 *   into the art — in place of the plates formed off the body and flown in
 *   (owner, 2026-10-23), the swarm, the gold pour and the field;
 * - `formChange`: the chain's changes drawn as this form's
 *   (src/lib/illusionculum-form-change.ts);
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

import {
  ASSEMBLY_BEATS,
  mountRexonanceAssembly,
  type RexonanceAssemblyConfig,
} from "./rexonance-resonance.js";
import { createNaniteSkinGeneration, type NaniteSkinStyle } from "./nanite-skin.ts";
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
  ILLUSIONCULUM_SUIT_SEAMS,
  ILLUSIONCULUM_SUIT_SIZE,
  ILLUSIONCULUM_SUIT_TILE,
  ILLUSIONCULUM_SUIT_UNDERSUIT,
} from "./illusionculum-suit.ts";
import { createIllusionculumFormChange } from "./illusionculum-form-change.ts";
import {
  createIllusionculumScrollAccents,
  illusionculumScrollAccentBudget,
} from "./illusionculum-scroll-accents.ts";
import { createIllusionculumImageLoader } from "./illusionculum-image-loader.js";
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
    [233, 184, 102],
  ],
  rings: ["rgb(166 230 255)", "rgb(169 131 255)", "rgb(233 184 102)"],
  reactorMotes: ["rgb(230 248 255)", "rgb(166 230 255)", "rgb(255 143 210)"],
  lightArms: ["rgb(166 230 255)", "rgb(255 143 210)"],
  coreGlow: ["rgb(240 250 255 / 0.9)", "rgb(166 230 255 / 0.45)", "rgb(169 131 255 / 0)"],
  field: {
    ice: [0.65, 0.9, 1],
    pink: [1, 0.56, 0.82],
    white: [0.94, 0.97, 1],
    leads: [
      [0.56, 0.8],
      [0.26, 0.74],
      [0.32, 0.52],
    ],
  },
  nanites: {
    tone: ["rgb(166 230 255)", "rgb(255 143 210)", "rgb(233 184 102)"],
    shade: ["rgb(22 52 78)", "rgb(78 34 62)", "rgb(74 56 24)"],
    touchTone: ["rgb(200 240 255)", "rgb(255 190 228)", "rgb(255 226 168)"],
    touchShade: ["rgb(34 66 92)", "rgb(92 44 74)", "rgb(90 70 34)"],
    // The kit's rows: ice, pink, gold (the white row is never drawn here).
    toneRows: [0, 1, 3],
  },
} as const satisfies NonNullable<RexonanceAssemblyConfig["palette"]>);

/** This form's nanite skin (nanite-skin.ts; owner, 2026-11-11): violet
 * steel under ice light, hexagonal cells, pink droplets. */
export const ILLUSIONCULUM_SKIN_STYLE: NaniteSkinStyle = Object.freeze({
  steel: "rgb(24 22 40)",
  steelAlpha: 0.84,
  line: "rgb(166 230 255)",
  glint: [232, 246, 255] as const,
  motes: ["rgb(150 160 196)", "rgb(255 143 210)", "rgb(240 250 255)"] as const,
  cell: 7,
  triangles: false,
});

/** The scene's config: this suit in the Rexonance engine's terms. */
export function illusionculumAssemblyConfig(): RexonanceAssemblyConfig {
  const formChange = createIllusionculumFormChange({
    size: ILLUSIONCULUM_SUIT_SIZE,
    core: ILLUSIONCULUM_SUIT_MARKS.core,
    orbs: ILLUSIONCULUM_SUIT_ORBS,
    orbForms: ["more", "ultraMore"],
    ultraForms: ["ultra", "ultraMore"],
  });
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
    driverFront: true,
    atlas: ILLUSIONCULUM_SUIT_ATLAS.src,
    palette: ILLUSIONCULUM_PALETTE,
    formChange,
    // The armour grows as a nanite skin from the reactor (owner,
    // 2026-11-11); the changes of form stay this form's own. No swarm kit
    // and no gold atlas: the skin draws the art itself.
    generation: createNaniteSkinGeneration({
      style: ILLUSIONCULUM_SKIN_STYLE,
      beats: ASSEMBLY_BEATS,
      changes: formChange,
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
  options: { entry?: boolean; progress?: () => number } = {},
): () => void {
  const entry = Boolean(options.entry);
  const config = illusionculumAssemblyConfig();
  const compact = environment.matchMedia("(any-pointer: coarse), (max-width: 767px)").matches;
  const loader = compact || entry ? createIllusionculumImageLoader(environment) : null;
  if (loader) config.loadImage = loader.load;
  // Prepare in short yielding tasks on phones, instead of waiting for
  // separate idle windows for each phase of the page's suit-up.
  config.eager = compact || entry;
  config.progress = options.progress;
  // The accents round the skin (illusionculum-scroll-accents.ts): the vortex
  // of motes, each group's seams traced and locked as the skin makes it
  // whole, the seal's bloom. They never move the figure (owner, 2026-11-03),
  // on the scroll and — since the armour is no longer thrown on plate by
  // plate (owner, 2026-11-11) — on the entry too.
  config.accents = createIllusionculumScrollAccents({
    size: ILLUSIONCULUM_SUIT_SIZE,
    pieces: ILLUSIONCULUM_SUIT_PIECES,
    core: ILLUSIONCULUM_SUIT_MARKS.core,
    seams: ILLUSIONCULUM_SUIT_SEAMS,
    budget: illusionculumScrollAccentBudget(environment, { compact, entry }),
  });
  if (compact) config.prewarm = !entry;
  try {
    const dispose = mountRexonanceAssembly(runway, config, environment);
    return () => {
      loader?.dispose();
      dispose();
    };
  } catch (error) {
    loader?.dispose();
    throw error;
  }
}
