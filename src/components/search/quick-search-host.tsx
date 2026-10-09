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
  // Keys typed between the shortcut and the overlay's first paint (its chunk
  // loads on first use) are kept and handed to the field, not lost.
  const [seed, setSeed] = useState("");
  const pendingRef = useRef<string | null>(null);
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
      if (!document.querySelector("dialog.quick-search[open]")) pendingRef.current = "";
      setMounted(true);
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (pendingRef.current !== null) {
        if (document.querySelector("dialog.quick-search[open]")) {
          pendingRef.current = null;
        } else if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.isComposing
        ) {
          event.preventDefault();
          pendingRef.current += event.key;
          setSeed(pendingRef.current);
          return;
        }
      }
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
      <QuickSearchDialog
        open={open}
        seed={seed}
        onSeeded={() => {
          pendingRef.current = null;
          setSeed("");
        }}
        onClose={() => setOpen(false)}
      />
    </Suspense>
  );
}
