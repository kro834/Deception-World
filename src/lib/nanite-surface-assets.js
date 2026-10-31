/** Material-only Blender re-renders. UV layout, alpha coverage and animation stay unchanged. */
export const NANITE_SURFACE_SOURCES = Object.freeze({
  "/rexonance-nanites-20261023/cells.webp": "/nanite-surface-20261031/rexonance.webp",
  "/far-from-nanites-20261022/cells.webp": "/nanite-surface-20261031/far-from.webp",
  "/illusionculum-nanites-20261027/cells.webp": "/nanite-surface-20261031/illusionculum.webp",
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
