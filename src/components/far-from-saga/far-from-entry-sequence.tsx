import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  FAR_FROM_CALLS,
  FAR_FROM_CHANT_ANSWER,
  FAR_FROM_ENTRY_BEATS,
  FAR_FROM_ENTRY_CAPTION,
  FAR_FROM_ENTRY_FRAME_MS,
  FAR_FROM_ENTRY_SCAN,
  FAR_FROM_ENTRY_TIMINGS,
  FAR_FROM_SUIT_CORE,
  FAR_FROM_SUIT_JOINTS,
  FAR_FROM_SUIT_MOTES,
  FAR_FROM_SUIT_PARTS,
  FAR_FROM_SUIT_PART_LINE,
  FAR_FROM_SUIT_PIXELS,
  FAR_FROM_SUIT_RETICLE,
  FAR_FROM_SUIT_SYSTEMS,
  FAR_FROM_SUIT_UNDER,
  beatCall,
  type FarFromEntryBeat,
} from "@/lib/far-from-entry-calls";
import {
  FAR_FROM_ENTRY_ATLAS,
  FAR_FROM_ENTRY_EYES_BOX,
  FAR_FROM_ENTRY_EYES_GLOW,
  FAR_FROM_ENTRY_FIGURE,
  FAR_FROM_ENTRY_LIGHTS,
  FAR_FROM_ENTRY_MARKS,
  FAR_FROM_ENTRY_REACTOR_BOX,
  FAR_FROM_ENTRY_REACTOR_GLOW,
  FAR_FROM_ENTRY_SIZE,
  FAR_FROM_ENTRY_UNDER,
} from "@/lib/far-from-entry-suit";
import { REXONANCE_SUIT_UNDERSUIT } from "@/lib/rexonance-suit";
import { FAR_FROM_ENTRY_KITS } from "@/lib/far-from-entry-kits";
import { farFromEntrySource } from "@/lib/far-from-entry-warmup";
import {
  FAR_FROM_ENTRY_START_BY,
  createFarFromEntryEngine,
  type FarFromEntrySources,
} from "./far-from-entry-engine";

/* FAR FROM SAGA's entry transformation (owner, 2026-10-22): the page-entry
   overlay of /far-from-saga, modelled on Rexonance's call
   (rexonance-call-sequence.tsx) and drawn by its global call sheet
   (styles-rexonance-calls.css: the ground, the frame, the words, the HUD,
   the suit's scan, joints, halos, rings, lock, callouts and pixel squares
   are the same grammar) with this suit's own data (far-from-entry-calls,
   far-from-entry-suit) and its own small sheet (styles-far-from-entry.css).
   The seven calls of the record play on one clock; the bare undersuit is
   scanned in, the fire engulfs it and bursts into nanites, the armour
   assembles plate by plate (the canvas engine, far-from-entry-engine) and
   on FAR FROM DEUS！ the eyes and the reactor fill with pixel squares that
   scatter: ミドル, complete.

   Decorative: aria-hidden; the route transition screen (load-gate.tsx,
   through far-from-entry-gate.ts) owns navigation, the phase, the tier,
   the skip control, cancellation and the cover's timing, as it does for
   Rexonance's call. No browser reads or timers in render: server and
   client render alike. */

type FarFromEntrySequenceProps = {
  phase: "covering" | "revealing";
  /** The gate's tier: "full" plays the call; "calm" (economy) and
   * "reduced" (prefers-reduced-motion) rest it on the finished figure and
   * the last call, still (the shared call sheet's still rules). */
  tier?: "full" | "calm" | "reduced";
  /** "build" when the suit's images are decoded; otherwise the finished
   * figure stands whole and the calls play over it. */
  suit: "build" | "whole";
};

// Each beat's lines: every call verbatim, the long calls as the lines the
// shared sheet sets (the chant as call and answer, the final call as two).
function BeatLines({ beat }: { beat: FarFromEntryBeat }) {
  if (beat.role === "rider")
    return (
      <>
        <span>RIDER！</span>
        <span>FAR FROM！</span>
      </>
    );
  if (beat.role === "chant")
    return (
      <>
        {[0, 1, 2, 3].map((line) => (
          <span key={line}>
            SA-GA！
            <span className="rx-call-answer">{line === 3 ? "DEUS！！！" : "DEUS！"}</span>
          </span>
        ))}
      </>
    );
  if (beat.role === "repetition")
    return (
      <>
        <span>FAR FROM！</span>
        <span>FAR FROM！</span>
        <span>FAR FROM！</span>
        <span>FAR FROM！</span>
      </>
    );
  if (beat.role === "final")
    return (
      <>
        <span>FAR FROM</span>
        <span>DEUS！</span>
      </>
    );
  return (
    <>
      {beat.calls.map((index) => (
        <span key={index}>{FAR_FROM_CALLS[index]}</span>
      ))}
    </>
  );
}
const BEAT_CLASS = {
  opening: "rx-call-beat rx-call-opening",
  cut: "rx-call-beat rx-call-opening",
  rider: "rx-call-beat rx-call-opening ffe-call-rider",
  chant: "rx-call-beat rx-call-chant",
  repetition: "rx-call-beat rx-call-repetition",
  final: "rx-call-beat rx-call-final",
} as const;
const beatOf = (role: FarFromEntryBeat["role"]) =>
  FAR_FROM_ENTRY_BEATS.find((beat) => beat.role === role)!;

const FIG = FAR_FROM_ENTRY_SIZE;
const U = FAR_FROM_ENTRY_UNDER;
const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
const place = (x: number, y: number, w: number, h: number): CSSProperties => ({
  left: pct(x, FIG.width),
  top: pct(y, FIG.height),
  width: pct(w, FIG.width),
  height: pct(h, FIG.height),
});
const at = ([x, y]: readonly [number, number]): CSSProperties => ({
  left: pct(x, FIG.width),
  top: pct(y, FIG.height),
});
// The undersuit inside the figure's box (a background position of an
// image smaller than its box is a share of the slack).
const UNDER_STYLE: CSSProperties = {
  backgroundImage: `url("${REXONANCE_SUIT_UNDERSUIT}")`,
  backgroundSize: `${pct(U.w, FIG.width)} ${pct(U.h, FIG.height)}`,
  backgroundPosition: `${((U.x / (FIG.width - U.w)) * 100).toFixed(3)}% ${((U.y / (FIG.height - U.h)) * 100).toFixed(3)}%`,
};
const bootClock = (index: number): CSSProperties =>
  ({
    "--rx-suit-boot-label-start": `${40 + index * 32}ms`,
    "--rx-suit-boot-label-duration": "60ms",
    "--rx-suit-boot-value-start": `${120 + index * 32}ms`,
    "--rx-suit-boot-value-duration": "60ms",
  }) as CSSProperties;

// Deterministic scatter (seeded, so server and client draw the same).
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};
const inside = (polygon: readonly (readonly [number, number])[], px: number, py: number) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
  }
  return hit;
};
const square = (x: number, y: number, size: number) =>
  `M${x.toFixed(1)} ${y.toFixed(1)}h${size}v${size}h-${size}z`;
type Squares = { cyan: string; pink: string; white: string };
// RIDER！FAR FROM！'s fallback motes: squares in the air round the body
// (shown only while the engine's own swarm is not drawing).
const suitMotes = (): Squares => {
  const random = seeded(1410);
  const out: Squares = { cyan: "", pink: "", white: "" };
  for (let n = 0; n < 220; n += 1) {
    const angle = random() * Math.PI * 2;
    const reach = 0.28 + 0.72 * Math.sqrt(random());
    const x = FIG.width / 2 + Math.cos(angle) * reach * FIG.width * 0.56;
    const y = FIG.height * 0.47 + Math.sin(angle) * reach * FIG.height * 0.52;
    const size = [3, 4, 5, 7][n % 4];
    const tone = n % 9 === 0 ? "white" : n % 3 === 0 ? "pink" : "cyan";
    out[tone] += square(x, y, size);
  }
  return out;
};
// FAR FROM DEUS！'s pixel squares: a mass filling a light (the eyes' glow,
// the reactor's crystal), in groups that land in turn and burst outward in
// turn. Ice at the edges, violet down the centre, a few burn white.
type Light = {
  name: string;
  glow: readonly (readonly [number, number])[];
  box: { x: number; y: number; w: number; h: number };
  centre: readonly [number, number];
  seed: number;
  count: number;
};
const LIGHTS: readonly Light[] = [
  {
    name: "eyes",
    glow: FAR_FROM_ENTRY_EYES_GLOW,
    box: FAR_FROM_ENTRY_EYES_BOX,
    centre: FAR_FROM_ENTRY_MARKS.visor,
    seed: 2010,
    count: 150,
  },
  {
    name: "reactor",
    glow: FAR_FROM_ENTRY_REACTOR_GLOW,
    box: FAR_FROM_ENTRY_REACTOR_BOX,
    centre: FAR_FROM_ENTRY_MARKS.core,
    seed: 3030,
    count: 150,
  },
];
const suitPixels = (light: Light): Squares[] => {
  const random = seeded(light.seed);
  const xs = light.glow.map(([x]) => x);
  const ys = light.glow.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const groups: Squares[] = Array.from({ length: FAR_FROM_SUIT_PIXELS.groups }, () => ({
    cyan: "",
    pink: "",
    white: "",
  }));
  for (let found = 0, tries = 0; found < light.count && tries < 4000; tries += 1) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (!inside(light.glow, x, y)) continue;
    const size = [4, 5, 6, 8][found % 4];
    const centre = Math.abs(x - light.centre[0]) < 10 + (y - y0) * 0.1;
    const tone = found % 7 === 0 ? "white" : centre ? "pink" : "cyan";
    groups[found % groups.length][tone] += square(x - size / 2, y - size / 2, size);
    found += 1;
  }
  return groups;
};
// Drawn once, on the first entry, then reused.
let SQUARES: { motes: Squares; pixels: Squares[][] } | undefined;
const suitSquares = () =>
  (SQUARES ??= { motes: suitMotes(), pixels: LIGHTS.map((light) => suitPixels(light)) });
// Each burst group flies its own way: a scale from the light's centre and a turn.
const SUIT_BURST = [
  [3.4, -14],
  [4.6, 10],
  [3, 22],
  [5.2, -6],
  [3.9, -24],
  [4.8, 16],
] as const;
const pad = (box: { x: number; y: number; w: number; h: number }) => ({
  x: box.x - 8,
  y: box.y - 8,
  w: box.w + 16,
  h: box.h + 16,
});

function SquarePaths({ squares }: { squares: Squares }) {
  return (
    <>
      <path className="is-cyan" d={squares.cyan} />
      <path className="is-pink" d={squares.pink} />
      <path className="is-white" d={squares.white} />
    </>
  );
}

// The halos' places and widths (figure px): the reactor and the eyes.
const SUIT_HALOS = [
  { name: "core", at: FAR_FROM_ENTRY_MARKS.core, size: 180 },
  { name: "eyes", at: FAR_FROM_ENTRY_MARKS.visor, size: 200 },
] as const;
// One resonance ring per FAR FROM！ quarter-beat, from the reactor.
const SUIT_RINGS = ["ice", "violet", "gold", "ice"] as const;

/** The canvas engine's host: it starts on the overlay's next frame, from
 * the decoded sources, on the call meter's clock, if the clock has not
 * passed FAR_FROM_ENTRY_START_BY; otherwise, or if it cannot draw, the
 * finished figure stands (onEngine("whole")). */
function FarFromEntryNanites({
  onEngine,
}: {
  onEngine: (state: "canvas" | "whole" | "finished") => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onEngine);
  report.current = onEngine;
  useEffect(() => {
    let frame = 0;
    let engine: ReturnType<typeof createFarFromEntryEngine> | null = null;
    const begin = () => {
      frame = 0;
      const box = host.current;
      const meter = box?.closest(".rx-call-sequence")?.querySelector(".rx-call-meter > i");
      if (!box || !meter) return;
      const clock = () => {
        const animation = meter.getAnimations()[0];
        if (!animation) return null;
        return Number(animation.currentTime);
      };
      const now = clock();
      const atlas = farFromEntrySource(FAR_FROM_ENTRY_ATLAS.src);
      const figure = farFromEntrySource(FAR_FROM_ENTRY_FIGURE);
      const lights = farFromEntrySource(FAR_FROM_ENTRY_LIGHTS);
      const under = farFromEntrySource(REXONANCE_SUIT_UNDERSUIT);
      const kitA = farFromEntrySource(FAR_FROM_ENTRY_KITS[0].src);
      const kitB = farFromEntrySource(FAR_FROM_ENTRY_KITS[1].src);
      if (
        now === null ||
        now > FAR_FROM_ENTRY_START_BY ||
        !atlas ||
        !figure ||
        !lights ||
        !under ||
        !kitA ||
        !kitB
      ) {
        report.current("whole");
        return;
      }
      const sources: FarFromEntrySources = { atlas, figure, lights, under, kits: [kitA, kitB] };
      const coarse = Boolean(
        globalThis.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches,
      );
      engine = createFarFromEntryEngine({
        box,
        coarse,
        sources,
        clock,
        onFinish: () => report.current("finished"),
      });
      if (engine.start(now)) report.current("canvas");
      else {
        engine = null;
        report.current("whole");
      }
    };
    frame = globalThis.requestAnimationFrame(begin);
    return () => {
      if (frame) globalThis.cancelAnimationFrame(frame);
      engine?.stop();
      engine = null;
    };
  }, []);
  return <div ref={host} className="rx-suit-nanites" />;
}

function Suit({ suit, animate }: { suit: "build" | "whole"; animate: boolean }) {
  const { motes, pixels } = suitSquares();
  const [fallback, setFallback] = useState(false);
  const [engine, setEngine] = useState<"dom" | "canvas" | "finished">("dom");
  const onEngine = useCallback((state: "canvas" | "whole" | "finished") => {
    if (state === "whole") setFallback(true);
    else setEngine(state);
  }, []);
  // A still tier stands the finished figure: no engine, no build.
  const shown = fallback || !animate ? "whole" : suit;
  return (
    <div
      className="rx-suit"
      data-suit={shown}
      data-nanites={engine}
      data-swarm={engine === "dom" ? "svg" : "canvas"}
      style={
        {
          "--rx-suit-material-start": `${FAR_FROM_SUIT_MOTES.from}ms`,
          "--rx-suit-heading-duration": "300ms",
          "--rx-suit-scan-duration": `${FAR_FROM_ENTRY_SCAN.span}ms`,
          "--rx-suit-sweep-duration": "330ms",
          "--rx-suit-under-duration": "60ms",
          "--rx-suit-core-start": `${FAR_FROM_SUIT_CORE.start}ms`,
          "--rx-suit-core-duration": `${FAR_FROM_SUIT_CORE.duration}ms`,
          "--ffe-under-dim-at": `${FAR_FROM_SUIT_UNDER.dimAt}ms`,
          "--ffe-under-dim-ms": `${FAR_FROM_SUIT_UNDER.dimMs}ms`,
          "--ffe-under-dim": FAR_FROM_SUIT_UNDER.dim,
          "--ffe-under-out-at": `${FAR_FROM_SUIT_UNDER.outAt}ms`,
          "--ffe-under-out-ms": `${FAR_FROM_SUIT_UNDER.outMs}ms`,
          "--ffe-reticle-delay": `${FAR_FROM_SUIT_RETICLE.delay}ms`,
          "--ffe-reticle-duration": `${FAR_FROM_SUIT_RETICLE.duration}ms`,
          "--ffe-motes-duration": `${FAR_FROM_SUIT_MOTES.ms}ms`,
        } as CSSProperties
      }
    >
      <i className="rx-suit-rim is-left" />
      <i className="rx-suit-rim is-right" />
      <i className="rx-suit-heading" />
      <i className="rx-suit-stage">
        <i className="rx-suit-floor" />
      </i>
      <div className="rx-suit-figure">
        {/* The opening calls scan the bare undersuit top to bottom; the
            finished figure stands in the scan when the pieces were not ready. */}
        <i className="rx-suit-scan">
          <i className="rx-suit-under" style={UNDER_STYLE} />
          <i
            className="rx-suit-whole"
            style={{ backgroundImage: `url("${FAR_FROM_ENTRY_FIGURE}")` }}
          />
        </i>
        {FAR_FROM_ENTRY_MARKS.joints.map((joint, index) => (
          <i
            key={joint.join()}
            className="rx-suit-joint"
            style={
              {
                ...at(joint),
                "--rx-suit-j": index,
                "--rx-suit-joint-start": `${FAR_FROM_SUIT_JOINTS.start + index * FAR_FROM_SUIT_JOINTS.step}ms`,
                "--rx-suit-joint-duration": `${FAR_FROM_SUIT_JOINTS.duration}ms`,
              } as CSSProperties
            }
          />
        ))}
        <svg className="rx-suit-motes" viewBox={`0 0 ${FIG.width} ${FIG.height}`}>
          <SquarePaths squares={motes} />
        </svg>
        {SUIT_HALOS.map(({ name, at: point, size }) => (
          <i
            key={name}
            className={`rx-suit-halo is-${name}`}
            style={{ ...at(point), width: pct(size, FIG.width) }}
          />
        ))}
        {/* The reactor's ignition on the last call. */}
        <i
          className="ffe-reactor-halo"
          style={{ ...at(FAR_FROM_ENTRY_MARKS.core), width: pct(260, FIG.width) }}
        />
        <div className="rx-suit-build">
          {shown === "build" ? <FarFromEntryNanites onEngine={onEngine} /> : null}
        </div>
        {/* FAR FROM DEUS！: the eyes and the reactor fill with pixel squares,
            group by group, and each group bursts outward from its centre. */}
        {LIGHTS.map((light, l) =>
          pixels[l].map((group, index) => {
            const [burst, turn] = SUIT_BURST[index];
            const box = pad(light.box);
            const origin = light.centre;
            const flown = {
              x: origin[0] - (origin[0] - box.x) * burst,
              y: origin[1] - (origin[1] - box.y) * burst,
              w: box.w * burst,
              h: box.h * burst,
            };
            return (
              <svg
                key={`${light.name}-${index}`}
                className={`rx-suit-pixels is-${light.name}`}
                viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
                style={
                  {
                    ...place(flown.x, flown.y, flown.w, flown.h),
                    transformOrigin: `${pct(origin[0] - flown.x, flown.w)} ${pct(origin[1] - flown.y, flown.h)}`,
                    "--rx-suit-i": index,
                    "--rx-suit-burst": burst,
                    "--rx-suit-r": `${turn}deg`,
                  } as CSSProperties
                }
              >
                <SquarePaths squares={group} />
              </svg>
            );
          }),
        )}
        {SUIT_RINGS.map((tone, index) => (
          <i
            key={index}
            className={`rx-suit-ring is-${tone}`}
            style={{ ...at(FAR_FROM_ENTRY_MARKS.core), "--rx-suit-k": index } as CSSProperties}
          />
        ))}
        <i className="rx-suit-lock" style={at(FAR_FROM_ENTRY_MARKS.visor)} />
      </div>
      <div className="rx-suit-callouts">
        {FAR_FROM_SUIT_PARTS.map((part) => (
          <p
            key={part}
            className={`rx-suit-callout is-${part.toLowerCase()}`}
            style={{ "--rx-suit-i": FAR_FROM_SUIT_PART_LINE[part] } as CSSProperties}
          >
            <span className="rx-suit-label">{part}</span>
            <i />
          </p>
        ))}
        <p className="rx-suit-callout is-lock">
          <span className="rx-suit-label">LOCK</span>
        </p>
      </div>
      <div className="rx-suit-boot">
        <p
          className="rx-suit-boot-title"
          style={{ ...bootClock(0), "--rx-suit-i": 0 } as CSSProperties}
        >
          SYSTEM CHECK
        </p>
        {FAR_FROM_SUIT_SYSTEMS.map(([name, status], index) => (
          <p
            key={name}
            style={{ ...bootClock(index + 1), "--rx-suit-i": index + 1 } as CSSProperties}
          >
            {name}
            <b>{status}</b>
          </p>
        ))}
      </div>
    </div>
  );
}

export function FarFromEntrySequence({ phase, tier = "full", suit }: FarFromEntrySequenceProps) {
  const chant = beatOf("chant");
  const response = beatOf("repetition");
  return (
    <div
      className="rx-call-sequence ffe-sequence"
      data-mode="entry"
      data-phase={phase}
      data-tier={tier}
      data-stage="middle"
      data-saga="far-from"
      aria-hidden="true"
      style={
        {
          "--rx-call-cover": `${FAR_FROM_ENTRY_TIMINGS.cover}ms`,
          "--rx-call-reveal": `${FAR_FROM_ENTRY_TIMINGS.reveal}ms`,
          "--rx-call-frame-duration": `${FAR_FROM_ENTRY_FRAME_MS}ms`,
          "--rx-call-rider-start": `${beatOf("rider").start}ms`,
          "--rx-call-chant-start": `${chant.start}ms`,
          "--rx-call-chant-duration": `${chant.duration}ms`,
          "--rx-call-response-start": `${response.start}ms`,
          "--rx-call-response-duration": `${response.duration}ms`,
          "--rx-call-final-start": `${beatOf("final").start}ms`,
          "--rx-call-answer-first": `${FAR_FROM_CHANT_ANSWER.first}ms`,
          "--rx-suit-ar": (FIG.width / FIG.height).toFixed(4),
        } as CSSProperties
      }
    >
      <div className="rx-call-ground">
        <i />
        <i />
        <i />
      </div>
      <div className="rx-call-frame">
        <i className="rx-call-axis rx-call-axis-horizontal" />
        <i className="rx-call-axis rx-call-axis-vertical" />
        <i className="rx-call-brackets" />
      </div>
      <div className="rx-call-aperture">
        <i />
        <i />
        <i />
      </div>
      <Suit suit={suit} animate={tier === "full"} />
      <div className="rx-call-caption">
        <span>{FAR_FROM_ENTRY_CAPTION[0]}</span>
        <span>{FAR_FROM_ENTRY_CAPTION[1]}</span>
      </div>
      <div className="rx-call-words">
        {FAR_FROM_ENTRY_BEATS.map((beat) => (
          <div
            key={beat.role}
            className={BEAT_CLASS[beat.role]}
            data-call={beatCall(beat)}
            style={
              {
                "--rx-call-start": `${beat.start}ms`,
                "--rx-call-duration": `${beat.duration}ms`,
              } as CSSProperties
            }
          >
            <BeatLines beat={beat} />
          </div>
        ))}
      </div>
      <div className="rx-call-meter">
        <i />
      </div>
    </div>
  );
}
