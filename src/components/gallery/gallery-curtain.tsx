import type { CSSProperties } from "react";

/** Two weighted velvet panels. Only transforms move; the folds stay on the cloth. */
export function GalleryCurtain({
  phase,
  calm = false,
}: {
  phase: "covering" | "revealing";
  calm?: boolean;
}) {
  return (
    <div
      className={`load-gate gallery-curtain is-${phase}${calm ? " is-calm" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={
        phase === "covering" ? "展示室のカーテンを閉じています" : "展示室のカーテンを開いています"
      }
      aria-busy={phase === "covering"}
    >
      <div className="gallery-curtain-rail" aria-hidden="true" />
      {["left", "right"].map((side) => (
        <div key={side} className={`gallery-curtain-panel is-${side}`} aria-hidden="true">
          <div className="gallery-curtain-cloth">
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} style={{ "--fold": index } as CSSProperties} />
            ))}
          </div>
          <div className="gallery-curtain-hem" />
        </div>
      ))}
    </div>
  );
}
