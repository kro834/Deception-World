import type { CSSProperties } from "react";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CALLS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_STAGE_DURATION_MS,
  REXONANCE_STAGE_LABELS,
  REXONANCE_SUIT_FORM_MS,
  REXONANCE_SUIT_HELM_FORM,
  REXONANCE_SUIT_PARTS,
  REXONANCE_SUIT_PIXELS,
  REXONANCE_SUIT_RIBBONS,
  REXONANCE_SUIT_SNAP,
  REXONANCE_SUIT_SYSTEMS,
  REXONANCE_SUIT_TAIL,
  type RexonanceStage,
} from "@/lib/rexonance-calls";
import {
  REXONANCE_SUIT_BODY,
  REXONANCE_SUIT_FACE,
  REXONANCE_SUIT_FACE_GLOW,
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_UNDERSUIT,
  type RexonanceSuitPiece,
} from "@/lib/rexonance-suit";

type RexonanceCallSequenceProps = {
  mode: "entry" | "stage";
  phase: "covering" | "revealing";
  tier: "full" | "calm" | "reduced";
  stage?: RexonanceStage;
  // rx12: "build" when the suit's pieces are decoded (the gate's warm-up);
  // otherwise the call stands the finished figure whole.
  suit?: "build" | "whole";
};

function CallLines({ index }: { index: number }) {
  if (index === 2) {
    return (
      <>
        {/* Each line is a call and its answer: SA-GA！, then DEUS！ answers. */}
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
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

// The stage card's badge: the helmet of the approved artwork drawn in a
// 240 x 480 space (suitup5, 2026-10-05) — a tall crown of splayed, upswept
// horns over a sharp V visor, the crest plate swapped per form. Outlines
// are point lists; curve() rounds them where the artwork curves.
const SUIT_W = 240;
type Point = readonly [number, number];
const fmt = ([x, y]: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;
const mirror = (points: string) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",");
      return `${(SUIT_W - Number(x)).toFixed(1)},${y}`;
    })
    .join(" ");
const catmull = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const at = (k: 0 | 1) =>
    0.5 *
    (2 * p1[k] +
      (-p0[k] + p2[k]) * t +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
  return [at(0), at(1)];
};
// A closed outline through key points, rounded between them; a point
// written "x,y*" stays a sharp corner (tips, chins, plate edges).
const curve = (spec: string, steps = 2) => {
  const nodes = spec.split(" ").map((token) => ({
    p: token.replace("*", "").split(",").map(Number) as unknown as Point,
    sharp: token.endsWith("*"),
  }));
  const n = nodes.length;
  const out: Point[] = [];
  nodes.forEach((a, i) => {
    const b = nodes[(i + 1) % n];
    const p0 = a.sharp ? a.p : nodes[(i - 1 + n) % n].p;
    const p3 = b.sharp ? b.p : nodes[(i + 2) % n].p;
    for (let step = 0; step < steps; step += 1) out.push(catmull(p0, a.p, b.p, p3, step / steps));
  });
  return out.map(fmt).join(" ");
};

// Helmet: a tall crown of splayed, upswept horns over a sharp V visor.
const SUIT_SHELL = curve(
  "120,37 131,40 138,47 141,58 139,70 133,80 120,91* 107,80 101,70 99,58 102,47 109,40",
);
const SUIT_CREST = curve("103,12* 100,25 100,37 103,49 109,59 115,67* 112,55 108,42 105,27");
const SUIT_HORN = curve("92,36* 95,49 101,59 106,66* 102,57 97,47");
const SUIT_SPIKE = curve("120,31* 123,44 122,58 120,67* 118,58 117,44");
// MAX adds faceted temple fins; ULTRA carries cheek blades and a forehead jewel.
const SUIT_FIN = curve("90,52* 95,62 103,70* 98,63");
const SUIT_BLADE = curve("92,64* 98,72 106,79* 100,70");
const SUIT_CRESTS = {
  standard: [SUIT_CREST, mirror(SUIT_CREST), SUIT_HORN, mirror(SUIT_HORN), SUIT_SPIKE],
  max: [
    SUIT_CREST,
    mirror(SUIT_CREST),
    SUIT_SPIKE,
    SUIT_FIN,
    mirror(SUIT_FIN),
    SUIT_HORN,
    mirror(SUIT_HORN),
  ],
  ultra: [
    SUIT_CREST,
    mirror(SUIT_CREST),
    SUIT_BLADE,
    mirror(SUIT_BLADE),
    "120,40 124,49 120,58 116,49",
  ],
} as const;
const SUIT_FACE = curve("120,61 112,59 103,59* 105,68 110,77 116,85 120,91*");
const SUIT_EYE = "103,61 109,63 116,72 120,79 120,86 115,79 108,70";

// Closed outlines as one path: "M" starts each outline, its other points are
// implicit line-tos, "Z" closes it.
const outline = (shapes: readonly string[]) => shapes.map((points) => `M${points}Z`).join("");

// The badge's light (rx4): opaque black armour lit from the top left, the
// crown in gold. Stops are [offset, colour, opacity].
type SuitStop = readonly [number, string, string];
type SuitGradient = { fill: readonly SuitStop[]; rim: readonly SuitStop[] };
const SUIT_LIGHT: Record<string, SuitGradient> = {
  white: {
    fill: [
      [0, "#ffffff", "0.96"],
      [0.07, "#dcedff", "0.55"],
      [0.2, "#22364a", "0.98"],
      [0.6, "#0c1520", "1"],
      [1, "#03060c", "1"],
    ],
    rim: [
      [0, "#ffffff", "1"],
      [0.3, "#e8f4fc", "0.95"],
      [1, "#6c8ca3", "0.65"],
    ],
  },
  gold: {
    fill: [
      [0, "#fff7dc", "0.98"],
      [0.1, "#f2d896", "0.85"],
      [0.32, "#8e6c2e", "1"],
      [0.7, "#3b2a10", "1"],
      [1, "#160f05", "1"],
    ],
    rim: [
      [0, "#fff9e6", "1"],
      [0.35, "#f0d49a", "0.95"],
      [1, "#8a6a30", "0.75"],
    ],
  },
};
const SUIT_AXES = { fill: ["0", "0", "0.3", "1"], rim: ["0", "0", "0.2", "1"] } as const;

function SuitLight() {
  return (
    <svg className="rx-suit-defs" width="0" height="0" focusable="false">
      <defs>
        {Object.entries(SUIT_LIGHT).map(([tone, light]) => (
          <g key={tone}>
            {(["fill", "rim"] as const).map((kind) => {
              const [x1, y1, x2, y2] = SUIT_AXES[kind];
              return (
                <linearGradient
                  key={kind}
                  id={`rx-suit-${kind}-${tone}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                >
                  {light[kind].map(([offset, color, opacity]) => (
                    <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
                  ))}
                </linearGradient>
              );
            })}
          </g>
        ))}
      </defs>
    </svg>
  );
}

// The stage card's accent: the helmet, its crest plate swapped for the form.
function SuitBadge() {
  const view = "73 4 94 91";
  return (
    <div className="rx-suit-badge">
      <SuitLight />
      <i className="rx-suit-badge-halo" />
      <svg className="rx-suit-badge-helmet" viewBox={view}>
        <path className="rx-suit-bevel" d={outline([SUIT_SHELL])} />
        <path d={outline([SUIT_SHELL])} />
        <path className="rx-suit-sheen" d={outline([SUIT_SHELL])} />
        <path className="rx-suit-badge-visor" d={outline([SUIT_FACE, mirror(SUIT_FACE)])} />
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

// rx12 (2026-10-10, owner): the suit-up is the approved full-body artwork
// itself, cut into raster pieces by scripts/build-rexonance-suit.mjs
// (src/lib/rexonance-suit.ts holds their files and places, in delivery
// pixels of the figure). The bare undersuit is scanned in; each armour
// piece forms out of nanites — motes converge into a coarse square mosaic
// that resolves into the plate — floating a little off the body with a
// faint cyan rim, then snaps onto its seat on its DEUS！ with a hard stop,
// a hair past it and a spark at the seam, and the whole figure jolts. The
// tail grows out section by section, the ribbons stream down, the helmet
// forms above the head and clamps down, and the face's lights fill with
// pixel squares that scatter. Every layer is a small box that moves by
// transform and opacity on the call clock (styles-rexonance-calls.css).
const FIG = REXONANCE_SUIT_SIZE;
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

// Within a group the pieces bite a beat apart, so each DEUS！ lands as a
// rattle of clanks (ガチャガチャ) rather than one: ms after the group's snap.
const SUIT_RATTLE: Record<string, number> = {
  "boot-r": 22,
  "knee-l": 12,
  "knee-r": 34,
  "gauntlet-r": 24,
  chest: 18,
  "shoulder-r": 26,
  core: 40,
  "thigh-r": 20,
  belt: 30,
  tasset: 42,
};
// When a piece forms, snaps and how long its forming takes (ms).
const suitClock = (piece: RexonanceSuitPiece) => {
  if (piece.group === "tail") {
    const section = Number(piece.id.slice(5));
    const t = REXONANCE_SUIT_TAIL.start + section * REXONANCE_SUIT_TAIL.step;
    return { t, s: t + REXONANCE_SUIT_TAIL.grow, f: REXONANCE_SUIT_TAIL.grow };
  }
  if (piece.group === "ribbon") {
    const t = REXONANCE_SUIT_RIBBONS.start + (piece.id.endsWith("-r") ? 40 : 0);
    return { t, s: t + REXONANCE_SUIT_RIBBONS.stream, f: REXONANCE_SUIT_RIBBONS.stream };
  }
  const s = REXONANCE_SUIT_SNAP[piece.group] + (SUIT_RATTLE[piece.id] ?? 0);
  const t = piece.group === "helm" ? REXONANCE_SUIT_HELM_FORM : s - REXONANCE_SUIT_FORM_MS;
  return { t, s, f: REXONANCE_SUIT_FORM_MS };
};
// Back to front: ribbons and the tail behind, the legs, the waist, the
// arms, the chest and shoulders, the helmet in front.
const SUIT_ORDER = ["ribbon", "tail", "legs", "waist", "arms", "chest", "helm"] as const;
const SUIT_STACK = SUIT_ORDER.flatMap((group) =>
  REXONANCE_SUIT_PIECES.filter((piece) => piece.group === group).reverse(),
);
const pieceStyle = (piece: RexonanceSuitPiece) => {
  const { t, s, f } = suitClock(piece);
  const [dx, dy, turn, scale] = piece.float ?? [0, 0, 0, 1];
  return {
    ...place(piece.x, piece.y, piece.w, piece.h),
    // Grows (the tail's sections, the ribbons) and snaps turn about the seam.
    transformOrigin: `${pct(piece.seat[0] - piece.x, piece.w)} ${pct(piece.seat[1] - piece.y, piece.h)}`,
    "--rx-suit-src": `url("${piece.src}")`,
    "--rx-suit-t": `${t}ms`,
    "--rx-suit-s": `${s}ms`,
    "--rx-suit-f": `${f}ms`,
    "--rx-suit-dx": dx,
    "--rx-suit-dy": dy,
    "--rx-suit-r": `${turn}deg`,
    "--rx-suit-k": scale,
  } as CSSProperties;
};

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
// RIDER！'s nanite motes: squares hanging in the air round the body,
// thickest near it (figure pixels).
const suitMotes = (): Squares => {
  const random = seeded(1410);
  const out: Squares = { cyan: "", pink: "", white: "" };
  for (let n = 0; n < 220; n += 1) {
    const angle = random() * Math.PI * 2;
    const reach = 0.28 + 0.72 * Math.sqrt(random());
    const x = FIG.width / 2 + Math.cos(angle) * reach * FIG.width * 0.62;
    const y = FIG.height * 0.47 + Math.sin(angle) * reach * FIG.height * 0.52;
    const size = [3, 4, 5, 7][n % 4];
    const tone = n % 9 === 0 ? "white" : x < FIG.width / 2 ? "cyan" : "pink";
    out[tone] += square(x, y, size);
  }
  return out;
};
// REXONANCE DEUS！'s pixel squares: a mass filling the face's lights, in
// groups that land in turn and burst outward in turn.
const suitPixels = (): Squares[] => {
  const random = seeded(2010);
  const glow = REXONANCE_SUIT_FACE_GLOW;
  const xs = glow.map(([x]) => x);
  const ys = glow.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const groups: Squares[] = Array.from({ length: REXONANCE_SUIT_PIXELS.groups }, () => ({
    cyan: "",
    pink: "",
    white: "",
  }));
  for (let found = 0, tries = 0; found < 156 && tries < 4000; tries += 1) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (!inside(glow, x, y)) continue;
    const size = [4, 5, 6, 8][found % 4];
    // Ice along the outer wings, pink down the centre, a few burn white.
    const centre = Math.abs(x - REXONANCE_SUIT_MARKS.visor[0]) < 14 + (y - y0) * 0.12;
    const tone = found % 7 === 0 ? "white" : centre ? "pink" : "cyan";
    groups[found % groups.length][tone] += square(x - size / 2, y - size / 2, size);
    found += 1;
  }
  return groups;
};
// Drawn once, on the first entry, then reused.
let SUIT_SQUARES: { motes: Squares; pixels: Squares[] } | undefined;
const suitSquares = () => (SUIT_SQUARES ??= { motes: suitMotes(), pixels: suitPixels() });
// The face's box, a little wider than its lights, that the squares burst from.
const FACE_BOX = (() => {
  const { x, y, w, h } = REXONANCE_SUIT_FACE;
  return { x: x - 8, y: y - 8, w: w + 16, h: h + 16 };
})();
// Each burst group flies its own way: a scale from the visor and a turn.
const SUIT_BURST = [
  [3.4, -14],
  [4.6, 10],
  [3, 22],
  [5.2, -6],
  [3.9, -24],
  [4.8, 16],
] as const;

function SquarePaths({ squares }: { squares: Squares }) {
  return (
    <>
      <path className="is-cyan" d={squares.cyan} />
      <path className="is-pink" d={squares.pink} />
      <path className="is-white" d={squares.white} />
    </>
  );
}

// Each label lands on the line its group snaps on (the helmet's on the
// last call).
const SUIT_PART_LINE = { LEGS: 0, ARMS: 1, CHEST: 2, HEAD: 3 } as const;
// The halos' places and widths (figure pixels): the core and the eyes.
const SUIT_HALOS = [
  { name: "core", at: REXONANCE_SUIT_MARKS.core, size: 150 },
  { name: "eyes", at: REXONANCE_SUIT_MARKS.visor, size: 170 },
] as const;
// The phases of the resonance rings from the core.
const SUIT_PHASES = ["ice", "violet", "gold"] as const;

function Suit({ suit }: { suit: "build" | "whole" }) {
  const { motes, pixels } = suitSquares();
  const visor = REXONANCE_SUIT_MARKS.visor;
  return (
    <div
      className="rx-suit"
      data-suit={suit}
      style={{ "--rx-suit-ar": (FIG.width / FIG.height).toFixed(4) } as CSSProperties}
    >
      {/* Interior HUD: the visor's curved edges and a heading strip. */}
      <i className="rx-suit-rim is-left" />
      <i className="rx-suit-rim is-right" />
      <i className="rx-suit-heading" />
      {/* The light rig behind the figure: a backlight in the two tones, a
          floor under the boots and a faint lattice; it wakes with the HUD. */}
      <i className="rx-suit-stage">
        <i className="rx-suit-floor" />
      </i>
      <div className="rx-suit-figure">
        {/* FAR UP！ scans the bare undersuit top to bottom: a frame that
            slides down over a picture that holds still (two transforms).
            The finished figure stands in it for the still tiers, or when
            the pieces were not ready in time. */}
        <i className="rx-suit-scan">
          <i
            className="rx-suit-under"
            style={{ backgroundImage: `url("${REXONANCE_SUIT_UNDERSUIT}")` }}
          />
          <i
            className="rx-suit-whole"
            style={{ backgroundImage: `url("${REXONANCE_SUIT_FIGURE}")` }}
          />
        </i>
        {REXONANCE_SUIT_MARKS.joints.map((joint, index) => (
          <i
            key={joint.join()}
            className="rx-suit-joint"
            style={{ ...at(joint), "--rx-suit-j": index } as CSSProperties}
          />
        ))}
        {/* RIDER！: nanite motes gather in the air round the body. */}
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
        <div className="rx-suit-build">
          {/* The bodysuit between the plates, as painted: it takes the
              undersuit's place once the helmet is on. */}
          <i
            className="rx-suit-body"
            style={{
              ...place(
                REXONANCE_SUIT_BODY.x,
                REXONANCE_SUIT_BODY.y,
                REXONANCE_SUIT_BODY.w,
                REXONANCE_SUIT_BODY.h,
              ),
              backgroundImage: `url("${REXONANCE_SUIT_BODY.src}")`,
            }}
          />
          {SUIT_STACK.map((piece) => (
            <i
              key={piece.id}
              className={`rx-suit-piece is-${piece.group}`}
              data-piece={piece.id}
              style={pieceStyle(piece)}
            >
              <i className="rx-suit-halo-rim" />
              <i className="rx-suit-mosaic" />
              <i className="rx-suit-art" />
            </i>
          ))}
          {/* The face's lights, lit: they come on under the pixel squares. */}
          <i
            className="rx-suit-face"
            style={{
              ...place(
                REXONANCE_SUIT_FACE.x,
                REXONANCE_SUIT_FACE.y,
                REXONANCE_SUIT_FACE.w,
                REXONANCE_SUIT_FACE.h,
              ),
              backgroundImage: `url("${REXONANCE_SUIT_FACE.src}")`,
            }}
          />
          {/* A spark at the seam of every piece as it bites. */}
          {SUIT_STACK.filter((piece) => piece.float).map((piece) => (
            <i
              key={piece.id}
              className="rx-suit-spark"
              style={
                { ...at(piece.seat), "--rx-suit-s": `${suitClock(piece).s}ms` } as CSSProperties
              }
            />
          ))}
        </div>
        {/* REXONANCE DEUS！: the face's lights fill with pixel squares,
            group by group, and each group bursts outward from the visor. */}
        {pixels.map((group, index) => {
          // Each group draws the face's squares at its burst's full size,
          // about the visor, and starts scaled down onto the face: the
          // squares stay crisp as they fly out (a compositor scale up would
          // blur them).
          const [burst, turn] = SUIT_BURST[index];
          const box = {
            x: visor[0] - (visor[0] - FACE_BOX.x) * burst,
            y: visor[1] - (visor[1] - FACE_BOX.y) * burst,
            w: FACE_BOX.w * burst,
            h: FACE_BOX.h * burst,
          };
          return (
            <svg
              key={SUIT_BURST[index].join()}
              className="rx-suit-pixels"
              viewBox={`${FACE_BOX.x} ${FACE_BOX.y} ${FACE_BOX.w} ${FACE_BOX.h}`}
              style={
                {
                  ...place(box.x, box.y, box.w, box.h),
                  transformOrigin: `${pct(visor[0] - box.x, box.w)} ${pct(visor[1] - box.y, box.h)}`,
                  "--rx-suit-i": index,
                  "--rx-suit-burst": burst,
                  "--rx-suit-r": `${turn}deg`,
                } as CSSProperties
              }
            >
              <SquarePaths squares={group} />
            </svg>
          );
        })}
        {SUIT_PHASES.map((phase, index) => (
          <i
            key={phase}
            className={`rx-suit-ring is-${phase}`}
            style={{ ...at(REXONANCE_SUIT_MARKS.core), "--rx-suit-k": index } as CSSProperties}
          />
        ))}
        <i className="rx-suit-lock" style={at(visor)} />
      </div>
      <div className="rx-suit-callouts">
        {REXONANCE_SUIT_PARTS.map((part) => (
          <p
            key={part}
            className={`rx-suit-callout is-${part.toLowerCase()}`}
            style={{ "--rx-suit-i": SUIT_PART_LINE[part] } as CSSProperties}
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
  suit = "whole",
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
      {entry ? <Suit suit={suit} /> : <SuitBadge />}
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
