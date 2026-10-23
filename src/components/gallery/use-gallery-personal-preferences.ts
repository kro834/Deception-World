import { useCallback, useEffect, useRef, useState } from "react";
import { GALLERY_FAVORITES_KEY } from "./gallery-discovery";
import { GALLERY_FEATURE_KEY } from "./gallery-feature";
import {
  changeGalleryPersonalFavorite,
  changeGalleryPersonalFeature,
  createGalleryPersonalPreferences,
  readGalleryPersonalPreferences,
} from "./gallery-personal-preferences";

function browserPersonalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function useGalleryPersonalPreferences(artworkIds: readonly string[]) {
  const [preferences, setPreferences] = useState(createGalleryPersonalPreferences);
  const currentRef = useRef(preferences);

  useEffect(() => {
    const load = (key: string | null = null) => {
      const next = readGalleryPersonalPreferences(
        browserPersonalStorage(),
        currentRef.current,
        artworkIds,
        key,
      );
      currentRef.current = next;
      setPreferences(next);
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== GALLERY_FAVORITES_KEY &&
        event.key !== GALLERY_FEATURE_KEY
      )
        return;
      const storage = browserPersonalStorage();
      if (!storage || event.storageArea !== storage) return;
      // Read the latest value: queued storage events can describe an older write.
      load(event.key);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [artworkIds]);

  const changeFavorite = useCallback(
    (id: string) => {
      const next = changeGalleryPersonalFavorite(
        browserPersonalStorage(),
        currentRef.current,
        id,
        artworkIds,
      );
      // Update synchronously so repeated actions do not depend on a completed render.
      currentRef.current = next;
      setPreferences(next);
    },
    [artworkIds],
  );
  const changeFeature = useCallback(
    (id: string | null) => {
      const next = changeGalleryPersonalFeature(
        browserPersonalStorage(),
        currentRef.current,
        id,
        artworkIds,
      );
      currentRef.current = next;
      setPreferences(next);
    },
    [artworkIds],
  );

  return {
    favorites: preferences.favorites,
    featuredId: preferences.featuredId,
    favoriteStatus: preferences.favoriteStatus,
    favoriteError: preferences.favoriteError,
    featureStatus: preferences.featureStatus,
    featureError: preferences.featureError,
    changeFavorite,
    changeFeature,
  };
}
