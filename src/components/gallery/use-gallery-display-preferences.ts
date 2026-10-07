import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_GALLERY_DISPLAY,
  GALLERY_DISPLAY_KEY,
  parseGalleryDisplayPreferences,
  readGalleryDisplayPreferences,
  resetGalleryDisplayPreferences,
  updateGalleryDisplayPreferences,
  type GalleryDisplayPreferences,
} from "./gallery-display-preferences";

function browserDisplayStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function useGalleryDisplayPreferences() {
  // SSR and hydration share the same first render; never write defaults on mount.
  const [preferences, setPreferences] =
    useState<GalleryDisplayPreferences>(DEFAULT_GALLERY_DISPLAY);
  const currentRef = useRef<GalleryDisplayPreferences>(DEFAULT_GALLERY_DISPLAY);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const storage = browserDisplayStorage();
    try {
      if (!storage) throw new Error("Display storage unavailable");
      const saved = readGalleryDisplayPreferences(storage);
      currentRef.current = saved;
      setPreferences(saved);
    } catch {
      setError("保存済みの表示設定を読み込めません。変更はこの画面に反映できます。");
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== GALLERY_DISPLAY_KEY && event.key !== null) return;
      if (!storage || event.storageArea !== storage) return;
      const next = parseGalleryDisplayPreferences(event.key === null ? null : event.newValue);
      if (
        next.density === currentRef.current.density &&
        next.background === currentRef.current.background
      )
        return;
      currentRef.current = next;
      setPreferences(next);
      setError("");
      setStatus("別のタブで変更した表示設定を反映しました。");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<GalleryDisplayPreferences>) => {
    const result = updateGalleryDisplayPreferences(
      browserDisplayStorage(),
      currentRef.current,
      patch,
    );
    currentRef.current = result.preferences;
    setPreferences(result.preferences);
    setStatus(result.saved ? "表示設定をこのブラウザーに保存しました。" : "");
    setError(result.saved ? "" : "この画面には反映しましたが、表示設定を保存できませんでした。");
  }, []);

  const reset = useCallback(() => {
    const result = resetGalleryDisplayPreferences(browserDisplayStorage());
    currentRef.current = result.preferences;
    setPreferences(result.preferences);
    setStatus(result.saved ? "表示設定を標準に戻しました。" : "");
    setError(
      result.saved ? "" : "この画面は標準に戻しましたが、保存済みの設定を削除できませんでした。",
    );
  }, []);

  return { preferences, update, reset, status, error };
}
