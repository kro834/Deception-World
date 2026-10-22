/* FAR FROM SAGA — the ウルトラ sequence's mount (2026-10-22).

   `mountFarFromUltra(runway)` drives the #ultra runway: a tall section whose
   frame sticks while the scroll scrubs the sequence (far-from-ultra-scene.ts)
   from マックス, where the #suitup runway ends, to ウルトラ with its auxiliary
   interfaces. The frame's state is on the runway as data-ffu-state:

   - "static": reduced motion, forced colours, economy rendering, Save-Data
     or 2G. The stylesheet shows the still (the owner's ウルトラ with its
     interfaces); nothing is imported, fetched or drawn.
   - "waiting": motion allowed, the scene not yet ready. The マックス cutout
     stands in the frame; once the runway is near, the scene's chunk, the
     cutouts and the kit's sheets are fetched and decoded, the white body and
     the plan prepared.
   - "live": the canvas draws. Every frame is a closed-form function of the
     scroll progress; nothing runs between scrolls, nothing while the runway
     is out of view or the page hidden.

   Never on the page's startup path: the component mounts this after paint,
   and this imports the scene only under the motion gate, only once near. */
import {
  FAR_FROM_ULTRA_BUDGET,
  FAR_FROM_ULTRA_FIGURE,
  FAR_FROM_ULTRA_PHASES,
  FAR_FROM_ULTRA_WINDOWS,
  farFromUltraSrc,
  type FarFromUltraTier,
} from "./far-from-ultra-art.ts";
import {
  FAR_FROM_STAGE_TIERS,
  FAR_FROM_STAGE_VARS,
  farFromFigureBox,
  farFromStageTier,
} from "./far-from-stage.ts";
import type { FarFromUltraScene } from "./far-from-ultra-scene.ts";

type Connection = { saveData?: boolean; effectiveType?: string };
type Bitmap = (ImageBitmap | HTMLImageElement) & { width: number; height: number };

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const NEAR_MARGIN = "80% 0px 80% 0px";
const FETCH_TIMEOUT = 12000;
/** A sample grid of the cutouts' alpha for the plan (a quarter of the figure). */
const SAMPLE = 4;

export function mountFarFromUltra(
  runway: HTMLElement | null,
  environment: Window = window,
): () => void {
  if (!runway) return () => {};
  const document = runway.ownerDocument;
  const html = document.documentElement;
  const frame = runway.querySelector<HTMLElement>(".ffu-frame");
  const canvas = runway.querySelector<HTMLCanvasElement>("canvas.ffu-canvas");
  if (!frame || !canvas || typeof canvas.getContext !== "function") return () => {};
  const phases = [...runway.querySelectorAll<HTMLElement>(".ffu-phase [data-phase]")];
  const percent = runway.querySelector<HTMLElement>(".ffu-percent");
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColors = environment.matchMedia("(forced-colors: active)");
  const coarse = environment.matchMedia("(pointer: coarse)");
  const connection = (environment.navigator as Navigator & { connection?: Connection }).connection;

  let disposed = false;
  let live = false;
  let near = false;
  let visible = false;
  let loading: Promise<void> | null = null;
  let scene: FarFromUltraScene | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let bitmaps: Bitmap[] = [];
  let rafId = 0;
  let dirty = true;
  let lastProgress = -1;
  let lastPhase = -1;
  let lastPercent = "";
  let pinTop = 0;
  let travel = 0;
  let width = 0;
  let height = 0;
  let ratio = 1;

  // The preferences as their change events last reported them, never polled
  // (a listened list's `.matches` refreshes Chromium's cached result, and a
  // change read that way before the next style recalc never fires).
  const mediaNow = (list: MediaQueryList, event?: MediaQueryListEvent) =>
    typeof event?.matches === "boolean" ? event.matches : Boolean(list.matches);
  let reducedNow = mediaNow(reduced);
  let forcedNow = mediaNow(forcedColors);
  const motionAllowed = () => {
    const constrained =
      Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    return !reducedNow && !forcedNow && !constrained && html.dataset.worldEffects !== "economy";
  };
  const tier = (): FarFromUltraTier => (mediaNow(coarse) ? "coarse" : "fine");
  const setState = (state: "static" | "waiting" | "live") => {
    if (runway.dataset.ffuState !== state) runway.dataset.ffuState = state;
  };

  // The read-outs change on every frame of a scrub: rewrite the text node's
  // data rather than the element's content (a tree change restyles the
  // shell through its :has() rules).
  const writeText = (element: HTMLElement | null, text: string) => {
    if (!element) return;
    const node = element.firstChild;
    if (node && node.nodeType === 3 && !node.nextSibling) {
      if ((node as Text).data !== text) (node as Text).data = text;
    } else element.textContent = text;
  };

  /* ---------------- geometry ---------------- */
  // The figure stands where the #suitup runway's placement puts it for the
  // viewport's layout tier (far-from-stage.ts), written to the frame as the
  // same custom properties the stills are laid out by, so the still, the
  // マックス stand-in and the canvas agree in every tier.
  let placedTier = "";
  const placement = () => {
    const stageTier = farFromStageTier(
      environment.innerWidth || 1440,
      environment.innerHeight || 900,
    );
    const place = FAR_FROM_STAGE_TIERS[stageTier];
    if (placedTier !== stageTier) {
      placedTier = stageTier;
      frame.style.setProperty(FAR_FROM_STAGE_VARS.height, String(place.height));
      frame.style.setProperty(FAR_FROM_STAGE_VARS.width, String(place.width));
      frame.style.setProperty(FAR_FROM_STAGE_VARS.x, String(place.x));
      frame.style.setProperty(FAR_FROM_STAGE_VARS.bottom, String(place.bottom));
    }
    return place;
  };
  const measure = () => {
    pinTop = Number.parseFloat(environment.getComputedStyle(frame).top) || 0;
    travel = runway.offsetHeight - frame.offsetHeight;
  };
  const readProgress = () => {
    if (travel <= 0) return 1;
    return clamp01((pinTop - runway.getBoundingClientRect().top) / travel);
  };
  const resize = () => {
    const place = placement();
    if (!scene || !context) return false;
    const cssWidth = frame.clientWidth;
    const cssHeight = frame.clientHeight;
    if (!cssWidth || !cssHeight) return false;
    ratio = Math.min(environment.devicePixelRatio || 1, FAR_FROM_ULTRA_BUDGET[tier()].ratio);
    width = Math.round(cssWidth * ratio);
    height = Math.round(cssHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const box = farFromFigureBox(cssWidth, cssHeight, place, FAR_FROM_ULTRA_FIGURE);
    scene.view(box.scale * ratio, box.x * ratio, box.y * ratio, ratio, width, height);
    measure();
    return true;
  };

  /* ---------------- the loop ---------------- */
  const phaseAt = (progress: number) => {
    let index = 0;
    for (let k = 0; k < FAR_FROM_ULTRA_PHASES.length; k += 1)
      if (progress >= FAR_FROM_ULTRA_WINDOWS[FAR_FROM_ULTRA_PHASES[k].phase][0]) index = k;
    return index;
  };
  const hud = (progress: number) => {
    const phase = phaseAt(progress);
    if (phase !== lastPhase) {
      lastPhase = phase;
      phases.forEach((element, k) => {
        const state = k < phase ? "done" : k === phase ? "on" : "";
        if (element.dataset.state !== state) element.dataset.state = state;
      });
    }
    const text = String(Math.round(progress * 100));
    if (text !== lastPercent) {
      lastPercent = text;
      writeText(percent, text);
    }
  };
  const tick = () => {
    rafId = 0;
    if (disposed || !live || !scene || !context) return;
    const progress = readProgress();
    const changed = progress !== lastProgress;
    if (changed || dirty || !scene.settled()) {
      dirty = false;
      lastProgress = progress;
      scene.frame(progress);
      scene.draw(context);
      hud(progress);
    }
    // The cache catches up over a few frames after a long jump back; a
    // resting frame otherwise costs nothing until the next scroll.
    if (visible && !document.hidden && !scene.settled()) schedule();
  };
  const schedule = () => {
    if (rafId || disposed) return;
    rafId = environment.requestAnimationFrame(tick);
  };
  const onScroll = () => {
    if (live && visible && !document.hidden) schedule();
  };

  /* ---------------- loading ---------------- */
  const fetchBitmap = async (
    source: string,
    signal: AbortSignal,
    priority: "low" | "high",
  ): Promise<Bitmap> => {
    if (typeof createImageBitmap === "function" && typeof fetch === "function") {
      const response = await fetch(source, { signal, priority } as RequestInit);
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      const blob = await response.blob();
      if (signal.aborted) throw new Error("aborted");
      return (await createImageBitmap(blob)) as Bitmap;
    }
    return new Promise<Bitmap>((resolve, reject) => {
      const image = document.createElement("img");
      image.decoding = "async";
      image.onload = () => resolve(image as Bitmap);
      image.onerror = () => reject(new Error(`${source}: failed`));
      image.src = source;
    });
  };
  const alphaSamples = (max: Bitmap, body: Bitmap) => {
    const { width: W, height: H } = FAR_FROM_ULTRA_FIGURE;
    const sw = W / SAMPLE;
    const sh = H / SAMPLE;
    const scratch = document.createElement("canvas");
    scratch.width = sw;
    scratch.height = sh;
    const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
    if (!scratchContext) return null;
    const read = (bitmap: Bitmap) => {
      scratchContext.clearRect(0, 0, sw, sh);
      scratchContext.drawImage(bitmap, 0, 0, sw, sh);
      const { data } = scratchContext.getImageData(0, 0, sw, sh);
      const alpha = new Uint8Array(sw * sh);
      for (let k = 0; k < alpha.length; k += 1) alpha[k] = data[k * 4 + 3];
      return alpha;
    };
    const samples = { width: sw, height: sh, max: read(max), body: read(body) };
    scratch.width = 0;
    return samples;
  };
  let controller: AbortController | null = null;
  const prepare = async () => {
    const own = new AbortController();
    controller = own;
    const signal = own.signal;
    const deadline = environment.setTimeout(() => own.abort(), FETCH_TIMEOUT);
    try {
      const currentTier = tier();
      const artWidth = FAR_FROM_ULTRA_BUDGET[currentTier].width;
      const [sceneModule, kitModule, max, body] = await Promise.all([
        import("./far-from-ultra-scene.ts"),
        import("./far-from-ultra-kit.ts"),
        fetchBitmap(farFromUltraSrc("max", artWidth), signal, "high"),
        fetchBitmap(farFromUltraSrc("body", artWidth), signal, "high"),
      ]);
      if (signal.aborted || disposed) throw new Error("aborted");
      const kit = kitModule.FAR_FROM_ULTRA_KIT;
      // The kit's sheets are optional: without them the swarm is not drawn.
      const sheets = await Promise.all(
        kit.assets.map((asset) => fetchBitmap(asset, signal, "low").catch(() => null)),
      );
      if (signal.aborted || disposed) throw new Error("aborted");
      // The HUD face, so the read-outs measure and draw in it.
      try {
        await Promise.race([
          document.fonts?.load(`600 12px Michroma`),
          new Promise((resolve) => environment.setTimeout(resolve, 1500)),
        ]);
      } catch {
        /* the fallback face draws the read-outs */
      }
      const samples = alphaSamples(max, body);
      if (!samples) throw new Error("no 2d context");
      const plan = sceneModule.planFarFromUltra(samples);
      bitmaps = [max, body, ...sheets.filter((sheet): sheet is Bitmap => sheet !== null)];
      scene = sceneModule.createFarFromUltraScene({
        plan,
        tier: currentTier,
        bitmaps: { max, body, cells: sheets[0], comets: sheets[1], fx: sheets[2] },
        kit,
        document,
      });
      context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("no 2d context");
      if (!resize()) {
        // A hidden frame (display none): measured again on the next resize.
        dirty = true;
      }
      live = true;
      setState("live");
      dirty = true;
      schedule();
    } catch (error) {
      if (disposed) return;
      // Nothing to show but the still: the final ウルトラ with its interfaces.
      if (!signal.aborted || !disposed) setState("static");
      if (!(error instanceof Error && error.message === "aborted")) {
        releaseBitmaps();
      }
    } finally {
      environment.clearTimeout(deadline);
      if (controller === own) controller = null;
    }
  };
  const releaseBitmaps = () => {
    for (const bitmap of bitmaps) (bitmap as ImageBitmap).close?.();
    bitmaps = [];
  };
  const wake = () => {
    if (disposed || live || loading || !near || !motionAllowed() || document.hidden) return;
    loading = prepare().finally(() => {
      loading = null;
    });
  };

  /* ---------------- observers and listeners ---------------- */
  const nearObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) near = entry.isIntersecting;
            wake();
          },
          { rootMargin: NEAR_MARGIN },
        )
      : null;
  const viewObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) visible = entry.isIntersecting;
          if (visible) {
            dirty = true;
            schedule();
          }
        })
      : null;
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          if (resize()) {
            dirty = true;
            schedule();
          }
        })
      : null;
  const onVisibility = () => {
    if (!document.hidden) {
      dirty = true;
      schedule();
      wake();
    }
  };
  const onMotionChange = () => {
    if (disposed) return;
    if (!motionAllowed()) {
      // Motion withdrawn: hand the frame to the still; the scene stays for
      // a change back (its layers are small beside its pictures).
      live = false;
      setState("static");
      return;
    }
    if (scene && context) {
      live = true;
      setState("live");
      dirty = true;
      schedule();
    } else {
      setState("waiting");
      wake();
    }
  };
  const onReduced = (event: MediaQueryListEvent) => {
    reducedNow = mediaNow(reduced, event);
    onMotionChange();
  };
  const onForced = (event: MediaQueryListEvent) => {
    forcedNow = mediaNow(forcedColors, event);
    onMotionChange();
  };

  setState(motionAllowed() ? "waiting" : "static");
  placement();
  if (!nearObserver) near = true;
  if (!viewObserver) visible = true;
  nearObserver?.observe(runway);
  viewObserver?.observe(runway);
  resizeObserver?.observe(frame);
  environment.addEventListener("scroll", onScroll, { passive: true });
  environment.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  reduced.addEventListener("change", onReduced);
  forcedColors.addEventListener("change", onForced);
  if (!nearObserver) wake();

  return () => {
    disposed = true;
    live = false;
    controller?.abort();
    if (rafId) environment.cancelAnimationFrame(rafId);
    rafId = 0;
    nearObserver?.disconnect();
    viewObserver?.disconnect();
    resizeObserver?.disconnect();
    environment.removeEventListener("scroll", onScroll);
    environment.removeEventListener("resize", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    reduced.removeEventListener("change", onReduced);
    forcedColors.removeEventListener("change", onForced);
    scene?.release();
    scene = null;
    context = null;
    releaseBitmaps();
    canvas.width = 0;
    canvas.height = 0;
    delete runway.dataset.ffuState;
  };
}
