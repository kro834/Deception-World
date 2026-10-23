import { useEffect, useRef, type CSSProperties } from "react";
import { META_UNITAS_CALL_LINES } from "@/lib/meta-unitas-assembly";
import { META_UNITAS_ENTRY_TIMINGS } from "@/lib/meta-unitas-entry-gate";
import {
  META_UNITAS_RX_DRIVER_STANDIN,
  META_UNITAS_RX_SIZE,
  META_UNITAS_RX_UNDERSUIT,
} from "@/lib/meta-unitas-rx-suit";

/* META UNITAS SAGA — the entry transformation (2026-10-23; owner: 「メタ・
   ウニタスはレクソナンスと同じ装着です」), played by the route transition
   screen (load-gate.tsx) under its cover. The same scene as #suitup: the
   Rexonance scroll engine with Meta Unitas' suit (meta-unitas-rx-engine.ts),
   mounted on a runway inside this layer, whose own scroll the clock drives —
   the undersuit scanned, the fire, the nanites landing plate by plate, the
   seal, the light, the helix and the eyes in pixel squares: ミドル complete as
   the cover lifts. The full tier only. Styles are inline: the gate is global
   and this page's sheets are not loaded on the departure page. */

const LAYER: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2,
  overflowX: "hidden",
  overflowY: "scroll",
  scrollbarWidth: "none",
  background:
    "radial-gradient(44% 56% at 50% 52%, rgb(55 198 192 / 14%), transparent 70%), linear-gradient(180deg, #02070a, #03080c 70%, #020507)",
  transition: "opacity 0.5s ease",
  pointerEvents: "none",
};
const RUNWAY: CSSProperties = { position: "relative", height: "600vh" };
const FRAME: CSSProperties = {
  position: "sticky",
  top: 0,
  height: "100vh",
  overflow: "hidden",
  ["--rzn-fig-h" as string]: "0.78",
  ["--rzn-fig-w" as string]: "0.92",
  ["--rzn-fig-x" as string]: "0.5",
  ["--rzn-fig-b" as string]: "0.12",
};
const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
const FIGURE: CSSProperties = {
  position: "absolute",
  left: "4%",
  bottom: "12%",
  width: "92%",
  height: "78%",
  objectFit: "contain",
  objectPosition: "50% 100%",
};
const CALLS: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "max(22px, env(safe-area-inset-bottom))",
  transform: "translateX(-50%)",
  width: "min(92vw, 760px)",
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "6px 18px",
  color: "rgb(233 239 242 / 34%)",
  fontFamily: '"Rexonance Forge", "Helvetica Neue", Arial, sans-serif',
  fontSize: "clamp(12px, 1.4vw, 16px)",
  fontWeight: 650,
  letterSpacing: "0.05em",
};

const CALL_LIGHT = `.mus-entry::-webkit-scrollbar{display:none}
.mus-entry .rzn-line,.mus-entry .rzn-chip{transition:color .25s ease,text-shadow .25s ease}
.mus-entry .rzn-line[data-done]{color:rgb(233 239 242 / 74%)}
.mus-entry .rzn-line[data-on]{color:#fff;text-shadow:0 0 18px rgb(255 154 74 / 46%)}
.mus-entry .rzn-line[data-on] .rzn-chip:not([data-on]){color:rgb(233 239 242 / 34%)}`;

/** How long the build waits for the scene to be ready before its clock runs. */
const READY_WAIT_MS = 1100;

export function MetaUnitasEntrySequence({
  phase,
}: {
  phase: "covering" | "revealing";
  tier?: "full" | "calm" | "reduced";
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const runwayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const layer = layerRef.current;
    const runway = runwayRef.current;
    if (!layer || !runway) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    let raf = 0;
    const mounted = performance.now();
    void import("@/lib/meta-unitas-rx-engine").then((module) => {
      if (disposed) return;
      dispose = module.mountMetaUnitasAssemblyEngine(runway, window);
      let started = 0;
      const frame = (now: number) => {
        raf = 0;
        if (disposed) return;
        const ready = runway.dataset.rznLoad === "ready";
        if (!started && (ready || now - mounted > READY_WAIT_MS)) started = now;
        const span = Math.max(1200, META_UNITAS_ENTRY_TIMINGS.cover - (started - mounted) - 240);
        const t = started ? Math.min(1, (now - started) / span) : 0;
        // Eased, ending past the seal so ミドル stands finished, lit.
        const p = (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) * 0.95;
        const travel = runway.offsetHeight - layer.clientHeight;
        layer.scrollTop = Math.round(travel * p);
        window.dispatchEvent(new Event("scroll"));
        if (t < 1) raf = window.requestAnimationFrame(frame);
      };
      raf = window.requestAnimationFrame(frame);
    });
    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      dispose?.();
    };
  }, []);
  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      style={{ ...LAYER, opacity: phase === "revealing" ? 0 : 1 }}
    >
      <div ref={runwayRef} className="rzn-suitup" data-form="standard" style={RUNWAY}>
        <div className="rzn-frame" style={FRAME}>
          <img
            className="rzn-under"
            src={META_UNITAS_RX_UNDERSUIT}
            alt=""
            style={FIGURE}
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
          />
          <img
            className="rzn-driver-standin"
            src={META_UNITAS_RX_DRIVER_STANDIN}
            alt=""
            style={FIGURE}
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
          />
          <canvas className="rzn-canvas" width={0} height={0} style={FILL} />
          <ol className="rzn-lines" style={CALLS}>
            {META_UNITAS_CALL_LINES.map((units, index) => (
              <li key={index} className="rzn-line">
                {units.map((unit, unitIndex) => (
                  <span key={`${unit}-${unitIndex}`} className="rzn-chip">
                    {unitIndex === 0 ? "【" : ""}
                    {unit}
                    {unitIndex === units.length - 1 ? "】" : ""}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
