import type { HenshinFigure } from "./rexonance-henshin";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "./rexonance-suit";

/** Rexonance's figure for the bank's direction (rexonance-henshin.ts): its
 * plates' boxes by group, and the core, the visor and the driver. */
export const REXONANCE_HENSHIN_FIGURE: HenshinFigure = {
  size: REXONANCE_SUIT_SIZE,
  pieces: REXONANCE_SUIT_PIECES,
  core: REXONANCE_SUIT_MARKS.core as unknown as readonly [number, number],
  visor: REXONANCE_SUIT_MARKS.visor as unknown as readonly [number, number],
  belt: REXONANCE_SUIT_MARKS.belt as unknown as readonly [number, number],
};
