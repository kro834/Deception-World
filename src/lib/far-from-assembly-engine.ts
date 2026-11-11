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
 * - the armour grows as a nanite skin (owner, 2026-11-11: 「ナノマシン感が
 *   全くない」; `generation`, src/lib/nanite-skin.ts): one liquid front
 *   leaves the reactor and runs over the body — chest, waist, arms, legs,
 *   then the parts off the body and the helmet — and behind it the surface
 *   crystallises into a mesh of triangles (the wireframe this page's armour
 *   was generated as; owner, 2026-10-23) whose cells click into the art, in
 *   place of Rexonance's swarm, plates, gold pour and field;
 * - the reactor completes like the compound eyes (owner): its rim forms
 *   first, a wire ring with the chest's crystal, then on FAR FROM DEUS！
 *   pixel squares fill the crystal and scatter (`reactorGlow`); the crystal
 *   never turns as Rexonance's coil (`reactorRadius` 0, plate ids of its own);
 * - after the seal the suit-up runs the chain of forms up to the one chosen
 *   in the selector after the runway (the runway's data-form, as on the
 *   Rexonance page; owner, 2026-10-23): ハイ → エックスハイ → マックス →
 *   ウルトラ, each form overwriting the last with cells from the core out.
 *   ウルトラ goes through マックス and overwrites it twice — the owner's body
 *   (white, with its added parts), then the owner's figure with its
 *   auxiliary interfaces; each change is the same front from the reactor
 *   out. ミドル ("standard") stops on the base figure;
 * - the 光輪 open behind the figure as the output ignites
 *   (src/lib/far-from-assembly-accents.ts).
 *
 * The same wearer: the undersuit, the bare head and the uninstalled reactor
 * are Rexonance's, composited into this frame by the build
 * (scripts/build-far-from-suit.mjs). The fire is the shared body fire with
 * its end tone gold (`fireTone`, rexonance-fire/fire-tuning.js FIRE_TONES).
 */

import {
  ASSEMBLY_BEATS,
  mountRexonanceAssembly,
  type RexonanceAssemblyConfig,
} from "./rexonance-resonance.js";
import {
  FAR_FROM_SUIT_ATLAS,
  FAR_FROM_SUIT_DRIVER,
  FAR_FROM_SUIT_FACE_GLOW,
  FAR_FROM_SUIT_FIGURE,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_MARKS,
  FAR_FROM_SUIT_ORNAMENTS,
  FAR_FROM_SUIT_PIECES,
  FAR_FROM_SUIT_REACTOR_GLOW,
  FAR_FROM_SUIT_SIZE,
  FAR_FROM_SUIT_TILE,
  FAR_FROM_SUIT_UNDERSUIT,
} from "./far-from-suit.ts";
import { farFromAccents } from "./far-from-assembly-accents.ts";
import { farFromUltraSrc } from "./far-from-ultra-art.ts";
import {
  FAR_FROM_SHIFT,
  createFarFromFormShift,
  type FarFromShiftBeats,
  type FarFromShiftFrame,
} from "./far-from-form-shift.ts";
import { drawFarFromSettle } from "./far-from-form-settle.ts";
import { createNaniteSkinGeneration, type NaniteSkinLayer } from "./nanite-skin.ts";
import { FAR_FROM_SKIN_STYLE } from "./far-from-skin-style.ts";

/** The stages' lights, as the record's accents (final-stage-data.ts). */
export const FAR_FROM_FORM_TONES = Object.freeze({
  high: "#ffd77a",
  xhigh: "#ff6f8d",
  max: "#c99bff",
  "ultra-body": "#f4fbff",
  ultra: "#9cf1ff",
});

/** The forms the suit-up runs through after the seal, in order, up to the
 * runway's data-form (the selector's choice). "ultra-body" is ウルトラ's
 * first overwrite (never chosen by itself): the white body and its added
 * parts, before the interfaces of "ultra". */
export const FAR_FROM_FORM_CHAIN = Object.freeze([
  "high",
  "xhigh",
  "max",
  "ultra-body",
  "ultra",
] as const);

/** ウルトラ's two sheets, the owner's cutouts on the same 1024 × 1536 grid as
 * the suit's forms (far-from-ultra-art.ts). The 768 delivery is enough: the
 * scene's sheets are figure-sized (693 × 1040). */
export const FAR_FROM_ULTRA_FORMS = Object.freeze({
  "ultra-body": farFromUltraSrc("body", 768),
  ultra: farFromUltraSrc("interface", 768),
});

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

/** The reactor's radius in figure px: none (owner, 2026-10-23). FAR FROM's
 * reactor is the chest's crystal, a chest plate landing with the rest; the
 * engine's round disc (the undersuit's Rexonance socket drawn over the chest
 * until the coil forms) is Rexonance's alone. The crystal still completes by
 * pixel squares on the last call (reactorGlow). */
export const FAR_FROM_REACTOR_RADIUS = 0;

/** The fire ends gold (owner: 「炎は最終的に金色になります」): the shared
 * fire's end tone, rexonance-fire/fire-tuning.js FIRE_TONES.gold. */
export const FAR_FROM_FIRE_TONE = 1;

// The scene's skin, lent to the form change while the scene is mounted.
let farFromSkin: NaniteSkinLayer | null = null;

/** The armour's generation: the nanite skin growing from the reactor. */
export const farFromSkinGeneration = createNaniteSkinGeneration({
  style: FAR_FROM_SKIN_STYLE,
  beats: ASSEMBLY_BEATS,
  onLayer(layer) {
    farFromSkin = layer;
  },
});

/** The form change (owner, 2026-11-11; far-from-form-shift.ts): its clock,
 * the armour flowing back into the reactor (the skin's `retract`: the
 * picture on the canvas held with one copy, nothing read back) and the
 * finished form's flash, as the engine's `formShift` kit. A form's path
 * through the chain is its place in it (ミドル, "standard", has none). */
export const farFromFormShiftKit = Object.freeze({
  visible: FAR_FROM_SHIFT.visible,
  create(input: {
    document: Document;
    size: { readonly width: number; readonly height: number };
    core: readonly [number, number];
    coarse: boolean;
    undersuit: CanvasImageSource;
    beats: FarFromShiftBeats;
  }) {
    const chain: readonly string[] = FAR_FROM_FORM_CHAIN;
    const tones: Readonly<Record<string, string>> = FAR_FROM_FORM_TONES;
    const machine = createFarFromFormShift({
      beats: input.beats,
      steps: (form) => chain.indexOf(form) + 1,
    });
    let tone: string = FAR_FROM_PALETTE.nanites.tone[0];
    return {
      get active() {
        return machine.active;
      },
      get phase() {
        return machine.phase;
      },
      request: machine.request,
      frame: machine.frame,
      cancel: machine.cancel,
      capture(canvas: CanvasImageSource, vs: number, vx: number, vy: number) {
        return Boolean(farFromSkin?.hold(canvas, vs, vx, vy));
      },
      paint(
        context: CanvasRenderingContext2D,
        frame: { readonly progress: number },
        canvas: CanvasImageSource,
        vs: number,
        vx: number,
        vy: number,
        ratio: number,
      ) {
        const state = frame as FarFromShiftFrame;
        const px = ratio / Math.max(1e-6, vs);
        context.setTransform(vs, 0, 0, vs, vx, vy);
        if (state.mist >= 0 && state.mist < 1) farFromSkin?.retract(context, state.mist, vs, ratio);
        if (state.settle >= 0) {
          tone = tones[machine.target] ?? tone;
          drawFarFromSettle(context, canvas, state.settle, input.size, input.core, tone, px);
        }
      },
      release() {
        machine.cancel();
      },
    };
  },
});

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
    fireTone: FAR_FROM_FIRE_TONE,
    atlas: FAR_FROM_SUIT_ATLAS.src,
    palette: FAR_FROM_PALETTE,
    accents: farFromAccents,
    // The armour grows as a nanite skin from the reactor (owner,
    // 2026-11-11), its cells the triangles of the wireframe. No swarm kit and
    // no gold atlas: the skin draws the art itself, so neither is fetched.
    generation: farFromSkinGeneration,
    formShift: farFromFormShiftKit,
    forms: {
      chain: FAR_FROM_FORM_CHAIN,
      tones: FAR_FROM_FORM_TONES,
      ...FAR_FROM_SUIT_FORMS,
      ...FAR_FROM_ULTRA_FORMS,
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
