import { Children, cloneElement, memo, type CSSProperties, type ReactNode } from "react";
import { BLANK, revealLabel, splittable } from "./reveal-label";

/* Scroll-lit type for /world (styles-world-reveal.css).

   <RevealText> splits its text children into one inline <span class="tr-c">
   per character and gives each span its reading-order position as --tr-p
   (0 → 1). Everything else passes through untouched: <br>, components such as
   <FilmTextScan />, and anything aria-hidden. Inline host elements (<em>,
   <b>, <strong>, <span>, <small>, <i>) and fragments are split through, so
   the visible string and its markup are exactly what they were.

   The spans stay `display: inline`: no per-character layer, and Japanese line
   breaking (kinsoku) is unchanged. The owner element carries
   data-text-reveal="heading" | "copy" (the CSS hook and view timeline).

   Splitting is Array.from (code points), not Intl.Segmenter: the two agree on
   every string on the page, and Array.from cannot differ between the server's
   ICU and the browser's, so hydration always matches.

   RevealText is memoised. String children compare equal, and the JSX headings
   are module-scope constants in world-home.tsx, so a WorldHome commit (poster
   ticks, section changes) reuses the spans instead of rebuilding them.

   Screen readers
   - heading: pass the owner's aria-label from revealLabel(children), the same
     pattern as the rider <h3>. Spans stay exposed (verify-title-scroll needs
     real text to hit inside the heading).
   - copy: <RevealText copy> renders the whole sentence once in a
     .visually-hidden span and the split copy aria-hidden, so VoiceOver on iOS
     does not stop on every character. */

function count(node: ReactNode): number {
  let total = 0;
  Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number")
      total += Array.from(String(child)).filter((part) => !BLANK.test(part)).length;
    else if (splittable(child)) total += count(child.props.children);
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
  const total = count(children);
  let index = 0;
  const split = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (typeof child === "string" || typeof child === "number") {
        return Array.from(String(child), (part, key) =>
          BLANK.test(part) ? (
            part
          ) : (
            <span
              key={key}
              className="tr-c"
              style={{ "--tr-p": (index++ / Math.max(1, total - 1)).toFixed(3) } as CSSProperties}
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
