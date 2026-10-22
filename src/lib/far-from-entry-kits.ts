import { REXONANCE_NANITE_CELLS } from "./rexonance-nanites";
import { FAR_FROM_NANITE_CELLS } from "./far-from-nanites";

/* FAR FROM SAGA's two nanite kinds (owner, 2026-10-22: 「ナノマシンが別の
   ものも使う様になり、二種類使う」). Every chip of the entry's swarm carries a
   kit index, and both kits are drawn through one sprite path from sheets of
   the same layout contract (REXONANCE_NANITE_CELLS: 24-frame tumbles by
   tone, a 16 px mip, the unfold, bokeh, bead and spark cells).

   Kit A is Rexonance's hex kit (src/lib/rexonance-nanites.ts); kit B is the
   Blender crystal nanite (src/lib/far-from-nanites.ts), laid out as kit A. */
export type FarFromNaniteKit = Omit<typeof REXONANCE_NANITE_CELLS, "src"> & {
  readonly src: string;
};

/** Kit A (the hex chip), kit B (the crystal). */
export const FAR_FROM_ENTRY_KITS: readonly [FarFromNaniteKit, FarFromNaniteKit] = [
  REXONANCE_NANITE_CELLS,
  FAR_FROM_NANITE_CELLS,
];
/** True while kit B is Rexonance's kit standing in (it is not). */
export const FAR_FROM_ENTRY_KIT_B_STANDIN = FAR_FROM_ENTRY_KITS[0] === FAR_FROM_ENTRY_KITS[1];
/** The kits' sheets to fetch (each once). */
export const FAR_FROM_ENTRY_KIT_ASSETS: readonly string[] = [
  ...new Set(FAR_FROM_ENTRY_KITS.map((kit) => kit.src)),
];
/** The share of the swarm that is kit B (the rest kit A), by hash. */
export const FAR_FROM_ENTRY_KIT_B_SHARE = 0.5;
