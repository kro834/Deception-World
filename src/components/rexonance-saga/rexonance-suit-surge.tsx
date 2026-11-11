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
  REXONANCE_SUIT_FACE,
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_UNDERSUIT,
} from "@/lib/rexonance-suit";
import type { SkinField, SkinFrame, SkinRenderer, SkinTorrent } from "@/lib/rexonance-suit-skin";
import { LEAVE_FADE_MS, LEAVE_FROM, LEAVE_SLACK, SuitLeave, isSeek } from "@/lib/rexonance-suit-leave";
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
   WebGL, or if anything is late or fails, the classic suit-up plays.

   The retract (owner, 2026-11-11): where the suit leaves on the page — the
   「もう一度、装着を体験」 link and the auto movie's play from the start, both
   over the finished suit — the same canvas plays the build's reverse on a
   clock of its own (skinRetractFrame, about 1.6 s) before the page moves.
   Both ask with RETRACT_EVENT on the runway; the scroll hook below answers.
   A plain scroll back is never touched: it scrubs the build in reverse. */
const RETRACT_EVENT = "rexonance:assembly-leave";
/** The one who asked calls the leave off (the auto movie's scrubber moved,
 * the lab's slider): it ends at once and the scene is the playhead's. */
const RETRACT_CANCEL_EVENT = "rexonance:assembly-leave-cancel";
type RetractDetail = { done: (ok?: boolean) => void };
/** The retract plays over the finished suit: from this progress on. */
const RETRACT_FROM = LEAVE_FROM;
/** Reduced motion, economy, another form's art, no WebGL: a short fade. */
const RETRACT_FADE_MS = LEAVE_FADE_MS;
/** The reactor's disc (the scene's REACTOR_RADIUS), figure px. */
const REACTOR_DISC = 40;
type SkinLib = typeof import("@/lib/rexonance-suit-skin");
type Skin = {
  lib: SkinLib;
  renderer: SkinRenderer;
  field: SkinField;
  frame: SkinFrame;
  ratio: number;
  /** The torrent of nanites that feeds the front (SkinTorrent). */
  torrent: SkinTorrent;
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
      {
        art,
        base,
        field: fieldPicture,
        fieldSize: [field.w, field.h],
        eyes: [
          REXONANCE_SUIT_FACE.x,
          REXONANCE_SUIT_FACE.y,
          REXONANCE_SUIT_FACE.x + REXONANCE_SUIT_FACE.w,
          REXONANCE_SUIT_FACE.y + REXONANCE_SUIT_FACE.h,
        ],
        reactor: [REXONANCE_SUIT_MARKS.core[0], REXONANCE_SUIT_MARKS.core[1], REACTOR_DISC],
      },
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
    ready({
      lib,
      renderer,
      field,
      frame: lib.createSkinFrame(),
      ratio: budget.ratio,
      torrent: new lib.SkinTorrent(
        budget.torrent,
        REXONANCE_SUIT_MARKS.core,
        REXONANCE_SUIT_MARKS.belt,
      ),
    });
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
        engine.quiet = Boolean(growing?.shell);
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
              // The torrent that feeds the front, then the droplets at its lip.
              const cell = REXONANCE_SUIT_SIZE.width / grown.field.w;
              const px = 1 / Math.max(0.05, layers.scale);
              layers.back.globalCompositeOperation = "lighter";
              layers.front.globalCompositeOperation = "lighter";
              // (Nothing of it outlives the light: no streams after the flash.)
              if (t >= grown.lib.SKIN_ENTRY.light) grown.torrent.clear();
              grown.torrent.draw(
                layers.back,
                layers.front,
                grown.field,
                growing,
                cell,
                now,
                px,
                grown.lib.SKIN_TORRENT_SHARE[level],
                made ? made.lib.entryCharge(t, final) : 0,
              );
              if (growing.shell)
                grown.lib.drawSkinDroplets(layers.front, grown.field, growing, cell, now, px);
              layers.back.globalCompositeOperation = "source-over";
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
          made.engine.draw(layers, growing?.shell ? made.lib.quietCrescendo(pass) : pass);
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

/** Where the scene is not the page's scroll runway (the transformation lab,
 * 2026-11-11): the same layer on the lab's own stage. */
export type ScrollSurgeOptions = {
  /** The element whose children the scene's layers are (default: the
   * runway's frame). */
  box?: HTMLElement | null;
  /** The scene's playhead, given directly (the engine's `directProgress`):
   * no scroll is read and nothing eases — the skin stands exactly where the
   * scene does, at any speed and either way. */
  progress?: () => number;
};

/** Runs the surge over the scroll suit-up while its scene is live. */
export function useScrollSurge(runwayRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const runway = runwayRef.current;
    return runway ? mountScrollSurge(runway) : undefined;
  }, [runwayRef]);
}

/** The surge layer on a runway whose scene the shared engine plays; returns
 * its disposer. The page's own scroll scene by default (useScrollSurge). */
export function mountScrollSurge(runway: HTMLElement, options: ScrollSurgeOptions = {}) {
  {
    const frameBox = runway.querySelector<HTMLElement>(":scope > .rzn-frame");
    const layerBox = options.box ?? frameBox;
    const direct = typeof options.progress === "function" ? options.progress : null;
    const back = layerBox?.querySelector<HTMLCanvasElement>(":scope > canvas.rzn-surge.is-back");
    const front = layerBox?.querySelector<HTMLCanvasElement>(":scope > canvas.rzn-surge.is-front");
    const scene = layerBox?.querySelector<HTMLCanvasElement>(":scope > .rzn-canvas");
    if (!frameBox || !layerBox || !back || !front || !scene) return () => {};
    const coarse = Boolean(globalThis.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches);
    const windows = scrollWindows();
    const pieceWindows = scrollPieceWindows(windows);
    const parts = Array.from(runway.querySelectorAll<HTMLElement>(".rzn-part"));
    const partOn = parts.map(() => false);
    let engine: SurgeEngine | null = null;
    let crescendo: Crescendo | null = null;
    let crescendoClock: InstanceType<CrescendoLib["CrescendoScrollClock"]> | null = null;
    let dropCrescendo = () => {};
    const still = layerBox.querySelector<HTMLImageElement>(":scope > img.rzn-still");
    const skinBox = layerBox.querySelector<HTMLElement>(":scope > .rzn-surge.is-skin");
    const skinCanvas = skinBox?.querySelector<HTMLCanvasElement>("canvas") ?? null;
    let skin: Skin | null = null;
    let dropSkin = () => {};
    let classicShown = "";
    let skinPlaced = "";
    // The skin is live over the scene: the engine lights the HUD's parts by
    // its front and stops drawing under it (SUIT_UP hudParts, covered).
    const flagSkin = (on: boolean) => {
      if (on === "rznSkin" in runway.dataset) return;
      if (on) runway.dataset.rznSkin = "";
      else delete runway.dataset.rznSkin;
      runway.dispatchEvent(new Event("rexonance:assembly-redraw"));
    };
    // The scene's canvases are held at opacity 0 by this layer: the engine
    // draws nothing meanwhile. Set only after they are hidden, and cleared
    // (the engine told to draw again) before they are raised.
    const flagCovered = (on: boolean) => {
      if (on === "rznCovered" in runway.dataset) return;
      if (on) runway.dataset.rznCovered = "";
      else {
        delete runway.dataset.rznCovered;
        runway.dispatchEvent(new Event("rexonance:assembly-redraw"));
      }
    };
    // The leave in play (rexonance-suit-leave.ts): the retract, or the fade.
    const leave = new SuitLeave();
    // A playhead given directly has no scroll's noise: any move is the reader's.
    const slack = direct ? 0 : LEAVE_SLACK;
    // The fade's animations (they hold the figure hidden until the page has
    // moved) and its timers. Animations, not a transition: the reduced-motion
    // sheet zeroes every transition's duration, and the fade was a cut.
    let fading: Animation[] = [];
    let fadeTimer = 0;
    let fadeFrame = 0;
    // A leave that ended with the playhead where it was (called off, or the
    // page never moved) leaves its last frame on the canvases: the next
    // frame is drawn whether or not anything moves.
    let redraw = false;
    const releaseFade = () => {
      if (fadeTimer) window.clearTimeout(fadeTimer);
      if (fadeFrame) cancelAnimationFrame(fadeFrame);
      fadeTimer = fadeFrame = 0;
      for (const animation of fading) animation.cancel();
      fading = [];
    };
    /** The leave ends, whatever its state: answered (once), nothing of it
     * left — no stream in flight, no figure held hidden. */
    const endLeave = (ok: boolean) => {
      if (leave.end(ok)) {
        skin?.torrent.clear();
        redraw = true;
      }
      releaseFade();
    };
    // The classic scene's canvases under the skin: their opacity is this
    // layer's while the skin grows (and their own sheet's again after).
    const classicLayers = () =>
      layerBox.querySelectorAll<HTMLElement>(":scope > :is(.rzn-canvas, .rzn-field)");
    let snapFrame = 0;
    const showClassic = (value: number) => {
      const next = value >= 0.999 ? "" : value.toFixed(3);
      if (next === classicShown) return;
      // Raised whole from well under (a seek out from under the skin, a
      // leave called off): at once. The sheet's own fade-in for these
      // canvases would show the figure empty while it ran, the skin being
      // gone already; its transition is theirs again a frame later.
      const snap = next === "" && Number(classicShown) < 0.5;
      classicShown = next;
      const hidden = value <= 0.001;
      if (!hidden) flagCovered(false);
      for (const element of classicLayers()) {
        element.style.opacity = next;
        element.style.transition = next || snap ? "none" : "";
      }
      if (hidden) flagCovered(true);
      if (snap && !snapFrame)
        snapFrame = requestAnimationFrame(() => {
          snapFrame = 0;
          if (classicShown === "") for (const element of classicLayers()) element.style.transition = "";
        });
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
        layerBox.querySelectorAll<HTMLElement>(":scope > :is(.rzn-canvas, .rzn-field, .rzn-surge)"),
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
      skin?.torrent.clear();
      // (A leave cut short: the page moves on as it was asked to.)
      endLeave(true);
      flagSkin(false);
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
      const raw = direct
        ? Math.min(1, Math.max(0, Number(direct()) || 0))
        : travel > 0
          ? Math.min(1, Math.max(0, (pinTop - runway.getBoundingClientRect().top) / travel))
          : 1;
      // The bank's stepped clock (rexonance-henshin.ts), as the scene plays it.
      const director = henshinOf(runway);
      const target = director ? director.stepped(raw) : raw;
      const dt = Math.min(50, Math.max(1, lastStamp ? now - lastStamp : 16.7));
      lastStamp = now;
      // The scene's own playhead, in short: a spring that never trails far.
      if (direct || shown < 0 || Math.abs(target - shown) > 0.2) shown = target;
      else shown += (target - shown) * (1 - Math.exp(-dt * (coarse ? 0.044 : 0.032)));
      if (Math.abs(target - shown) < 0.0005) shown = target;
      const q = shown;
      const grown = skin as Skin | null;
      const skinLive = Boolean(grown && !grown.renderer.lost);
      flagSkin(skinLive);
      // A part that seats as the reader moves forward strikes its lock
      // (under the skin its label lights with the front: no plate clanks).
      parts.forEach((part, index) => {
        const on = part.hasAttribute("data-on");
        if (on && !partOn[index] && lastQ >= 0 && q >= lastQ - 0.001 && !skinLive)
          for (const g of PART_GROUPS[index]) if (g >= 0) engine?.lock(g, now);
        partOn[index] = on;
      });
      const moving = lastQ < 0 || Math.abs(q - lastQ) > 0.00005;
      // A seek (the scrubber, a jump): the streams in flight were aimed at a
      // front that is no longer there.
      if (isSeek(lastQ, q)) grown?.torrent.clear();
      lastQ = q;
      scrollSurgeFrame(frame, q, now, windows, pieceWindows);
      // The leave, on its own clock, until it is over or the reader moves
      // (the retract needs the skin; the fade ends with its own animations).
      const retracting = leave.mode === "retract";
      const step = leave.step(
        now,
        target,
        !retracting || skinLive,
        retracting && grown ? grown.lib.SKIN_RETRACT_MS : Number.POSITIVE_INFINITY,
        slack,
      );
      if (step === "moved") {
        // The scrub again (or the page has moved): nothing in flight; the
        // figure is raised only once the scene has drawn where it now is.
        grown?.torrent.clear();
        redraw = true;
        if (fading.length && !fadeFrame) fadeFrame = requestAnimationFrame(releaseFade);
      } else if (step === "hold" && retracting) {
        // Over: the page moves on; the bare body stands until it has.
        grown?.torrent.clear();
      }
      const leaving = step !== "" && step !== "moved" && retracting;
      // The skin at this playhead (closed-form: it scrubs both ways).
      const growing =
        grown && skinLive
          ? leaving
            ? grown.lib.skinRetractFrame(grown.frame, leave.ms)
            : grown.lib.skinFrame(grown.frame, grown.lib.SKIN_SCROLL, q)
          : null;
      const skinOn = Boolean(growing?.on);
      const shellOn = Boolean(growing?.shell);
      engine.quiet = shellOn;
      const flowing =
        (frame.swarm > 0.01 && frame.implode < 1) ||
        shellOn ||
        leaving ||
        Boolean(grown && grown.torrent.live > 0);
      // The crescendo's events strike on the same playhead, every frame.
      const pass =
        crescendo && crescendoClock
          ? crescendoClock.frame(crescendo.frame, q, now, frame.swarm, frame.implode, frame.pull)
          : null;
      if (pass && shellOn) crescendo?.lib.quietCrescendo(pass);
      const playing = Boolean(pass && crescendo?.lib.crescendoBusy(pass));
      const busy = engine.busy(now) || playing;
      // At rest the swarm keeps flowing (touch screens at about 30 fps).
      const due =
        redraw || moving || busy || leaving || (flowing && (!coarse || now - lastDraw > 31));
      if (due) {
        redraw = false;
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
            // The torrent that feeds the front, then the droplets at its lip.
            const cell = REXONANCE_SUIT_SIZE.width / grown.field.w;
            const px = 1 / Math.max(0.05, surfaces.scale);
            surfaces.back.globalCompositeOperation = "lighter";
            surfaces.front.globalCompositeOperation = "lighter";
            // (Nothing of it outlives the light: no streams after the flash.)
            if (!leaving && q >= grown.lib.SKIN_SCROLL.light) grown.torrent.clear();
            grown.torrent.draw(
              surfaces.back,
              surfaces.front,
              grown.field,
              growing,
              cell,
              now,
              px,
              grown.lib.SKIN_TORRENT_SHARE[crescendo ? crescendo.engine.governor.level : 0],
              leaving ? 0 : (pass?.charge ?? 0),
            );
            if (shellOn)
              grown.lib.drawSkinDroplets(surfaces.front, grown.field, growing, cell, now, px);
            surfaces.back.globalCompositeOperation = "source-over";
            surfaces.front.globalCompositeOperation = "source-over";
          } else if (grown.torrent.live) grown.torrent.clear();
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
    // The suit is asked to leave (the replay link, the movie's play from the
    // start, the lab's replay). Over the finished standard suit, with the
    // skin in hand: the retract. Another form's art, no skin, or the still
    // tiers (reduced motion, economy: the finished figure in view): a short
    // fade, then the page moves.
    const onLeave = (event: Event) => {
      const detail = (event as CustomEvent<RetractDetail>).detail;
      if (typeof detail?.done !== "function" || leave.active) return;
      const fadeOut = (elements: Iterable<HTMLElement>) => {
        const faded = [...elements].filter((element) => typeof element.animate === "function");
        if (!faded.length || !leave.begin("fade", performance.now(), detail.done)) return false;
        fading = faded.map((element) =>
          element.animate([{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], {
            duration: RETRACT_FADE_MS,
            easing: "ease-out",
            fill: "forwards",
          }),
        );
        // Faded (the animations' own end: under load they start a frame or
        // more after they are made; a timer of the same length cut them
        // short): the page moves, and the figure is back once it has (the
        // live scene's own frames see to it; the still tiers' two frames on).
        const mine = fading;
        const fadedOut = () => {
          if (fading !== mine || leave.over) return;
          window.clearTimeout(fadeTimer);
          leave.finish();
          fadeTimer = window.setTimeout(() => endLeave(true), live() ? 600 : 34);
        };
        void mine[0].finished.then(fadedOut, () => undefined);
        // (An animation that never runs is not waited for.)
        fadeTimer = window.setTimeout(fadedOut, RETRACT_FADE_MS + 400);
        return true;
      };
      if (!live()) {
        // The still tiers: the finished figure, if it is in view, fades.
        if (!visible || !still || !reducedMotion()) return;
        const box = still.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) return;
        if (fadeOut([still])) event.preventDefault();
        return;
      }
      if (lastQ < RETRACT_FROM) return;
      const grown = skin as Skin | null;
      if (grown && !grown.renderer.lost && runway.dataset.form === "standard") {
        // The frame back on its pin if the reader has scrolled it part away.
        const box = frameBox.getBoundingClientRect();
        if (!direct && box.top < -0.4 * box.height && travel > 0)
          window.scrollTo({
            top: window.scrollY + runway.getBoundingClientRect().top - pinTop + travel,
            behavior: "instant" as ScrollBehavior,
          });
        if (!leave.begin("retract", performance.now(), detail.done)) return;
        event.preventDefault();
        wake();
        return;
      }
      // Another form's art, or no skin: the figure fades, then the page moves.
      if (fadeOut(classicLayers())) event.preventDefault();
    };
    // Called off by the one who asked: it ends at once, unanswered there.
    const onLeaveCancel = () => {
      if (!leave.active) return;
      endLeave(false);
      wake();
    };
    runway.addEventListener(RETRACT_EVENT, onLeave);
    runway.addEventListener(RETRACT_CANCEL_EVENT, onLeaveCancel);
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
    if (layerBox !== frameBox) resize.observe(layerBox);
    resize.observe(runway);
    const onVisibility = () => wake();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      intersection.disconnect();
      state.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      runway.removeEventListener(RETRACT_EVENT, onLeave);
      runway.removeEventListener(RETRACT_CANCEL_EVENT, onLeaveCancel);
      // Nothing of this layer stays on a stage that outlives it (the lab's
      // canvas plays the next rider): no leave, no flag, no held opacity.
      stop();
      flagCovered(false);
      if (snapFrame) cancelAnimationFrame(snapFrame);
      for (const element of classicLayers()) element.style.transition = "";
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
  }
}
