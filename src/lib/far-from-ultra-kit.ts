/* FAR FROM SAGA — the ウルトラ sequence's nanite kit (2026-10-22).

   The owner's ウルトラ uses nanites of its own, a third kind beside the
   Rexonance swarm's and the #suitup runway's. Their kit (Blender-rendered
   chips, comets and effects) lands as src/lib/far-from-nanites-ultra.ts:
   FAR_FROM_ULTRA_NANITE_CELLS and its siblings, on the same layout contract
   as REXONANCE_NANITE_CELLS / _COMETS / _FX (src/lib/rexonance-nanites.ts),
   with its sheets under public/far-from-nanites-ultra-20261022/.

   Until that module exists the Rexonance kit stands in, drawn in its white
   and ice tones only. This module is the one place the sequence reads the
   kit from: swap the imports here and nothing else changes. Imported only by
   the scene's chunk, never on the page's startup path. */
import {
  REXONANCE_NANITE_CELLS,
  REXONANCE_NANITE_COMETS,
  REXONANCE_NANITE_FX,
} from "./rexonance-nanites.ts";

/** A chip sheet's layout (the contract both kits meet). */
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
  /** The files to fetch (sheets). */
  readonly assets: readonly string[];
};

/** The kit the sequence draws from (stand-in: the Rexonance kit, white and ice). */
export const FAR_FROM_ULTRA_KIT: FarFromUltraKit = {
  cells: REXONANCE_NANITE_CELLS,
  comets: REXONANCE_NANITE_COMETS,
  fx: REXONANCE_NANITE_FX,
  tones: { main: "white", accent: "ice" },
  cometTone: "ice",
  assets: [REXONANCE_NANITE_CELLS.src, REXONANCE_NANITE_COMETS.src, REXONANCE_NANITE_FX.src],
};
