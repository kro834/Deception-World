import {
  GALLERY_FAVORITES_KEY,
  readGalleryFavorites,
  type GalleryFavorites,
} from "./gallery-discovery.ts";
import {
  GALLERY_FEATURE_KEY,
  readGalleryFeature,
  saveGalleryFeature,
} from "./gallery-feature.ts";

type PersonalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type GalleryPersonalPreferences = {
  favorites: GalleryFavorites;
  favoriteIntents: Readonly<Record<string, boolean>>;
  favoriteStatus: string;
  favoriteError: string;
  featuredId: string | null;
  featurePending: boolean;
  featureStatus: string;
  featureError: string;
};

const FAVORITE_UNSAVED =
  "お気に入りはこの画面に反映しましたが、保存できませんでした。再読み込みすると変更が失われる場合があります。";
const FEATURE_UNSAVED =
  "トップ作品はこの画面に反映しましたが、保存できませんでした。再読み込みすると変更が失われる場合があります。";

export function createGalleryPersonalPreferences(): GalleryPersonalPreferences {
  return {
    favorites: [],
    favoriteIntents: {},
    favoriteStatus: "",
    favoriteError: "",
    featuredId: null,
    featurePending: false,
    featureStatus: "",
    featureError: "",
  };
}

function applyFavoriteIntents(
  favorites: GalleryFavorites,
  intents: GalleryPersonalPreferences["favoriteIntents"],
): GalleryFavorites {
  const next = new Set(favorites);
  for (const [id, wanted] of Object.entries(intents)) {
    if (wanted) next.add(id);
    else next.delete(id);
  }
  return [...next];
}

/** Read only the changed key; an external update never discards unsaved local choices. */
export function readGalleryPersonalPreferences(
  storage: PersonalStorage | undefined,
  current: GalleryPersonalPreferences,
  artworkIds: readonly string[],
  key: string | null = null,
): GalleryPersonalPreferences {
  let next = { ...current };
  if (key === null || key === GALLERY_FAVORITES_KEY) {
    try {
      if (!storage) throw new Error("Personal storage unavailable");
      const favorites = applyFavoriteIntents(
        readGalleryFavorites(storage, artworkIds, true),
        current.favoriteIntents,
      );
      next = {
        ...next,
        favorites,
        favoriteStatus:
          favorites.length !== current.favorites.length ||
          favorites.some((id, index) => id !== current.favorites[index])
            ? ""
            : current.favoriteStatus,
        favoriteError: Object.keys(current.favoriteIntents).length ? FAVORITE_UNSAVED : "",
      };
    } catch {
      next.favoriteStatus = "";
      next.favoriteError = Object.keys(current.favoriteIntents).length
        ? FAVORITE_UNSAVED
        : "保存済みのお気に入りを読み込めません。変更はこの画面に反映できます。";
    }
  }
  if ((key === null || key === GALLERY_FEATURE_KEY) && !current.featurePending) {
    try {
      if (!storage) throw new Error("Personal storage unavailable");
      const featuredId = readGalleryFeature(storage, artworkIds);
      next = {
        ...next,
        featuredId,
        featureStatus:
          featuredId !== current.featuredId
            ? "保存済みのトップ作品を反映しました。"
            : current.featureStatus,
        featureError: "",
      };
    } catch {
      next.featureStatus = "";
      next.featureError = "保存済みのトップ作品を読み込めません。変更はこの画面に反映できます。";
    }
  }
  return next;
}

/** Merge local membership intents into the latest persisted list before writing. */
export function changeGalleryPersonalFavorite(
  storage: PersonalStorage | undefined,
  current: GalleryPersonalPreferences,
  id: string,
  artworkIds: readonly string[],
): GalleryPersonalPreferences {
  if (!artworkIds.includes(id)) {
    return {
      ...current,
      favoriteStatus: "",
      favoriteError: "作品を確認できないため、お気に入りを変更できませんでした。",
    };
  }
  let readable = false;
  let base = current.favorites;
  try {
    if (storage) {
      base = applyFavoriteIntents(
        readGalleryFavorites(storage, artworkIds, true),
        current.favoriteIntents,
      );
      readable = true;
    }
  } catch {
    // Without a successful read, writing a fallback list could erase saved favorites.
  }
  const favoriteIntents = { ...current.favoriteIntents, [id]: !base.includes(id) };
  const favorites = applyFavoriteIntents(base, favoriteIntents);
  try {
    if (!storage || !readable) throw new Error("Personal storage unavailable");
    storage.setItem(GALLERY_FAVORITES_KEY, JSON.stringify(favorites));
    return {
      ...current,
      favorites,
      favoriteIntents: {},
      favoriteStatus: "お気に入りをこのブラウザーに保存しました。",
      favoriteError: "",
    };
  } catch {
    return {
      ...current,
      favorites,
      favoriteIntents,
      favoriteStatus: "",
      favoriteError: FAVORITE_UNSAVED,
    };
  }
}

export function changeGalleryPersonalFeature(
  storage: PersonalStorage | undefined,
  current: GalleryPersonalPreferences,
  id: string | null,
  artworkIds: readonly string[],
): GalleryPersonalPreferences {
  if (id !== null && !artworkIds.includes(id)) {
    return {
      ...current,
      featureStatus: "",
      featureError: "作品を確認できないため、トップ作品を変更できませんでした。",
    };
  }
  try {
    if (!storage) throw new Error("Personal storage unavailable");
    saveGalleryFeature(storage, id, artworkIds);
    return {
      ...current,
      featuredId: id,
      featurePending: false,
      featureStatus: id
        ? "トップ作品を保存しました。自分の表示だけに反映されます。"
        : "トップ作品を初期設定に戻しました。",
      featureError: "",
    };
  } catch {
    return {
      ...current,
      featuredId: id,
      featurePending: true,
      featureStatus: "",
      featureError: FEATURE_UNSAVED,
    };
  }
}
