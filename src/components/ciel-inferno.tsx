import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CIEL_INFERNO_DURATION,
  createCielInfernoRenderer,
  type InfernoGeometry,
} from "@/lib/ciel-inferno-renderer";
import styles from "@/styles-ciel-inferno.css?url";

type Props = {
  origin: { x: number; y: number };
  onCommit: () => void;
  artSrc?: string;
  artSrcSet?: string;
  routeKey?: string;
};
type Renderer = ReturnType<typeof createCielInfernoRenderer>;
const ART = "/ciel-inferno-20261019/ciel-1080.webp";
const ART_SET =
  "/ciel-inferno-20261019/ciel-216.webp 216w, /ciel-inferno-20261019/ciel-720.webp 720w, /ciel-inferno-20261019/ciel-1080.webp 1080w";
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
const calmNow = () => {
  if (typeof window === "undefined") return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return (
    matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)").matches ||
    document.documentElement.dataset.worldEffects === "economy" ||
    Boolean(connection?.saveData) ||
    /^(slow-)?2g$/.test(connection?.effectiveType || "")
  );
};

/** This document's reload-only burn. It never deletes, captures or replaces
 * site data. After the effect only an inert, opaque top-layer shell remains;
 * the browser's ordinary reload creates a fresh document and restores it. */
export default function CielInferno({
  origin,
  onCommit,
  artSrc = ART,
  artSrcSet = ART_SET,
  routeKey = "",
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLCanvasElement>(null);
  const detail = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const settle = useRef(() => {});
  const committed = useRef(false);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const initial = useRef({
    x: clamp(origin.x),
    y: clamp(origin.y),
    calm: calmNow(),
    route: routeKey,
  });
  const burnedRef = useRef(false);
  const [burned, setBurned] = useState(false);
  const id = useId();

  useEffect(() => {
    if (routeKey !== initial.current.route) settle.current();
  }, [routeKey]);

  useEffect(() => {
    if (!committed.current) {
      committed.current = true;
      commit.current();
    }
    const modal = dialog.current;
    if (!modal) return;
    const backdrop = field.current;
    const foreground = detail.current;
    const dragon = art.current;
    const source = initial.current;
    const duration = source.calm ? 1900 : CIEL_INFERNO_DURATION;
    const html = document.documentElement;
    const body = document.body;
    const media = matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)");
    const mediaAtStart = media.matches;
    const tier = html.dataset.worldEffects;
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const saveData = connection?.saveData;
    const networkTier = connection?.effectiveType;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = styles;
    link.dataset.cielInfernoStyles = "";
    const timers = { styles: 0, duration: 0, cap: 0 };
    const restores: Array<() => void> = [];
    const inertElements = new Map<HTMLElement, boolean>();
    let renderer: Renderer | null = null;
    let disposed = false;
    let activeStopped = false;
    let begun = false;
    let departing = false;
    let reopenQueued = false;
    let frame = 0;
    let started = 0;
    let phase = "";
    let fallback = false;

    // Restore only on actual component disposal, never at the burned state.
    // Longhands preserve pre-existing values/priorities and unrelated styles.
    for (const element of [html, body]) {
      const hadStyle = element.hasAttribute("style");
      for (const property of [
        "overflow-x",
        "overflow-y",
        "overscroll-behavior-x",
        "overscroll-behavior-y",
      ]) {
        const previous = element.style.getPropertyValue(property);
        const priority = element.style.getPropertyPriority(property);
        const value = property.startsWith("overflow") ? "hidden" : "none";
        element.style.setProperty(property, value, "important");
        restores.push(() => {
          if (
            element.style.getPropertyValue(property) !== value ||
            element.style.getPropertyPriority(property) !== "important"
          )
            return;
          if (previous) element.style.setProperty(property, previous, priority);
          else element.style.removeProperty(property);
        });
      }
      restores.unshift(() => {
        if (!hadStyle && !element.style.length) element.removeAttribute("style");
      });
    }
    const inertOutside = () => {
      for (const element of body.children) {
        if (!(element instanceof HTMLElement) || element === modal || element.contains(modal))
          continue;
        if (!inertElements.has(element)) inertElements.set(element, element.inert);
        element.inert = true;
      }
    };
    inertOutside();
    // A route may append a fresh portal; its content must remain inert too.
    const outsideObserver = new MutationObserver(inertOutside);
    outsideObserver.observe(body, { childList: true });

    const ensureModal = () => {
      if (disposed || departing || document.hidden || !modal.isConnected || modal.open) return;
      try {
        if (typeof modal.showModal !== "function") throw new Error("native dialog unavailable");
        modal.showModal();
      } catch {
        // Unsupported/failed native top-layer: critical inline geometry plus
        // inert siblings and the two keyboard/focus guards still block input.
        fallback = true;
        modal.dataset.fallback = "true";
        modal.setAttribute("open", "");
      }
    };
    const reopen = () => {
      if (disposed || reopenQueued) return;
      reopenQueued = true;
      queueMicrotask(() => {
        reopenQueued = false;
        ensureModal();
      });
    };
    const layout = (): InfernoGeometry => {
      const width = Math.max(1, innerWidth);
      const height = Math.max(1, innerHeight);
      const size = Math.min(width * (width < 700 ? 1.45 : 0.78), height * 1.02, 1040);
      const mouthX = width * 0.73;
      const mouthY = height * (width < 700 ? 0.31 : 0.34);
      const left = mouthX - size * 0.54;
      const top = mouthY - size * 0.44;
      if (dragon) {
        dragon.style.width = dragon.style.height = `${size}px`;
        dragon.style.left = `${left}px`;
        dragon.style.top = `${top}px`;
        dragon.style.setProperty("--ci-start-x", `${source.x * width - left - size * 0.5}px`);
        dragon.style.setProperty("--ci-start-y", `${source.y * height - top - size * 0.5}px`);
      }
      return { width, height, mouthX, mouthY, angle: 2.52 };
    };
    const resize = () => {
      if (!disposed && !burnedRef.current) renderer?.resize(layout());
    };
    const stopEffects = () => {
      if (activeStopped) return;
      activeStopped = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      Object.values(timers).forEach(clearTimeout);
      try {
        renderer?.dispose();
      } catch {
        /* The persistent shell still becomes black. */
      }
      renderer = null;
      link.onload = link.onerror = null;
      tierObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      media.removeEventListener("change", changed);
      connection?.removeEventListener("change", changed);
    };
    const settleBurned = () => {
      if (disposed) return;
      if (!burnedRef.current) burnedRef.current = true;
      stopEffects();
      modal.dataset.phase = "burned";
      modal.dataset.ready = "true";
      modal.dataset.renderer = "stopped";
      modal.style.background = "#000";
      modal.style.forcedColorAdjust = "none";
      modal.style.outline = "none";
      modal.style.boxShadow = "none";
      // Hide synchronously too: shader failure/stylesheet failure cannot
      // expose even one frame of the original page or a visible message.
      for (const child of modal.children) {
        if (child instanceof HTMLElement && !child.classList.contains("ciel-inferno-sr"))
          child.style.setProperty("display", "none", "important");
      }
      setBurned(true);
      ensureModal();
      try {
        if (modal.open && !document.hidden) modal.focus({ preventScroll: true });
      } catch {
        /* Browser UI reload stays available. */
      }
    };
    settle.current = settleBurned;
    const cancel = (event: Event) => {
      event.preventDefault();
      settleBurned();
    };
    const closed = () => {
      settleBurned();
      reopen();
    };
    const visibility = () => {
      if (document.hidden) settleBurned();
      else ensureModal();
    };
    const leave = (event: Event) => {
      if (event.type === "pagehide") departing = true;
      settleBurned();
      reopen();
    };
    const shown = () => {
      departing = false;
      if (burnedRef.current) ensureModal();
    };
    const changed = () => {
      if (
        media.matches !== mediaAtStart ||
        html.dataset.worldEffects !== tier ||
        connection?.saveData !== saveData ||
        connection?.effectiveType !== networkTier
      )
        settleBurned();
    };
    const tierObserver = new MutationObserver(changed);
    tierObserver.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
    const openObserver = new MutationObserver(() => {
      if (!disposed && (begun || burnedRef.current) && !modal.open) {
        settleBurned();
        reopen();
      }
    });
    openObserver.observe(modal, { attributes: true, attributeFilter: ["open"] });
    const fallbackKey = (event: KeyboardEvent) => {
      if (!fallback) return;
      if (event.key === "Escape") {
        event.preventDefault();
        settleBurned();
      } else if (event.key === "Tab" && burnedRef.current) {
        event.preventDefault();
        modal.focus({ preventScroll: true });
      }
    };
    const fallbackFocus = (event: FocusEvent) => {
      if (fallback && event.target instanceof Node && !modal.contains(event.target)) {
        try {
          modal.focus({ preventScroll: true });
        } catch {
          /* Native reload is outside the page. */
        }
      }
    };
    modal.addEventListener("cancel", cancel);
    modal.addEventListener("close", closed);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", fallbackKey, true);
    document.addEventListener("focusin", fallbackFocus, true);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", shown);
    window.addEventListener("popstate", leave);
    window.addEventListener("hashchange", leave);
    window.addEventListener("resize", resize, { passive: true });
    window.visualViewport?.addEventListener("resize", resize, { passive: true });
    media.addEventListener("change", changed);
    connection?.addEventListener("change", changed);

    const tick = (now: number) => {
      frame = 0;
      if (disposed || burnedRef.current) return;
      if (document.hidden) {
        settleBurned();
        return;
      }
      const elapsed = now - started;
      if (elapsed >= duration) {
        settleBurned();
        return;
      }
      const next =
        elapsed < 1100 ? "awaken" : elapsed < 3100 ? "jet" : elapsed < 5600 ? "engulf" : "ash";
      if (next !== phase) {
        phase = next;
        modal.dataset.phase = phase;
      }
      try {
        renderer?.render(elapsed);
      } catch {
        settleBurned();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const begin = () => {
      if (disposed || begun || burnedRef.current) return;
      begun = true;
      clearTimeout(timers.styles);
      if (document.hidden) {
        settleBurned();
        return;
      }
      try {
        if (!source.calm && backdrop && foreground) {
          renderer = createCielInfernoRenderer({
            field: backdrop,
            detail: foreground,
            coarse: matchMedia("(pointer: coarse), (any-pointer: coarse)").matches,
            onFailure: settleBurned,
            onAtlasState: (state) => {
              if (!disposed && !burnedRef.current) modal.dataset.jet = state;
            },
          });
          renderer.resize(layout());
        } else layout();
        ensureModal();
      } catch {
        settleBurned();
        return;
      }
      if (fallback) {
        settleBurned();
        return;
      }
      modal.dataset.renderer = renderer?.backend ?? "calm";
      modal.dataset.ready = "true";
      modal.focus({ preventScroll: true });
      started = performance.now();
      timers.duration = window.setTimeout(settleBurned, duration);
      if (!source.calm) frame = requestAnimationFrame(tick);
    };
    link.onload = begin;
    link.onerror = settleBurned;
    timers.styles = window.setTimeout(settleBurned, 1500);
    timers.cap = window.setTimeout(settleBurned, 9800);
    document.head.append(link);
    if (burnedRef.current || document.hidden) settleBurned();
    else if (link.sheet) begin();

    return () => {
      disposed = true;
      stopEffects();
      settle.current = () => {};
      openObserver.disconnect();
      outsideObserver.disconnect();
      modal.removeEventListener("cancel", cancel);
      modal.removeEventListener("close", closed);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", fallbackKey, true);
      document.removeEventListener("focusin", fallbackFocus, true);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", shown);
      window.removeEventListener("popstate", leave);
      window.removeEventListener("hashchange", leave);
      if (modal.open) modal.close();
      link.remove();
      for (let i = restores.length - 1; i >= 0; i--) restores[i]();
      for (const [element, wasInert] of inertElements) if (element.inert) element.inert = wasInert;
      // No focus/scroll restoration: only a new document restores this view.
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="ciel-inferno"
      data-ciel-inferno=""
      data-calm={initial.current.calm ? "true" : "false"}
      data-ready={burned ? "true" : "false"}
      data-phase={burned ? "burned" : "awaken"}
      data-jet={initial.current.calm ? "unused" : "loading"}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      tabIndex={-1}
      style={
        {
          "--ci-duration": `${CIEL_INFERNO_DURATION}ms`,
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100dvh",
          maxWidth: "none",
          maxHeight: "none",
          margin: 0,
          padding: 0,
          border: 0,
          overflow: "hidden",
          zIndex: 2147483647,
          background: burned ? "#000" : "transparent",
          forcedColorAdjust: burned ? "none" : undefined,
          outline: burned ? "none" : undefined,
          boxShadow: burned ? "none" : undefined,
        } as CSSProperties
      }
    >
      <h2 id={`${id}-title`} className="ciel-inferno-sr" style={SR_ONLY}>
        シエルの緑炎
      </h2>
      <p id={`${id}-description`} className="ciel-inferno-sr" style={SR_ONLY} aria-live="polite">
        {burned
          ? "画面は焼失しました。ページを再読み込みすると元に戻ります。"
          : "緑の炎が画面を包み、その後は焼失状態が残ります。再読み込みで元に戻ります。"}
      </p>
      {!burned && (
        <>
          <canvas ref={field} className="ciel-inferno-field" aria-hidden="true" />
          <div ref={art} className="ciel-inferno-dragon" aria-hidden="true">
            <img
              src={initial.current.calm ? "/ciel-inferno-20261019/ciel-216.webp" : artSrc}
              srcSet={initial.current.calm ? undefined : artSrcSet}
              sizes="(max-width: 699px) 145vw, min(78vw, 1040px)"
              width="1080"
              height="1080"
              alt=""
              decoding="async"
              fetchPriority="high"
              onError={(event) => {
                const image = event.currentTarget;
                if (image.dataset.fallback === "true") return;
                image.dataset.fallback = "true";
                image.removeAttribute("srcset");
                image.src = "/ciel-inferno-20261019/ciel-216.webp";
              }}
            />
          </div>
          <canvas ref={detail} className="ciel-inferno-detail" aria-hidden="true" />
          <div className="ciel-inferno-vignette" aria-hidden="true" />
          <p className="ciel-inferno-kicker" aria-hidden="true">
            CIEL <span>EMERALD INFERNO</span>
          </p>
        </>
      )}
    </dialog>,
    document.body,
  );
}
