// Scroll-driven signal bands between the hero and the story, and before the
// footer. Purely decorative: every string repeats existing copy, the band is
// aria-hidden, and it moves only while the reader scrolls (no autoplay).
const MIRAGE_TICKER_ITEMS = [
  "DECEPTION WORLD",
  "KAMEN RIDER SAGA",
  "THE SECOND SAGA",
  "THIS IS NOT A DREAM",
  "SIX SIGNALS ABOVE THE WORLD",
  "EIGHT RIDERS / ONE WORLD",
  "POWER BEYOND THE BORDER",
  "THE WORLD IS WAITING",
] as const;

type MirageTickerProps = {
  variant: "open" | "close";
  records: number;
};

export function MirageTicker({ variant, records }: MirageTickerProps) {
  const items = variant === "open" ? MIRAGE_TICKER_ITEMS : [...MIRAGE_TICKER_ITEMS].reverse();
  const line = `${[...items, `RECORDS FOUND ${String(records).padStart(2, "0")}`].join(" // ")} // `;
  return (
    <div className={`mr-ticker is-${variant}`} aria-hidden="true">
      <div className="mr-ticker-row">
        <span>{line}</span>
        <span>{line}</span>
      </div>
      <div className="mr-ticker-row is-outline">
        <span>
          {variant === "open"
            ? "DECEPTION WORLD — KAMEN RIDER SAGA — "
            : "THE STORY CONTINUES — DECEPTION WORLD — "}
        </span>
        <span>
          {variant === "open"
            ? "DECEPTION WORLD — KAMEN RIDER SAGA — "
            : "THE STORY CONTINUES — DECEPTION WORLD — "}
        </span>
      </div>
    </div>
  );
}
