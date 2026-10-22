/** FAR FROM SAGA — the scroll suit-up runway (2026-10-22).
 *
 * The seam the /far-from-saga `#suitup` section mounts: `mountFarFromAssembly(
 * host, { beats })` on the runway element, a disposer back. The runway is a
 * tall track with a sticky stage; its progress (0 at the top, 1 at the
 * bottom) is the one clock of the scene (far-from-assembly-scene.ts, the
 * lazy chunk: the cells of the ミドル artwork flying in from distant points,
 * the shared resonance field — src/lib/rexonance-field — converging on each
 * part, the crystal light, the bits and the halo rings). Every frame is
 * closed-form in that progress, so the scroll scrubs it in both directions.
 *
 * Tiers, as the Rexonance runway's: prefers-reduced-motion, forced colours,
 * Save-Data and 2G, and the world's economy flag hold the still (the finished
 * figure, the read-out at 100 %, no canvas, nothing downloaded). Otherwise
 * the scene's chunk and its picture load when the runway comes within a
 * screen, never on the startup path; the loop runs only while the runway is
 * on screen and only when the progress changes (no idle rendering), and a
 * hidden tab pauses it. Without WebGL the scene draws its own motes. */

import { FAR_FROM_SAGA_ARTWORK, farFromImage } from "./far-from-saga-artwork";
import type { FarFromScene } from "./far-from-assembly-scene";

export type FarFromAssemblyBeat = {
  /** 0–1 along the runway's scroll: when the part begins to form. */
  at: number;
  /** When it has formed. */
  until: number;
  /** What settles at this beat. */
  part: string;
  /** Its read-out on the HUD (plain Japanese). */
  label: string;
};

export type FarFromAssemblyOptions = {
  beats?: readonly FarFromAssemblyBeat[];
  /** Observe the viewer's prefers-reduced-motion (always honoured). */
  reducedMotion?: boolean;
};

/** The suit-up's beats, in order: the parts as the scene forms them
 * (far-from-assembly-scene.ts FAR_FROM_WINDOWS carries the same shares). */
export const FAR_FROM_ASSEMBLY_BEATS: readonly FarFromAssemblyBeat[] = Object.freeze([
  { at: 0, until: 0.1, part: "gather", label: "集結" },
  { at: 0.08, until: 0.3, part: "legs", label: "脚部装甲" },
  { at: 0.26, until: 0.4, part: "waist", label: "腰部装甲" },
  { at: 0.36, until: 0.52, part: "arms", label: "腕部装甲" },
  { at: 0.48, until: 0.62, part: "chest", label: "胸部装甲" },
  { at: 0.58, until: 0.7, part: "head", label: "頭部" },
  { at: 0.68, until: 0.9, part: "crystal", label: "結晶・中枢" },
  { at: 0.74, until: 0.92, part: "bits", label: "ファーフロムビット" },
  { at: 0.88, until: 1, part: "halo", label: "光輪" },
]);

/** The runway's progress for a scroll position: 0 while the runway's top is
 * at or below the viewport's top, 1 once its bottom has reached the stage's
 * bottom (the stage is sticky for `height - stage` of travel). */
export function farFromRunwayProgress(top: number, height: number, stage: number): number {
  const travel = height - stage;
  if (!(travel > 0)) return top <= 0 ? 1 : 0;
  const p = -top / travel;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export type FarFromBeatState = "pending" | "forming" | "set";

/** A beat's state at progress p. */
export function farFromBeatState(beat: FarFromAssemblyBeat, p: number): FarFromBeatState {
  if (p >= beat.until) return "set";
  if (p >= beat.at) return "forming";
  return "pending";
}

type Environment = Pick<Window, "matchMedia" | "requestAnimationFrame" | "cancelAnimationFrame"> & {
  navigator?: Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  devicePixelRatio?: number;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
  setTimeout: Window["setTimeout"];
  clearTimeout: Window["clearTimeout"];
  IntersectionObserver?: typeof IntersectionObserver;
  ResizeObserver?: typeof ResizeObserver;
  Image?: typeof Image;
};

/** The picture the scene cuts: the stage's height picks the delivery
 * width, so a phone never decodes the 1280 file for a 500 px figure. */
export function farFromSceneSource(stageHeight: number, ratio: number): string {
  const need = stageHeight * 0.86 * ratio;
  const stem = FAR_FROM_SAGA_ARTWORK.middle.src.replace(/-1280\.webp$/, "");
  const widths = farFromImage("middle")
    .srcSet.split(", ")
    .map((entry) => Number(entry.split(" ")[1].replace("w", "")));
  const aspect = FAR_FROM_SAGA_ARTWORK.middle.width / FAR_FROM_SAGA_ARTWORK.middle.height;
  for (const width of widths) if (width / aspect >= need) return `${stem}-${width}.webp`;
  return FAR_FROM_SAGA_ARTWORK.middle.src;
}

/** Loads the scene's chunk and its picture; null past `deadline` ms (the
 * caller keeps its still). Shared by the runway and the entry. */
export function loadFarFromScene(
  src: string,
  environment: { Image?: typeof Image; setTimeout: Window["setTimeout"]; clearTimeout: Window["clearTimeout"] },
  deadline = 12000,
): Promise<{ module: typeof import("./far-from-assembly-scene"); image: HTMLImageElement } | null> {
  const ImageCtor = environment.Image ?? globalThis.Image;
  if (typeof ImageCtor !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const image = new ImageCtor();
    const finish = (value: { module: typeof import("./far-from-assembly-scene"); image: HTMLImageElement } | null) => {
      if (done) return;
      done = true;
      environment.clearTimeout(timer);
      image.onload = image.onerror = null;
      if (!value) image.src = "";
      resolve(value);
    };
    const timer = environment.setTimeout(() => finish(null), deadline);
    const picture = new Promise<HTMLImageElement>((ok, fail) => {
      image.decoding = "async";
      image.onload = () => ok(image);
      image.onerror = () => fail(new Error("far-from: picture failed"));
      image.src = src;
    });
    Promise.all([import("./far-from-assembly-scene"), picture]).then(
      ([module, loaded]) => finish({ module, image: loaded }),
      () => finish(null),
    );
  });
}

/**
 * Mounts the suit-up runway on `host` (the `.ffs-runway` element: a
 * `.ffs-stage` with a `canvas.ffs-canvas`, the still picture and the HUD).
 * Returns the disposer. Safe to call with a null host or without a stage:
 * then nothing is mounted and the still stands.
 */
export function mountFarFromAssembly(
  host: HTMLElement | null | undefined,
  options: FarFromAssemblyOptions = {},
  environment: Environment = window,
): () => void {
  if (!host) return () => {};
  const beats = options.beats ?? FAR_FROM_ASSEMBLY_BEATS;
  const document = host.ownerDocument;
  const html = document.documentElement;
  const stage = host.querySelector<HTMLElement>(".ffs-stage");
  const canvas = host.querySelector<HTMLCanvasElement>("canvas.ffs-canvas");
  const percent = host.querySelector<HTMLElement>(".ffs-percent");
  const parts = beats.map((beat) => ({
    beat,
    element: host.querySelector<HTMLElement>(`.ffs-part[data-part="${beat.part}"]`),
    state: "" as string,
  }));
  if (!stage || !canvas || typeof canvas.getContext !== "function") {
    host.dataset.ffsLoad = "static";
    return () => {
      delete host.dataset.ffsLoad;
    };
  }
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColors = environment.matchMedia("(forced-colors: active)");
  const coarse = environment.matchMedia("(pointer: coarse)");
  const connection = environment.navigator?.connection;
  const motionAllowed = () => {
    const constrained =
      Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    return (
      options.reducedMotion !== true &&
      !reduced.matches &&
      !forcedColors.matches &&
      !constrained &&
      html.dataset.worldEffects !== "economy"
    );
  };

  let disposed = false;
  let scene: FarFromScene | null = null;
  let loading: Promise<void> | null = null;
  let near = false;
  let live = false;
  let frame = 0;
  let lastProgress = -1;
  let lastPercent = "";
  let stageW = 0;
  let stageH = 0;
  let needsResize = true;

  // The read-outs change every frame of a scrub: rewrite the text node's
  // data, not the element's content (a replaced node is a tree change).
  const writeText = (element: HTMLElement | null, text: string) => {
    if (!element) return;
    const node = element.firstChild;
    if (node && node.nodeType === 3 && !node.nextSibling) {
      if ((node as Text).data !== text) (node as Text).data = text;
    } else element.textContent = text;
  };

  const hud = (p: number) => {
    const pct = String(Math.round(p * 100));
    if (pct !== lastPercent) {
      lastPercent = pct;
      writeText(percent, pct);
    }
    for (const part of parts) {
      const state = farFromBeatState(part.beat, p);
      if (state !== part.state) {
        part.state = state;
        if (part.element) part.element.dataset.state = state;
      }
    }
    const phase = p <= 0 ? "idle" : p >= 1 ? "complete" : "forming";
    if (host.dataset.ffsState !== phase) host.dataset.ffsState = phase;
  };

  const progressNow = () => {
    const rect = host.getBoundingClientRect();
    return farFromRunwayProgress(rect.top, rect.height, stageH || stage.clientHeight);
  };

  const render = () => {
    frame = 0;
    if (disposed || !scene || !live) return;
    if (needsResize) {
      needsResize = false;
      stageW = stage.clientWidth;
      stageH = stage.clientHeight;
      scene.resize(stageW, stageH, environment.devicePixelRatio || 1);
      lastProgress = -1;
    }
    const p = progressNow();
    if (p === lastProgress) return;
    lastProgress = p;
    hud(p);
    // Cells still owed to the landed cache: the next frame draws them.
    if (scene.render(p) > 0) schedule(true);
  };
  const schedule = (force = false) => {
    if (frame || disposed || !live) return;
    if (!force && document.visibilityState === "hidden") return;
    frame = environment.requestAnimationFrame(render);
  };
  const onScroll = () => schedule();
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      lastProgress = -1;
      schedule();
    }
  };

  const goLive = () => {
    if (live || disposed || !scene) return;
    live = true;
    host.dataset.ffsLoad = "live";
    environment.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    lastProgress = -1;
    schedule();
  };
  const goStill = () => {
    if (!live) return;
    live = false;
    environment.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    if (frame) environment.cancelAnimationFrame(frame);
    frame = 0;
  };

  const load = () => {
    if (loading || scene || disposed) return;
    const ratio = Math.min(1.5, environment.devicePixelRatio || 1);
    loading = loadFarFromScene(farFromSceneSource(stage.clientHeight, ratio), environment).then(
      (loaded) => {
        loading = null;
        if (!loaded || disposed || !motionAllowed()) {
          if (!disposed && !loaded) host.dataset.ffsLoad = "static";
          return;
        }
        scene = loaded.module.createFarFromScene({
          stage,
          canvas,
          image: loaded.image,
          coarse: coarse.matches,
        });
        needsResize = true;
        host.dataset.ffsLoad = "ready";
        if (near) goLive();
      },
    );
  };

  const settle = () => {
    if (motionAllowed()) {
      if (host.dataset.ffsLoad !== "live" && host.dataset.ffsLoad !== "ready")
        host.dataset.ffsLoad = "waiting";
      if (near) {
        if (scene) goLive();
        else load();
      }
    } else {
      goStill();
      host.dataset.ffsLoad = "static";
      hud(1);
    }
  };

  let observer: IntersectionObserver | null = null;
  let resizer: ResizeObserver | null = null;
  if (typeof environment.IntersectionObserver === "function") {
    observer = new environment.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          near = entry.isIntersecting;
          if (near) settle();
          else goStill();
        }
      },
      { rootMargin: "100% 0px 100% 0px" },
    );
    observer.observe(host);
  } else {
    near = true;
    settle();
  }
  if (typeof environment.ResizeObserver === "function") {
    resizer = new environment.ResizeObserver(() => {
      needsResize = true;
      schedule();
    });
    resizer.observe(stage);
  }
  const onPreference = () => settle();
  reduced.addEventListener?.("change", onPreference);
  forcedColors.addEventListener?.("change", onPreference);
  const effects = new MutationObserver(onPreference);
  effects.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
  settle();

  return () => {
    disposed = true;
    goStill();
    observer?.disconnect();
    resizer?.disconnect();
    effects.disconnect();
    reduced.removeEventListener?.("change", onPreference);
    forcedColors.removeEventListener?.("change", onPreference);
    scene?.release();
    scene = null;
    delete host.dataset.ffsLoad;
    delete host.dataset.ffsState;
  };
}
