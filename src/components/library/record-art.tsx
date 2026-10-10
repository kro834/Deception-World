import { plateWords, type RecordArt } from "@/lib/record-art";

/** The index card's art window (rx10 STAGE): the record's picture, or a
 * typographic plate of its name when it has none, with its HUD code.
 * Decorative: the card's own title and link carry the words. */
export function RecordArtFrame({
  art,
  title,
  className,
  eager = false,
}: {
  art: RecordArt;
  title: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <span
      className={className ? `dxl-art ${className}` : "dxl-art"}
      data-edition={art.edition}
      data-plate={art.src ? undefined : "type"}
      aria-hidden="true"
    >
      {art.src ? (
        <img
          src={art.src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          style={art.pos ? { objectPosition: art.pos } : undefined}
        />
      ) : (
        <b>{plateWords(title)}</b>
      )}
      <i>{art.code}</i>
    </span>
  );
}
