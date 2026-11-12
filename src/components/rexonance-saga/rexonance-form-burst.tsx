import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  FORM_BURST_FADE_MS,
  formBurst,
  formBurstCalm,
  formBurstKind,
} from "@/lib/rexonance-form-burst-loader";
import { releasePendingImage } from "@/lib/release-pending-images";

/* REXONANCE FORM BURST over the 03 panel's art (owner, 2026-11-12; the play
   is rexonance-form-burst.ts): to MAX the picture on the panel is burned by
   green fire and explodes apart; to ULTRA it explodes apart and takes the
   cells in; back to Rexonance the front draws back into the reactor. The
   layer lies exactly over the new form's picture (its fit, its position,
   its lean), holds the old form's until its own first frame is drawn, and
   clears to the picture itself. A new pick re-keys the panel's figure: this
   layer is removed whole (its canvases, its context, its particles with
   them) and the next starts from the form last on screen.

   Reduced motion, economy, no WebGL: the two pictures cross-fade, briefly.
   The page mounts this only once the play's chunk is here (or for the
   cross-fade); until then its own overwrite (FormMorph) changes the form. */

/** The body in the panel's paintings ([x0, y0, x1, y1, r]: x and r in the
 * picture's widths, y in its heights). The three forms stand alike in them
 * (rexonance-overwrite.js FORM_LANDMARKS.panel): the head and horns, the
 * shoulders, the trunk, the arms to the hands, the legs to the picture's
 * foot, the tail over the right shoulder. */
export const FORM_BURST_PANEL_BODY = [
  [0.5, 0.06, 0.5, 0.2, 0.07],
  [0.5, 0.2, 0.58, 0.33, 0.1],
  [0.36, 0.27, 0.71, 0.31, 0.12],
  [0.56, 0.33, 0.6, 0.52, 0.15],
  [0.14, 0.27, 0.3, 0.3, 0.09],
  [0.27, 0.32, 0.2, 0.47, 0.09],
  [0.2, 0.47, 0.27, 0.63, 0.075],
  [0.76, 0.34, 0.8, 0.52, 0.075],
  [0.8, 0.52, 0.9, 0.61, 0.06],
  [0.52, 0.56, 0.38, 0.85, 0.12],
  [0.66, 0.56, 0.7, 0.83, 0.11],
  [0.38, 0.85, 0.33, 1.02, 0.1],
  [0.7, 0.83, 0.72, 1.02, 0.1],
  [0.62, 0.22, 0.68, 0.08, 0.045],
  [0.68, 0.08, 0.86, 0.05, 0.045],
  [0.86, 0.05, 0.94, 0.15, 0.045],
  [0.94, 0.15, 0.9, 0.3, 0.04],
] as const;
/** The reactor in them, and the figure's width in their heights. */
export const FORM_BURST_PANEL_ORIGIN = [0.578, 0.335] as const;
export const FORM_BURST_PANEL_UNIT = 0.62;

type Picture = { image: string; alt: string };
type Responsive = (src: string) => { srcSet?: string; sizes?: string };

/** Fetches the play's chunk once `near` comes within a screen of the view
 * (full motion only), and compiles its program ahead of the first pick. */
export function useFormBurstNear(near: RefObject<Element | null>, mounted: boolean) {
  useEffect(() => {
    const element = near.current;
    if (!mounted || !element || formBurstCalm() || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void formBurst.load().then((stage) => {
          if (!stage) return;
          const warm = () => stage.warmFormBurst();
          if (typeof window.requestIdleCallback === "function")
            window.requestIdleCallback(warm, { timeout: 1500 });
          else window.setTimeout(warm, 300);
        });
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, mounted]);
}

/** Whether this layer changes the form (else the page's own overwrite). */
export const formBurstPlays = (from: string, to: string) =>
  Boolean(formBurstKind(from, to)) && (Boolean(formBurst.stage) || formBurstCalm());

export function RexonanceFormBurst({
  from,
  to,
  delay,
  pictures,
  responsive,
}: {
  from: string;
  to: string;
  delay: number;
  pictures: Record<string, Picture>;
  responsive: Responsive;
}) {
  const ref = useRef<HTMLTemplateElement | null>(null);
  useLayoutEffect(() => {
    const figure = ref.current?.parentElement;
    const img = figure?.querySelector("img");
    if (!figure || !img) return;
    // The panel survives its keyed figure: the form last on screen.
    const panel = img.closest<HTMLElement>(".rxs-stage-panel");
    const held = panel?.dataset.morphStage;
    const origin = held && held in pictures ? held : from;
    if (panel) panel.dataset.morphStage = origin;
    const settle = () => {
      if (panel) panel.dataset.morphStage = to;
    };
    const kind = formBurstKind(origin, to);
    if (!kind || window.matchMedia("(forced-colors: active)").matches) {
      settle();
      return;
    }
    const old = pictures[origin];
    const stage = formBurstCalm() ? null : formBurst.stage;
    if (!stage) {
      // The cross-fade: the old picture, laid over the new, fades out.
      settle();
      if (typeof img.animate !== "function") return;
      const over = document.createElement("img");
      const candidates = responsive(old.image);
      if (candidates.sizes) over.sizes = candidates.sizes;
      if (candidates.srcSet) over.srcset = candidates.srcSet;
      over.src = old.image;
      over.alt = "";
      over.className = "rxf-fade";
      over.setAttribute("aria-hidden", "true");
      const style = getComputedStyle(img);
      Object.assign(over.style, {
        position: "absolute",
        zIndex: "1",
        left: `${img.offsetLeft}px`,
        top: `${img.offsetTop}px`,
        width: `${img.offsetWidth}px`,
        height: `${img.offsetHeight}px`,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        pointerEvents: "none",
      });
      figure.append(over);
      const fade = over.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FORM_BURST_FADE_MS,
        delay,
        easing: "ease-out",
        fill: "forwards",
      });
      const drop = () => {
        releasePendingImage(over);
        over.remove();
      };
      void fade.finished.then(drop, () => undefined);
      return () => {
        fade.cancel();
        drop();
      };
    }
    let cancelled = false;
    let play: ReturnType<typeof stage.playFormBurst> = null;
    const target = {
      src: img.getAttribute("src")!,
      srcSet: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes"),
      alt: img.alt,
      visibility: img.style.visibility,
    };
    const show = (src: string, candidates: { srcSet?: string | null; sizes?: string | null }) => {
      if (candidates.sizes) img.sizes = candidates.sizes;
      else img.removeAttribute("sizes");
      if (candidates.srcSet) img.srcset = candidates.srcSet;
      else img.removeAttribute("srcset");
      img.src = src;
    };
    const restore = () => {
      show(target.src, target);
      img.alt = target.alt;
    };
    // The old picture (cached) holds the panel until the layer's first
    // frame is drawn: the newly keyed figure never shows through early.
    show(old.image, responsive(old.image));
    img.alt = old.alt;
    const loaders = new Set<HTMLImageElement>();
    const load = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        loaders.add(image);
        image.decoding = "async";
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          image.onload = image.onerror = null;
          if (ok && !cancelled && image.naturalWidth > 0) {
            // The delivery file the panel shows, not a second original.
            if (image.currentSrc) image.src = image.currentSrc;
            image.removeAttribute("srcset");
            image.removeAttribute("sizes");
            resolve(image);
          } else resolve(null);
        };
        const timeout = window.setTimeout(() => finish(false), 6000);
        image.onload = () => {
          void Promise.resolve()
            .then(() => image.decode?.())
            .then(
              () => finish(true),
              () => finish(true),
            );
        };
        image.onerror = () => finish(false);
        const candidates = responsive(src);
        if (candidates.sizes) image.sizes = candidates.sizes;
        if (candidates.srcSet) image.srcset = candidates.srcSet;
        image.src = src;
      });
    const plain = () => {
      restore();
      img.style.visibility = target.visibility;
      delete figure.dataset.rxfBurst;
      settle();
    };
    void Promise.all([load(old.image), load(pictures[to].image)]).then(([a, b]) => {
      if (cancelled) return;
      if (!a || !b) {
        plain();
        return;
      }
      const style = getComputedStyle(img);
      const [px, py] = style.objectPosition
        .split(" ")
        .map((part) => (part.endsWith("%") ? Number.parseFloat(part) / 100 : 0.5));
      const cover = style.objectFit === "cover";
      const box = () => {
        // The picture as the panel fits it (contain, on this page).
        const width = img.offsetWidth;
        const height = img.offsetHeight;
        const scale = (cover ? Math.max : Math.min)(width / b.naturalWidth, height / b.naturalHeight);
        return {
          left: (width - b.naturalWidth * scale) * (px ?? 0.5),
          top: (height - b.naturalHeight * scale) * (py ?? 0.5),
          width: b.naturalWidth * scale,
          height: b.naturalHeight * scale,
        };
      };
      const own = img.offsetParent === figure || getComputedStyle(figure).position !== "static";
      figure.dataset.rxfBurst = kind;
      play = stage.playFormBurst({
        kind,
        host: figure,
        frame: () => ({
          left: own ? img.offsetLeft : 0,
          top: own ? img.offsetTop : 0,
          width: img.offsetWidth,
          height: img.offsetHeight,
        }),
        art: box,
        clip: () => ({ left: 0, top: 0, width: img.offsetWidth, height: img.offsetHeight }),
        from: a,
        to: b,
        body: FORM_BURST_PANEL_BODY,
        origin: FORM_BURST_PANEL_ORIGIN,
        unit: FORM_BURST_PANEL_UNIT,
        delay,
        // The layer moves with the picture (its entrance, its lean).
        onFrame: (layer) => {
          const live = getComputedStyle(img);
          layer.style.transform = live.transform;
          layer.style.scale = live.scale;
          layer.style.translate = live.translate;
          layer.style.transformOrigin = live.transformOrigin;
        },
        onShown: () => {
          img.style.visibility = "hidden";
          restore();
        },
        onSwap: settle,
        onDone: () => {
          img.style.visibility = target.visibility;
          delete figure.dataset.rxfBurst;
          play?.cancel();
          play = null;
        },
      });
      if (!play) plain();
    });
    return () => {
      cancelled = true;
      play?.cancel();
      play = null;
      for (const image of loaders) releasePendingImage(image);
      loaders.clear();
      restore();
      img.style.visibility = target.visibility;
      delete figure.dataset.rxfBurst;
    };
    // (`pictures` and `responsive` are the page's constants.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, delay]);
  // (A marker in the figure: the layer itself is made by the play.)
  return <template ref={ref} />;
}
