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
  const count = String(records).padStart(2, "0");
  const renderStream = () => (
    <>
      {items.map((phrase, idx) => (
        <span key={`${variant}-${idx}`} className="mr-ticker-unit">
          <b className="mr-ticker-idx">{String(idx + 1).padStart(2, "0")}</b>
          <em className="mr-ticker-item">{phrase}</em>
          <i className="mr-ticker-sep">//</i>
        </span>
      ))}
      <strong className="mr-ticker-count">RECORDS FOUND {count}</strong>
      <i className="mr-ticker-sep">//</i>
    </>
  );
  const renderOutline = () =>
    variant === "open" ? (
      <>
        DECEPTION WORLD <i className="mr-ticker-glyph">+</i> KAMEN RIDER SAGA —{" "}
      </>
    ) : (
      <>
        THE STORY CONTINUES <i className="mr-ticker-glyph">+</i> DECEPTION WORLD —{" "}
      </>
    );

  return (
    <div className={`mr-ticker is-${variant}`} aria-hidden="true">
      <div className="mr-ticker-row">
        <span>{renderStream()}</span>
        <span>{renderStream()}</span>
      </div>
      <div className="mr-ticker-row is-outline">
        <span>{renderOutline()}</span>
        <span>{renderOutline()}</span>
      </div>
    </div>
  );
}
