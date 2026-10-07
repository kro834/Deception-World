import { useEffect, useRef, useState } from "react";
import { galleryArtworkShareUrl } from "./gallery-artwork-link";

export function GalleryShareControl({ id, disabled }: { id: string; disabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "fallback">("idle");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const activeRef = useRef(true);
  const copyingRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const copy = async () => {
    if (copyingRef.current || disabled) return;
    const url = galleryArtworkShareUrl(window.location.origin, id);
    copyingRef.current = true;
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      if (activeRef.current) {
        setFallbackUrl("");
        setStatus("copied");
      }
    } catch {
      if (activeRef.current) {
        setFallbackUrl(url);
        setStatus("fallback");
      }
    } finally {
      copyingRef.current = false;
    }
  };

  return (
    <div className="gallery-share-control">
      <button
        type="button"
        className="gallery-viewer-close"
        disabled={disabled}
        aria-disabled={status === "copying" || undefined}
        onClick={() => void copy()}
      >
        {status === "copying" ? "コピー中…" : "作品リンクをコピー"}
      </button>
      {status === "copied" && (
        <p className="gallery-storage-note" role="status">
          作品リンクをコピーしました。開くとこの作品から鑑賞できます。
        </p>
      )}
      {status === "fallback" && (
        <div>
          <p className="gallery-storage-note" role="status">
            自動コピーを利用できません。下のリンクを選択してコピーしてください。
          </p>
          <label className="gallery-share-url">
            この作品のリンク
            <input
              type="text"
              readOnly
              value={fallbackUrl}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
          </label>
        </div>
      )}
    </div>
  );
}
