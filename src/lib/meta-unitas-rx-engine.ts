/** META UNITAS SAGA — the scroll suit-up's engine chunk (2026-10-23).
 *
 * Owner: 「メタ・ウニタスはレクソナンスと同じ装着です」. The Rexonance scroll
 * engine (src/lib/rexonance-resonance.js, mountRexonanceAssembly) plays Meta
 * Unitas' suit (src/lib/meta-unitas-rx-suit.ts, built by
 * scripts/build-meta-unitas-rx-suit.mjs from SAM's cut of the owner's ミドル):
 * the undersuit scanned, the fire engulfing it, the seal, the ignition, the
 * helix and the eyes filling with pixel squares, then ウルトラ (the owner's
 * cutout, the same frame) taking it over from the core out when the selector
 * chose it. Since 2026-11-11 (owner: 「ナノマシン感が全くない」) the armour
 * itself grows as a nanite skin from the reactor (`generation`,
 * src/lib/nanite-skin.ts), in place of the swarm and its plates. Only the
 * engine's own options are passed: Rexonance plays exactly as before.
 */

import {
  ASSEMBLY_BEATS,
  mountRexonanceAssembly,
  type RexonanceAssemblyConfig,
} from "./rexonance-resonance.js";
import { createNaniteSkinGeneration, type NaniteSkinStyle } from "./nanite-skin.ts";
import {
  META_UNITAS_RX_ATLAS,
  META_UNITAS_RX_DRIVER,
  META_UNITAS_RX_FACE_GLOW,
  META_UNITAS_RX_FIGURE,
  META_UNITAS_RX_FORMS,
  META_UNITAS_RX_MARKS,
  META_UNITAS_RX_ORNAMENTS,
  META_UNITAS_RX_PIECES,
  META_UNITAS_RX_REACTOR_GLOW,
  META_UNITAS_RX_SIZE,
  META_UNITAS_RX_TILE,
  META_UNITAS_RX_UNDERSUIT,
} from "./meta-unitas-rx-suit.ts";
import { farFromAccents, farFromStillAccents } from "./far-from-assembly-accents.ts";
import { mountMetaUnitasBoost } from "./meta-unitas-boost.ts";
import {
  META_UNITAS_HENSHIN_PALETTE,
  mountHenshinDirector,
  type HenshinFigure,
} from "./rexonance-henshin.ts";

/** The bank's direction cuts to its parts in the plan's order (legs, arms,
 * chest, waist); the nanite skin makes them whole out from the reactor
 * (chest, waist, arms, legs). Each piece is handed to the director under
 * the group whose beat it is whole on, so the camera and the lock follow
 * the armour (rexonance-henshin.ts is shared and untouched). */
const HENSHIN_GROUP: Readonly<Record<string, string>> = {
  chest: "legs",
  shoulders: "legs",
  waist: "arms",
  arms: "chest",
  legs: "waist",
};

/** Meta Unitas' figure for the bank's direction (rexonance-henshin.ts). */
export const META_UNITAS_HENSHIN_FIGURE: HenshinFigure = {
  size: META_UNITAS_RX_SIZE,
  pieces: META_UNITAS_RX_PIECES.map((piece) => ({
    ...piece,
    group: HENSHIN_GROUP[piece.group] ?? piece.group,
  })),
  core: META_UNITAS_RX_MARKS.core as unknown as readonly [number, number],
  visor: META_UNITAS_RX_MARKS.visor as unknown as readonly [number, number],
  belt: META_UNITAS_RX_MARKS.belt as unknown as readonly [number, number],
};

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

/** Meta Unitas' nanite skin (nanite-skin.ts; owner, 2026-11-11): dark teal
 * steel under its scale's light, hexagonal cells. */
export const META_UNITAS_SKIN_STYLE: NaniteSkinStyle = Object.freeze({
  steel: "rgb(16 30 34)",
  steelAlpha: 0.84,
  line: "rgb(120 226 220)",
  glint: [226, 252, 248] as const,
  motes: ["rgb(140 176 178)", "rgb(255 170 96)", "rgb(244 248 250)"] as const,
  cell: 7,
  triangles: false,
});

/** The armour's generation: the nanite skin growing from the reactor. */
export const metaUnitasSkinGeneration = createNaniteSkinGeneration({
  style: META_UNITAS_SKIN_STYLE,
  beats: ASSEMBLY_BEATS,
});

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
    // The driver stays in front of the plates built around it.
    driverFront: true,
    atlas: META_UNITAS_RX_ATLAS.src,
    palette: META_UNITAS_PALETTE,
    accents: farFromAccents,
    // The armour grows as a nanite skin from the reactor (owner,
    // 2026-11-11): no swarm kit and no gold atlas are fetched.
    generation: metaUnitasSkinGeneration,
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
  // The bank's direction (owner, 2026-11-01: 「装着アニメーションを大きく
  // 改善して」): the camera and the overlay on the entry's runway only. Owner
  // (2026-11-03): 「スクロール変身アニメーションは、もとの体がガタガタしないタイプに
  // もどして。」 — the page's scroll suit-up (#suitup) plays the engine on its
  // own clock and the boost's own steady camera, as before the bank.
  const director = runway.closest(".mus-entry")
    ? mountHenshinDirector(runway, {
        figure: META_UNITAS_HENSHIN_FIGURE,
        palette: META_UNITAS_HENSHIN_PALETTE,
        environment,
      })
    : null;
  const dispose = mountRexonanceAssembly(
    runway,
    {
      ...metaUnitasAssemblyConfig(),
      // The scroll's canvases move by the boost's camera alone (FAR FROM's
      // round-2 camera rode the shared accents and fought it, frame by frame).
      ...(director ? null : { accents: farFromStillAccents }),
      eager: options.eager,
      progress: director?.progress,
    },
    environment,
  );
  // The page's scroll suit-up rides the nanite boost (meta-unitas-boost.ts);
  // the entry (eager) mounts its own from its first frame.
  const disposeBoost = options.eager ? null : mountMetaUnitasBoost(runway, environment);
  return () => {
    disposeBoost?.();
    dispose();
    director?.dispose();
  };
}
