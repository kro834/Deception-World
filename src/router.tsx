import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent, NotFoundComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

/* The document's first render on a fresh entry (owner, 2026-10-23: 「自動変身
   再生が必ず読み込まれ、正常に動作する様にして。」): the router puts a new
   entry at the top when it first renders, but on a slow connection that
   render lands seconds after the page is shown and readable, and a reader who
   had already scrolled (to the suit-up's runway, say) was thrown back to the
   top. On that first render only, a fresh entry (not a reload or Back/Forward,
   whose saved positions the router restores) with no #section keeps the
   reader where they are. */
let firstRender = true;
function readerScrolledBeforeFirstRender() {
  if (!firstRender || typeof window === "undefined") return false;
  firstRender = false;
  if (window.location.hash.length > 1) return false;
  const [navigation] = (window.performance?.getEntriesByType?.("navigation") ??
    []) as PerformanceNavigationTiming[];
  return (navigation?.type ?? "navigate") === "navigate" && window.scrollY > 0;
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    // A gallery modal owns restoration until its history traversal settles.
    // Never restore the frozen body's offset (scrollY = 0) over the reader's position.
    scrollRestoration: ({ location }) =>
      location.pathname !== "/gallery" ||
      typeof document === "undefined" ||
      !document.body.hasAttribute("data-gallery-viewer-lock")
        ? !readerScrolledBeforeFirstRender()
        : false,
    // Restore Back/Forward positions in one jump. A smooth restore is
    // cancelled by the first layout shift of the returning page.
    scrollRestorationBehavior: "instant",
  });
}
