import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_SNAP,
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
import {
  REXONANCE_HENSHIN_PALETTE,
  henshinEntrySheet,
  henshinOf,
  mountHenshinEntry,
} from "@/lib/rexonance-henshin";
import { REXONANCE_HENSHIN_FIGURE } from "@/lib/rexonance-henshin-figures";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_UNDERSUIT,
} from "@/lib/rexonance-suit";
import type { SkinField, SkinFrame, SkinRenderer } from "@/lib/rexonance-suit-skin";
import { rexonanceSuitSource } from "@/lib/rexonance-suit-warmup";
import type { CrescendoEngine, CrescendoFrame } from "@/lib/rexonance-suit-crescendo";

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

/* REXONANCE CRESCENDO (owner, 2026-11-11): the cinema pass over the surge's
   own two canvases — reactor streams that wind along the limbs, a micro-flash
   on every plate, energy along the armour's panel lines, the charge, the
   completion's shock, visor glint and settle (rexonance-suit-crescendo.ts).
   Its chunk is fetched here, on demand, only once a suit-up is about to
   play in full motion; until it arrives (or if it never does) the surge
   plays as it did. */
type CrescendoLib = typeof import("@/lib/rexonance-suit-crescendo");
type Crescendo = { lib: CrescendoLib; engine: CrescendoEngine; frame: CrescendoFrame };

/** The armour's art for the crescendo's lines: the finished still when it
 * is given and decoded, else the suit's atlas, plate by plate. */
const paintSuit =
  (still: HTMLImageElement | null) => (context: CanvasRenderingContext2D, w: number, h: number) => {
    if (still?.complete && still.naturalWidth) {
      context.drawImage(still, 0, 0, w, h);
      return true;
    }
    const atlas = rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src);
    if (!atlas) return false;
    const k = w / REXONANCE_SUIT_SIZE.width;
    for (const piece of REXONANCE_SUIT_PIECES)
      context.drawImage(
        atlas,
        piece.ax,
        piece.ay,
        piece.w,
        piece.h,
        piece.x * k,
        piece.y * k,
        piece.w * k,
        piece.h * k,
      );
    return true;
  };

/** Loads the crescendo and builds its engine for a surge engine; its lines
 * are taken from the art in idle time (retried while the art decodes).
 * `art`: null where the suit on screen is not the standard one. Returns its
 * canceller. */
function mountCrescendo(
  surge: SurgeEngine,
  art: ((context: CanvasRenderingContext2D, w: number, h: number) => boolean) | null,
  ready: (crescendo: Crescendo) => void,
) {
  let cancelled = false;
  let timer = 0;
  let engine: CrescendoEngine | null = null;
  void import("@/lib/rexonance-suit-crescendo").then(
    (lib) => {
      const tier = lib.crescendoTier();
      if (cancelled || !tier) return;
      const pieces = surgePieces();
      const plates = new Float32Array(pieces.length * 6);
      pieces.forEach((piece, n) =>
        plates.set([piece.seat[0], piece.seat[1], piece.x, piece.y, piece.w, piece.h], n * 6),
      );
      const suit = {
        width: REXONANCE_SUIT_SIZE.width,
        height: REXONANCE_SUIT_SIZE.height,
        core: REXONANCE_SUIT_MARKS.core,
        visor: REXONANCE_SUIT_MARKS.visor,
        belt: REXONANCE_SUIT_MARKS.belt,
        anchors: surge.anchors(),
        plates,
      };
      const made = new lib.CrescendoEngine(suit, tier);
      engine = made;
      ready({
        lib,
        engine: made,
        frame: lib.createCrescendoFrame(SURGE_GROUPS.length, pieces.length),
      });
      if (!art || !tier.edge) return;
      let tries = 0;
      const build = () => {
        timer = 0;
        if (cancelled || !made.wantsArt) return;
        const lines = lib.buildCrescendoArt(tier, suit, art);
        if (lines) made.setArt(lines);
        else if ((tries += 1) < 8) timer = window.setTimeout(idle, 600);
      };
      const idle = () => {
        timer = 0;
        if (typeof window.requestIdleCallback === "function")
          window.requestIdleCallback(build, { timeout: 400 });
        else timer = window.setTimeout(build, 120);
      };
      idle();
    },
    () => undefined,
  );
  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
    engine?.dispose();
  };
}

/* REXONANCE SKIN (owner, 2026-11-11): the armour grown from the reactor as
   one front of liquid nanite metal (rexonance-suit-skin.ts), on a
   figure-sized WebGL canvas over the classic engines' canvases, which stand
   down (their opacity, never their clocks) while it grows and are whole
   again under it before it fades. Its chunk, the figure's picture and the
   baked field are fetched here, on demand, in full motion only; without
   WebGL, or if anything is late or fails, the classic suit-up plays. */
type SkinLib = typeof import("@/lib/rexonance-suit-skin");
type Skin = {
  lib: SkinLib;
  renderer: SkinRenderer;
  field: SkinField;
  frame: SkinFrame;
  ratio: number;
};
const DRIVER_STANDIN = "/rexonance-zenith-20261023/driver-standin.webp";

const picture = (source: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });

/** Loads the skin for a canvas. `under`: the scroll scene, whose classic
 * canvas also carries the undersuit and the driver — the skin then draws
 * them itself while that canvas stands down. Returns its canceller. */
function mountSkin(canvas: HTMLCanvasElement, under: boolean, ready: (skin: Skin) => void) {
  let cancelled = false;
  let renderer: SkinRenderer | null = null;
  void (async () => {
    const lib = await import("@/lib/rexonance-suit-skin");
    const budget = lib.skinBudget();
    if (cancelled || !budget) return;
    const [art, fieldPicture, undersuit, driver] = await Promise.all([
      picture(REXONANCE_SUIT_FIGURE),
      picture(lib.REXONANCE_SKIN_FIELD),
      under ? picture(REXONANCE_SUIT_UNDERSUIT) : null,
      under ? picture(DRIVER_STANDIN) : null,
    ]);
    if (cancelled || !art || !fieldPicture || (under && (!undersuit || !driver))) return;
    // The field's pixels, for the droplets' samples.
    const scratch = document.createElement("canvas");
    scratch.width = fieldPicture.naturalWidth;
    scratch.height = fieldPicture.naturalHeight;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(fieldPicture, 0, 0);
    const pixels = context.getImageData(0, 0, scratch.width, scratch.height);
    const field = lib.skinSamples(pixels.data, scratch.width, scratch.height, budget.samples);
    scratch.width = 0;
    scratch.height = 0;
    let base: HTMLCanvasElement | null = null;
    if (undersuit && driver) {
      base = document.createElement("canvas");
      base.width = REXONANCE_SUIT_SIZE.width;
      base.height = REXONANCE_SUIT_SIZE.height;
      const paint = base.getContext("2d");
      paint?.drawImage(undersuit, 0, 0, base.width, base.height);
      paint?.drawImage(driver, 0, 0, base.width, base.height);
    }
    // A breath between the pixel work and the shader's compile.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (cancelled) return;
    renderer = lib.SkinRenderer.create(
      canvas,
      { art, base, field: fieldPicture, fieldSize: [field.w, field.h] },
      [REXONANCE_SUIT_SIZE.width, REXONANCE_SUIT_SIZE.height],
    );
    if (base) {
      base.width = 0;
      base.height = 0;
    }
    if (!renderer) return;
    if (cancelled) {
      renderer.dispose();
      renderer = null;
      return;
    }
    ready({ lib, renderer, field, frame: lib.createSkinFrame(), ratio: budget.ratio });
  })().catch(() => undefined);
  return () => {
    cancelled = true;
    renderer?.dispose();
    renderer = null;
  };
}

/** The skin's canvas in the call's figure (after the nanite engine's). */
export function EntrySkinCanvas() {
  return (
    <canvas
      className="rx-suit-skin"
      aria-hidden="true"
      width={0}
      height={0}
      style={{ ...CANVAS, inset: 0, width: "100%", height: "100%", background: "none" }}
    />
  );
}

/** The skin's canvas in the scroll scene (after the scene's canvas): a box
 * on the frame (it takes the camera's lean with the other layers) and the
 * figure-sized canvas in it. */
export function ScrollSkinCanvas() {
  return (
    <i className="rzn-surge is-skin" aria-hidden="true" style={SCROLL_CANVAS}>
      <canvas width={0} height={0} style={CANVAS} />
    </i>
  );
}

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
    // The bank's direction (owner, 2026-11-01: 「装着アニメーションを大きく
    // 改善して」): the camera on the figure, the overlay over the stage, on
    // the call's own beats (rexonance-henshin.ts).
    const tail = REXONANCE_SUIT_CASCADE.find((step) => step.group === "tail");
    const henshin = mountHenshinEntry(figure, suit, {
      figure: REXONANCE_HENSHIN_FIGURE,
      palette: REXONANCE_HENSHIN_PALETTE,
      sheet: henshinEntrySheet(REXONANCE_HENSHIN_FIGURE, {
        rider: REXONANCE_CALL_BEATS[1].start,
        chant: REXONANCE_CALL_BEATS[2].start,
        snaps: [
          REXONANCE_SUIT_SNAP.legs,
          REXONANCE_SUIT_SNAP.waist,
          REXONANCE_SUIT_SNAP.arms,
          REXONANCE_SUIT_SNAP.chest,
        ],
        response: REXONANCE_CALL_BEATS[3].start,
        tail: tail?.to ?? REXONANCE_CALL_BEATS[3].start + 400,
        helm: REXONANCE_SUIT_SNAP.helm,
        final,
      }),
    });
    const frame = createSurgeFrame();
    let crescendo: Crescendo | null = null;
    const dropCrescendo = mountCrescendo(engine, paintSuit(null), (made) => {
      crescendo = made;
    });
    // The skin: engaged only if it is ready, and the nanite engine running
    // under it, before its front is due.
    const skinCanvas = figure.querySelector<HTMLCanvasElement>("canvas.rx-suit-skin");
    const classic = figure.querySelector<HTMLElement>(".rx-suit-nanites");
    let skin: Skin | null = null;
    let engaged = false;
    let classicShown = "";
    const dropSkin = skinCanvas
      ? mountSkin(skinCanvas, false, (made) => {
          skin = made;
        })
      : () => {};
    const showClassic = (value: number) => {
      const next = value >= 0.999 ? "" : value.toFixed(3);
      if (next === classicShown || !classic) return;
      classicShown = next;
      classic.style.opacity = next;
      // Fully hidden, the engine under it stands by (it draws nothing).
      if (value <= 0.001) classic.dataset.standby = "";
      else delete classic.dataset.standby;
    };
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
      henshin.rest();
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
        const grown = skin as Skin | null;
        if (grown && !engaged && !grown.renderer.lost) {
          const [from, to] = grown.lib.SKIN_ENTRY.leave;
          engaged = t < from + (to - from) * 0.4 && suit.dataset.nanites === "canvas";
          if (engaged) suit.dataset.skin = "";
        }
        const growing = engaged && grown ? grown.lib.skinFrame(grown.frame, grown.lib.SKIN_ENTRY, t) : null;
        engine.quiet = Boolean(growing?.on);
        engine.draw(entrySurgeFrame(frame, t, now, fits, windows, final));
        const layers = engine.layers();
        const made = crescendo as Crescendo | null;
        if (growing && grown) {
          if (grown.renderer.lost) {
            // The context went: the classic engine carries the call on.
            engaged = false;
            showClassic(1);
          } else {
            const level = made ? made.engine.governor.level : 0;
            grown.renderer.resize(
              figure.clientWidth,
              figure.clientHeight,
              globalThis.devicePixelRatio || 1,
              grown.ratio,
              grown.lib.SKIN_QUALITY[level],
            );
            grown.renderer.render(growing, now / 1000, 0);
            showClassic(growing.classic);
            if (growing.on && layers) {
              layers.front.globalCompositeOperation = "lighter";
              grown.lib.drawSkinDroplets(
                layers.front,
                grown.field,
                growing,
                REXONANCE_SUIT_SIZE.width / grown.field.w,
                now,
                1 / Math.max(0.05, layers.scale),
              );
              layers.front.globalCompositeOperation = "source-over";
            }
          }
        }
        if (made && layers) {
          const pass = made.lib.entryCrescendoFrame(
            made.frame,
            t,
            now,
            fits,
            windows,
            final,
            frame.swarm,
            frame.implode,
            frame.pull,
          );
          made.engine.draw(layers, growing ? made.lib.quietCrescendo(pass) : pass);
        }
        // The locks' shake rides the bank's camera (one transform).
        const [x, y] = engine.shake(now);
        henshin.frame(t, x, y);
        if (t > final + 1400) {
          henshin.rest();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      rest();
      henshin.dispose();
      dropCrescendo();
      dropSkin();
      showClassic(1);
      delete suit.dataset.skin;
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
    let crescendo: Crescendo | null = null;
    let crescendoClock: InstanceType<CrescendoLib["CrescendoScrollClock"]> | null = null;
    let dropCrescendo = () => {};
    const still = frameBox.querySelector<HTMLImageElement>(":scope > img.rzn-still");
    const skinBox = frameBox.querySelector<HTMLElement>(":scope > .rzn-surge.is-skin");
    const skinCanvas = skinBox?.querySelector<HTMLCanvasElement>("canvas") ?? null;
    let skin: Skin | null = null;
    let dropSkin = () => {};
    let classicShown = "";
    let skinPlaced = "";
    // The classic scene's canvases under the skin: their opacity is this
    // layer's while the skin grows (and their own sheet's again after).
    const showClassic = (value: number) => {
      const next = value >= 0.999 ? "" : value.toFixed(3);
      if (next === classicShown) return;
      classicShown = next;
      for (const element of frameBox.querySelectorAll<HTMLElement>(
        ":scope > :is(.rzn-canvas, .rzn-field)",
      )) {
        element.style.opacity = next;
        element.style.transition = next ? "none" : "";
      }
    };
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
      skin?.renderer.clear();
      showClassic(1);
      crescendoClock?.reset();
      shown = -1;
      lastQ = -1;
    };
    const tick = (now: number) => {
      raf = 0;
      if (!live()) {
        stop();
        return;
      }
      if (!engine) {
        engine = new SurgeEngine(back, front, surgeTier());
        // The lines are the standard suit's: another form ends the scene on
        // its own art, so it plays the crescendo without them.
        if (skinCanvas)
          dropSkin = mountSkin(skinCanvas, true, (made) => {
            skin = made;
          });
        dropCrescendo = mountCrescendo(
          engine,
          runway.dataset.form === "standard" ? paintSuit(still) : null,
          (made) => {
            crescendo = made;
            crescendoClock = new made.lib.CrescendoScrollClock(windows, pieceWindows);
          },
        );
      }
      measure();
      const raw = travel > 0 ? Math.min(1, Math.max(0, (pinTop - runway.getBoundingClientRect().top) / travel)) : 1;
      // The bank's stepped clock (rexonance-henshin.ts), as the scene plays it.
      const director = henshinOf(runway);
      const target = director ? director.stepped(raw) : raw;
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
      // The skin at this playhead (closed-form: it scrubs both ways).
      const grown = skin as Skin | null;
      const growing =
        grown && !grown.renderer.lost
          ? grown.lib.skinFrame(grown.frame, grown.lib.SKIN_SCROLL, q)
          : null;
      const skinOn = Boolean(growing?.on);
      engine.quiet = skinOn;
      const flowing = (frame.swarm > 0.01 && frame.implode < 1) || skinOn;
      // The crescendo's events strike on the same playhead, every frame.
      const pass =
        crescendo && crescendoClock
          ? crescendoClock.frame(crescendo.frame, q, now, frame.swarm, frame.implode, frame.pull)
          : null;
      if (pass && skinOn) crescendo?.lib.quietCrescendo(pass);
      const playing = Boolean(pass && crescendo?.lib.crescendoBusy(pass));
      const busy = engine.busy(now) || playing;
      // At rest the swarm keeps flowing (touch screens at about 30 fps).
      const due = moving || busy || (flowing && (!coarse || now - lastDraw > 31));
      if (due) {
        const paced = !moving && !busy;
        lastDraw = now;
        engine.draw(frame);
        const surfaces = engine.layers();
        if (grown && growing && skinCanvas) {
          if (size !== skinPlaced && size) {
            // The figure's box in the frame (the surge's own measure).
            skinPlaced = size;
            const view = engine.view;
            Object.assign(skinCanvas.style, {
              left: `${view.x}px`,
              top: `${view.y}px`,
              width: `${REXONANCE_SUIT_SIZE.width * view.scale}px`,
              height: `${REXONANCE_SUIT_SIZE.height * view.scale}px`,
            });
          }
          const view = engine.view;
          grown.renderer.resize(
            REXONANCE_SUIT_SIZE.width * view.scale,
            REXONANCE_SUIT_SIZE.height * view.scale,
            globalThis.devicePixelRatio || 1,
            grown.ratio,
            grown.lib.SKIN_QUALITY[crescendo ? crescendo.engine.governor.level : 0],
          );
          grown.renderer.render(growing, now / 1000, 1);
          showClassic(growing.classic);
          if (skinOn && surfaces) {
            surfaces.front.globalCompositeOperation = "lighter";
            grown.lib.drawSkinDroplets(
              surfaces.front,
              grown.field,
              growing,
              REXONANCE_SUIT_SIZE.width / grown.field.w,
              now,
              1 / Math.max(0.05, surfaces.scale),
            );
            surfaces.front.globalCompositeOperation = "source-over";
          }
        } else showClassic(1);
        if (crescendo && pass && surfaces) crescendo.engine.draw(surfaces, pass, paced);
        // The lean in is for fine pointers: on touch screens a transform on
        // the scene's large canvases every scrolled frame cost WebKit its
        // frame rate; there only the locks' brief shake moves them.
        const push = coarse ? 1 : scrollPush(q);
        const [x, y] = engine.shake(now);
        // The bank's director owns the camera: the locks' shake joins it.
        if (director) {
          if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) director.shake(x, y);
          raf = requestAnimationFrame(tick);
          return;
        }
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
      dropCrescendo();
      dropSkin();
      skin = null;
      crescendo = null;
      crescendoClock = null;
      engine?.dispose();
      engine = null;
      back.width = 0;
      back.height = 0;
      front.width = 0;
      front.height = 0;
    };
  }, [runwayRef]);
}
