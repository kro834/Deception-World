import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_FIT,
} from "@/lib/rexonance-calls";
import { entryCanonicalTime } from "@/lib/rexonance-ignition.js";
import {
  SURGE_GROUPS,
  SurgeEngine,
  createSurgeFrame,
  entrySurgeFrame,
  figureIn,
  scrollPieceWindows,
  scrollPush,
  scrollSurgeFrame,
  scrollWindows,
  surgePieces,
  surgeTier,
} from "@/lib/rexonance-suit-surge";

/* REXONANCE SURGE (owner, 2026-10-30): the suit-up's extra layer of nanite
   swarm, debris, construction scans, lock-in impacts and camera shake, over
   the entry's call (rexonance-call-sequence.tsx) and the page's scroll
   suit-up (#assembly-runway), drawn by src/lib/rexonance-suit-surge.ts.
   Rexonance's only: the shared engines (rexonance-resonance.js, which
   Meta Unitas also plays; the call's nanite engine) are untouched, and this
   layer only reads their clocks. Decorative: aria-hidden canvases that
   never take input. Full motion only: the call mounts it in its full tier
   while the suit builds, and the scroll runs it only while the scene is
   live (the scene never goes live under reduced motion or economy). */

const CANVAS: CSSProperties = { position: "absolute", pointerEvents: "none", display: "block" };
// The entry's canvases bleed past the figure (its box has the art's aspect).
const BLEED = { left: 0.4, top: 0.14, width: 1.8, height: 1.28 };
const ENTRY_CANVAS: CSSProperties = {
  ...CANVAS,
  left: `${-BLEED.left * 100}%`,
  top: `${-BLEED.top * 100}%`,
  width: `${BLEED.width * 100}%`,
  height: `${BLEED.height * 100}%`,
};
const SCROLL_CANVAS: CSSProperties = {
  ...CANVAS,
  inset: 0,
  zIndex: 1,
  width: "100%",
  height: "100%",
};

const reducedMotion = () =>
  Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ||
  document.documentElement.dataset.worldEffects === "economy";

/** The back canvas (first in the call's figure, under the plates). */
export function EntrySurgeBack() {
  return <canvas className="rx-suit-surge is-back" aria-hidden="true" style={ENTRY_CANVAS} />;
}

/** The front canvas and the entry's driver (last in the call's figure). */
export function EntrySurge() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const front = ref.current;
    const figure = front?.parentElement;
    const back = figure?.querySelector<HTMLCanvasElement>(":scope > canvas.rx-suit-surge.is-back");
    const suit = figure?.closest<HTMLElement>(".rx-suit");
    const sequence = figure?.closest<HTMLElement>(".rx-call-sequence");
    const meter = sequence?.querySelector(".rx-call-meter > i");
    if (!front || !figure || !back || !suit || !sequence || !meter || reducedMotion()) return;
    const pieces = surgePieces();
    const fits = new Float32Array(pieces.map((piece) => REXONANCE_SUIT_FIT[piece.id] ?? 0));
    const windows = new Float32Array(SURGE_GROUPS.length * 2);
    SURGE_GROUPS.forEach((group, g) => {
      const step = REXONANCE_SUIT_CASCADE.find((entry) => entry.group === group);
      windows[g * 2] = step?.from ?? 0;
      windows[g * 2 + 1] = step?.to ?? 0;
    });
    const final = REXONANCE_CALL_BEATS[4].start;
    const engine = new SurgeEngine(back, front, surgeTier());
    const frame = createSurgeFrame();
    let raf = 0;
    let last = -1;
    let size = "";
    let shaken = false;
    const measure = () => {
      const width = figure.clientWidth;
      const height = figure.clientHeight;
      const key = `${width}x${height}`;
      if (key === size || !width) return;
      size = key;
      engine.resize({
        width: width * BLEED.width,
        height: height * BLEED.height,
        x: width * BLEED.left,
        y: height * BLEED.top,
        scale: width / 571,
      });
    };
    const rest = () => {
      if (!shaken) return;
      shaken = false;
      suit.style.translate = "";
    };
    const tick = (now: number) => {
      raf = 0;
      if (sequence.dataset.phase !== "covering") {
        rest();
        return;
      }
      const animation = meter.getAnimations()[0];
      const elapsed = animation ? Number(animation.currentTime) : NaN;
      if (Number.isFinite(elapsed)) {
        const t = entryCanonicalTime(elapsed);
        measure();
        // The locks that seated since the last frame (forward only).
        if (last >= 0 && t > last)
          for (let g = 0; g < SURGE_GROUPS.length; g += 1) {
            const at = windows[g * 2 + 1];
            if (at > last && at <= t) engine.lock(g, now);
          }
        last = t;
        engine.draw(entrySurgeFrame(frame, t, now, fits, windows, final));
        const [x, y] = engine.shake(now);
        if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) {
          shaken = true;
          suit.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
        } else rest();
        if (t > final + 1400) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      rest();
      engine.dispose();
      back.width = 0;
      back.height = 0;
      front.width = 0;
      front.height = 0;
    };
  }, []);
  return <canvas ref={ref} className="rx-suit-surge is-front" aria-hidden="true" style={ENTRY_CANVAS} />;
}

/** The scroll scene's canvases: the back one before the figure's still,
 * the front one after the scene's canvas. */
export function ScrollSurgeCanvas({ layer }: { layer: "back" | "front" }) {
  return <canvas className={`rzn-surge is-${layer}`} aria-hidden="true" width={0} height={0} style={SCROLL_CANVAS} />;
}

// The HUD's parts (ASSEMBLY_PARTS: LEGS, ARMS, CHEST, WAIST, TAIL, HEAD) and
// the groups each one seats.
const PART_GROUPS = [
  [SURGE_GROUPS.indexOf("legs")],
  [SURGE_GROUPS.indexOf("arms")],
  [SURGE_GROUPS.indexOf("chest"), SURGE_GROUPS.indexOf("shoulders")],
  [SURGE_GROUPS.indexOf("waist")],
  [SURGE_GROUPS.indexOf("tail"), SURGE_GROUPS.indexOf("ribbon")],
  [SURGE_GROUPS.indexOf("helm")],
];

/** Runs the surge over the scroll suit-up while its scene is live. */
export function useScrollSurge(runwayRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const runway = runwayRef.current;
    const frameBox = runway?.querySelector<HTMLElement>(":scope > .rzn-frame");
    const back = frameBox?.querySelector<HTMLCanvasElement>(":scope > canvas.rzn-surge.is-back");
    const front = frameBox?.querySelector<HTMLCanvasElement>(":scope > canvas.rzn-surge.is-front");
    const scene = frameBox?.querySelector<HTMLCanvasElement>(":scope > .rzn-canvas");
    if (!runway || !frameBox || !back || !front || !scene) return;
    const coarse = Boolean(globalThis.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches);
    const windows = scrollWindows();
    const pieceWindows = scrollPieceWindows(windows);
    const parts = Array.from(runway.querySelectorAll<HTMLElement>(".rzn-part"));
    const partOn = parts.map(() => false);
    let engine: SurgeEngine | null = null;
    const frame = createSurgeFrame();
    let raf = 0;
    let visible = false;
    let shown = -1;
    let lastQ = -1;
    let lastStamp = 0;
    let lastDraw = -Infinity;
    let size = "";
    let moved: HTMLElement[] = [];
    let camera = "";
    let pinTop = 0;
    let travel = 0;
    const layers = () =>
      Array.from(
        frameBox.querySelectorAll<HTMLElement>(":scope > :is(.rzn-canvas, .rzn-field, .rzn-surge)"),
      );
    const restCamera = () => {
      for (const element of moved) {
        element.style.scale = "";
        element.style.translate = "";
        element.style.transformOrigin = "";
      }
      moved = [];
      camera = "";
    };
    const measure = () => {
      if (size || !engine) return;
      const width = scene.clientWidth;
      const height = scene.clientHeight;
      if (!width || !height) return;
      size = `${width}x${height}`;
      pinTop = Number.parseFloat(getComputedStyle(frameBox).top) || 0;
      travel = runway.offsetHeight - frameBox.offsetHeight;
      const style = getComputedStyle(scene);
      const read = (name: string, fallback: number) =>
        Number.parseFloat(style.getPropertyValue(name)) || fallback;
      const figure = figureIn(
        width,
        height,
        read("--rzn-fig-w", 0.9),
        read("--rzn-fig-h", 0.84),
        read("--rzn-fig-x", 0.5),
        read("--rzn-fig-b", 0.05),
      );
      engine.resize({ width, height, ...figure });
      restCamera();
    };
    const live = () =>
      runway.dataset.rznState === "live" && !document.hidden && visible && !reducedMotion();
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      restCamera();
      engine?.clear();
      shown = -1;
      lastQ = -1;
    };
    const tick = (now: number) => {
      raf = 0;
      if (!live()) {
        stop();
        return;
      }
      if (!engine) engine = new SurgeEngine(back, front, surgeTier());
      measure();
      const target = travel > 0 ? Math.min(1, Math.max(0, (pinTop - runway.getBoundingClientRect().top) / travel)) : 1;
      const dt = Math.min(50, Math.max(1, lastStamp ? now - lastStamp : 16.7));
      lastStamp = now;
      // The scene's own playhead, in short: a spring that never trails far.
      if (shown < 0 || Math.abs(target - shown) > 0.2) shown = target;
      else shown += (target - shown) * (1 - Math.exp(-dt * (coarse ? 0.044 : 0.032)));
      if (Math.abs(target - shown) < 0.0005) shown = target;
      const q = shown;
      // A part that seats as the reader moves forward strikes its lock.
      parts.forEach((part, index) => {
        const on = part.hasAttribute("data-on");
        if (on && !partOn[index] && lastQ >= 0 && q >= lastQ - 0.001)
          for (const g of PART_GROUPS[index]) if (g >= 0) engine?.lock(g, now);
        partOn[index] = on;
      });
      const moving = lastQ < 0 || Math.abs(q - lastQ) > 0.00005;
      lastQ = q;
      scrollSurgeFrame(frame, q, now, windows, pieceWindows);
      const flowing = frame.swarm > 0.01 && frame.implode < 1;
      const busy = engine.busy(now);
      // At rest the swarm keeps flowing (touch screens at about 30 fps).
      const due = moving || busy || (flowing && (!coarse || now - lastDraw > 31));
      if (due) {
        lastDraw = now;
        engine.draw(frame);
        // The lean in is for fine pointers: on touch screens a transform on
        // the scene's large canvases every scrolled frame cost WebKit its
        // frame rate; there only the locks' brief shake moves them.
        const push = coarse ? 1 : scrollPush(q);
        const [x, y] = engine.shake(now);
        const key = `${push.toFixed(4)}|${x.toFixed(1)}|${y.toFixed(1)}`;
        if (key !== camera) {
          camera = key;
          if (push === 1 && Math.abs(x) < 0.05 && Math.abs(y) < 0.05) restCamera();
          else {
            if (!moved.length) {
              moved = layers();
              for (const element of moved) element.style.transformOrigin = "50% 58%";
            }
            for (const element of moved) {
              element.style.scale = push === 1 ? "" : push.toFixed(4);
              element.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf && live()) raf = requestAnimationFrame(tick);
    };
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    });
    intersection.observe(runway);
    const state = new MutationObserver(wake);
    state.observe(runway, { attributes: true, attributeFilter: ["data-rzn-state"] });
    const resize = new ResizeObserver(() => {
      size = "";
    });
    resize.observe(frameBox);
    resize.observe(runway);
    const onVisibility = () => wake();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      intersection.disconnect();
      state.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      engine?.dispose();
      engine = null;
      back.width = 0;
      back.height = 0;
      front.width = 0;
      front.height = 0;
    };
  }, [runwayRef]);
}
