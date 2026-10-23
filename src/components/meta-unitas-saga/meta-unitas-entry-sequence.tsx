import { useEffect, useRef, type CSSProperties } from "react";
import { META_UNITAS_CALL_LINES } from "@/lib/meta-unitas-assembly";
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
};
const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

/* The entry's staging (the Rexonance entry's grammar, in Meta Unitas'
   light): the figure stands right of centre in a halo of thin orbits; each
   call takes the stage alone at the left, set large, and gives way to the
   next; the chant's four SA-GA！DEUS！ light one by one. Phones stack the
   call over the figure. Opacity and transforms only. */
const STAGING = `.mus-entry::-webkit-scrollbar{display:none}
.mus-entry .rzn-frame{--rzn-fig-x:.66;--rzn-fig-h:.86;--rzn-fig-b:.05}
.mus-entry .mus-entry-fig{position:absolute;left:calc((var(--rzn-fig-x) - .46) * 100%);bottom:5%;width:92%;height:86%;object-fit:contain;object-position:50% 100%}
.mus-entry .mus-entry-orbit{position:absolute;left:calc(var(--rzn-fig-x) * 100%);top:50%;width:min(110vh,90vw);aspect-ratio:1;border:1px solid rgb(255 154 74 / 18%);border-radius:50%;transform:translate(-50%,-50%) rotate(-12deg) scaleY(.38)}
.mus-entry .mus-entry-orbit.is-b{width:min(78vh,70vw);border-color:rgb(55 198 192 / 20%);transform:translate(-50%,-56%) rotate(18deg) scaleY(.52)}
.mus-entry .mus-entry-calls{position:absolute;left:clamp(24px,6vw,96px);top:50%;width:min(52vw,760px);height:0;margin:0;padding:0;list-style:none}
.mus-entry .rzn-line{position:absolute;left:0;top:0;transform:translateY(-40%);display:flex;flex-wrap:wrap;gap:0 .32em;font:640 clamp(36px,5.6vw,104px)/1.06 "Rexonance Forge","Helvetica Neue",Arial,sans-serif;letter-spacing:.01em;color:#f4f8fa;opacity:0;transition:opacity .28s ease,transform .5s cubic-bezier(.2,.7,.1,1)}
.mus-entry .rzn-line[data-chant]{flex-direction:column;font-size:clamp(30px,4.4vw,76px)}
.mus-entry .rzn-line:not([data-chant]) .rzn-chip{display:flex;flex-direction:column}
.mus-entry .rzn-chip>span{white-space:nowrap}
.mus-entry .rzn-suitup:not([data-rzn-state]) .rzn-line:first-child{opacity:1;transform:translateY(-50%)}
.mus-entry .rzn-line[data-on]{opacity:1;transform:translateY(-50%);transition-delay:.12s}
.mus-entry .rzn-line[data-done]:not([data-on]){opacity:0;transform:translateY(-62%);transition-duration:.16s,.3s}
.mus-entry .rzn-line:last-child[data-on],.mus-entry .rzn-line:last-child[data-done]{opacity:1;transform:translateY(-50%)}
.mus-entry .rzn-chip{background:linear-gradient(100deg,#fff 10%,#ffc98f 55%,#ff9a4a);-webkit-background-clip:text;background-clip:text;color:transparent}
.mus-entry .rzn-line[data-chant] .rzn-chip{opacity:.22;transition:opacity .2s ease}
.mus-entry .rzn-line[data-chant] .rzn-chip[data-on],.mus-entry .rzn-line[data-chant] .rzn-chip[data-done]{opacity:1}
.mus-entry .rzn-line:last-child .rzn-chip{background:linear-gradient(100deg,#fff,#9ff0ea 60%,#37c6c0);-webkit-background-clip:text;background-clip:text}
@media (max-width:760px),(orientation:portrait){
.mus-entry .rzn-frame{--rzn-fig-x:.5;--rzn-fig-h:.6;--rzn-fig-b:.3}
.mus-entry .mus-entry-fig{bottom:30%;height:60%}
.mus-entry .mus-entry-calls{left:20px;right:20px;top:auto;bottom:16%;width:auto}
.mus-entry .rzn-line{left:0;right:0;justify-content:center;text-align:center;transform:translateY(-20%);font-size:clamp(30px,8.4vw,72px)}
.mus-entry .rzn-line[data-on],.mus-entry .rzn-line:last-child[data-on],.mus-entry .rzn-line:last-child[data-done]{transform:translateY(-50%)}
.mus-entry .rzn-line[data-chant]{align-items:center;font-size:clamp(22px,6vw,52px)}
.mus-entry .rzn-line:not([data-chant]) .rzn-chip{align-items:center}}`;

/** How long the build waits for the scene to be ready before its clock runs. */
const READY_WAIT_MS = 1500;

/** The entry's clock (owner, 2026-10-24: 「装着が駆け足すぎる」), set to the
 * Rexonance entry's pacing: the scan, the fire, each part's landing a call's
 * stage long, the bits and the head, the seal and the light — [ms, p] keys
 * along the engine's scroll beats (ASSEMBLY_BEATS). */
const CLOCK: readonly (readonly [number, number])[] = [
  [0, 0],
  [420, 0.07],
  [1020, 0.16],
  [1600, 0.275],
  [2180, 0.39],
  [2760, 0.505],
  [3340, 0.62],
  [4060, 0.85],
  [4700, 0.95],
];
const progressAt = (ms: number) => {
  for (let i = 1; i < CLOCK.length; i += 1) {
    const [t1, p1] = CLOCK[i];
    const [t0, p0] = CLOCK[i - 1];
    if (ms <= t1) return p0 + ((p1 - p0) * (ms - t0)) / (t1 - t0);
  }
  return CLOCK[CLOCK.length - 1][1];
};

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
        const elapsed = started ? now - started : 0;
        const p = progressAt(elapsed);
        const t = elapsed >= CLOCK[CLOCK.length - 1][0] ? 1 : 0;
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
      className="mus-entry"
      aria-hidden="true"
      style={{ ...LAYER, opacity: phase === "revealing" ? 0 : 1 }}
    >
      <style>{STAGING}</style>
      <div ref={runwayRef} className="rzn-suitup" data-form="standard" style={RUNWAY}>
        <div className="rzn-frame" style={FRAME}>
          <img
            className="rzn-under mus-entry-fig"
            src={META_UNITAS_RX_UNDERSUIT}
            alt=""
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
          />
          <img
            className="rzn-driver-standin mus-entry-fig"
            src={META_UNITAS_RX_DRIVER_STANDIN}
            alt=""
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
          />
          <canvas className="rzn-canvas" width={0} height={0} style={FILL} />
          <i className="mus-entry-orbit" />
          <i className="mus-entry-orbit is-b" />
          <ol className="rzn-lines mus-entry-calls">
            {META_UNITAS_CALL_LINES.map((units, index) => (
              <li key={index} className="rzn-line" data-chant={units.length > 1 || undefined}>
                {units.map((unit, unitIndex) => (
                  <span key={`${unit}-${unitIndex}`} className="rzn-chip">
                    {(units.length > 1
                      ? [
                          `${unitIndex === 0 ? "【" : ""}${unit}${unitIndex === units.length - 1 ? "】" : ""}`,
                        ]
                      : (`【${unit}】`.match(/[^！]+！+】?|[^！]+$/g) ?? [unit])
                    ).map((part, partIndex) => (
                      <span key={partIndex}>{part}</span>
                    ))}
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
