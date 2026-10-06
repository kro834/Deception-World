import { memo, useEffect, useRef } from "react";
import { worldChapterLine, worldChapterMarker } from "./world-chapter-marker";

const PALETTES = {
  projection: { accent: "#7ae8ff", warm: "#ff5cc8", base: "#03060c" },
  story: { accent: "#a9c4ff", warm: "#c9abff", base: "#080d1b" },
  managers: { accent: "#c8a3ff", warm: "#ff7fa4", base: "#12091a" },
  riders: { accent: "#cfd8e3", warm: "#a48bff", base: "#10151c" },
  records: { accent: "#efb96f", warm: "#e98c5e", base: "#160e07" },
  annex: { accent: "#6ddfba", warm: "#e3a674", base: "#07140f" },
  finale: { accent: "#ffab66", warm: "#ffc27a", base: "#120804" },
};
type Phase = keyof typeof PALETTES;

const REGIONS: readonly [string, Phase][] = [
  ["#top", "projection"],
  ["#story", "story"],
  ["#manager-archive", "managers"],
  ["#riders", "riders"],
  ["#records", "records"],
  [".wa-contents", "annex"],
  ["#cast-roster", "annex"],
  ["#world-brief", "annex"],
  ["#episode-notes", "annex"],
  ["#glossary", "annex"],
  ["#quotes", "annex"],
  [".finale-section", "finale"],
  ["footer", "finale"],
];

/** Local chrome follows the reading area; the printed sections keep their
 * own colours. Only two shallow, prepainted light layers crossfade. */
export const WorldAtmosphere = memo(function WorldAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    const shell = stage?.closest<HTMLElement>(".site-shell.film-edition.mirage-edition");
    if (!stage || !shell || typeof IntersectionObserver === "undefined") return;
    const layers = [...stage.querySelectorAll<HTMLElement>(".world-atmosphere-light")];
    const regions = REGIONS.flatMap(([selector, phase]) => {
      const element = shell.querySelector<HTMLElement>(selector);
      return element ? [{ element, phase }] : [];
    });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;
    let frame = 0;
    let fadeFrame = 0;
    let fadeTimer = 0;
    let shown = 0;
    let painted: Phase | null = null;
    let pending: Phase | null = null;
    let fading = false;
    let line = 0;

    const paint = (layer: HTMLElement, phase: Phase) => {
      layer.style.setProperty("--atmosphere-light", PALETTES[phase].accent);
      layer.style.setProperty("--atmosphere-warm", PALETTES[phase].warm);
    };
    const calm = () =>
      reducedMotion.matches ||
      document.documentElement.dataset.worldEffects === "economy" ||
      document.documentElement.hasAttribute("data-loading");
    const settleLight = (phase: Phase) => {
      window.clearTimeout(fadeTimer);
      if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
      fadeFrame = 0;
      pending = null;
      fading = false;
      layers.forEach((layer) => paint(layer, phase));
      stage.dataset.visibleLayer = "0";
      delete stage.dataset.blending;
      shown = 0;
      painted = phase;
    };
    const fadeLight = (phase: Phase) => {
      if (painted === null || calm()) {
        settleLight(phase);
        return;
      }
      if (fading) {
        // A fast scroll keeps the latest destination instead of recolouring
        // a still-visible outgoing layer midway through its fade.
        pending = phase;
        return;
      }
      if (painted === phase) return;
      fading = true;
      const incoming = 1 - shown;
      paint(layers[incoming], phase);
      stage.dataset.blending = "true";
      fadeFrame = window.requestAnimationFrame(() => {
        fadeFrame = 0;
        stage.dataset.visibleLayer = String(incoming);
        shown = incoming;
        painted = phase;
        fadeTimer = window.setTimeout(() => {
          fading = false;
          delete stage.dataset.blending;
          const destination = pending;
          pending = null;
          if (destination) fadeLight(destination);
        }, 680);
      });
    };
    const sync = () => {
      frame = 0;
      const positioned = regions.map((region) => ({
        ...region,
        rect: region.element.getBoundingClientRect(),
        readingLine: worldChapterLine(region.element, line),
      }));
      // A nested archive wins only while the reading line is inside it;
      // leaving it returns to STORY rather than carrying its violet onward.
      const inside = positioned.filter(
        ({ rect, readingLine }) => rect.top <= readingLine && rect.bottom > readingLine,
      );
      const phase =
        (inside.length
          ? inside.sort((a, b) => a.rect.height - b.rect.height)[0]
          : positioned.filter(({ rect, readingLine }) => rect.top <= readingLine).at(-1)
        )?.phase ?? "projection";
      if (shell.dataset.worldPhase !== phase) {
        shell.dataset.worldPhase = phase;
        shell.style.setProperty("--world-atmosphere-accent", PALETTES[phase].accent);
        shell.style.setProperty("--world-atmosphere-base", PALETTES[phase].base);
      }
      fadeLight(phase);
    };
    const requestSync = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };
    const measure = () => {
      line = worldChapterMarker();
      observer?.disconnect();
      observer = new IntersectionObserver(requestSync, {
        rootMargin: `-${line}px 0px -${Math.max(0, window.innerHeight - line - 1)}px 0px`,
        threshold: 0,
      });
      regions.forEach(({ element }) => observer?.observe(element));
      requestSync();
    };
    const onPreference = () => {
      if (calm() && painted !== null) {
        settleLight((shell.dataset.worldPhase as Phase) || painted);
      }
      requestSync();
    };
    const onLocalLink = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a")?.getAttribute("href")?.startsWith("#")) requestSync();
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(requestSync);
    regions.forEach(({ element }) => resizeObserver?.observe(element));
    const modeObserver = new MutationObserver(onPreference);
    modeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world-effects", "data-loading"],
    });
    reducedMotion.addEventListener("change", onPreference);
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("hashchange", requestSync, { passive: true });
    window.addEventListener("scrollend", requestSync, { passive: true });
    shell.addEventListener("click", onLocalLink);
    measure();
    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      modeObserver.disconnect();
      reducedMotion.removeEventListener("change", onPreference);
      window.removeEventListener("resize", measure);
      window.removeEventListener("hashchange", requestSync);
      window.removeEventListener("scrollend", requestSync);
      shell.removeEventListener("click", onLocalLink);
      if (frame) window.cancelAnimationFrame(frame);
      if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
      window.clearTimeout(fadeTimer);
      delete shell.dataset.worldPhase;
      shell.style.removeProperty("--world-atmosphere-accent");
      shell.style.removeProperty("--world-atmosphere-base");
    };
  }, []);

  return (
    <div ref={ref} className="world-atmosphere" data-visible-layer="0" aria-hidden="true">
      <i className="world-atmosphere-light" />
      <i className="world-atmosphere-light" />
    </div>
  );
});
