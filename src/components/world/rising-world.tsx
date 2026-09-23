import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";
import { rexonanceImage } from "@/lib/rexonance-images";
import { RISING_BURN_ART, risingBurnArt } from "./rising-art";
import type { RisingRun, RisingStats } from "./rising-sequence";

// The image the fire consumes is chosen per device at the press
// (rising-art.ts). The art that emerges from the ash is the standard
// Rexonance artwork (gold on dark reads under red), 640w candidate.
const RIDER_ART =
  rexonanceImage(REXONANCE_SITE_ARTWORK.standard).srcSet?.split(",")[0]?.trim().split(" ")[0] ??
  REXONANCE_SITE_ARTWORK.standard;

// The calm tier's fire, drawn in CSS and SVG and moved only by transform and
// opacity: two fractal burn edges, flame tongues seated on them ([centre in %
// across, width in cqmin, height in cqh], so a tongue keeps its shape on any
// screen; one of three flame shapes by position), smoke billows, and embers
// rising from the front (left, in %).
const CALM_TONGUES = [
  [-4, 34, 20],
  [5, 28, 27],
  [13, 38, 17],
  [22, 30, 29],
  [31, 36, 21],
  [39, 28, 30],
  [48, 40, 19],
  [57, 30, 26],
  [65, 36, 22],
  [73, 28, 30],
  [82, 38, 18],
  [90, 30, 27],
  [98, 36, 21],
] as const;
// Three flame clusters (three tongues each, 200 x 200, root along y = 200),
// drawn once as SVG symbols and used by every tongue.
const CALM_FLAME_SHAPES = [
  "M26 200C26 198 25 191 27 186C28 180 32 174 34 169C36 163 39 158 40 152C40 146 38 141 37 135C36 130 33 124 33 118C33 113 35 108 37 104C39 100 43 96 46 92C50 88 55 80 58 80C60 80 60 88 60 92C61 96 60 100 61 104C61 108 61 113 63 118C64 124 66 130 69 135C72 141 76 146 80 152C84 158 90 163 93 169C96 174 99 180 99 186C100 191 98 198 98 200ZM57 200C59 196 64 185 67 176C70 168 75 158 76 149C78 140 77 131 77 122C77 112 76 103 79 94C81 85 87 75 91 67C96 58 102 50 106 43C111 36 114 30 116 24C119 17 119 4 121 4C123 4 127 17 129 24C131 30 131 36 132 43C132 50 132 58 131 67C130 75 128 85 127 94C126 103 124 112 125 122C125 131 127 140 130 149C133 158 139 168 142 176C146 185 149 196 151 200ZM116 200C117 197 121 189 122 182C123 176 123 169 123 162C124 155 123 148 125 142C127 135 131 128 135 121C139 114 146 107 149 101C153 94 155 89 157 83C158 78 157 73 157 69C157 64 156 54 157 54C159 54 164 64 166 69C169 73 171 78 172 83C174 89 175 94 176 101C176 107 176 114 174 121C173 128 170 135 169 142C167 148 165 155 165 162C165 169 166 176 168 182C170 189 175 197 176 200Z",
  "M17 200C18 196 24 187 26 179C28 171 30 162 31 154C31 146 28 138 27 130C27 121 26 113 27 105C29 97 33 88 36 80C39 73 43 66 44 59C46 53 46 47 46 42C45 36 40 24 42 24C44 24 53 36 57 42C61 47 64 53 66 59C68 66 70 73 71 80C73 88 72 97 72 105C73 113 72 121 72 130C73 138 75 146 78 154C81 162 86 171 90 179C93 187 98 196 99 200ZM70 200C71 197 71 190 73 185C76 179 80 173 83 167C85 161 87 155 88 149C88 143 86 137 86 131C86 125 86 119 88 113C90 107 95 102 99 98C104 93 109 89 113 85C118 81 125 72 127 72C129 72 127 81 127 85C126 89 124 93 123 98C122 102 120 107 119 113C119 119 118 125 119 131C121 137 123 143 127 149C130 155 135 161 138 167C141 173 145 179 146 185C147 190 146 197 146 200ZM116 200C117 197 119 187 119 180C119 173 118 165 119 157C119 150 121 142 124 134C127 127 132 119 136 111C140 104 144 96 146 88C149 81 149 75 149 69C150 63 149 58 150 52C152 47 155 36 156 36C158 36 159 47 161 52C162 58 164 63 165 69C167 75 169 81 171 88C172 96 174 104 175 111C176 119 176 127 175 134C174 142 171 150 170 157C169 165 167 173 167 180C168 187 171 197 172 200Z",
  "M24 200C25 197 27 188 30 182C33 176 38 168 40 161C42 154 42 147 42 140C42 133 38 126 38 119C38 112 39 104 42 98C45 91 51 86 55 80C60 74 65 70 69 65C72 60 75 50 78 50C80 50 82 60 83 65C84 70 84 74 83 80C83 86 81 91 81 98C80 104 79 112 80 119C81 126 83 133 87 140C90 147 96 154 101 161C105 168 111 176 113 182C116 188 116 197 116 200ZM80 200C82 196 88 185 90 177C92 169 93 159 92 151C92 142 89 133 89 124C89 115 90 106 92 97C95 89 100 79 103 71C106 63 109 55 110 48C111 41 110 35 109 29C107 23 101 10 103 10C105 10 115 23 120 29C125 35 128 41 131 48C135 55 138 63 139 71C141 79 142 89 142 97C142 106 140 115 140 124C141 133 140 142 142 151C145 159 149 169 153 177C156 185 162 196 164 200ZM136 200C136 198 134 192 134 188C134 183 135 178 137 173C139 168 143 163 146 158C148 154 152 149 153 144C154 139 153 134 153 129C152 125 151 121 152 117C152 113 153 110 156 106C159 103 167 96 169 96C171 96 167 103 167 106C166 110 166 113 167 117C167 121 169 125 171 129C173 134 176 139 179 144C181 149 184 154 185 158C186 163 186 168 185 173C185 178 182 183 181 188C181 192 180 198 180 200Z",
] as const;
const CALM_SMOKE = [12, 44, 76] as const;
const CALM_EMBERS = [4, 11, 19, 26, 33, 41, 48, 55, 62, 70, 77, 85, 92] as const;

/**
 * The calm tier's burn edge: a ragged, fractal front (1-D midpoint
 * displacement from a fixed seed, so every run and the server render agree) in
 * a 1000 x 400 box whose front runs around y = 60 (y down). Two edges from
 * different seeds slide past each other while they climb, so the front they
 * make together keeps tearing into new shapes; each carries its own tongues,
 * seated where its edge is.
 */
function burnEdge(seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
  const SEGMENTS = 128;
  const heights = new Array<number>(SEGMENTS + 1).fill(0);
  heights[0] = random() * 60;
  heights[SEGMENTS] = random() * 60;
  let amplitude = 110;
  for (let step = SEGMENTS; step > 1; step /= 2) {
    for (let index = step / 2; index < SEGMENTS; index += step) {
      heights[index] =
        (heights[index - step / 2] + heights[index + step / 2]) / 2 + random() * amplitude;
    }
    amplitude *= 0.63;
  }
  const ys = heights.map((height) => Math.min(150, Math.max(-50, height)) + 60);
  const points = ys
    .map((y, index) => `${((index * 1000) / SEGMENTS).toFixed(1)} ${y.toFixed(1)}`)
    .join(" L");
  /** The edge's y (0-400) at x (0-1000). */
  const at = (x: number) => {
    const position = (Math.min(1000, Math.max(0, x)) / 1000) * SEGMENTS;
    const index = Math.min(SEGMENTS - 1, Math.floor(position));
    return ys[index] + (ys[index + 1] - ys[index]) * (position - index);
  };
  return { line: `M${points}`, fill: `M0 400 L${points} L1000 400Z`, at };
}

const CALM_EDGES = (["a", "b"] as const).map((id, edgeIndex) => {
  const edge = burnEdge(edgeIndex ? 0x51c3 : 0x2b17);
  return {
    id,
    fill: edge.fill,
    line: edge.line,
    // Alternate tongues ride each edge, their roots sunk into the ember bed.
    tongues: CALM_TONGUES.map(([centre, width, height], index) => ({
      centre,
      width,
      height,
      edge: index % 2,
      shape: index % CALM_FLAME_SHAPES.length,
    }))
      .filter((tongue) => tongue.edge === edgeIndex)
      .map(({ centre, width, height, shape }) => ({
        centre,
        width,
        height,
        shape,
        // How far the edge dips below its mean line (y = 60) here, in % of
        // the box: landscape screens stretch the edge (--rw-edge-k).
        dip: Number((((edge.at(centre * 10) - 60) / 400) * 100).toFixed(2)),
      })),
  };
});

type Engine = typeof import("./rising-sequence");
let engine: Promise<Engine> | null = null;
let engineModule: Engine | null = null;
// A failed import() is not retried: the browser keeps the failed module in its
// module map for the document's lifetime, so the same (hashed) URL would only
// reject again without a request. The dialog then shows the static end still.
const loadEngine = () => {
  engine ??= import("./rising-sequence").then((module) => {
    engineModule = module;
    return module;
  });
  return engine;
};
const prewarm = () => {
  void loadEngine()
    .then((module) => module.prepareRising(risingBurnArt(), RIDER_ART))
    .catch(() => undefined);
};

type RisingTestHook = {
  readonly run: RisingRun | null;
  readonly stats: RisingStats | null;
  seek: (T: number) => void;
};

declare global {
  interface Window {
    __risingTest?: RisingTestHook;
    __risingStats?: RisingStats;
  }
}

// Most taps last longer than this, and a flick usually cancels the pointer
// (the browser takes over the pan) sooner; a quicker tap primes at pointerup.
const TOUCH_PRIME_DELAY_MS = 60;

// SKIP and もう一度 share one spot and swap the picture between the end still
// and the void: a press this soon after a swap is a double or repeated press.
const SWAP_GUARD_MS = 600;

const auditRequested = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rising-audit");

/**
 * The gate after the footer. Scrolling past END OF RECORD raises the RISING
 * THE WORLD button (scroll-linked, styles-world-rising.css). The button opens
 * a modal sequence: a dive into the world, the world consumed by red flames
 * and, mid-burn, a hard cut to EP7 REXONANCE. The engine is loaded on
 * approach, and the WebGL context exists only while the sequence plays.
 */
/**
 * The calm tier's fire (static markup: the tiers move it with WAAPI).
 * Memoised with no props, so opening the dialog does not re-render its
 * hundred-odd SVG nodes inside the press's click handler.
 */
const CalmFire = memo(function CalmFire() {
  return (
    <>
      <svg className="rw-calm-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient
            id="rw-flame-body"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="200"
            x2="0"
            y2="0"
          >
            <stop offset="0" stopColor="#ffd690" stopOpacity="0" />
            <stop offset="0.13" stopColor="#ffd690" />
            <stop offset="0.22" stopColor="#ff9a30" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#f05a12" stopOpacity="0.8" />
            <stop offset="0.78" stopColor="#b82a08" stopOpacity="0.34" />
            <stop offset="1" stopColor="#701004" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="rw-flame-core"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="200"
            x2="0"
            y2="60"
          >
            <stop offset="0" stopColor="#fff6de" stopOpacity="0" />
            <stop offset="0.14" stopColor="#fff6de" />
            <stop offset="0.45" stopColor="#ffd57a" stopOpacity="0.75" />
            <stop offset="1" stopColor="#ffa040" stopOpacity="0" />
          </linearGradient>
          <filter id="rw-flame-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          {CALM_FLAME_SHAPES.map((d, index) => (
            <path key={d} id={`rw-flame-${index}`} d={d} />
          ))}
        </defs>
      </svg>
      <span className="rw-calm-burn">
        <span className="rw-calm-smoke">
          {CALM_SMOKE.map((left) => (
            <i key={left} style={{ left: `${left}%` }} />
          ))}
        </span>
        {CALM_EDGES.map(({ id, fill, line, tongues }) => (
          <span key={id} className={`rw-calm-char rw-calm-char-${id}`}>
            <svg viewBox="0 0 1000 400" preserveAspectRatio="none" focusable="false">
              <defs>
                <linearGradient id={`rw-char-${id}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#6b1604" />
                  <stop offset="0.2" stopColor="#2a0703" />
                  <stop offset="0.42" stopColor="#070203" />
                </linearGradient>
                <filter id={`rw-lip-${id}`} x="-2%" y="-40%" width="104%" height="180%">
                  <feGaussianBlur stdDeviation="6 5" />
                </filter>
              </defs>
              {/* Scorch: the print browns just ahead of the lip. */}
              <path
                d={line}
                fill="none"
                stroke="#2e0d05"
                strokeOpacity="0.6"
                strokeWidth="46"
                transform="translate(0 -14)"
                filter={`url(#rw-lip-${id})`}
              />
              <path d={fill} fill={`url(#rw-char-${id})`} />
              {/* The sheet of flame the tongues rise from, and the ember glow. */}
              <path
                d={line}
                fill="none"
                stroke="#ff8a2a"
                strokeOpacity="0.8"
                strokeWidth="26"
                transform="translate(0 -8)"
                filter={`url(#rw-lip-${id})`}
              />
              <path
                d={line}
                fill="none"
                stroke="#ff5a14"
                strokeWidth="12"
                filter={`url(#rw-lip-${id})`}
              />
              <path
                d={line}
                fill="none"
                stroke="#ffd79a"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="rw-calm-flames">
              {tongues.map(({ centre, width, height, dip, shape }) => (
                <i
                  key={centre}
                  style={{
                    left: `${centre}%`,
                    bottom: `calc(80.5% - ${dip}% * var(--rw-edge-k))`,
                    width: `${width}cqmin`,
                    height: `${height}cqh`,
                    marginLeft: `${-width / 2}cqmin`,
                  }}
                >
                  <svg viewBox="0 0 200 200" preserveAspectRatio="none" focusable="false">
                    <g filter="url(#rw-flame-blur)">
                      <use href={`#rw-flame-${shape}`} fill="url(#rw-flame-body)" />
                      <use
                        href={`#rw-flame-${shape}`}
                        fill="url(#rw-flame-core)"
                        transform="translate(30 58) scale(0.7 0.71)"
                      />
                    </g>
                  </svg>
                </i>
              ))}
            </span>
          </span>
        ))}
      </span>
      <span className="rw-calm-embers">
        {CALM_EMBERS.map((left) => (
          <i key={left} style={{ left: `${left}%` }} />
        ))}
      </span>
    </>
  );
});

export function RisingWorld() {
  const gateRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<RisingRun | null>(null);
  const releaseLockRef = useRef<(() => void) | null>(null);
  const openRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const refocusControlRef = useRef(false);
  const generationRef = useRef(0);
  const swappedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const skipRequestedRef = useRef(false);
  const artRef = useRef(RISING_BURN_ART);
  const [art, setArt] = useState(RISING_BURN_ART);
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState("");

  // Warm the engine, the images and the shader when the gate nears the view.
  useEffect(() => {
    const gate = gateRef.current;
    if (!gate || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        prewarm();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(gate);
    return () => observer.disconnect();
  }, []);

  // SKIP and もう一度 replace each other; keep keyboard focus on the control.
  useLayoutEffect(() => {
    swappedAtRef.current = performance.now();
    if (!refocusControlRef.current) return;
    refocusControlRef.current = false;
    controlsRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [ended]);

  const noteControlFocus = useCallback(() => {
    refocusControlRef.current = Boolean(
      document.activeElement && controlsRef.current?.contains(document.activeElement),
    );
  }, []);

  // Every path to the end still: focus moves from SKIP to もう一度 with it.
  const markEnded = useCallback(() => {
    noteControlFocus();
    setEnded(true);
  }, [noteControlFocus]);

  // Starts (or restarts, for もう一度) a run inside the open dialog.
  const begin = useCallback(async () => {
    const generation = ++generationRef.current;
    runRef.current?.dispose();
    runRef.current = null;
    skipRequestedRef.current = false;
    setLive("");
    // No tier yet: the engine is still loading. The picture stays dark until
    // the run starts, so the end still (the reveal) never shows first.
    if (viewportRef.current) delete viewportRef.current.dataset.tier;
    let module: Engine;
    try {
      module = engineModule ?? (await loadEngine());
    } catch {
      // Offline or the chunk failed: show the end still with the title. The
      // failure is final (see loadEngine), so もう一度 is not offered.
      skipRequestedRef.current = false;
      const viewport = viewportRef.current;
      if (viewport && dialogRef.current?.open && generation === generationRef.current) {
        viewport.dataset.tier = "static";
        setLive("EP7 REXONANCE");
        // SKIP unmounts without a successor: hand its focus to CLOSE first.
        if (controlsRef.current?.contains(document.activeElement)) {
          closeRef.current?.focus({ preventScroll: true });
        }
        setFailed(true);
        setEnded(true);
      }
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport || !dialogRef.current?.open || generation !== generationRef.current) return;
    const audit = auditRequested();
    const run = module.runRising({
      viewport,
      origin: originRef.current,
      world: artRef.current,
      rider: RIDER_ART,
      audit,
      onTitle: () => setLive("EP7 REXONANCE"),
      onEnd: markEnded,
    });
    runRef.current = run;
    window.__risingStats = run.stats;
    if (audit) {
      window.__risingTest = {
        get run() {
          return runRef.current;
        },
        get stats() {
          return runRef.current?.stats ?? null;
        },
        seek: (T: number) => runRef.current?.seek(T),
      };
    }
    // SKIP pressed while the engine chunk was loading.
    if (skipRequestedRef.current) {
      skipRequestedRef.current = false;
      run.skip();
    }
  }, [markEnded]);

  // Pointer contact: warm up, and create the GL context and start the shader
  // compile on a detached canvas before the click opens the dialog. A touch
  // that lands on the button may be the start of a scroll (pointercancel), so
  // touch primes a moment later, or at pointerup: getContext() on the main
  // thread must not delay the scroll starting under the thumb.
  const primeTimerRef = useRef(0);
  const cancelPrime = () => {
    window.clearTimeout(primeTimerRef.current);
    primeTimerRef.current = 0;
  };
  const primeNow = () => {
    cancelPrime();
    engineModule?.primeRising(risingBurnArt(), RIDER_ART);
  };
  const prime = (event: ReactPointerEvent<HTMLButtonElement>) => {
    prewarm();
    if (event.pointerType !== "touch") {
      primeNow();
      return;
    }
    cancelPrime();
    primeTimerRef.current = window.setTimeout(primeNow, TOUCH_PRIME_DELAY_MS);
  };
  const primePending = () => {
    if (primeTimerRef.current) primeNow();
  };

  const start = useCallback(
    (keyboard: boolean) => {
      const dialog = dialogRef.current;
      const trigger = triggerRef.current;
      if (!dialog || !trigger || dialog.open) return;
      const rect = trigger.getBoundingClientRect();
      originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      artRef.current = risingBurnArt();
      try {
        dialog.showModal(); // top layer: covers the Zeus button, the header and the page
      } catch {
        return;
      }
      // Locked in the same task as showModal(), released in the same task as close().
      openRef.current = true;
      releaseLockRef.current?.();
      releaseLockRef.current = acquireViewportScrollLock({ freezeBody: true });
      // Pointer: focus the dialog surface (no ring flash). Keyboard: CLOSE.
      (keyboard ? closeRef.current : dialog)?.focus({ preventScroll: true });
      setEnded(false);
      setArt(artRef.current);
      setOpen(true);
      void begin();
    },
    [begin],
  );

  const settled = () => performance.now() - swappedAtRef.current >= SWAP_GUARD_MS;

  const skip = () => {
    if (!settled()) return;
    if (runRef.current) runRef.current.skip();
    else skipRequestedRef.current = true; // the run starts at the end still
  };

  const replay = () => {
    if (!settled()) return;
    noteControlFocus();
    setEnded(false);
    void begin();
  };

  // Idempotent: CLOSE, Esc / the Android back gesture (cancel) and any other
  // close all end here, synchronously.
  const finishClose = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    generationRef.current += 1;
    runRef.current?.dispose();
    runRef.current = null;
    skipRequestedRef.current = false;
    setOpen(false);
    setEnded(false);
    setLive("");
    // Focus first (the body is still frozen), then restore the scroll position.
    triggerRef.current?.focus({ preventScroll: true });
    releaseLockRef.current?.();
    releaseLockRef.current = null;
  }, []);

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    finishClose();
  }, [finishClose]);

  // bfcache and route changes release the context and the lock.
  useEffect(() => {
    const onPageHide = () => {
      if (dialogRef.current?.open) closeDialog();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.clearTimeout(primeTimerRef.current);
      openRef.current = false;
      runRef.current?.dispose();
      runRef.current = null;
      // After the run: close the prepared bitmaps; the next approach prepares again.
      engineModule?.releaseRising();
      releaseLockRef.current?.();
      releaseLockRef.current = null;
    };
  }, [closeDialog]);

  return (
    <>
      <section ref={gateRef} className="rw-gate" aria-label="RISING THE WORLD">
        <span className="rw-gate-horizon" aria-hidden="true" />
        <span className="rw-gate-rule" aria-hidden="true" />
        <button
          ref={triggerRef}
          type="button"
          className="rw-gate-button"
          aria-haspopup="dialog"
          aria-controls="rising-world-dialog"
          onPointerDown={prime}
          onPointerUp={primePending}
          onPointerCancel={cancelPrime}
          onFocus={prewarm}
          onClick={(event) => start(event.detail === 0)}
        >
          RISING THE WORLD
        </button>
      </section>

      <dialog
        ref={dialogRef}
        id="rising-world-dialog"
        className="rw-dialog"
        aria-label="RISING THE WORLD"
        tabIndex={-1}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => {
          // A close event queued by an earlier close can arrive after start() has
          // reopened the dialog; it belongs to the old session.
          if (!dialogRef.current?.open) finishClose();
        }}
        onKeyDown={(event) => {
          // A held Enter or Space would click the control under focus on every repeat.
          if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
        }}
      >
        <div ref={viewportRef} className="rw-viewport">
          <div className="rw-end" aria-hidden="true">
            <img
              className="rw-end-art"
              src={open ? RIDER_ART : undefined}
              alt=""
              width={640}
              height={853}
              decoding="async"
            />
          </div>
          <div className="rw-calm" aria-hidden="true">
            <img
              className="rw-calm-world"
              src={open ? art : undefined}
              alt=""
              width={1024}
              height={1536}
              decoding="async"
            />
            <CalmFire />
          </div>
          <div className="rw-gl" aria-hidden="true" />
          <span className="rw-title-scrim" aria-hidden="true" />
          <div className="rw-title-wrap" aria-hidden="true">
            <p className="rw-title">
              <span className="rw-title-ep">EP7</span>{" "}
              <span className="rw-title-name">REXONANCE</span>
            </p>
          </div>
          <div className="rw-portal" aria-hidden="true">
            <img
              className="rw-portal-art"
              src={open ? art : undefined}
              alt=""
              width={1024}
              height={1536}
              decoding="async"
            />
          </div>
        </div>
        <p className="rw-live" aria-live="polite" aria-atomic="true">
          {live}
        </p>
        <div ref={controlsRef} className="rw-controls">
          {ended ? (
            failed ? null : (
              <button key="replay" type="button" className="rw-replay" onClick={replay}>
                もう一度
              </button>
            )
          ) : (
            <button key="skip" type="button" className="rw-skip" onClick={skip}>
              SKIP
            </button>
          )}
        </div>
        <button ref={closeRef} type="button" className="rw-close" onClick={closeDialog}>
          <span>CLOSE</span>
          <i aria-hidden="true" />
        </button>
      </dialog>
    </>
  );
}
