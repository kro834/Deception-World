import { plateRunStyle, plateWords, type RecordArt } from "@/lib/record-art";
import { recordImage, type RecordArtSlot } from "@/lib/record-images";

/** The window's slot (its decode width) from the frame's variant class. */
function slotOf(className?: string): RecordArtSlot {
  if (!className) return "card";
  if (className.includes("is-row")) return "row";
  if (className.includes("is-continue")) return "continue";
  if (className.includes("is-stop")) return "stop";
  return "card";
}

/** The index card's art window (rx10 STAGE): the record's picture, or a
 * typographic plate of its name when it has none, with its HUD code.
 * Decorative: the card's own title and link carry the words. `slot` names
 * the window's size so the picture is decoded at the pixels it paints. */
export function RecordArtFrame({
  art,
  title,
  className,
  eager = false,
  slot,
}: {
  art: RecordArt;
  title: string;
  className?: string;
  eager?: boolean;
  slot?: RecordArtSlot;
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
          {...recordImage(art.src, slot ?? slotOf(className))}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          style={art.pos ? { objectPosition: art.pos } : undefined}
        />
      ) : (
        // The name's run goes to the sheet, which fits it to the window.
        <b style={plateRunStyle(plateWords(title))}>{plateWords(title)}</b>
      )}
      <i>{art.code}</i>
    </span>
  );
}
