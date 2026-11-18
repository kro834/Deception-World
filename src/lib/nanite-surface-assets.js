/** Versioned Cycles turntables; all existing flight and unfold coordinates remain valid. */
export const NANITE_FORGE_SHEETS = Object.freeze({
  rexonance: "/nanite-forge-20261118/rexonance.webp",
  "far-from": "/nanite-forge-20261118/far-from.webp",
  illusionculum: "/nanite-forge-20261118/illusionculum.webp",
});
export const REXONANCE_CLASP_ATLAS = "/nanite-forge-20261118/rexonance-clasps.webp";
export const NANITE_FORGE_DELIVERIES = Object.freeze([
  ...Object.values(NANITE_FORGE_SHEETS),
  REXONANCE_CLASP_ATLAS,
  "/nanite-forge-20261118/provenance.json",
]);
export const NANITE_SURFACE_SOURCES = Object.freeze({
  "/rexonance-nanites-20261023/cells.webp": NANITE_FORGE_SHEETS.rexonance,
  "/far-from-nanites-20261022/cells.webp": NANITE_FORGE_SHEETS["far-from"],
  "/illusionculum-nanites-20261027/cells.webp": NANITE_FORGE_SHEETS.illusionculum,
});
export const refinedNaniteSource = (source) => NANITE_SURFACE_SOURCES[source] || source;

export function refinedNaniteKit(kit) {
  if (!kit) return kit;
  const sheet = (value) =>
    value && NANITE_SURFACE_SOURCES[value.src]
      ? { ...value, src: NANITE_SURFACE_SOURCES[value.src] }
      : value;
  return { ...kit, cells: sheet(kit.cells), cellsB: sheet(kit.cellsB) };
}
