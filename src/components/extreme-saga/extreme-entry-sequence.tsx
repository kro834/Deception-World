import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { EntryPlayback } from "@/lib/entry-playback";
import {
  EXTREME_ENTRY_TIMINGS,
  EXTREME_SUITUP_CORE,
  extremeSuitupFigure,
} from "@/lib/extreme-entry";

/* EXTREME SAGA's entry suit-up (owner, 2026-11-11: 「エクスプリームに変身
   アニメーションを遷移アニメーションのみに追加して。ナノマシンではなく、細かい
   機械パーツが展開するシステム」): the route transition screen of an in-site
   navigation to /extreme-saga (load-gate.tsx, the "extreme" dive), as
   ILLUSIONCULUM's entry plays in its own.

   The page carries no suit-up of its own: this layer lives in the gate's
   chunk and is light — a backdrop and one canvas. The renderer
   (src/lib/extreme-suitup-engine.ts) and the owner's suit art
   (public/extreme-suitup-20261111/) are fetched only when this mounts, so
   no other route downloads them. Under the cover: the belt core ignites,
   small plates deploy out of the belt and lock along the body (chest,
   shoulders and arms, legs and boots, gauntlets), the glow lines trace on,
   the star gems flash, the helmet folds closed and the horns extend, the
   cape unfurls, one light sweep — then the gate reveals the page.

   Decorative (aria-hidden). The gate owns the tier (only "full" plays
   this; reduced motion and economy get its short calm shutter), the skip
   (its button and Escape) and the reveal. Preparation never spends the
   suit-up's clock; the gate waits for the playback, bounded by its
   watchdog. */

const LAYER: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  contain: "strict",
  background:
    "radial-gradient(42% 36% at 50% 40%, rgb(38 72 190 / 0.32), transparent 72%)," +
    "radial-gradient(70% 22% at 50% 96%, rgb(255 196 92 / 0.10), transparent 70%)," +
    "radial-gradient(120% 90% at 50% 45%, #050a1e 0%, #02040c 62%, #010207 100%)",
};
const FILL: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

/* The pilot light. The stage starts unlit and the engine and its art load
   only once this layer is up, so the cover's first frames were an empty dark
   field (verify-route-transitions: 7–9 flat frames from 17 ms, longer on a
   cold load). The belt core is where the suit-up begins: the layer shows it
   alight from the cover's first frame, in the engine's own core colours and
   place, and lets it go as the engine's first painted frame takes the core
   over. No part of the suit-up's clock or beats changes. */
const PILOT_RADIUS = 96; // in the art's pixels: the engine's core, part lit
const PILOT_HANDOVER_MS = 320;
const PILOT: CSSProperties = {
  position: "absolute",
  borderRadius: "50%",
  // Over the canvas, as light: the undersuit fading up must not put it out
  // before the engine's own core has lit.
  mixBlendMode: "screen",
  background:
    "radial-gradient(circle, rgb(255 255 255) 0%, rgb(190 220 255 / 0.95) 18%, rgb(70 130 255 / 0.45) 45%, rgb(20 60 255 / 0) 100%)",
  transition: `opacity ${PILOT_HANDOVER_MS}ms cubic-bezier(0.4, 0, 1, 1)`,
};

export function ExtremeEntrySequence({
  phase,
  playback,
}: {
  phase: "covering" | "revealing";
  playback: EntryPlayback;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pilotRef = useRef<HTMLSpanElement | null>(null);
  // The pilot sits on the belt core by the engine's own rule for the figure,
  // before the first paint and through a resize.
  useLayoutEffect(() => {
    const pilot = pilotRef.current;
    const layer = pilot?.parentElement;
    if (!pilot || !layer) return;
    const place = () => {
      const box = layer.getBoundingClientRect();
      const figure = extremeSuitupFigure(
        Math.max(1, box.width || window.innerWidth),
        Math.max(1, box.height || window.innerHeight),
      );
      const radius = PILOT_RADIUS * figure.scale;
      Object.assign(pilot.style, {
        left: `${figure.x + EXTREME_SUITUP_CORE[0] * figure.scale - radius}px`,
        top: `${figure.y + EXTREME_SUITUP_CORE[1] * figure.scale - radius}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    let lit = false;
    void import("@/lib/extreme-suitup-engine")
      .then((engine) => {
        if (disposed) return;
        dispose = engine.mountExtremeSuitup(canvas, playback, {
          onFrame: () => {
            if (lit) return;
            lit = true;
            if (pilotRef.current) pilotRef.current.style.opacity = "0";
          },
        });
      })
      .catch(() => {
        if (!disposed) playback.fail();
      });
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [playback]);
  const revealing = phase === "revealing";
  return (
    <div
      className="exs-entry"
      data-phase={phase}
      aria-hidden="true"
      style={{
        ...LAYER,
        opacity: revealing ? 0 : 1,
        transform: revealing ? "scale(1.035)" : "none",
        transition: revealing
          ? `opacity ${EXTREME_ENTRY_TIMINGS.reveal}ms cubic-bezier(0.3, 0, 0.2, 1), transform ${EXTREME_ENTRY_TIMINGS.reveal}ms cubic-bezier(0.2, 0.7, 0.2, 1)`
          : undefined,
      }}
    >
      <canvas ref={canvasRef} width={0} height={0} style={FILL} />
      <span ref={pilotRef} style={PILOT} />
    </div>
  );
}
