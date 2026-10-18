import { useEffect, useId, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CIEL_INFERNO_DURATION,
  createCielInfernoRenderer,
  type InfernoGeometry,
} from "@/lib/ciel-inferno-renderer";
import styles from "@/styles-ciel-inferno.css?url";

type Props = {
  origin: { x: number; y: number };
  onClose: () => void;
  artSrc?: string;
  artSrcSet?: string;
  routeKey?: string;
};
type Renderer = ReturnType<typeof createCielInfernoRenderer>;
const ART = "/ciel-inferno-20261019/ciel-1080.webp";
const ART_SET =
  "/ciel-inferno-20261019/ciel-216.webp 216w, /ciel-inferno-20261019/ciel-720.webp 720w, /ciel-inferno-20261019/ciel-1080.webp 1080w";
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
const calmNow = () => {
  if (typeof window === "undefined") return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)").matches ||
    document.documentElement.dataset.worldEffects === "economy" ||
    Boolean(connection?.saveData) ||
    /^(slow-)?2g$/.test(connection?.effectiveType || "")
  );
};

/** The site itself is never burned, captured, replaced or traversed. All
 * pixels/resources belong to this bounded, dismissible top-layer overlay. */
export default function CielInferno({
  origin,
  onClose,
  artSrc = ART,
  artSrcSet = ART_SET,
  routeKey = "",
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLCanvasElement>(null);
  const detail = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const exit = useRef<HTMLButtonElement>(null);
  const close = useRef(() => {});
  const callback = useRef(onClose);
  callback.current = onClose;
  const initial = useRef({ x: clamp(origin.x), y: clamp(origin.y), calm: calmNow() });
  const route = routeKey;
  const initialRoute = useRef(route);
  const id = useId();

  useEffect(() => {
    if (route !== initialRoute.current) close.current();
  }, [route]);

  useEffect(() => {
    const modal = dialog.current;
    const backdrop = field.current;
    const foreground = detail.current;
    const dragon = art.current;
    if (!modal || !backdrop || !foreground || !dragon) return;
    const source = initial.current;
    const calm = source.calm;
    const duration = calm ? 1900 : CIEL_INFERNO_DURATION;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const startURL = location.href;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const media = window.matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)");
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
    let renderer: Renderer | null = null;
    let frame = 0;
    let started = 0;
    let ended = false;
    let cleaned = false;
    let begun = false;
    let restoreView = true;
    let needsFocusRestore = false;
    let focusQueued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let phase = "";
    const restores: Array<() => void> = [];
    // Longhand snapshots preserve an owner's pre-existing overflow-y or
    // !important value. Never fix/reposition body or replace its cssText.
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
    const layout = (): InfernoGeometry => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const size = Math.min(width * (width < 700 ? 1.45 : 0.78), height * 1.02, 1040);
      // The supplied drawing's open mouth is at (.54,.44), projecting left
      // and downward. No per-frame layout reads or guessed button geometry.
      const mouthX = width * 0.73;
      const mouthY = height * (width < 700 ? 0.31 : 0.34);
      const left = mouthX - size * 0.54;
      const top = mouthY - size * 0.44;
      dragon.style.width = dragon.style.height = `${size}px`;
      dragon.style.left = `${left}px`;
      dragon.style.top = `${top}px`;
      dragon.style.setProperty("--ci-start-x", `${source.x * width - left - size * 0.5}px`);
      dragon.style.setProperty("--ci-start-y", `${source.y * height - top - size * 0.5}px`);
      return { width, height, mouthX, mouthY, angle: 2.52 };
    };
    const resize = () => {
      if (!ended) renderer?.resize(layout());
    };
    const queueFocusRestore = () => {
      if (focusQueued || !needsFocusRestore || !restoreView) return;
      focusQueued = true;
      const settle = (last: boolean) => {
        if (!restoreView || location.href !== startURL || document.hidden) return;
        // Native dialog.close(), React's provider commit and the portal's
        // observer settle separately. Re-query the live Ciel, never prefer
        // an old Ciel node merely because it is connected for one more frame.
        const currentButton = document.querySelector<HTMLElement>(".zeus-button");
        const wasCiel = Boolean(active?.matches(".zeus-button, .ciel-button"));
        const target = wasCiel || !active?.isConnected || active === body ? currentButton : active;
        const focused = document.activeElement;
        const belongsToReturn =
          !focused ||
          focused === body ||
          focused === html ||
          focused === active ||
          modal.contains(focused) ||
          (focused instanceof Element && focused.matches(".zeus-button, .ciel-button"));
        // A user-selected control, a new route, or another top-layer dialog
        // owns its focus. This bounded repair must not take it away.
        if (!belongsToReturn) return;
        const openDialog = [...document.querySelectorAll("dialog[open]")].at(-1);
        if (target && (!openDialog || openDialog.contains(target))) {
          try {
            if (focused !== target) target.focus({ preventScroll: true });
          } catch {
            /* A portal can detach this exact node before focus. */
          }
        }
        if (!last) requestAnimationFrame(() => settle(true));
      };
      // Only three frames maximum: two for native/React/portal settling,
      // then one verification/re-query. No timer or persistent retry loop.
      requestAnimationFrame(() => requestAnimationFrame(() => settle(false)));
    };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(cap);
      clearTimeout(styleTimer);
      // Losing an already-lost GPU context must never strand the scroll
      // lock, dialog, stylesheet, listeners or the provider's active flag.
      try {
        renderer?.dispose();
      } catch {
        /* The overlay still owns and removes both canvas elements. */
      }
      renderer = null;
      link.onload = link.onerror = null;
      link.remove();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("popstate", leave);
      window.removeEventListener("hashchange", leave);
      media.removeEventListener("change", changed);
      connection?.removeEventListener("change", changed);
      modal.removeEventListener("cancel", cancel);
      modal.removeEventListener("close", finish);
      if (modal.open) modal.close();
      for (let i = restores.length - 1; i >= 0; i--) restores[i]();
      // A route change owns its own scroll; only this original view returns
      // to its exact scroll. No focus is stolen from a newly opened route.
      if (restoreView && location.href === startURL && !document.hidden) {
        try {
          window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
        } catch {
          try {
            window.scrollTo(scrollX, scrollY);
          } catch {
            /* A departing view need not scroll. */
          }
        }
        needsFocusRestore = true;
      }
    };
    const finish = () => {
      if (ended) return;
      ended = true;
      cleanup();
      try {
        callback.current();
      } finally {
        queueFocusRestore();
      }
    };
    close.current = finish;
    const visibility = () => {
      if (document.hidden) {
        restoreView = false;
        finish();
      }
    };
    const leave = () => {
      restoreView = false;
      finish();
    };
    const cancel = (event: Event) => {
      event.preventDefault();
      finish();
    };
    const changed = () => {
      if (
        media.matches !== mediaAtStart ||
        html.dataset.worldEffects !== tier ||
        connection?.saveData !== saveData ||
        connection?.effectiveType !== networkTier
      )
        finish();
    };
    const observer = new MutationObserver(changed);
    observer.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
    modal.addEventListener("cancel", cancel);
    modal.addEventListener("close", finish);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("popstate", leave);
    window.addEventListener("hashchange", leave);
    window.addEventListener("resize", resize, { passive: true });
    window.visualViewport?.addEventListener("resize", resize, { passive: true });
    media.addEventListener("change", changed);
    connection?.addEventListener("change", changed);
    const tick = (now: number) => {
      frame = 0;
      if (ended || document.hidden) return;
      const elapsed = now - started;
      if (elapsed >= duration) {
        finish();
        return;
      }
      const next = calm
        ? "return"
        : elapsed < 1100
          ? "awaken"
          : elapsed < 3100
            ? "jet"
            : elapsed < 5600
              ? "engulf"
              : elapsed < 7100
                ? "ash"
                : "return";
      if (next !== phase) {
        phase = next;
        modal.dataset.phase = phase;
      }
      try {
        renderer?.render(elapsed);
      } catch {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const begin = () => {
      if (ended || begun) return;
      begun = true;
      clearTimeout(styleTimer);
      if (document.hidden) {
        finish();
        return;
      }
      const geometry = layout();
      try {
        if (!calm) {
          renderer = createCielInfernoRenderer({
            field: backdrop,
            detail: foreground,
            coarse: matchMedia("(pointer: coarse), (any-pointer: coarse)").matches,
            onFailure: finish,
            onAtlasState: (state) => {
              if (!ended) modal.dataset.jet = state;
            },
          });
          renderer.resize(geometry);
        }
        if (typeof modal.showModal === "function") modal.showModal();
        else {
          finish();
          return;
        }
      } catch {
        finish();
        return;
      }
      modal.dataset.renderer = renderer?.backend ?? "calm";
      modal.dataset.ready = "true";
      exit.current?.focus({ preventScroll: true });
      started = performance.now();
      timer = setTimeout(finish, duration);
      if (!calm) frame = requestAnimationFrame(tick);
    };
    link.onload = begin;
    link.onerror = finish;
    const styleTimer = setTimeout(finish, 1500);
    const cap = setTimeout(finish, 9800);
    document.head.append(link);
    // Cached styles can become a sheet before their load callback dispatch.
    if (link.sheet) begin();
    return () => {
      ended = true;
      cleanup();
      queueFocusRestore();
      close.current = () => {};
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="ciel-inferno"
      data-ciel-inferno=""
      data-calm={initial.current.calm ? "true" : "false"}
      data-ready="false"
      data-phase="awaken"
      data-jet={initial.current.calm ? "unused" : "loading"}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      style={{ "--ci-duration": `${CIEL_INFERNO_DURATION}ms` } as CSSProperties}
    >
      <h2 id={`${id}-title`} className="ciel-inferno-sr">
        シエルの緑炎
      </h2>
      <p id={`${id}-description`} className="ciel-inferno-sr">
        緑の炎が画面を包む短い演出です。いつでも終了できます。
      </p>
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
      <button
        ref={exit}
        type="button"
        className="ciel-inferno-close"
        aria-label="演出を終了"
        onClick={() => close.current()}
      >
        <span aria-hidden="true">×</span> 演出を終了
      </button>
      <button type="button" className="ciel-inferno-return" onClick={() => close.current()}>
        元の画面へ <span aria-hidden="true">↗</span>
      </button>
    </dialog>,
    document.body,
  );
}
