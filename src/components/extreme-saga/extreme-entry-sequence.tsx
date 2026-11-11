import { useEffect, useRef, type CSSProperties } from "react";
import type { EntryPlayback } from "@/lib/entry-playback";
import { EXTREME_ENTRY_TIMINGS } from "@/lib/extreme-entry";

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

export function ExtremeEntrySequence({
  phase,
  playback,
}: {
  phase: "covering" | "revealing";
  playback: EntryPlayback;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    void import("@/lib/extreme-suitup-engine")
      .then((engine) => {
        if (disposed) return;
        dispose = engine.mountExtremeSuitup(canvas, playback);
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
    </div>
  );
}
