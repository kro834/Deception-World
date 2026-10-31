import { useEffect, useState } from "react";
import { readRenderQuality, saveRenderQuality, type RenderQuality } from "@/lib/render-quality";

/** Standalone control for the World menu; parent owns placement. */
export function RenderQualityControl() {
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<RenderQuality>("high");

  useEffect(() => {
    const saved = readRenderQuality();
    setQuality(saved);
    if (saved === "lightweight")
      document.documentElement.setAttribute("data-world-effects", "economy");
    else document.documentElement.removeAttribute("data-world-effects");
  }, []);

  const choose = (next: RenderQuality) => {
    if (saveRenderQuality(next)) {
      setQuality(next);
      setError("");
      window.location.reload();
    } else setError("描画品質を保存できませんでした。");
  };

  return (
    <fieldset
      aria-label="描画品質"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: 0,
        padding: "10px 0",
        border: 0,
        color: "inherit",
        font: "inherit",
      }}
    >
      <legend style={{ padding: 0, marginBottom: 6, fontSize: "0.8em", opacity: 0.78 }}>
        描画品質
      </legend>
      {error && <span role="status">{error}</span>}
      {(
        [
          ["high", "高品質"],
          ["lightweight", "軽量"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={quality === value}
          onClick={() => choose(value)}
          style={{
            minHeight: 40,
            padding: "8px 14px",
            border: "1px solid currentColor",
            borderRadius: 999,
            color: "inherit",
            background: quality === value ? "#ffffff24" : "transparent",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
