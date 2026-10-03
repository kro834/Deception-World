import type { CSSProperties } from "react";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CALLS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_STAGE_DURATION_MS,
  REXONANCE_STAGE_LABELS,
  REXONANCE_SUIT_PARTS,
  REXONANCE_SUIT_SYSTEMS,
  type RexonanceStage,
} from "@/lib/rexonance-calls";

type RexonanceCallSequenceProps = {
  mode: "entry" | "stage";
  phase: "covering" | "revealing";
  tier: "full" | "calm" | "reduced";
  stage?: RexonanceStage;
};

function CallLines({ index }: { index: number }) {
  if (index === 2) {
    return (
      <>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
      </>
    );
  }
  if (index === 3) {
    return (
      <>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
      </>
    );
  }
  if (index === 4) {
    return (
      <>
        <span>REXONANCE</span>
        <span>DEUS！</span>
      </>
    );
  }
  return <span>{REXONANCE_CALLS[index]}</span>;
}

// rx3 — the suit-up schematic, in 240 × 480 drawing units. Shapes are drawn
// for the left side and mirrored. Every group is its own small box (so it
// moves on the compositor and rasters small), drawn as one path of closed
// outlines (a few nodes, not one per plate), and its strokes stay 1 px at any
// size. Textless: only the HUD below carries words.
const SUIT_W = 240;
const SUIT_H = 480;
const mirror = (points: string) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",");
      return `${SUIT_W - Number(x)},${y}`;
    })
    .join(" ");
const SUIT_ARM = [
  "88,96 68,92 52,102 48,118 56,130 74,128 86,116",
  "70,93 50,66 56,64 78,94",
  "54,134 74,133 75,176 57,178",
  "65,180 73,188 65,196 57,188",
  "54,200 76,198 77,250 58,254",
  "54,206 42,228 54,244",
  "58,257 77,254 79,274 63,278",
];
const SUIT_LEG = [
  "96,216 118,216 117,238 99,244 93,228",
  "95,247 119,247 117,320 100,322",
  "108,322 118,331 108,341 98,331",
  "98,344 119,344 117,428 102,432 95,388",
  "108,350 111,388 108,422 105,388",
  "101,436 118,436 123,468 92,471 96,452",
];
const SUIT_PEC = "118,98 100,96 84,104 82,120 92,142 110,152 118,148";
const SUIT_CHEST = [
  SUIT_PEC,
  mirror(SUIT_PEC),
  "102,156 138,156 136,168 104,168",
  "104,171 136,171 134,183 106,183",
  "106,186 134,186 132,197 108,197",
  "96,201 144,201 146,214 94,214",
  "120,198 128,202.5 128,211.5 120,216 112,211.5 112,202.5",
];
// The P14 core's housing, drawn in gold on the chest plate.
const SUIT_HOUSING = "120,115 129.5,120.5 129.5,131.5 120,137 110.5,131.5 110.5,120.5";
const SUIT_SHELL =
  "120,22 136,27 146,38 149,56 145,72 134,82 120,85 106,82 95,72 91,56 94,38 104,27";
const SUIT_CREST = "117,33 112,31 86,6 91,4";
const SUIT_SPIKE = "120,6 124,23 120,35 116,23";
const SUIT_HEAD = [SUIT_SHELL, SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE];
// The stage card's badge swaps the crest per form: HIGH keeps the V, MAX
// fans six fins (every ornament turned outward), ULTRA draws its blades
// into one spire.
const SUIT_FIN_A = "114,30 98,8 102,6 117,27";
const SUIT_FIN_B = "110,33 84,17 87,13 113,29";
const SUIT_FIN_C = "106,37 78,32 79,27 108,33";
const SUIT_BLADE = "112,31 108,28 112,-4 116,-2";
const SUIT_CRESTS = {
  standard: [SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE],
  max: [
    SUIT_FIN_A,
    SUIT_FIN_B,
    SUIT_FIN_C,
    ...[SUIT_FIN_A, SUIT_FIN_B, SUIT_FIN_C].map(mirror),
    SUIT_SPIKE,
  ],
  ultra: [SUIT_BLADE, mirror(SUIT_BLADE), "120,-16 125,16 120,36 115,16"],
} as const;
const SUIT_FACE = "120,36 106,39 97,50 98,66 108,77 120,80";
const SUIT_EYE = "117,50 105,45 97,48 98,55 108,59 117,55";
const SUIT_SILHOUETTE =
  "M120 86 110 86 92 95 62 100 50 112 48 134 52 200 52 256 56 282 80 282 80 200 84 150 94 196 92 216 92 330 94 436 90 474 120 474 120 252";
const mirrorPath = (path: string) =>
  path.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, x, y) => `${SUIT_W - Number(x)} ${y}`);

const SUIT_PLATES = [
  { name: "is-legs is-left", shapes: SUIT_LEG, index: 0 },
  { name: "is-legs is-right", shapes: SUIT_LEG.map(mirror), index: 0 },
  { name: "is-arms is-left", shapes: SUIT_ARM, index: 1 },
  { name: "is-arms is-right", shapes: SUIT_ARM.map(mirror), index: 1 },
  { name: "is-chest", shapes: SUIT_CHEST, accent: [SUIT_HOUSING], index: 2 },
  { name: "is-head", shapes: SUIT_HEAD, index: 3 },
] as const;

// Resonance runs outward from the core: chest, then arms and helmet, then legs.
const SUIT_ZONES = [
  [...SUIT_CHEST, SUIT_HOUSING],
  [...SUIT_ARM, ...SUIT_ARM.map(mirror), ...SUIT_HEAD],
  [...SUIT_LEG, ...SUIT_LEG.map(mirror)],
];
const SUIT_PHASES = ["ice", "violet", "gold"] as const;
const SUIT_CORE = [120, 126] as const;

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
// Closed outlines as one path: "M" starts each outline, its other points are
// implicit line-tos, "Z" closes it.
const outline = (shapes: readonly string[]) => shapes.map((points) => `M${points}Z`).join("");

function SuitShape({
  className,
  shapes,
  accent,
  pivot,
  bare,
  style,
}: {
  className: string;
  shapes: readonly string[];
  // The SVG is the box itself (nothing to bite or to shut inside it).
  bare?: boolean;
  // Outlines drawn in the accent stroke (the gold core housing).
  accent?: readonly string[];
  // A drawing point to scale from (the core, for the resonance).
  pivot?: readonly [number, number];
  style?: CSSProperties;
}) {
  const coordinates = [...shapes, ...(accent ?? [])].flatMap((points) =>
    points.split(" ").map((pair) => pair.split(",").map(Number)),
  );
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const x = Math.min(...xs) - 2;
  const y = Math.min(...ys) - 2;
  const width = Math.max(...xs) + 2 - x;
  const height = Math.max(...ys) + 2 - y;
  const box = {
    ...style,
    left: percent(x, SUIT_W),
    top: percent(y, SUIT_H),
    width: percent(width, SUIT_W),
    height: percent(height, SUIT_H),
    transformOrigin: pivot
      ? `${percent(pivot[0] - x, width)} ${percent(pivot[1] - y, height)}`
      : undefined,
  };
  const drawing = (
    <>
      <path d={outline(shapes)} />
      {accent ? <path className="rx-suit-accent" d={outline(accent)} /> : null}
    </>
  );
  const view = `${x} ${y} ${width} ${height}`;
  if (bare) {
    return (
      <svg className={className} style={box} viewBox={view} preserveAspectRatio="none">
        {drawing}
      </svg>
    );
  }
  return (
    <i className={className} style={box}>
      <svg viewBox={view} preserveAspectRatio="none">
        {drawing}
      </svg>
    </i>
  );
}

// The stage card's accent: the helmet, its crest plate swapped for the form.
function SuitBadge() {
  const view = "60 -16 120 104";
  return (
    <div className="rx-suit-badge">
      <svg className="rx-suit-badge-helmet" viewBox={view}>
        <path d={outline([SUIT_SHELL, SUIT_FACE, mirror(SUIT_FACE)])} />
      </svg>
      {(["standard", "max", "ultra"] as const).map((form) => (
        <svg key={form} className={`rx-suit-crest is-${form}`} viewBox={view}>
          <path d={outline(SUIT_CRESTS[form])} />
        </svg>
      ))}
      <svg className="rx-suit-badge-eyes" viewBox={view}>
        <path d={outline([SUIT_EYE, mirror(SUIT_EYE)])} />
      </svg>
    </div>
  );
}

function Suit() {
  return (
    <div className="rx-suit">
      {/* Interior HUD: the visor's curved edges and a heading strip. */}
      <i className="rx-suit-rim is-left" />
      <i className="rx-suit-rim is-right" />
      <i className="rx-suit-heading" />
      <div className="rx-suit-figure">
        <svg className="rx-suit-blueprint" viewBox="0 0 240 480" preserveAspectRatio="none">
          <path
            className="rx-suit-guides"
            d="M120 0V480M0 54H240M0 112H240M0 126H240M0 207H240M0 331H240M0 474H240"
          />
          <path d={`${SUIT_SILHOUETTE}${mirrorPath(SUIT_SILHOUETTE)}`} />
        </svg>
        {SUIT_PLATES.map((plate) => (
          <SuitShape
            key={plate.name}
            className={`rx-suit-plate ${plate.name}`}
            shapes={plate.shapes}
            accent={"accent" in plate ? plate.accent : undefined}
            style={{ "--rx-suit-i": plate.index } as CSSProperties}
          />
        ))}
        {SUIT_PHASES.map((phase, index) =>
          SUIT_ZONES.map((shapes, zone) => (
            <SuitShape
              key={`${phase}-${zone}`}
              className={`rx-suit-glow is-${phase}`}
              shapes={shapes}
              pivot={SUIT_CORE}
              bare
              style={{ "--rx-suit-k": index, "--rx-suit-z": zone } as CSSProperties}
            />
          )),
        )}
        {SUIT_PHASES.map((phase, index) => (
          <i
            key={phase}
            className={`rx-suit-ring is-${phase}`}
            style={{ "--rx-suit-k": index } as CSSProperties}
          />
        ))}
        <SuitShape className="rx-suit-face is-left" shapes={[SUIT_FACE]} />
        <SuitShape className="rx-suit-face is-right" shapes={[mirror(SUIT_FACE)]} />
        {SUIT_PHASES.map((phase, index) => (
          <SuitShape
            key={phase}
            className={`rx-suit-eyes is-${phase}`}
            shapes={[SUIT_EYE, mirror(SUIT_EYE)]}
            bare
            style={{ "--rx-suit-k": index } as CSSProperties}
          />
        ))}
        <i className="rx-suit-core" />
        <i className="rx-suit-lock" />
      </div>
      <div className="rx-suit-callouts">
        {REXONANCE_SUIT_PARTS.map((part, index) => (
          <p
            key={part}
            className={`rx-suit-callout is-${part.toLowerCase()}`}
            style={{ "--rx-suit-i": index } as CSSProperties}
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
        <p className="rx-suit-boot-title" style={{ "--rx-suit-i": 0 } as CSSProperties}>
          SYSTEM CHECK
        </p>
        {REXONANCE_SUIT_SYSTEMS.map(([name, status], index) => (
          <p key={name} style={{ "--rx-suit-i": index + 1 } as CSSProperties}>
            {name}
            <b>{status}</b>
          </p>
        ))}
      </div>
    </div>
  );
}

// Decorative only. LoadGate owns navigation, live status, cancellation and
// cover timing; the stage coordinator owns selection and the component's life.
// No browser reads or independent timers: server and client render identically.
export function RexonanceCallSequence({
  mode,
  phase,
  tier,
  stage = "standard",
}: RexonanceCallSequenceProps) {
  const entry = mode === "entry";
  return (
    <div
      className="rx-call-sequence"
      data-mode={mode}
      data-phase={phase}
      data-tier={tier}
      data-stage={stage}
      aria-hidden="true"
      style={
        {
          "--rx-call-cover": `${REXONANCE_ENTRY_TIMINGS.cover}ms`,
          "--rx-call-reveal": `${REXONANCE_ENTRY_TIMINGS.reveal}ms`,
          "--rx-call-stage-duration": `${REXONANCE_STAGE_DURATION_MS}ms`,
          // The call and its answer, for the ornaments that keep their beat.
          "--rx-call-rider-start": `${REXONANCE_CALL_BEATS[1].start}ms`,
          "--rx-call-chant-start": `${REXONANCE_CALL_BEATS[2].start}ms`,
          "--rx-call-chant-duration": `${REXONANCE_CALL_BEATS[2].duration}ms`,
          "--rx-call-response-start": `${REXONANCE_CALL_BEATS[3].start}ms`,
          "--rx-call-response-duration": `${REXONANCE_CALL_BEATS[3].duration}ms`,
          "--rx-call-final-start": `${REXONANCE_CALL_BEATS[4].start}ms`,
        } as CSSProperties
      }
    >
      {/* Three blades: the dark ground opens as an aperture (textless). */}
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
      {entry ? (
        <div className="rx-call-aperture">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="rx-call-signature">
          <i />
        </div>
      )}
      {entry ? <Suit /> : <SuitBadge />}
      <div className="rx-call-caption">
        <span>TRINITY RESONANCE</span>
        <span>{entry ? "P14 / FINAL ARRIVAL" : `P14 / ${REXONANCE_STAGE_LABELS[stage]}`}</span>
      </div>
      <div className="rx-call-words">
        {entry ? (
          REXONANCE_CALLS.map((call, index) => (
            <div
              key={`${index}-${call}`}
              className={`rx-call-beat${index < 2 ? " rx-call-opening" : ""}${index === 4 ? " rx-call-final" : ""}${index === 2 ? " rx-call-chant" : ""}${index === 3 ? " rx-call-repetition" : ""}`}
              data-call={call}
              style={
                {
                  "--rx-call-start": `${REXONANCE_CALL_BEATS[index].start}ms`,
                  "--rx-call-duration": `${REXONANCE_CALL_BEATS[index].duration}ms`,
                } as CSSProperties
              }
            >
              <CallLines index={index} />
            </div>
          ))
        ) : (
          <div className="rx-call-beat rx-call-final">
            <CallLines index={4} />
            <small className="rx-call-operating-stage">
              <span>OPERATING STAGE</span>
              <b>{REXONANCE_STAGE_LABELS[stage]}</b>
            </small>
          </div>
        )}
      </div>
      <div className="rx-call-meter">
        <i />
      </div>
    </div>
  );
}
