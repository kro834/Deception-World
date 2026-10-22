import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";

/* FAR FROM SAGA — the entry transformation's controller (owner, 2026-10-22:
   「遷移画面の変身アニメーション」, modelled on Rexonance's entry call:
   src/components/rexonance-saga/rexonance-call-sequence.tsx and its
   controller).

   Mounted at the top of /far-from-saga. It renders nothing on the server
   and on the first client render, so it never gates the first paint: the
   hero is in the DOM and readable before, during (an overlay, never a
   wall) and after it. Once mounted it decides, once per visit (a session
   storage mark), whether to play:

   - the full tier covers the page at once (a dark ground and the HUD's
     caption), loads the sequence's chunk and warms the suit's images and
     the nanite kits in parallel, and starts the call the moment both are
     there — with the finished figure standing whole if the images are
     late, and not at all if the chunk misses its deadline;
   - prefers-reduced-motion, economy, forced colours, Save-Data and 2G show
     a still (the finished figure and the last call, no motion, nothing
     heavy downloaded) for a moment, then the page.

   It is skippable (the button, Escape): the reveal plays and the page is
   there. The viewport's scroll is held while it covers. Every heavy module
   is lazy; this file imports none of them. */

export type FarFromEntryPhase = "idle" | "covering" | "revealing" | "revealed";

export type FarFromEntryTransitionProps = {
  /** The stage the hero shows (the entry ends on ミドル regardless). */
  stage?: "middle" | "high" | "xhigh" | "max" | "ultra";
  /** Called once when the reveal has finished (or at once, when skipped or not played). */
  onRevealed?: () => void;
};

/** One play per visit: the mark in session storage. */
export const FAR_FROM_ENTRY_PLAYED_KEY = "ffs-entry:20261022";
/** The sequence's chunk and the images get this long before the entry is
 * given up (the chunk) or played with the finished figure (the images). */
export const FAR_FROM_ENTRY_DEADLINE_MS = 2400;
/** The still tiers show the finished figure this long. */
export const FAR_FROM_ENTRY_STILL_MS = 1400;
/** The cover stands at least this long before the first call strikes (the
 * cut to black reads as a beat, and the page's own first frames settle). */
export const FAR_FROM_ENTRY_COVER_MIN_MS = 450;
/** The timings the controller needs before the chunk is there (pinned to
 * far-from-entry-calls by scripts/far-from-entry.test.mjs). */
const COVER_MS = 3240;
const REVEAL_MS = 480;
/** The finished figure for the still tiers (FAR_FROM_ENTRY_FIGURE, pinned
 * by the test): the still never loads the suit's module. */
const STILL_FIGURE = "/far-from-entry-20261022/figure.webp";
const STILL_RATIO = "0.6663";

type SequenceModule = typeof import("./far-from-entry-sequence");
type Tier = "full" | "reduced";
type State =
  | { kind: "idle" }
  | { kind: "cover"; tier: Tier }
  | { kind: "playing"; sequence: SequenceModule["FarFromEntrySequence"]; suit: "build" | "whole" }
  | { kind: "still" }
  | {
      kind: "revealing";
      sequence: SequenceModule["FarFromEntrySequence"] | null;
      suit: "build" | "whole";
    }
  | { kind: "done" };

const stillTier = () => {
  if (typeof window === "undefined") return true;
  const media = (query: string) => Boolean(window.matchMedia?.(query).matches);
  if (media("(prefers-reduced-motion: reduce)") || media("(forced-colors: active)")) return true;
  if (document.documentElement.dataset.worldEffects === "economy") return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return (
    Boolean(connection?.saveData) || ["slow-2g", "2g"].includes(connection?.effectiveType || "")
  );
};
const played = () => {
  try {
    return sessionStorage.getItem(FAR_FROM_ENTRY_PLAYED_KEY) !== null;
  } catch {
    return false;
  }
};
const markPlayed = () => {
  try {
    sessionStorage.setItem(FAR_FROM_ENTRY_PLAYED_KEY, "1");
  } catch {
    /* Private mode: the entry plays again next time. */
  }
};

/** The cover before the sequence is there, and the still: the ground, the
 * caption and (still) the finished figure with the last call. */
function Cover({ still }: { still: boolean }) {
  return (
    <div className="ffe-cover" data-still={still ? "" : undefined}>
      <div className="rx-call-caption">
        <span>FARFROM DRIVE</span>
        <span>SA-GA OS 6.1 / MIDDLE</span>
      </div>
      {still ? (
        <div
          className="rx-call-sequence ffe-sequence ffe-still"
          data-mode="entry"
          data-phase="covering"
          data-tier="reduced"
          aria-hidden="true"
          style={{ "--rx-suit-ar": STILL_RATIO } as CSSProperties}
        >
          <div className="rx-call-ground" />
          <div className="rx-suit" data-suit="whole">
            <div className="rx-suit-figure">
              <i className="rx-suit-scan">
                <i
                  className="rx-suit-whole"
                  style={{ backgroundImage: `url("${STILL_FIGURE}")` }}
                />
              </i>
            </div>
          </div>
          <div className="rx-call-words">
            <div className="rx-call-beat rx-call-final" data-call="FAR FROM DEUS！">
              <span>FAR FROM</span>
              <span>DEUS！</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FarFromEntryTransition({ onRevealed }: FarFromEntryTransitionProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const revealed = useRef(onRevealed);
  revealed.current = onRevealed;
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);
  const finish = useCallback(() => {
    setState({ kind: "done" });
    revealed.current?.();
  }, []);
  // The reveal: the sequence's blades open (or, still, the cover goes), then
  // the overlay is gone.
  const reveal = useCallback(() => {
    setState((current) => {
      if (current.kind === "playing")
        return { kind: "revealing", sequence: current.sequence, suit: current.suit };
      if (current.kind === "cover" || current.kind === "still")
        return { kind: "revealing", sequence: null, suit: "whole" };
      return current;
    });
  }, []);
  const skip = useCallback(() => {
    markPlayed();
    reveal();
  }, [reveal]);

  useEffect(() => {
    if (played()) {
      revealed.current?.();
      return;
    }
    markPlayed();
    let cancelled = false;
    if (stillTier()) {
      setState({ kind: "still" });
      later(() => {
        if (!cancelled) reveal();
      }, FAR_FROM_ENTRY_STILL_MS);
      return () => {
        cancelled = true;
      };
    }
    setState({ kind: "cover", tier: "full" });
    let sequence: SequenceModule["FarFromEntrySequence"] | null = null;
    let decoded: boolean | null = null;
    let started = false;
    let release: (() => void) | null = null;
    // The call's faces and a beat of cover first (the deadline overrides both).
    let ready = false;
    const mounted = performance.now();
    const fonts = (document.fonts?.ready ?? Promise.resolve()).then(
      () => undefined,
      () => undefined,
    );
    const begin = (suit: "build" | "whole") => {
      if (cancelled || started || !sequence) return;
      started = true;
      setState({ kind: "playing", sequence, suit });
      later(() => {
        if (!cancelled) reveal();
      }, COVER_MS);
    };
    const settle = () => {
      if (cancelled || started) return;
      if (!sequence || !ready) return;
      if (decoded === null) return;
      begin(decoded ? "build" : "whole");
    };
    void fonts.then(() => {
      const wait = Math.max(0, FAR_FROM_ENTRY_COVER_MIN_MS - (performance.now() - mounted));
      later(() => {
        ready = true;
        settle();
      }, wait);
    });
    void import("./far-from-entry-sequence").then(
      (module) => {
        sequence = module.FarFromEntrySequence;
        settle();
      },
      () => undefined,
    );
    void import("@/lib/far-from-entry-warmup").then(
      (warmup) => {
        release = warmup.releaseFarFromEntry;
        return warmup.warmFarFromEntry("high").then((ready) => {
          decoded = ready;
          settle();
        });
      },
      () => {
        decoded = false;
        settle();
      },
    );
    // The deadline: the images late play the finished figure; the chunk
    // late gives the entry up quietly.
    later(() => {
      if (cancelled || started) return;
      if (sequence) begin("whole");
      else finish();
    }, FAR_FROM_ENTRY_DEADLINE_MS);
    return () => {
      cancelled = true;
      release?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The reveal's end; the overlay's scroll hold; the keyboard skip.
  const kind = state.kind;
  useEffect(() => {
    if (kind !== "revealing") return;
    const id = later(finish, REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [kind, later, finish]);
  useEffect(() => {
    if (kind === "idle" || kind === "done") return;
    const unlock = acquireViewportScrollLock();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [kind, skip]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.length = 0;
    };
  }, []);

  if (state.kind === "idle" || state.kind === "done") return null;
  const Sequence = state.kind === "playing" || state.kind === "revealing" ? state.sequence : null;
  const suit = state.kind === "playing" || state.kind === "revealing" ? state.suit : "whole";
  return (
    <div className="ffe-overlay" data-ffe={state.kind} data-ffe-suit={Sequence ? suit : undefined}>
      {Sequence ? (
        <Sequence phase={state.kind === "revealing" ? "revealing" : "covering"} suit={suit} />
      ) : (
        <Cover still={state.kind === "still" || (state.kind === "revealing" && !Sequence)} />
      )}
      {state.kind !== "revealing" ? (
        <button type="button" className="ffe-skip" onClick={skip} aria-label="変身演出をスキップ">
          スキップ
        </button>
      ) : null}
    </div>
  );
}
