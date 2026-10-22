/* FAR FROM SAGA — the ウルトラ sequence's nanite kit (2026-10-22).

   The owner's ウルトラ uses nanites of its own, a third kind beside the
   Rexonance swarm's (kit A) and the #suitup runway's (kit B): kit C,
   src/lib/far-from-nanites-ultra.ts — the Ultra unit rendered in Blender in
   kit A's exact sheet layout (FAR_FROM_ULTRA_NANITE_CELLS and _COMETS, under
   public/far-from-nanites-ultra-20261022/). Kit C has no effects sheet of
   its own: kit A's scan plane serves the white front.

   This module is the one place the sequence reads the kit from. Imported
   only by the scene's chunk, never on the page's startup path. */
import {
  FAR_FROM_ULTRA_NANITE_CELLS,
  FAR_FROM_ULTRA_NANITE_COMETS,
} from "./far-from-nanites-ultra.ts";
import { REXONANCE_NANITE_FX } from "./rexonance-nanites.ts";

/** A chip sheet's layout (the contract kits A, B and C meet). */
export type FarFromUltraCells = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly frames: number;
  readonly lockFrame: number;
  readonly tones: Readonly<Record<string, number>>;
  readonly mip: {
    readonly cell: number;
    readonly x: readonly number[];
    readonly y: readonly number[];
  };
  readonly spark: { readonly x: number; readonly y: number; readonly frames: number };
  /** The unit squaring into a lit data tile, tones 0–2: (x[t] + cell·k, y), k 0–frames−1. */
  readonly unfold: { readonly y: number; readonly frames: number; readonly x: readonly number[] };
  /** The unit defocused, for depth. */
  readonly bokeh: { readonly x: readonly number[]; readonly y: readonly number[] };
};

export type FarFromUltraComets = {
  readonly src: string;
  readonly cell: number;
  readonly angles: number;
  readonly step: number;
  readonly rows: Readonly<Record<string, number>>;
  readonly tail: readonly number[];
  readonly head: readonly [number, number];
};

export type FarFromUltraFx = {
  readonly src: string;
  readonly scan: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly edgeY: number;
  };
};

export type FarFromUltraKit = {
  readonly cells: FarFromUltraCells;
  readonly comets: FarFromUltraComets;
  readonly fx: FarFromUltraFx;
  /** The chip tones the sequence draws (names in cells.tones): most chips
   * the main tone, every third the accent. */
  readonly tones: { readonly main: string; readonly accent: string };
  /** The comets' row (a name in comets.rows). */
  readonly cometTone: string;
  /** The files to fetch: the cells, the comets, the effects, in that order. */
  readonly assets: readonly string[];
};

/** The kit the sequence draws from: kit C's white and aqua units, its aqua
 * data streaks (kit A's "ice" row slot), kit A's effects. */
export const FAR_FROM_ULTRA_KIT: FarFromUltraKit = {
  cells: FAR_FROM_ULTRA_NANITE_CELLS,
  comets: FAR_FROM_ULTRA_NANITE_COMETS,
  fx: REXONANCE_NANITE_FX,
  tones: { main: "white", accent: "aqua" },
  cometTone: "ice",
  assets: [
    FAR_FROM_ULTRA_NANITE_CELLS.src,
    FAR_FROM_ULTRA_NANITE_COMETS.src,
    REXONANCE_NANITE_FX.src,
  ],
};
