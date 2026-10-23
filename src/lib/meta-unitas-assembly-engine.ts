/** META UNITAS SAGA — the scroll suit-up's engine chunk (2026-10-23).
 *
 * Imported by src/lib/meta-unitas-assembly.ts only under the motion gate,
 * after the page is idle. It owns the runway (#suitup's .mus-runway): the
 * pictures load once the runway is near, the canvas follows the sticky
 * frame's size, and every scroll sets the target progress; the drawn
 * progress follows it on one rAF loop, eased and speed-capped (through the
 * glowing whole the cap is lower, so the brightest change always takes a
 * quarter second or more), so a fling never strobes. The HUD's calls, the
 * stamp and the rail are set from the same progress. The runway's
 * data-form (the selector's choice) picks what the end of the scroll
 * becomes: ミドル stops finished; ウルトラ partitions it again.
 */

import {
  META_UNITAS_MIDDLE_PICTURES,
  META_UNITAS_ULTRA_PICTURES,
  createPartitionScene,
  loadPictures,
  type MetaUnitasForm,
  type PartitionScene,
} from "./meta-unitas-partition.ts";
import { META_UNITAS_SUIT_SIZE } from "./meta-unitas-suit.ts";
import {
  META_UNITAS_BEATS,
  META_UNITAS_MIDDLE_DONE,
  callsAt,
  clamp01,
} from "./meta-unitas-timeline.ts";

/** The drawn progress's speed limits (runway per second). */
const SPEED = 1.5;
const SPEED_BRIGHT = 0.45;
/** Where the brightest change happens (the whole rising, the plates lit). */
const BRIGHT: readonly [number, number] = [
  META_UNITAS_BEATS.whole[0] - 0.02,
  META_UNITAS_BEATS.partition[1],
];

/** The figure's box in the frame, from the sheet's custom properties. */
export function figureBox(
  frame: { width: number; height: number },
  style: CSSStyleDeclaration | null,
) {
  const read = (name: string, fallback: number) => {
    const value = Number.parseFloat(style?.getPropertyValue(name) ?? "");
    return Number.isFinite(value) ? value : fallback;
  };
  const share = read("--mus-fig-h", 0.86);
  const widthShare = read("--mus-fig-w", 0.94);
  const centre = read("--mus-fig-x", 0.5);
  const bottom = read("--mus-fig-b", 0.03);
  let height = frame.height * share;
  let width = (height * META_UNITAS_SUIT_SIZE.width) / META_UNITAS_SUIT_SIZE.height;
  if (width > frame.width * widthShare) {
    width = frame.width * widthShare;
    height = (width * META_UNITAS_SUIT_SIZE.height) / META_UNITAS_SUIT_SIZE.width;
  }
  return {
    x: frame.width * centre - width / 2,
    y: frame.height * (1 - bottom) - height,
    width,
    height,
  };
}

export function mountMetaUnitasAssemblyEngine(
  runway: HTMLElement,
  environment: typeof globalThis = window,
): () => void {
  const win = environment;
  const frame = runway.querySelector<HTMLElement>(".mus-frame");
  const canvas = runway.querySelector<HTMLCanvasElement>(".mus-canvas");
  const context = canvas?.getContext("2d", { alpha: true }) ?? null;
  if (!frame || !canvas || !context) {
    runway.dataset.musLoad = "static";
    return () => {};
  }
  const lines = [...runway.querySelectorAll<HTMLElement>(".mus-call-line")];
  const chants = [...runway.querySelectorAll<HTMLElement>(".mus-call-chip")];
  const rail = runway.querySelector<HTMLElement>(".mus-rail > i");
  let disposed = false;
  let scene: PartitionScene | null = null;
  let loadingUltra = false;
  let target = 0;
  let shown = -1;
  let raf = 0;
  let last = 0;
  let visible = false;
  let deviceRatio = 1;

  const form = (): MetaUnitasForm => (runway.dataset.form === "ultra" ? "ultra" : "middle");

  const measure = () => {
    const rect = runway.getBoundingClientRect();
    const travel = rect.height - frame.offsetHeight;
    target = travel > 0 ? clamp01(-rect.top / travel) : 0;
  };

  const size = () => {
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    // A device-pixel budget: 2× at most, and no more than ~2.4 M pixels
    // (the mid-range Android budget the other runways keep).
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    const budget = Math.min(1, Math.sqrt(2_400_000 / Math.max(1, width * height * ratio * ratio)));
    deviceRatio = ratio * budget;
    const w = Math.max(1, Math.round(width * deviceRatio));
    const h = Math.max(1, Math.round(height * deviceRatio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      shown = -1;
    }
  };

  const hud = (p: number) => {
    const { line, chant } = callsAt(p);
    lines.forEach((element, index) => {
      const lit = index <= line;
      if ((element.dataset.lit === "true") !== lit) element.dataset.lit = lit ? "true" : "false";
      const current = index === line;
      if ((element.dataset.current === "true") !== current)
        element.dataset.current = current ? "true" : "false";
    });
    chants.forEach((element, index) => {
      const lit = index < chant;
      if ((element.dataset.lit === "true") !== lit) element.dataset.lit = lit ? "true" : "false";
    });
    const ultraShown = form() === "ultra" && p >= META_UNITAS_BEATS.ultra[0] + 0.05;
    const stage = ultraShown ? "ultra" : "middle";
    if (runway.dataset.musShown !== stage) runway.dataset.musShown = stage;
    const complete =
      form() === "ultra" ? p >= META_UNITAS_BEATS.ultra[1] : p >= META_UNITAS_MIDDLE_DONE;
    const flag = complete ? "true" : "false";
    if (runway.dataset.musComplete !== flag) runway.dataset.musComplete = flag;
    if (rail) rail.style.transform = `scaleY(${p.toFixed(4)})`;
  };

  const draw = (p: number) => {
    if (!scene) return;
    const box = figureBox(
      { width: frame.clientWidth, height: frame.clientHeight },
      win.getComputedStyle(frame),
    );
    scene.draw(p, form(), {
      x: box.x * deviceRatio,
      y: box.y * deviceRatio,
      scale: (box.height / META_UNITAS_SUIT_SIZE.height) * deviceRatio,
    });
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !scene) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const from = shown < 0 ? target : shown;
    let next = from + (target - from) * Math.min(1, dt * 9);
    const inBright = (v: number) => v >= BRIGHT[0] && v <= BRIGHT[1];
    const limit = (inBright(from) || inBright(next) ? SPEED_BRIGHT : SPEED) * dt;
    if (Math.abs(next - from) > limit) next = from + Math.sign(next - from) * limit;
    if (Math.abs(target - next) < 0.0005) next = target;
    if (next !== shown) {
      shown = next;
      draw(next);
      hud(next);
    }
    if (next !== target && visible) raf = win.requestAnimationFrame(tick);
    else last = 0;
  };
  const kick = () => {
    if (!raf && scene && visible) raf = win.requestAnimationFrame(tick);
  };

  const onScroll = () => {
    measure();
    kick();
  };
  const onResize = () => {
    size();
    measure();
    shown = -1;
    kick();
  };

  const loadUltra = () => {
    if (loadingUltra || !scene || scene.hasUltra()) return;
    loadingUltra = true;
    loadPictures(META_UNITAS_ULTRA_PICTURES).then(
      (pictures) => {
        if (disposed || !scene) return;
        scene.setUltra(pictures);
        shown = -1;
        kick();
      },
      () => {
        loadingUltra = false;
      },
    );
  };

  const load = () => {
    if (scene || runway.dataset.musLoad === "loading") return;
    runway.dataset.musLoad = "loading";
    loadPictures(META_UNITAS_MIDDLE_PICTURES).then(
      (pictures) => {
        if (disposed) return;
        scene = createPartitionScene(context, pictures);
        runway.dataset.musLoad = "ready";
        runway.dataset.musState = "live";
        size();
        measure();
        shown = -1;
        // ウルトラ's pictures follow once ミドル's are in (they are what the end
        // of the scroll may become).
        loadUltra();
        kick();
      },
      () => {
        if (!disposed) runway.dataset.musLoad = "error";
      },
    );
  };

  const retry = () => {
    if (runway.dataset.musLoad === "error") {
      delete runway.dataset.musLoad;
      load();
    }
  };

  runway.dataset.musLoad = "waiting";
  const nearObserver = new win.IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        load();
      }
    },
    { rootMargin: "150% 0px 150% 0px" },
  );
  const viewObserver = new win.IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        measure();
        kick();
      }
    },
    { rootMargin: "10% 0px 10% 0px" },
  );
  nearObserver.observe(runway);
  viewObserver.observe(runway);
  const formObserver = new win.MutationObserver(() => {
    shown = -1;
    kick();
  });
  formObserver.observe(runway, { attributes: true, attributeFilter: ["data-form"] });
  const resize = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(onResize) : null;
  resize?.observe(frame);
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", onResize);
  runway.addEventListener("meta-unitas:assembly-retry", retry);

  return () => {
    disposed = true;
    if (raf) win.cancelAnimationFrame(raf);
    nearObserver.disconnect();
    viewObserver.disconnect();
    formObserver.disconnect();
    resize?.disconnect();
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("resize", onResize);
    runway.removeEventListener("meta-unitas:assembly-retry", retry);
    delete runway.dataset.musState;
    delete runway.dataset.musLoad;
  };
}
