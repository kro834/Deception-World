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

// The approved Rexonance portrait, reduced to its characteristic outlines:
// swept crown, descending V visor, layered shoulder blades, circular jewels
// and the curled ornament behind the right shoulder. Each assembly group
// retains its own bounded SVG and the existing transformation-call clock.
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
const circleOutline = (cx: number, cy: number, radius: number) =>
  Array.from({ length: 16 }, (_, index) => {
    const angle = (index * Math.PI) / 8;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
const rotateOutline = (points: string, angle: number, cx: number, cy: number) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${(cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle)).toFixed(1)},${(cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)).toFixed(1)}`;
    })
    .join(" ");
const SUIT_ARM = [
  "88,121 62,100 22,65 33,105 60,128 82,134",
  "84,126 55,115 8,113 40,130 69,141",
  "82,134 51,135 15,155 53,148 76,150",
  "84,143 62,150 27,180 64,162 85,155",
  "68,145 81,151 78,181 65,198 55,181 56,158",
  "71,167 63,184 69,198 75,184",
  "59,193 45,183 45,212 54,235 68,250 73,224 70,204",
  "50,204 59,215 63,232 56,246 48,225",
  "48,219 36,205 39,239 53,259 62,251",
  "52,252 66,248 69,264 52,272 47,263",
  "52,274 67,266 74,279 70,291 58,299 48,288",
  "69,142 76,151 69,165 62,152",
  "83,116 86,122 92,125 86,128 83,134 80,128 74,125 80,122",
];
const SUIT_SHOULDER = [circleOutline(83, 125, 13), circleOutline(83, 125, 9)];
const SUIT_ARM_TRIM = [
  ...SUIT_SHOULDER,
  "22,65 38,108 79,131 63,112",
  "8,113 45,132 74,144 52,129",
  "15,155 52,146 78,146 61,152",
  "45,183 50,215 62,242 67,250 59,226",
  "52,252 66,248 69,264 52,272 47,263",
];
const SUIT_LEG = [
  "94,239 114,246 115,284 102,322 86,307 83,273",
  "91,255 105,272 102,307 89,287",
  "95,266 104,279 95,296 86,280",
  "90,316 101,338 96,360 81,354 80,338",
  "90,327 98,342 90,355 83,341",
  "79,354 97,361 105,415 99,443 82,438 72,395",
  "80,362 86,397 99,426 91,405 88,373",
  "81,440 100,444 104,462 94,474 69,472 70,459",
];
const SUIT_LEG_TRIM = [
  "91,255 105,272 102,307 89,287",
  "90,316 101,338 96,360 81,354 80,338",
  "79,354 84,388 102,421 99,436 91,416 78,392",
];
const SUIT_PEC = "114,110 97,110 88,120 90,143 105,159 115,150";
// The portrait's asymmetric, crescent-shaped ornament curls above one shoulder.
const SUIT_MANTLE = [
  "146,124 150,90 159,61 174,37 194,23 215,19 236,20 216,28 196,39 185,55 181,77 187,93 204,105 212,124 210,148 200,169 203,145 201,127 189,114 171,108 159,129",
  "159,61 171,56 183,50 196,39 174,44",
  "150,90 165,84 181,77 174,91 157,105",
  "171,108 182,99 194,102 204,112 186,109",
  "200,169 214,139 220,116 213,146",
];
const SUIT_HOUSING = [circleOutline(120, 154, 22), circleOutline(120, 154, 13)];
const SUIT_SPIRAL = Array.from({ length: 6 }, (_, index) =>
  rotateOutline("120,132 136,135 144,148 130,142 119,140 110,144", (index * Math.PI) / 3, 120, 154),
);
const SUIT_BELT = [circleOutline(120, 230, 12), circleOutline(120, 230, 8)];
const SUIT_CHEST = [
  ...SUIT_MANTLE,
  SUIT_PEC,
  mirror(SUIT_PEC),
  ...SUIT_SPIRAL,
  "90,143 99,164 112,178 108,165 99,155",
  mirror("90,143 99,164 112,178 108,165 99,155"),
  "108,177 120,194 132,177 131,207 120,223 109,207",
  "102,211 120,220 138,211 143,237 130,249 120,241 110,249 97,237",
  "102,242 114,251 120,273 126,251 138,242 130,272 120,296 110,272",
  "96,219 107,220 106,235 94,237",
  mirror("96,219 107,220 106,235 94,237"),
];
const SUIT_SHELL = "120,47 135,54 142,67 141,84 132,100 120,112 108,100 99,84 98,67 105,54";
const SUIT_CREST = "116,76 105,65 96,45 90,22 91,2 98,33 107,52 120,66";
const SUIT_SPIKE = "120,30 125,54 120,73 115,54";
const SUIT_HEAD = [SUIT_SHELL, SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE];
// All three supplied portraits retain the long crown and V visor. MAX
// adds faceted temple fins; ULTRA carries the pointed forehead jewel.
const SUIT_FIN = "103,83 94,67 91,49 101,63 111,76";
const SUIT_BLADE = "105,96 93,82 88,61 102,77 114,89";
const SUIT_CRESTS = {
  standard: [SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE],
  max: [SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE, SUIT_FIN, mirror(SUIT_FIN)],
  ultra: [
    SUIT_CREST,
    mirror(SUIT_CREST),
    SUIT_BLADE,
    mirror(SUIT_BLADE),
    "120,42 126,58 120,73 114,58",
  ],
} as const;
const SUIT_FACE = "120,77 107,67 99,66 102,86 110,102 120,112";
const SUIT_EYE = "120,82 105,70 101,68 104,80 116,91 120,106 120,94 118,87";
const SUIT_SILHOUETTE =
  "M120 113 108 106 87 110 61 108 38 120 56 153 50 179 44 198 46 252 46 287 58 302 74 291 81 265 76 202 87 162 102 196 93 239 82 274 80 338 73 395 80 439 68 460 68 476 97 476 106 458 103 430 103 359 119 283 120 262";
const mirrorPath = (path: string) =>
  path.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, x, y) => `${SUIT_W - Number(x)} ${y}`);

const SUIT_PLATES = [
  { name: "is-legs is-left", shapes: SUIT_LEG, accent: SUIT_LEG_TRIM, index: 0 },
  {
    name: "is-legs is-right",
    shapes: SUIT_LEG.map(mirror),
    accent: SUIT_LEG_TRIM.map(mirror),
    index: 0,
  },
  { name: "is-arms is-left", shapes: SUIT_ARM, accent: SUIT_ARM_TRIM, index: 1 },
  {
    name: "is-arms is-right",
    shapes: SUIT_ARM.map(mirror),
    accent: SUIT_ARM_TRIM.map(mirror),
    index: 1,
  },
  {
    name: "is-chest",
    shapes: SUIT_CHEST,
    accent: [...SUIT_HOUSING, ...SUIT_SPIRAL, ...SUIT_BELT],
    index: 2,
  },
  {
    name: "is-head",
    shapes: SUIT_HEAD,
    accent: [SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE],
    index: 3,
  },
] as const;

// Resonance runs outward from the core: chest, then arms and helmet, then legs.
const SUIT_ZONES = [
  [...SUIT_CHEST, ...SUIT_HOUSING, ...SUIT_BELT],
  [...SUIT_ARM, ...SUIT_ARM.map(mirror), ...SUIT_HEAD],
  [...SUIT_LEG, ...SUIT_LEG.map(mirror)],
];
const SUIT_PHASES = ["ice", "violet", "gold"] as const;
const SUIT_CORE = [120, 154] as const;

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
// Closed outlines as one path: "M" starts each outline, its other points are
// implicit line-tos, "Z" closes it.
const outline = (shapes: readonly string[]) => shapes.map((points) => `M${points}Z`).join("");

// suitup2: the fitting. The owner's plate groups above stay exactly as drawn;
// for the assembly each group is carried by a few pieces cut along its own
// outlines (the same point lists, nothing redrawn): two leg sections, the
// arm and its four shoulder blades, the chest, the spiral housing that
// closes like an iris, the mantle crescent, and the helmet's shell, crest
// halves and spike. Tones: ice on the left, violet on the right, white at
// the centre; gold is never a plate colour, it lights the trims last.
type SuitTone = "ice" | "violet" | "white";
type SuitPiece = {
  name: string;
  shapes: readonly string[];
  tone: SuitTone;
  // The SA-GA！DEUS！ line it locks on, and its place in that line's run.
  line: number;
  order: number;
  pivot?: readonly [number, number];
  fold?: string;
};
const mirrorPivot = ([x, y]: readonly [number, number]) => [SUIT_W - x, y] as const;
const SUIT_SHOULDER_PIVOT = [83, 125] as const;
// The shoulder blades open as a fan: each starts folded onto the lowest
// one and the lowest opens first (blade 0 is the top blade).
const SUIT_BLADE_FOLD = [-89, -54, -20, -6];
const SUIT_CHEST_BODY = [
  ...SUIT_CHEST.filter((shape) => !SUIT_MANTLE.includes(shape) && !SUIT_SPIRAL.includes(shape)),
  ...SUIT_BELT,
];
const SUIT_CREST_PIVOT = [117, 72] as const;
const sided = (
  name: string,
  shapes: readonly string[],
  piece: Omit<SuitPiece, "name" | "shapes" | "tone">,
): SuitPiece[] => [
  { ...piece, name: `${name} is-left`, shapes, tone: "ice" },
  {
    ...piece,
    name: `${name} is-right`,
    shapes: shapes.map(mirror),
    tone: "violet",
    pivot: piece.pivot ? mirrorPivot(piece.pivot) : undefined,
    fold: piece.fold ? `${-Number.parseFloat(piece.fold)}deg` : undefined,
  },
];
// Back to front: the mantle curls behind the shoulder, the blades behind
// the arms, the chest in front of both.
const SUIT_PIECES: readonly SuitPiece[] = [
  {
    name: "is-mantle is-key",
    shapes: SUIT_MANTLE,
    tone: "violet",
    line: 3,
    order: 0,
    pivot: [152, 126],
  },
  ...sided("is-legs is-upper is-key", SUIT_LEG.slice(0, 5), { line: 0, order: 0 }),
  ...sided("is-legs is-lower", SUIT_LEG.slice(5), { line: 0, order: 1 }),
  ...[3, 2, 1, 0].flatMap((blade, index) =>
    sided("is-arms is-blade", [SUIT_ARM[blade]], {
      line: 1,
      order: index + 1,
      pivot: SUIT_SHOULDER_PIVOT,
      fold: `${SUIT_BLADE_FOLD[blade]}deg`,
    }),
  ),
  ...sided("is-arms is-limb is-key", SUIT_ARM.slice(4), { line: 1, order: 0 }),
  { name: "is-chest is-key", shapes: SUIT_CHEST_BODY, tone: "white", line: 2, order: 0 },
  {
    name: "is-iris",
    shapes: [...SUIT_HOUSING, ...SUIT_SPIRAL],
    tone: "white",
    line: 2,
    order: 3,
    pivot: SUIT_CORE,
  },
];
// The helmet waits above, open, through REXONANCE！ and shuts last.
const SUIT_HELM: readonly SuitPiece[] = [
  { name: "is-shell", shapes: [SUIT_SHELL], tone: "white", line: 4, order: 0 },
  {
    name: "is-crest is-left",
    shapes: [SUIT_CREST],
    tone: "white",
    line: 4,
    order: 0,
    pivot: SUIT_CREST_PIVOT,
    fold: "-22deg",
  },
  {
    name: "is-crest is-right",
    shapes: [mirror(SUIT_CREST)],
    tone: "white",
    line: 4,
    order: 0,
    pivot: mirrorPivot(SUIT_CREST_PIVOT),
    fold: "22deg",
  },
  { name: "is-spike", shapes: [SUIT_SPIKE], tone: "white", line: 4, order: 0 },
];
// Gold reaches the trims from the core outward: chest, arms, legs, and the
// helmet's crest last (zones in the order of SUIT_PLATES' index 2, 1, 0, 3).
const SUIT_TRIM_ZONE = [2, 1, 0, 3];
// Alignment brackets bite on the joints as the frame locks on RIDER！:
// the core, the shoulders, the elbows, the knees.
const SUIT_JOINTS = [
  SUIT_CORE,
  [83, 125],
  [157, 125],
  [60, 196],
  [180, 196],
  [90, 338],
  [150, 338],
] as const;
// Plate light: a lit top edge over a darker body (fill), and a rim that is
// brightest where the light strikes (stroke). Colour stops per tone.
const SUIT_LIGHT: Record<SuitTone, { fill: string[]; rim: string[] }> = {
  ice: {
    fill: ["#79e8ff", "0.24", "#1c5872", "0.34", "#06111d", "0.86"],
    rim: ["#effdff", "1", "#79e8ff", "0.92", "#3c9fbd", "0.5"],
  },
  violet: {
    fill: ["#b6a3ff", "0.22", "#3a2f78", "0.34", "#0a0a1f", "0.86"],
    rim: ["#f5f1ff", "1", "#b6a3ff", "0.92", "#6c5bbd", "0.5"],
  },
  white: {
    fill: ["#e2f2ff", "0.2", "#2b4a63", "0.32", "#060c17", "0.88"],
    rim: ["#ffffff", "1", "#d6ecf8", "0.9", "#7d9cb2", "0.5"],
  },
};

const stops = (values: string[]) =>
  [0, 0.45, 1].map((offset, index) => (
    <stop
      key={offset}
      offset={offset}
      stopColor={values[index * 2]}
      stopOpacity={values[index * 2 + 1]}
    />
  ));

function SuitLight() {
  return (
    <svg className="rx-suit-defs" width="0" height="0" focusable="false">
      <defs>
        {(Object.keys(SUIT_LIGHT) as SuitTone[]).map((tone) => (
          <g key={tone}>
            <linearGradient id={`rx-suit-fill-${tone}`} x1="0" y1="0" x2="0.3" y2="1">
              {stops(SUIT_LIGHT[tone].fill)}
            </linearGradient>
            <linearGradient id={`rx-suit-rim-${tone}`} x1="0" y1="0" x2="0.2" y2="1">
              {stops(SUIT_LIGHT[tone].rim)}
            </linearGradient>
          </g>
        ))}
      </defs>
    </svg>
  );
}

function SuitShape({
  className,
  shapes,
  accent,
  pivot,
  bare,
  glint,
  style,
}: {
  className: string;
  shapes: readonly string[];
  // The SVG is the box itself (nothing to bite or to shut inside it).
  bare?: boolean;
  // A second, bright copy of the outline for the lock's rim glint.
  glint?: boolean;
  // Outlines drawn in the accent stroke (the gold core housing).
  accent?: readonly string[];
  // A drawing point to scale or turn from (the core, a shoulder, a root).
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
      {glint ? (
        <svg className="rx-suit-glint" viewBox={view} preserveAspectRatio="none">
          <path d={outline(shapes)} />
        </svg>
      ) : null}
    </i>
  );
}

const pieceStyle = (piece: SuitPiece) =>
  ({
    "--rx-suit-i": piece.line,
    "--rx-suit-j": piece.order,
    ...(piece.fold ? { "--rx-suit-r": piece.fold } : null),
  }) as CSSProperties;

// The stage card's accent: the helmet, its crest plate swapped for the form.
function SuitBadge() {
  const view = "60 0 120 116";
  return (
    <div className="rx-suit-badge">
      <svg className="rx-suit-badge-helmet" viewBox={view}>
        <path d={outline([SUIT_SHELL, SUIT_FACE, mirror(SUIT_FACE)])} />
      </svg>
      {/* The form's crest plate swaps in and seats with a rim glint. */}
      {(["standard", "max", "ultra"] as const).map((form) => (
        <div key={form} className={`rx-suit-crest is-${form}`}>
          <svg viewBox={view}>
            <path d={outline(SUIT_CRESTS[form])} />
          </svg>
          <svg className="rx-suit-crest-glint" viewBox={view}>
            <path d={outline(SUIT_CRESTS[form])} />
          </svg>
        </div>
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
      <SuitLight />
      {/* Interior HUD: the visor's curved edges and a heading strip. */}
      <i className="rx-suit-rim is-left" />
      <i className="rx-suit-rim is-right" />
      <i className="rx-suit-heading" />
      <div className="rx-suit-figure">
        {/* FAR UP！ scans the undersuit top to bottom: a frame that slides
            down over a drawing that holds still (two transforms). */}
        <i className="rx-suit-scan">
          <svg className="rx-suit-blueprint" viewBox="0 0 240 480" preserveAspectRatio="none">
            <path
              className="rx-suit-guides"
              d="M120 0V480M0 78H240M0 125H240M0 154H240M0 230H240M0 341H240M0 474H240"
            />
            <path d={`${SUIT_SILHOUETTE}${mirrorPath(SUIT_SILHOUETTE)}`} />
          </svg>
        </i>
        {SUIT_JOINTS.map(([x, y], index) => (
          <i
            key={`${x}-${y}`}
            className="rx-suit-joint"
            style={
              {
                left: percent(x, SUIT_W),
                top: percent(y, SUIT_H),
                "--rx-suit-j": index,
              } as CSSProperties
            }
          />
        ))}
        {SUIT_PIECES.map((piece) => (
          <SuitShape
            key={`${piece.name}-${piece.order}`}
            className={`rx-suit-plate ${piece.name} is-${piece.tone}`}
            shapes={piece.shapes}
            pivot={piece.pivot}
            // The rim glint marks each group's key plate and the iris.
            glint={/is-key|is-iris/.test(piece.name)}
            style={pieceStyle(piece)}
          />
        ))}
        {SUIT_HELM.map((piece) => (
          <SuitShape
            key={piece.name}
            className={`rx-suit-helm ${piece.name} is-${piece.tone}`}
            shapes={piece.shapes}
            pivot={piece.pivot}
            glint
            style={pieceStyle(piece)}
          />
        ))}
        <SuitShape className="rx-suit-face is-left" shapes={[SUIT_FACE]} />
        <SuitShape className="rx-suit-face is-right" shapes={[mirror(SUIT_FACE)]} />
        {SUIT_PLATES.map((plate) => (
          <SuitShape
            key={plate.name}
            className={`rx-suit-trim ${plate.name}`}
            shapes={plate.accent}
            bare
            style={{ "--rx-suit-z": SUIT_TRIM_ZONE[plate.index] } as CSSProperties}
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
        <i className="rx-suit-jewel" />
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
