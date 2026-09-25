import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";
import { rexonanceImage } from "@/lib/rexonance-images";
import {
  RISING_BURN_ART,
  RISING_CALM_CHAR,
  RISING_CALM_EDGES,
  RISING_CALM_FLAMES,
  RISING_CALM_SCORCHES,
  RISING_CALM_SMOKE,
  RISING_FLASHBACK,
  risingBurnArt,
} from "./rising-art";
import { CALM_EMBERS, CALM_FLAME_SEATS, CALM_SMOKE } from "./rising-calm";
import type { RisingRun, RisingStats } from "./rising-sequence";
import type { ReDiveRun } from "./re-dive-sequence";
import { RE_DIVE_SECTION_ID, ReDiveSection } from "./re-dive-section";

// The image the fire consumes is chosen per device at the press
// (rising-art.ts). The art that emerges from the ash is the standard
// Rexonance artwork (gold on dark reads under red), 640w candidate.
const RIDER_ART =
  rexonanceImage(REXONANCE_SITE_ARTWORK.standard).srcSet?.split(",")[0]?.trim().split(" ")[0] ??
  REXONANCE_SITE_ARTWORK.standard;

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
// The flashback's scenes go into the HTTP cache on approach, so the dialog's
// lazy images find them there when it opens.
let flashbackWarmed = false;
const warmFlashback = () => {
  if (flashbackWarmed || typeof Image === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  flashbackWarmed = true;
  for (const src of RISING_FLASHBACK) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }
};
const prewarm = () => {
  warmFlashback();
  void loadEngine()
    .then((module) => module.prepareRising(risingBurnArt(), RIDER_ART))
    .catch(() => undefined);
};

// RE DIVE…?: the transition into the RE DIVE section, loaded when the end
// still settles (re-dive-sequence.ts). The section stays unlocked for the
// session (and a link to #re-dive opens it), and browser back from a card
// opened in it comes back to it.
type ReDiveEngine = typeof import("./re-dive-sequence");
let reDiveEngine: Promise<ReDiveEngine> | null = null;
let reDiveModule: ReDiveEngine | null = null;
const loadReDive = () =>
  (reDiveEngine ??= import("./re-dive-sequence").then((module) => {
    reDiveModule = module;
    return module;
  }));
const RE_DIVE_UNLOCKED_KEY = "dw-re-dive";
const RE_DIVE_RETURN_KEY = "dw-re-dive-return";
const RE_DIVE_EDGE = RISING_CALM_EDGES[0];

// The cards come up out of the ground once (styles-world-re-dive.css).
const markArrived = (section: HTMLElement) => {
  section.removeAttribute("data-arrived");
  void section.offsetWidth;
  section.setAttribute("data-arrived", "");
};

// The header's bottom: the section lands just under it.
const headerBottom = () => {
  const topbar = document.querySelector<HTMLElement>(".site-shell .topbar");
  return topbar ? Math.max(0, Math.round(topbar.getBoundingClientRect().bottom)) : 0;
};

const readSession = (key: string) => {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writeSession = (key: string, on: boolean) => {
  try {
    if (on) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private mode without storage: the section simply is not remembered.
  }
};

// Unlocked, as a store: the section is in the first render of a client-side
// return (so the router's restored position exists), and after hydration on
// a page load (the server never renders it).
let unlockedHere = false;
const unlockListeners = new Set<() => void>();
const subscribeUnlock = (listener: () => void) => {
  unlockListeners.add(listener);
  return () => {
    unlockListeners.delete(listener);
  };
};
const readUnlocked = () =>
  unlockedHere ||
  readSession(RE_DIVE_UNLOCKED_KEY) ||
  window.location.hash === `#${RE_DIVE_SECTION_ID}`;
const unlockReDive = () => {
  unlockedHere = true;
  writeSession(RE_DIVE_UNLOCKED_KEY, true);
  unlockListeners.forEach((listener) => listener());
};

// A card opened from the section: the World's history entry gets the
// section's hash, so browser back finds the section still unlocked
// (readUnlocked) and the return effect in RisingWorld lands on it.
const leaveForDossier = () => {
  writeSession(RE_DIVE_RETURN_KEY, true);
  try {
    const { pathname, search } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}#${RE_DIVE_SECTION_ID}`,
    );
  } catch {
    // The return simply starts at the top.
  }
};

// Once per document: a page opened on #re-dive (a link, a reload) lands on
// the section after hydration renders it.
let alignedOnLoad = false;

type RisingTestHook = {
  readonly run: RisingRun | null;
  readonly stats: RisingStats | null;
  seek: (T: number) => void;
};

type ReDiveTestHook = {
  readonly run: ReDiveRun | null;
  seek: (T: number) => void;
};

declare global {
  interface Window {
    __risingTest?: RisingTestHook;
    __risingStats?: RisingStats;
    __reDiveTest?: ReDiveTestHook;
  }
}

// Most taps last longer than this, and a flick usually cancels the pointer
// (the browser takes over the pan) sooner; a quicker tap primes at pointerup.
const TOUCH_PRIME_DELAY_MS = 60;

// SKIP and もう一度 share one spot and swap the picture between the end still
// and the void: a press this soon after a swap is a double or repeated press.
const SWAP_GUARD_MS = 600;

// CLOSE sits over the header: the dialog closes on the first click, so the
// second tap of a double tap would land on RECORDS or the menu underneath.
// Swallow pointer input briefly after a pointer close (keyboard is detail 0).
const TAP_THROUGH_GUARD_MS = 450;
function guardTapThrough() {
  const until = performance.now() + TAP_THROUGH_GUARD_MS;
  const types = ["pointerdown", "mousedown", "click"] as const;
  const swallow = (event: Event) => {
    if (performance.now() > until) return;
    // No focus move, no navigation, no handler below.
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of types) window.addEventListener(type, swallow, { capture: true });
  window.setTimeout(() => {
    for (const type of types) window.removeEventListener(type, swallow, { capture: true });
  }, TAP_THROUGH_GUARD_MS);
}

const auditRequested = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rising-audit");

/**
 * The calm tier's fire (static markup: the tiers move it with WAAPI): raster
 * sprites rendered from the same fire model
 * (scripts/render-rising-calm-sprites.mjs): the burn-edge strip over tiled
 * char, flame sprites seated along its lip behind it (two frames per seat
 * that take turns), smoke billows, and embers. The images load lazily, so
 * only a run that shows this tier fetches them (reduced motion hides the
 * whole burn layer). Memoised with no props, so opening the dialog does not
 * re-render it inside the press's click handler.
 */
const CalmFire = memo(function CalmFire() {
  return (
    <>
      <span className="rw-calm-burn">
        <span className="rw-calm-smoke">
          {CALM_SMOKE.map((left) => (
            <img
              key={left}
              src={RISING_CALM_SMOKE}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ left: `${left}%` }}
            />
          ))}
        </span>
        <span className="rw-calm-ash" style={{ backgroundImage: `url(${RISING_CALM_CHAR})` }} />
        {/* Under the flames: the print browning and blistering ahead of the lip. */}
        <span className="rw-calm-scorch">
          {RISING_CALM_SCORCHES.map((src, index) => (
            <img
              key={src}
              className="rw-calm-edge"
              data-profile={index}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ))}
        </span>
        {/* Behind the strip: the char cuts the flames' roots along the lip. */}
        <span className="rw-calm-flames">
          {CALM_FLAME_SEATS.map(({ centre, width, height, dip, frame, mirror }) => (
            <i
              key={centre}
              className={mirror ? "rw-calm-mirror" : undefined}
              style={{
                left: `${centre}%`,
                bottom: `calc(79% - ${dip}% * var(--rw-edge-k))`,
                width: `min(${width}cqmin, ${(height * 0.9).toFixed(1)}cqh)`,
                height: `${height}cqh`,
              }}
            >
              {[frame, frame + 1].map((index) => (
                <img
                  key={index}
                  src={RISING_CALM_FLAMES[index % RISING_CALM_FLAMES.length]}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </i>
          ))}
        </span>
        <span className="rw-calm-char">
          {RISING_CALM_EDGES.map((src, index) => (
            <img
              key={src}
              className="rw-calm-edge"
              data-profile={index}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ))}
        </span>
      </span>
      <span className="rw-calm-embers">
        {CALM_EMBERS.map((left) => (
          <i key={left} style={{ left: `${left}%` }} />
        ))}
      </span>
    </>
  );
});

/**
 * The gate after the footer. Scrolling past END OF RECORD raises the RISING
 * THE WORLD button (scroll-linked, styles-world-rising.css). The button opens
 * a modal sequence: a dive into the rider print (rising-art.ts), the print
 * burned away by red flames from below and, mid-burn, a hard cut to EP7
 * REXONANCE. The engine is loaded on approach, and the WebGL context exists
 * only while the sequence plays.
 */
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
  // RE DIVE…?: idle, the transition playing, or landed and fading out.
  const [reDive, setReDive] = useState<"idle" | "diving" | "leaving">("idle");
  const unlocked = useSyncExternalStore(subscribeUnlock, readUnlocked, () => false);
  const reDiveStateRef = useRef<"idle" | "diving" | "leaving">("idle");
  const reDiveStageRef = useRef<HTMLDivElement>(null);
  const reDiveRunRef = useRef<ReDiveRun | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const leaveTimerRef = useRef(0);
  const titleFadesRef = useRef<Animation[]>([]);
  const groundTopRef = useRef(0);

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

  // Back from a card opened in the section, or a page opened on #re-dive:
  // once the route's own scroll handling has settled, land on the section.
  // Any other return keeps the position the router restores. The marks are
  // spent only when the section is reached (the route may mount twice).
  useEffect(() => {
    if (!unlocked) return;
    if (window.location.hash !== `#${RE_DIVE_SECTION_ID}`) {
      alignedOnLoad = true;
      writeSession(RE_DIVE_RETURN_KEY, false);
      return;
    }
    if (alignedOnLoad && !readSession(RE_DIVE_RETURN_KEY)) return;
    let frame = 0;
    const since = performance.now();
    const settle = () => {
      frame = 0;
      if (
        document.documentElement.hasAttribute("data-route-scroll-settling") &&
        performance.now() - since < 2500
      ) {
        frame = window.requestAnimationFrame(settle);
        return;
      }
      alignedOnLoad = true;
      writeSession(RE_DIVE_RETURN_KEY, false);
      sectionRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    };
    frame = window.requestAnimationFrame(settle);
    return () => window.cancelAnimationFrame(frame);
  }, [unlocked]);

  // The end still has settled: have the RE DIVE images ready for the press.
  useEffect(() => {
    if (!open || !ended) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void loadReDive()
      .then((module) => module.prepareReDive(RIDER_ART, RISING_CALM_CHAR, RE_DIVE_EDGE))
      .catch(() => undefined);
  }, [open, ended]);

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
    reDiveRunRef.current?.dispose();
    reDiveRunRef.current = null;
    window.clearTimeout(leaveTimerRef.current);
    titleFadesRef.current.forEach((animation) => animation.cancel());
    titleFadesRef.current = [];
    const reDiving = reDiveStateRef.current !== "idle";
    const landed = reDiveStateRef.current === "leaving";
    reDiveStateRef.current = "idle";
    skipRequestedRef.current = false;
    setOpen(false);
    setEnded(false);
    setLive("");
    setReDive("idle");
    if (reDiving) {
      // RE DIVE (landed, or closed on the way): the page stays at the section.
      releaseLockRef.current?.();
      releaseLockRef.current = null;
      const section = sectionRef.current;
      if (section) {
        window.scrollTo({
          top: section.getBoundingClientRect().top + window.scrollY - groundTopRef.current,
          left: 0,
          behavior: "instant",
        });
        section.focus({ preventScroll: true });
        // Closed before landing (Esc on the way): the cards come up now.
        if (!landed) markArrived(section);
      }
      return;
    }
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

  // Landed: under the still frame, move the page to the section (the lock
  // gives the gate's position back first), then fade the dialog out over it.
  const landReDive = useCallback(() => {
    if (reDiveStateRef.current !== "diving" || !openRef.current) return;
    reDiveStateRef.current = "leaving";
    releaseLockRef.current?.();
    releaseLockRef.current = null;
    const section = sectionRef.current;
    if (section) {
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY - groundTopRef.current,
        left: 0,
        behavior: "instant",
      });
      // The cards come up while the dialog fades out over them.
      markArrived(section);
    }
    setReDive("leaving");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    leaveTimerRef.current = window.setTimeout(closeDialog, reduced ? 0 : 600);
  }, [closeDialog]);

  const reDiveNow = () => {
    if (!settled() || reDiveStateRef.current !== "idle") return;
    const dialog = dialogRef.current;
    const stage = reDiveStageRef.current;
    if (!dialog?.open || !stage) return;
    reDiveStateRef.current = "diving";
    groundTopRef.current = headerBottom();
    unlockReDive();
    setReDive("diving");
    setLive("");
    // The title steps aside with the controls (its opacity is the RISING run's
    // filled animation, so this one is layered over it and cancelled on close).
    titleFadesRef.current = [
      ...dialog.querySelectorAll<HTMLElement>(".rw-title-wrap, .rw-title-scrim"),
    ].map((element) =>
      element.animate([{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], {
        duration: 280,
        easing: "ease-out",
        fill: "forwards",
      }),
    );
    // Keyboard focus leaves the fading controls for the dialog surface.
    dialog.focus({ preventScroll: true });
    const generation = generationRef.current;
    void loadReDive()
      .then((module) => {
        if (
          !dialogRef.current?.open ||
          generation !== generationRef.current ||
          reDiveStateRef.current !== "diving"
        ) {
          return;
        }
        const run = module.runReDive({
          stage,
          art: RIDER_ART,
          char: RISING_CALM_CHAR,
          edge: RE_DIVE_EDGE,
          groundTop: groundTopRef.current,
          onLanded: landReDive,
        });
        reDiveRunRef.current = run;
        if (auditRequested()) {
          window.__reDiveTest = {
            get run() {
              return reDiveRunRef.current;
            },
            seek: (T: number) => reDiveRunRef.current?.seek(T),
          };
        }
      })
      // The chunk failed: arrive without the transition.
      .catch(landReDive);
  };

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
      reDiveRunRef.current?.dispose();
      reDiveRunRef.current = null;
      window.clearTimeout(leaveTimerRef.current);
      reDiveModule?.releaseReDive();
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

      {unlocked ? <ReDiveSection ref={sectionRef} onLeave={leaveForDossier} /> : null}

      <dialog
        ref={dialogRef}
        id="rising-world-dialog"
        className="rw-dialog"
        aria-label="RISING THE WORLD"
        data-redive={reDive === "idle" ? undefined : ""}
        data-leaving={reDive === "leaving" ? "" : undefined}
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
          {/* Scenes flashing back over the dive and the burn, before the title
              (rising-sequence.ts moves them; reduced motion hides them). */}
          <span className="rw-flashback" aria-hidden="true">
            {RISING_FLASHBACK.map((src) => (
              <img key={src} src={src} alt="" loading="lazy" decoding="async" />
            ))}
          </span>
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
          {/* RE DIVE…?: the WebGL tier draws on a canvas it adds here; the
              CSS and reduced tiers move these layers (re-dive-sequence.ts). */}
          <div ref={reDiveStageRef} className="rw-redive" aria-hidden="true">
            <span className="rw-redive-lines" />
            <span className="rw-redive-glow" />
            <span className="rw-redive-ground">
              <span
                className="re-dive-char"
                style={
                  reDive === "idle" ? undefined : { backgroundImage: `url(${RISING_CALM_CHAR})` }
                }
              />
              <span
                className="re-dive-edge"
                style={reDive === "idle" ? undefined : { backgroundImage: `url(${RE_DIVE_EDGE})` }}
              />
              <span className="re-dive-embers" />
            </span>
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
        {ended && reDive === "idle" ? (
          <button
            type="button"
            className="rw-redive-button"
            onPointerDown={() => void loadReDive()}
            onClick={reDiveNow}
          >
            RE DIVE…?
          </button>
        ) : null}
        <button
          ref={closeRef}
          type="button"
          className="rw-close"
          onClick={(event) => {
            if (event.detail > 0) guardTapThrough();
            closeDialog();
          }}
        >
          <span>CLOSE</span>
          <i aria-hidden="true" />
        </button>
      </dialog>
    </>
  );
}
