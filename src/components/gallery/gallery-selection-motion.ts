import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

function motionAllowed() {
  return (
    !document.hidden &&
    typeof Element.prototype.animate === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.worldEffects !== "economy"
  );
}

/** Animate committed exhibition changes without delaying state, focus or history. */
export function useGallerySelectionMotion(
  grid: RefObject<HTMLDivElement | null>,
  filters: RefObject<HTMLElement | null>,
  stage: RefObject<HTMLDivElement | null>,
  collection: string,
  category: string,
  selectedId: string | null,
  direction: RefObject<number>,
) {
  const previous = useRef(new Map<string, { x: number; y: number }>());
  const lastCollection = useRef(collection);
  const lastSelection = useRef(selectedId);
  const animations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const clear = () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
    clear();
    const allowed = motionAllowed();
    const changed = lastCollection.current !== collection;
    const next = new Map<string, { x: number; y: number }>();
    let visibleIndex = 0;
    grid.current?.querySelectorAll<HTMLElement>("[data-gallery-artwork]").forEach((card) => {
      const rect = card.getBoundingClientRect();
      const position = { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
      const old = previous.current.get(card.dataset.galleryArtwork!);
      next.set(card.dataset.galleryArtwork!, position);
      if (
        !allowed ||
        !changed ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        visibleIndex >= 18
      )
        return;
      const index = visibleIndex++;
      const x = old ? Math.max(-160, Math.min(160, old.x - position.x)) : index % 2 ? 30 : -30;
      const y = old ? Math.max(-100, Math.min(100, old.y - position.y)) : 48;
      animations.current.push(
        card.animate(
          [
            {
              transform: `translate3d(${x}px, ${y}px, 0) scale(${old ? 0.97 : 0.92})`,
              opacity: old ? 0.65 : 0,
            },
            { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
          ],
          {
            duration: 520,
            delay: Math.min(index * 28, 196),
            easing: "cubic-bezier(.16,1,.3,1)",
            fill: "backwards",
          },
        ),
      );
    });
    previous.current = next;
    lastCollection.current = collection;
    const active = filters.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    const marker = filters.current?.querySelector<HTMLElement>(".gallery-selection-marker");
    if (active && marker) {
      marker.style.width = `${active.offsetWidth}px`;
      marker.style.height = `${active.offsetHeight}px`;
      marker.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    }
    if (
      allowed &&
      selectedId &&
      lastSelection.current &&
      selectedId !== lastSelection.current &&
      stage.current
    ) {
      animations.current.push(
        stage.current.animate(
          [
            {
              transform: `translate3d(${direction.current * 62}px, 0, 0) scale(.96)`,
              opacity: 0.25,
            },
            { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
          ],
          { duration: 460, easing: "cubic-bezier(.16,1,.3,1)" },
        ),
      );
    }
    lastSelection.current = selectedId;
    return clear;
  }, [grid, filters, stage, collection, category, selectedId, direction]);

  useEffect(() => {
    // Focus must immediately reveal its real target, including during stagger delays.
    // Listen on the document because the viewer stage mounts only while open.
    const settleFocusedArtwork = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!grid.current?.contains(event.target) && !stage.current?.contains(event.target)) return;
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
    document.addEventListener("focusin", settleFocusedArtwork);
    return () => document.removeEventListener("focusin", settleFocusedArtwork);
  }, [grid, stage]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelIfSuppressed = () => {
      if (motionAllowed()) return;
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
    const observer = new MutationObserver(cancelIfSuppressed);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world-effects"],
    });
    preference.addEventListener("change", cancelIfSuppressed);
    document.addEventListener("visibilitychange", cancelIfSuppressed);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", cancelIfSuppressed);
      document.removeEventListener("visibilitychange", cancelIfSuppressed);
    };
  }, []);

  useLayoutEffect(() => {
    const nav = filters.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const active = nav.querySelector<HTMLElement>('button[aria-pressed="true"]');
      const marker = nav.querySelector<HTMLElement>(".gallery-selection-marker");
      if (!active || !marker) return;
      marker.style.width = `${active.offsetWidth}px`;
      marker.style.height = `${active.offsetHeight}px`;
      marker.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    });
    observer.observe(nav);
    nav.querySelectorAll("button").forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [filters]);
}
