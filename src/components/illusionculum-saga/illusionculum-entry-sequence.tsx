import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { ILLUSIONCULUM_ENTRY_CALLS } from "@/lib/illusionculum-entry";
import {
  ILLUSIONCULUM_SUIT_DRIVER_STANDIN,
  ILLUSIONCULUM_SUIT_SIZE,
  ILLUSIONCULUM_SUIT_UNDERSUIT,
} from "@/lib/illusionculum-suit";

/* ILLUSIONCULUM SAGA's entry transformation: the route transition screen of
   an in-site navigation to /illusionculum-saga (load-gate.tsx, the
   "illusionculum" dive), as Rexonance's and FAR FROM's calls play in theirs.

   Under the cover, on one clock (styles-illusionculum-entry.css, the gate's
   ILLUSIONCULUM_ENTRY_TIMINGS): the gold sigil draws; the owner's four calls
   come in one after another; over the bare undersuit (the same wearer as
   Rexonance) the armour is generated from nanite cells away from the body
   (owner, 2026-10-23: 「ナノマシンで生成された装甲をしてから装着する方式」),
   then flies in and locks on — the scroll suit-up's own engine (below);
   the reactor surges and lights. Then the gate reveals the page.

   Decorative (aria-hidden); the gate owns the tier (only "full" plays this;
   economy and reduced motion get the gate's short calm shutter), the
   timing and the reveal. The clock runs even if the scene is late, so the
   cover never waits. Runs
   once: no loop, no flash (the reactor's light is a small, slow glow). */

/* The engine's runway (owner, 2026-10-24: 「イリュージョンクルムの遷移アニメー
   ションでも、ナノマシン装着される様にして」): the same scene as #suitup — the
   Rexonance scroll engine with this suit (illusionculum-assembly-engine.ts),
   mounted on one full-screen layer whose progress the clock drives
   directly: the plates built by nanite cells off
   the body, then flown in and attached onto the undersuit, the driver on it
   from frame one. Inline styles: the gate is global. */
const SIZE = ILLUSIONCULUM_SUIT_SIZE;
const LAYER: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
};
const RUNWAY: CSSProperties = { position: "relative", height: "100%" };
const FRAME: CSSProperties = { position: "absolute", inset: 0, height: "100%", overflow: "hidden" };
const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

/* The figure where the old stage stood (right of centre on wide screens,
   raised over the calls on phones and portrait tablets). */
const STAGING = `.ice-entry-engine::-webkit-scrollbar{display:none}
.ice-entry-engine .rzn-frame{--rzn-fig-x:.64;--rzn-fig-h:.84;--rzn-fig-b:.08}
.ice-entry-engine .ice-entry-fig{position:absolute;left:calc(var(--rzn-fig-x) * 100% - 50%);bottom:calc(var(--rzn-fig-b) * 100%);width:100%;height:calc(var(--rzn-fig-h) * 100%);object-fit:contain;object-position:50% 100%}
@media (max-width:760px){.ice-entry-engine .rzn-frame{--rzn-fig-x:.5;--rzn-fig-h:.62;--rzn-fig-b:.25}}
@media (min-width:761px) and (max-width:1099.98px) and (orientation:portrait){.ice-entry-engine .rzn-frame{--rzn-fig-x:.5;--rzn-fig-h:.66;--rzn-fig-b:.22}}`;

/** How long the clock waits for the scene before it runs regardless. */
const READY_WAIT_MS = 420;

/** The clock, inside the ≈3.1 s cover (Rexonance's pacing): the scan, the
 * cells building each group off the body and landing a call's stage long,
 * the head, the seal and the light — [ms, p] along the engine's beats. */
const CLOCK: readonly (readonly [number, number])[] = [
  [0, 0],
  [240, 0.07],
  [600, 0.16],
  [950, 0.275],
  [1300, 0.39],
  [1650, 0.505],
  [2000, 0.62],
  [2380, 0.85],
  [2620, 0.95],
];
const progressAt = (ms: number) => {
  for (let i = 1; i < CLOCK.length; i += 1) {
    const [t1, p1] = CLOCK[i];
    const [t0, p0] = CLOCK[i - 1];
    if (ms <= t1) return p0 + ((p1 - p0) * (ms - t0)) / (t1 - t0);
  }
  return CLOCK[CLOCK.length - 1][1];
};

function useEngineClock(runwayRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    let raf = 0;
    let progress = 0;
    const mounted = performance.now();
    void import("@/lib/illusionculum-assembly-engine")
      .then((module) => {
        if (disposed) return;
        dispose = module.mountIllusionculumAssemblyEngine(runway, window, {
          entry: true,
          progress: () => progress,
        });
        let started = 0;
        const frame = (now: number) => {
          raf = 0;
          if (disposed) return;
          const ready = runway.dataset.rznLoad === "ready";
          if (!started && (ready || now - mounted > READY_WAIT_MS)) started = now;
          const elapsed = started ? now - started : 0;
          progress = progressAt(elapsed);
          runway.dispatchEvent(new Event("rexonance:assembly-frame"));
          if (elapsed < CLOCK[CLOCK.length - 1][0]) raf = window.requestAnimationFrame(frame);
        };
        raf = window.requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!disposed) runway.dataset.rznLoad = "error";
      });
    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      dispose?.();
    };
  }, [runwayRef]);
}

export function IllusionculumEntrySequence({ phase }: { phase: "covering" | "revealing" }) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  useEngineClock(runwayRef);
  return (
    <div className="ice-entry" data-phase={phase} aria-hidden="true">
      <span className="ice-entry-ground" />
      {/* The dream-dive vortex: rings of the light paths' colours, far and
          near, spinning in and converging into the reactor (the form's own
          signature event, at the scale of Rexonance's flame vortex). */}
      <span className="ice-entry-vortex" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((ring) => (
          <i key={ring} style={{ ["--ring" as string]: ring }} />
        ))}
      </span>
      {/* Far cells, drifting behind the figure (the depth's back plane). */}
      <span className="ice-entry-far" aria-hidden="true" />
      <svg className="ice-entry-sigil" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="190" pathLength="1" />
        <circle cx="200" cy="200" r="132" pathLength="1" />
        <path d="M200 10 L364 295 L36 295 Z" pathLength="1" />
        <path d="M200 390 L36 105 L364 105 Z" pathLength="1" />
      </svg>
      <div className="ice-entry-engine" style={LAYER}>
        <style>{STAGING}</style>
        <div ref={runwayRef} className="rzn-suitup" data-form="standard" style={RUNWAY}>
          <div className="rzn-frame" style={FRAME}>
            <img
              className="rzn-under ice-entry-fig"
              src={ILLUSIONCULUM_SUIT_UNDERSUIT}
              alt=""
              width={SIZE.width}
              height={SIZE.height}
            />
            {/* The driver, on the undersuit from the first frame (owner). */}
            <img
              className="rzn-driver-standin ice-entry-fig"
              src={ILLUSIONCULUM_SUIT_DRIVER_STANDIN}
              alt=""
              width={SIZE.width}
              height={SIZE.height}
            />
            <canvas className="rzn-canvas" width={0} height={0} style={FILL} />
          </div>
        </div>
      </div>
      <div className="ice-entry-stage">
        <div className="ice-entry-figure">
          {/* The reactor's ice surge and its core, over the engine's figure. */}
          <span className="ice-entry-surge" />
          <span className="ice-entry-core" />
        </div>
      </div>
      {/* The calls, one at a time, large and centred under the figure (as
          Rexonance's entry stages them); a chant's units light in turn. */}
      <ol className="ice-entry-calls">
        {ILLUSIONCULUM_ENTRY_CALLS.map((call, index) => {
          const units = call.match(/[^！]+！/g) ?? [call];
          return (
            <li
              key={call}
              style={{ ["--ice-call" as string]: index }}
              data-last={index === ILLUSIONCULUM_ENTRY_CALLS.length - 1 || undefined}
            >
              {units.map((unit, k) => (
                <span key={k} style={{ ["--ice-unit" as string]: k }}>
                  {unit}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
      {/* The frame: corner ticks, the scan line down the undersuit, and the
          lock's ring at the reactor once the suit is whole. */}
      {/* The orbit plane, tilted, the orbs' path round the figure. */}
      <span className="ice-entry-orbit" />
      {/* Near cells, larger and faster in front (the depth's front plane). */}
      <span className="ice-entry-near" />
      <span className="ice-entry-frame" />
      <span className="ice-entry-scan" />
      <span className="ice-entry-lock" />
    </div>
  );
}
