import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { loadQuickSearch, QUICK_SEARCH_OPEN_EVENT } from "./quick-search-events";
import { isQuickSearchShortcut, isTypingTarget, quickSearchBlocked } from "./quick-search-shortcut";

// The overlay and its index load on first use, never with a route.
const QuickSearchDialog = lazy(loadQuickSearch);

export function QuickSearchHost() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
    // A route change closes it (a result was opened, or Back was pressed).
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const show = () => {
      // The search page has its own field: go there instead of an overlay.
      const field =
        pathnameRef.current === "/search"
          ? document.querySelector<HTMLInputElement>("#record-query")
          : null;
      if (field) {
        field.focus();
        field.select();
        return;
      }
      setMounted(true);
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isQuickSearchShortcut(event) || isTypingTarget(event.target)) return;
      if (quickSearchBlocked(document, pathnameRef.current)) return;
      event.preventDefault();
      show();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(QUICK_SEARCH_OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(QUICK_SEARCH_OPEN_EVENT, show);
    };
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <QuickSearchDialog open={open} onClose={() => setOpen(false)} />
    </Suspense>
  );
}
