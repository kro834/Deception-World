export const GALLERY_DISPLAY_KEY = "deception-world.gallery-display.v1";

export type GalleryDensity = "standard" | "compact" | "spacious";
export type GalleryBackground = "ink" | "warm" | "light";
export type GalleryDisplayPreferences = {
  density: GalleryDensity;
  background: GalleryBackground;
};

export const DEFAULT_GALLERY_DISPLAY: Readonly<GalleryDisplayPreferences> = Object.freeze({
  density: "standard",
  background: "ink",
});

type DisplayStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type GalleryDisplaySaveResult = {
  preferences: GalleryDisplayPreferences;
  saved: boolean;
};

/** Local storage is input: recover each supported field without copying unknown data. */
export function normalizeGalleryDisplayPreferences(value: unknown): GalleryDisplayPreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    density:
      input.density === "compact" || input.density === "spacious"
        ? input.density
        : DEFAULT_GALLERY_DISPLAY.density,
    background:
      input.background === "warm" || input.background === "light"
        ? input.background
        : DEFAULT_GALLERY_DISPLAY.background,
  };
}

export function parseGalleryDisplayPreferences(raw: string | null): GalleryDisplayPreferences {
  if (!raw) return { ...DEFAULT_GALLERY_DISPLAY };
  try {
    return normalizeGalleryDisplayPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GALLERY_DISPLAY };
  }
}

export function readGalleryDisplayPreferences(
  storage: Pick<DisplayStorage, "getItem">,
): GalleryDisplayPreferences {
  return parseGalleryDisplayPreferences(storage.getItem(GALLERY_DISPLAY_KEY));
}

/** Keep the requested display usable even when storage is unavailable or full. */
export function updateGalleryDisplayPreferences(
  storage: Pick<DisplayStorage, "setItem"> | undefined,
  current: GalleryDisplayPreferences,
  patch: Partial<GalleryDisplayPreferences>,
): GalleryDisplaySaveResult {
  const preferences = normalizeGalleryDisplayPreferences({ ...current, ...patch });
  try {
    if (!storage) return { preferences, saved: false };
    storage.setItem(GALLERY_DISPLAY_KEY, JSON.stringify(preferences));
    return { preferences, saved: true };
  } catch {
    return { preferences, saved: false };
  }
}

export function resetGalleryDisplayPreferences(
  storage: Pick<DisplayStorage, "removeItem"> | undefined,
): GalleryDisplaySaveResult {
  const preferences = { ...DEFAULT_GALLERY_DISPLAY };
  try {
    if (!storage) return { preferences, saved: false };
    storage.removeItem(GALLERY_DISPLAY_KEY);
    return { preferences, saved: true };
  } catch {
    return { preferences, saved: false };
  }
}
