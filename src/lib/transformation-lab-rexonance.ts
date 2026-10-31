import type { RexonanceAssemblyConfig } from "./rexonance-resonance.js";
import * as suit from "./rexonance-suit";
import { REXONANCE_SUIT_BASE, REXONANCE_SUIT_ORNAMENTS } from "./rexonance-suit-base";
import { REXONANCE_SUIT_DRIVER } from "./rexonance-calls";
import { REXONANCE_FORM_FIGURES, REXONANCE_FORM_PAD } from "./rexonance-forms";
import { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } from "./rexonance-suit-gold";
const {
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_UNDERSUIT,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_FACE_GLOW,
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
} = suit;
export function rexonanceLabConfig(): RexonanceAssemblyConfig {
  return {
    forms: { ...REXONANCE_FORM_FIGURES, pad: REXONANCE_FORM_PAD },
    figure: REXONANCE_SUIT_FIGURE,
    // The armour assembles whole from the figure without its ornaments; the
    // tail and ribbons then form over it (owner, 2026-10-16).
    base: REXONANCE_SUIT_BASE,
    ornaments: REXONANCE_SUIT_ORNAMENTS,
    undersuit: REXONANCE_SUIT_UNDERSUIT,
    size: REXONANCE_SUIT_SIZE,
    maskTile: REXONANCE_SUIT_TILE,
    pieces: REXONANCE_SUIT_PIECES.map(({ id, group, x, y, w, h, seat, tiles, ax, ay }) => ({
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
      // The driver is on the body, finished, from the start (owner).
      preset: REXONANCE_SUIT_DRIVER.includes(id),
    })),
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    glow: REXONANCE_SUIT_FACE_GLOW,
    // The gold forms by nanites right after each plate seats (owner), as in the call.
    atlas: REXONANCE_SUIT_ATLAS.src,
    gold: {
      atlas: REXONANCE_SUIT_GOLD_ATLAS.src,
      cell: REXONANCE_SUIT_GOLD_CELL,
      cells: REXONANCE_SUIT_GOLD_CELLS,
    },
    // The nanite kit (owner, 2026-10-16: 超大幅な改善): Blender hex chips,
    // comets, clamps, latches, scan planes, droplets, shock rings, the gold
    // guideway conduit, and each plate's real outline and gold box — loaded
    // with the scene's pictures (round 3), never by the still tiers.
    nanites: () => import("@/lib/rexonance-nanites").then((module) => module.REXONANCE_NANITES),
  };
}
