import { plateRunStyle, plateWords, type RecordArt } from "@/lib/record-art";
import { recordImage, type RecordArtSlot } from "@/lib/record-images";
import { withWordBreaks } from "@/lib/name-breaks";

/** A plate's name as its words (each an inline block,
 * styles-library-zenith.css), so a name too long for one line of its window
 * (マキャベルゴアナイトメア, “犬”と“イサク”の謎 on a phone's row card, the
 * see-all strip) wraps between words: the name seams (仮面ライダー|, ・|) and
 * one after a quoted word's particle (“犬”と|“イサク”の謎), where WebKit
 * split イ|サク. One word longer than its line still breaks inside. */
const plateRun = (words: string) =>
  withWordBreaks(words)
    .replace(/([”」』][とのや])(?=[“「『])/gu, "$1\u200b")
    .split("\u200b")
    .filter(Boolean)
    .map((word, index) => <span key={index}>{word}</span>);

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
        <b style={plateRunStyle(plateWords(title))}>{plateRun(plateWords(title))}</b>
      )}
      <i>{art.code}</i>
    </span>
  );
}
