import type { CSSProperties } from "react";

/* The cast's stickers, stuck on the velvet (2026-10-07, the owner's request).
   Cut out of the supplied sheets with their own white die-cut edge. x/y place
   each sticker's centre on its panel (percent of the panel), r tilts it, h is
   its height relative to the others. Five on the left panel, four on the right;
   they ride the cloth, so they sway and part with it. */
const STICKERS = [
  { src: "sticker-01", side: "left", x: 22, y: 20, r: -9, h: 1 },
  { src: "sticker-02", side: "left", x: 64, y: 27, r: 7, h: 0.96 },
  { src: "sticker-03", side: "left", x: 34, y: 52, r: 4, h: 1.08 },
  { src: "sticker-04", side: "left", x: 72, y: 61, r: -6, h: 0.98 },
  { src: "sticker-05", side: "left", x: 30, y: 82, r: -3, h: 0.94 },
  { src: "sticker-06", side: "right", x: 36, y: 24, r: 6, h: 1 },
  { src: "sticker-07", side: "right", x: 74, y: 40, r: -8, h: 1.02 },
  { src: "sticker-08", side: "right", x: 32, y: 63, r: -4, h: 1.04 },
  { src: "sticker-09", side: "right", x: 70, y: 81, r: 8, h: 0.96 },
] as const;

const stickerSrc = (name: string) => `/gallery/stickers/${name}.webp`;

/** Warmed by the menu's gallery link, so the stickers are on the cloth
 * from the curtain's first frame. */
export const GALLERY_CURTAIN_STICKERS: readonly string[] = STICKERS.map(({ src }) =>
  stickerSrc(src),
);

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
            <div className="gallery-curtain-stickers">
              {STICKERS.filter((sticker) => sticker.side === side).map((sticker) => (
                <img
                  key={sticker.src}
                  src={stickerSrc(sticker.src)}
                  alt=""
                  decoding="async"
                  draggable={false}
                  style={
                    {
                      "--sticker-x": `${sticker.x}%`,
                      "--sticker-y": `${sticker.y}%`,
                      "--sticker-r": `${sticker.r}deg`,
                      "--sticker-h": sticker.h,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
          <div className="gallery-curtain-hem" />
        </div>
      ))}
    </div>
  );
}
