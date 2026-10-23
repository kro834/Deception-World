// The Rexonance base figure (owner, 2026-10-16): the art without its
// ornaments (no tail, no ribbons), in the suit figure's frame, cut by
// scripts/build-rexonance-base.mjs from design/rexonance-suit/
// rexonance-base-20261016.jpg. The scroll suit-up assembles the armour whole
// from it; the ornaments then form over the armour from the full art.
export const REXONANCE_SUIT_BASE = "/rexonance-suit-base-20261023/base.webp";

/** The piece groups that are ornaments: formed over the finished armour. */
export const REXONANCE_SUIT_ORNAMENTS: readonly string[] = ["tail", "ribbon"];
