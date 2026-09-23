import { Children, cloneElement, memo, type CSSProperties, type ReactNode } from "react";
import { BLANK, COPY_CHUNK, revealLabel, splittable, typedCells } from "./reveal-label";

/* Scroll-lit type for /world (styles-world-reveal.css).

   <RevealText> splits its text children into one inline <span class="tr-c">
   per character (per short phrase in copy, below) and gives each span its
   reading-order position as --tr-p (0 → 1). Everything else passes through
   untouched: <br>, components such as <FilmTextScan />, and anything
   aria-hidden.
   Each span also carries --tr-d = 1/(n-1), one span's share of the block,
   which sizes the typing cursor's step. Inline host elements (<em>,
   <b>, <strong>, <span>, <small>, <i>) and fragments are split through, so
   the visible string and its markup are exactly what they were.

   The spans stay `display: inline`: no per-character layer, and Japanese line
   breaking (kinsoku) is unchanged. The owner element carries
   data-text-reveal="heading" | "copy" (the CSS hook and view timeline).

   Splitting is Array.from (code points), not Intl.Segmenter: the two agree on
   every string on the page, and Array.from cannot differ between the server's
   ICU and the browser's, so hydration always matches.

   Copy is typed a short phrase at a time, the way an IME commits Japanese:
   up to COPY_CHUNK characters per span, a span closing early after
   punctuation. The copy is three quarters of the page's characters, so this
   keeps the typing look (the cursor still waits on the next cell, then the
   phrase appears) with a third of the scroll-linked animations, which the
   main thread samples on every scroll frame. Headings stay one span per
   character. The grouping is a pure function of the string, so the server
   and the browser always cut it alike.

   RevealText is memoised. String children compare equal, and the JSX headings
   are module-scope constants in world-home.tsx, so a WorldHome commit (poster
   ticks, section changes) reuses the spans instead of rebuilding them.

   Screen readers
   - heading: pass the owner's aria-label from revealLabel(children), the same
     pattern as the rider <h3>. Spans stay exposed (verify-title-scroll needs
     real text to hit inside the heading).
   - copy: <RevealText copy> renders the whole sentence once in a
     .visually-hidden span and the split copy aria-hidden, so VoiceOver on iOS
     does not stop on every character.
     Trade-off: find in page (Chrome desktop and Android) matches each copy
     phrase twice. The first match is the clipped label, so it has no visible
     highlight; the label sits at the paragraph's top-left, so the jump still
     lands on the paragraph, and the next match highlights the visible text.
     innerText also contains the sentence twice. Selection is blocked
     site-wide (styles.css), so copy and paste are unaffected. aria-labelledby
     is not an alternative: role=paragraph cannot be named, so the paragraph
     would go silent with its content aria-hidden. */

function count(node: ReactNode, size: number): number {
  let total = 0;
  Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number")
      total += typedCells(String(child), size).filter((part) => !BLANK.test(part)).length;
    else if (splittable(child)) total += count(child.props.children, size);
  });
  return total;
}

export const RevealText = memo(function RevealText({
  children,
  copy = false,
}: {
  children: ReactNode;
  copy?: boolean;
}) {
  const size = copy ? COPY_CHUNK : 1;
  const total = count(children, size);
  let index = 0;
  const split = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (typeof child === "string" || typeof child === "number") {
        return typedCells(String(child), size).map((part, key) =>
          BLANK.test(part) ? (
            part
          ) : (
            <span
              key={key}
              className="tr-c"
              style={
                {
                  "--tr-p": (index++ / Math.max(1, total - 1)).toFixed(3),
                  "--tr-d": (1 / Math.max(1, total - 1)).toFixed(3),
                } as CSSProperties
              }
            >
              {part}
            </span>
          ),
        );
      }
      if (splittable(child)) return cloneElement(child, undefined, split(child.props.children));
      return child;
    });
  if (!copy) return <>{split(children)}</>;
  return (
    <>
      <span className="visually-hidden">{revealLabel(children)}</span>
      <span aria-hidden="true">{split(children)}</span>
    </>
  );
});
