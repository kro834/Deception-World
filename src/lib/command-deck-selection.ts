const KEY = "dw-command-deck-selection-v1";
export type DeckSelection = { scene: number; artwork: number };
export function readDeckSelection(storage: Pick<Storage, "getItem">, counts: readonly number[]): DeckSelection | null {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!value || !Number.isInteger(value.scene) || !Number.isInteger(value.artwork) || value.scene < 0 || value.scene >= counts.length || value.artwork < 0 || value.artwork >= counts[value.scene]) return null;
    return { scene: value.scene, artwork: value.artwork };
  } catch { return null; }
}
export function saveDeckSelection(storage: Pick<Storage, "setItem">, selection: DeckSelection) {
  try { storage.setItem(KEY, JSON.stringify(selection)); } catch { /* Browsing remains available with storage disabled. */ }
}
