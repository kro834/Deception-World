import type { MouseEvent } from "react";
import { useRouterState } from "@tanstack/react-router";

// The tallest sticky header (the World and dossier bars) ends at 76 px.
const HEADER_CLEARANCE = 96;
const EMBED_MARK_MS = 2400;

/* The page's own heading: the reading position a keyboard route arrival
   parks on (load-gate focusRouteDestination), so a skip and an arrival land
   in the same place. A heading only one layout shows (display: none in the
   other) is passed over. */
function skipTarget() {
  const shown = (element: HTMLElement) => element.getClientRects().length > 0;
  let target =
    Array.from(document.querySelectorAll<HTMLElement>("main h1")).find(shown) ??
    Array.from(document.querySelectorAll<HTMLElement>("h1")).find(shown) ??
    // A page without a heading (the form archive) reads in its embedded document.
    Array.from(document.querySelectorAll<HTMLElement>("main iframe[title]")).find(shown) ??
    document.querySelector<HTMLElement>("main");
  // Hidden markers are not a place to read; their section is.
  const hidden = target?.closest<HTMLElement>('[aria-hidden="true"]');
  if (hidden) target = hidden.parentElement;
  return target;
}

/* Where the mark is drawn: the heading itself, or, for a heading kept for
   screen readers only (the Dream Chapter's is drawn as its logo), the block
   that holds it. */
function skipMark(target: HTMLElement) {
  let mark: HTMLElement | null = target;
  while (mark) {
    const box = mark.getBoundingClientRect();
    if (box.width > 8 && box.height > 8) return mark;
    mark = mark.parentElement;
  }
  return null;
}

function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
  // No element carries id="main": the target is found at the click, and the
  // URL keeps its own hash.
  event.preventDefault();
  const target = skipTarget();
  if (!target) return;
  const focusable = target.matches(
    "a[href],button,input,select,textarea,summary,iframe,[tabindex]",
  );
  if (!focusable) {
    target.tabIndex = -1;
    target.dataset.routeFocus = "true";
  }
  // A skip, unlike a route arrival, was asked for, so where reading starts is
  // marked (styles-route-transitions.css). Enter reaches the link as a click
  // with no pointer detail; a pointer never sets the mark.
  const mark = event.detail === 0 ? skipMark(target) : null;
  if (mark) mark.dataset.skipMark = "true";
  // Focus stays on an embedded document while the reader works inside it,
  // so its frame is shown briefly instead.
  if (mark && target instanceof HTMLIFrameElement) {
    window.setTimeout(() => mark.removeAttribute("data-skip-mark"), EMBED_MARK_MS);
  }
  // Focusable and marked for this visit only, so a later click on its text
  // does not select the whole heading.
  target.addEventListener(
    "blur",
    () => {
      if (!focusable) {
        target.removeAttribute("tabindex");
        target.removeAttribute("data-route-focus");
      }
      mark?.removeAttribute("data-skip-mark");
    },
    { once: true },
  );
  target.focus({ preventScroll: true });
  // A heading already in view below the header stays where it is, so the
  // first view keeps its composition. Otherwise a heading is centred, clear
  // of the header; a whole <main> or embedded document (a page without an h1)
  // is brought to its start.
  const box = target.getBoundingClientRect();
  const tall = box.height > window.innerHeight / 2;
  const inView =
    box.top >= HEADER_CLEARANCE &&
    (tall ? box.top < window.innerHeight : box.bottom <= window.innerHeight);
  if (!inView) target.scrollIntoView({ block: tall ? "start" : "center" });
}

/* First Tab stop on every route but the opening (本文へスキップ): past the
   header and its menu to the page's heading. The opening at "/" has no
   header, and its first stop is its own SKIP; a second "skip" beside it
   would only ask which one is meant. */
export function SkipLink() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/") return null;
  return (
    <a className="dw-skip-link" href="#main" onClick={skipToContent}>
      本文へスキップ
    </a>
  );
}
