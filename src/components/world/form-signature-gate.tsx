import {
  useEffect,
  useMemo,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { FormTheme, GateScene } from "./form-signature-state";

/* The record covers (form-signature-state.ts holds their timing and the
   lifecycle lives in FormPickup). Everything drawn here is decorative and
   silent; the one spoken line is the polite status. No text is drawn
   except the Rexonance wordmark. */

type GateProps = {
  theme: FormTheme;
  scene: GateScene;
  life: string;
  status: string;
  onLifeEnd: () => void;
};

const vars = (values: Record<string, string | number>) => values as CSSProperties;
const px = (value: number) => `${Math.round(value * 10) / 10}px`;

/* A repeatable fracture for a given press: the same point breaks the same way. */
function prng(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

type Point = { x: number; y: number };
type Crack = {
  x: number;
  y: number;
  length: number;
  angle: number;
  delay: number;
  duration: number;
  weight: "is-main" | "is-ring" | "is-far";
};
type Shard = {
  left: number;
  top: number;
  width: number;
  height: number;
  points: string;
  hot: string | null;
  origin: string;
  bx: number;
  by: number;
  fall: number;
  spin: number;
  ax: number;
  ay: number;
  delay: number;
  duration: number;
  tone: number;
};
type Debris = {
  size: number;
  dx: number;
  dy: number;
  lift: number;
  fall: number;
  spin: number;
  delay: number;
  duration: number;
  hot: boolean;
};

/* The Explom cover's clock (ms from its start): the crack front reaches
   the far corner at FRONT, the surface bursts at BURST, every shard has
   fallen out of the frame by DOWN, and the record takes over at its
   life's end (1080 ms), while the last of them are still leaving. */
const FRONT = 320;
const BURST = 330;
const DOWN = 1075;

/** A spider-web fracture round the impact: kinked rays out past the
 * farthest corner, rings closer together near the impact. Rays and rings
 * are the cracks; the cells between them are the shards. */
function explomFracture(scene: GateScene) {
  const { w, h, x, y } = scene;
  const random = prng(scene.seed);
  const far = Math.max(1, Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
  const reach = far * 1.16 + 48;
  const compact = Math.min(w, h) < 600;
  const rays = compact ? 10 : 11;
  const rings = compact ? [0.07, 0.17, 0.34, 0.6, 1] : [0.065, 0.16, 0.32, 0.57, 1];
  // A phone's frame is small: the blast throws its pieces less far.
  const throwScale = compact ? 0.6 : 1;
  const step = (Math.PI * 2) / rays;
  const base = random() * step;
  const angles = Array.from(
    { length: rays },
    (_, index) => base + index * step + (random() - 0.5) * step * 0.5,
  );
  const grid: (Point & { r: number })[][] = angles.map((angle) => {
    const column = [{ x, y, r: 0 }];
    rings.forEach((fraction, ring) => {
      const r = reach * fraction * (ring === rings.length - 1 ? 1 : 0.86 + random() * 0.28);
      const bend = angle + (random() - 0.5) * 0.14 * (ring + 1);
      column.push({ x: x + r * Math.cos(bend), y: y + r * Math.sin(bend), r });
    });
    return column;
  });
  // The front runs fast off the impact and slows as it spreads.
  const at = (r: number) => 40 + (FRONT - 40) * Math.min(1, r / far) ** 0.8;
  const cracks: Crack[] = [];
  const segment = (
    a: Point & { r: number },
    b: Point & { r: number },
    start: number,
    duration: number,
    weight: Crack["weight"],
  ) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 2) return;
    cracks.push({
      x: a.x,
      y: a.y,
      length: length + 1,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      delay: start,
      duration: Math.max(30, duration),
      weight,
    });
  };
  for (let ray = 0; ray < rays; ray += 1) {
    for (let ring = 1; ring <= rings.length; ring += 1) {
      const a = grid[ray][ring - 1];
      const b = grid[ray][ring];
      // Rays reach the screen's edge; past it nothing is drawn.
      if (a.r > far * 1.02) continue;
      const weight = ring <= 2 ? "is-main" : "is-far";
      // Far spans of a phone's fracture stay straight: fewer layers to draw
      // on the impact frame of a mid-range phone.
      if (compact && ring > 2) {
        segment(a, b, at(a.r), at(b.r) - at(a.r), weight);
        continue;
      }
      // A crack never runs straight: one kink per span.
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const kink = (random() - 0.5) * 0.16 * length;
      const t = 0.4 + random() * 0.2;
      const nx = -(b.y - a.y) / Math.max(1, length);
      const ny = (b.x - a.x) / Math.max(1, length);
      const mid = {
        x: a.x + (b.x - a.x) * t + nx * kink,
        y: a.y + (b.y - a.y) * t + ny * kink,
        r: a.r + (b.r - a.r) * t,
      };
      segment(a, mid, at(a.r), at(mid.r) - at(a.r), weight);
      segment(mid, b, at(mid.r), at(b.r) - at(mid.r), weight);
    }
    for (let ring = 1; ring < (compact ? 4 : rings.length); ring += 1) {
      const a = grid[ray][ring];
      const b = grid[(ray + 1) % rays][ring];
      if (Math.min(a.r, b.r) > far) continue;
      segment(a, b, Math.max(at(a.r), at(b.r)) + 10, 56, "is-ring");
    }
  }
  // The shards: triangles at the impact, then quads; the outer ring halves.
  const shards: Shard[] = [];
  const addShard = (polygon: Point[], ring: number, inner: [Point, Point] | null) => {
    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    const left = Math.floor(Math.min(...xs)) - 2;
    const top = Math.floor(Math.min(...ys)) - 2;
    const width = Math.ceil(Math.max(...xs)) + 2 - left;
    const height = Math.ceil(Math.max(...ys)) + 2 - top;
    // Wholly off the screen: never drawn.
    if (left > w || top > h || left + width < 0 || top + height < 0) return;
    const cx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const cy = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const dx = cx - x;
    const dy = cy - y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    // The blast throws the pieces nearest the impact hardest.
    const push =
      (120 + 420 * (1 - Math.min(1, distance / far))) * (0.8 + random() * 0.4) * throwScale;
    const local = (p: Point) =>
      `${Math.round((p.x - left) * 10) / 10},${Math.round((p.y - top) * 10) / 10}`;
    const delay = BURST + ring * 18 + random() * 26;
    const by = (dy / distance) * push;
    shards.push({
      left,
      top,
      width,
      height,
      points: polygon.map(local).join(" "),
      hot: inner ? inner.map(local).join(" ") : null,
      origin: `${px(cx - left)} ${px(cy - top)}`,
      bx: (dx / distance) * push,
      by,
      // Out of the frame by the end, whatever the blast did first.
      fall: Math.max(0, h - cy) + Math.max(0, -by) * 1.28 + height * 0.5 + 60 + random() * h * 0.25,
      spin: (random() < 0.5 ? -1 : 1) * (90 + random() * 230),
      ax: Math.round((random() * 2 - 1) * 100) / 100,
      ay: Math.round((random() * 2 - 1) * 100) / 100,
      delay,
      duration: DOWN - 60 + random() * 60 - delay,
      tone: random(),
    });
  };
  for (let ray = 0; ray < rays; ray += 1) {
    const next = (ray + 1) % rays;
    addShard([grid[ray][0], grid[ray][1], grid[next][1]], 0, null);
    for (let ring = 2; ring <= rings.length; ring += 1) {
      const a = grid[ray][ring - 1];
      const b = grid[ray][ring];
      const c = grid[next][ring];
      const d = grid[next][ring - 1];
      if (ring < rings.length) {
        addShard([a, b, c, d], ring - 1, ring <= 3 ? [a, d] : null);
        continue;
      }
      const t = 0.38 + random() * 0.24;
      const u = t + (random() - 0.5) * 0.16;
      const mid1 = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const mid2 = { x: d.x + (c.x - d.x) * u, y: d.y + (c.y - d.y) * u };
      addShard([a, mid1, mid2, d], ring - 1, null);
      addShard([mid1, b, c, mid2], ring, null);
    }
  }
  const debris: Debris[] = Array.from({ length: compact ? 16 : 30 }, () => {
    const angle = random() * Math.PI * 2;
    const speed = (compact ? 140 : 200) + random() * (compact ? 240 : 420);
    const delay = BURST + 10 + random() * 60;
    return {
      size: 4 + random() * 7,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed * 0.8,
      lift: 30 + random() * 80,
      fall: h * (0.45 + random() * 0.5),
      spin: (random() < 0.5 ? -1 : 1) * (180 + random() * 360),
      delay,
      duration: Math.min(600 + random() * 180, DOWN - delay),
      hot: random() < 0.18,
    };
  });
  // The blast itself: sparks thrown straight out of the impact.
  const streaks = Array.from({ length: compact ? 10 : 16 }, () => {
    const angle = random() * Math.PI * 2;
    const distance = (compact ? 240 : 380) + random() * (compact ? 240 : 420);
    return {
      angle: (angle * 180) / Math.PI,
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      length: 50 + random() * 130,
      delay: BURST - 8 + random() * 40,
      duration: 300 + random() * 160,
      hot: random() < 0.25,
    };
  });
  // Where the shards land: dust off the floor, gone by the hand-over.
  const puffs = compact ? 4 : 6;
  const dust = Array.from({ length: puffs }, (_, index) => ({
    left: ((index + 0.5) / puffs) * w + (random() - 0.5) * (w / puffs) * 0.6,
    delay: 600 + random() * 60,
  }));
  return { cracks, shards, debris, dust, streaks };
}

function ExplomGateArt({ scene }: { scene: GateScene }) {
  // Measured once per press: the status line's re-render keeps the same break.
  const { cracks, shards, debris, dust, streaks } = useMemo(() => explomFracture(scene), [scene]);
  return (
    <div className="explom-gate-field" aria-hidden="true">
      <svg className="explom-gate-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id="explom-shard-face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#17474e" stopOpacity="0.9" />
            <stop offset="0.42" stopColor="#0a2327" stopOpacity="0.86" />
            <stop offset="1" stopColor="#03090b" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="explom-shard-lit" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#3a8a8c" stopOpacity="0.9" />
            <stop offset="0.3" stopColor="#14444a" stopOpacity="0.88" />
            <stop offset="1" stopColor="#051316" stopOpacity="0.92" />
          </linearGradient>
        </defs>
      </svg>
      <i className="explom-gate-veil" />
      <i className="explom-gate-void" />
      <i className="explom-gate-core" />
      <div className="explom-gate-cracks">
        {cracks.map((crack, index) => (
          <i
            key={`c${index}`}
            className={crack.weight}
            style={vars({
              left: px(crack.x),
              top: px(crack.y),
              width: px(crack.length),
              rotate: `${crack.angle.toFixed(2)}deg`,
              animationDelay: `${Math.round(crack.delay)}ms`,
              animationDuration: `${Math.round(crack.duration)}ms`,
            })}
          />
        ))}
      </div>
      <i className="explom-gate-burst" />
      <i className="explom-gate-spark" />
      <div className="explom-gate-shards">
        {shards.map((shard, index) => (
          <svg
            key={`s${index}`}
            className={shard.tone < 0.3 ? "is-lit" : shard.tone > 0.82 ? "is-dim" : undefined}
            width={shard.width}
            height={shard.height}
            viewBox={`0 0 ${shard.width} ${shard.height}`}
            focusable="false"
            style={vars({
              left: px(shard.left),
              top: px(shard.top),
              transformOrigin: shard.origin,
              "--bx": px(shard.bx),
              "--by": px(shard.by),
              "--fall": px(shard.fall),
              "--spin": `${shard.spin.toFixed(1)}deg`,
              "--ax": shard.ax,
              "--ay": shard.ay,
              animationDelay: `${Math.round(shard.delay)}ms`,
              animationDuration: `${Math.round(shard.duration)}ms`,
            })}
          >
            <polygon points={shard.points} />
            {shard.hot ? <polyline points={shard.hot} /> : null}
          </svg>
        ))}
      </div>
      <div className="explom-gate-debris">
        {debris.map((piece, index) => (
          <i
            key={`d${index}`}
            className={piece.hot ? "is-hot" : undefined}
            style={vars({
              width: px(piece.size),
              height: px(piece.size),
              "--dx": px(piece.dx),
              "--dy": px(piece.dy),
              "--lift": px(piece.lift),
              "--fall": px(piece.fall),
              "--spin": `${Math.round(piece.spin)}deg`,
              animationDelay: `${Math.round(piece.delay)}ms`,
              animationDuration: `${Math.round(piece.duration)}ms`,
            })}
          />
        ))}
      </div>
      <div className="explom-gate-streaks">
        {streaks.map((streak, index) => (
          <i
            key={`k${index}`}
            className={streak.hot ? "is-hot" : undefined}
            style={vars({
              width: px(streak.length),
              rotate: `${streak.angle.toFixed(1)}deg`,
              "--tx": px(streak.tx),
              "--ty": px(streak.ty),
              animationDelay: `${Math.round(streak.delay)}ms`,
              animationDuration: `${Math.round(streak.duration)}ms`,
            })}
          />
        ))}
      </div>
      <div className="explom-gate-dust">
        {dust.map((puff, index) => (
          <i
            key={`u${index}`}
            style={vars({ left: px(puff.left), animationDelay: `${Math.round(puff.delay)}ms` })}
          />
        ))}
      </div>
    </div>
  );
}

/* 犭: the screen sinks into darkness from its edges; the beast's eyes in
   the card's own art open red; the light smears as it lunges and rakes
   three claw strokes (the radical's three); one roar ripple (猛, the
   sonar); one breath. Red rises and falls over 400 ms or more, and the
   saturated red stays in thin, dim edges: the light itself is salmon and
   white-hot. */
function KemonohenEyes() {
  return (
    <>
      <span className="kemonohen-eye is-left">
        <i className="is-bloom" />
        <i className="is-trail" />
        <i className="is-halo" />
        <i className="is-core" />
      </span>
      <span className="kemonohen-eye is-right">
        <i className="is-bloom" />
        <i className="is-trail" />
        <i className="is-halo" />
        <i className="is-core" />
      </span>
    </>
  );
}

function KemonohenClaws() {
  return (
    <div className="kemonohen-claws">
      {[0, 1, 2].map((index) => (
        <span key={index} className={`kemonohen-claw is-${index + 1}`}>
          <i className="is-blur" />
          <i className="is-stroke" />
        </span>
      ))}
    </div>
  );
}

function KemonohenGateArt() {
  return (
    <div className="kemonohen-gate-field" aria-hidden="true">
      <i className="kemonohen-gate-vignette" />
      <i className="kemonohen-gate-dark" />
      <i className="kemonohen-gate-smear" />
      <i className="kemonohen-gate-roar" />
      <KemonohenClaws />
      <div className="kemonohen-gate-eyes">
        <KemonohenEyes />
      </div>
    </div>
  );
}

function RexonanceGateArt() {
  return (
    <>
      <div className="rexonance-gate-field" aria-hidden="true">
        <i className="rexonance-gate-spiral is-cyan" />
        <i className="rexonance-gate-spiral is-pink" />
        <i className="rexonance-gate-orbit is-outer" />
        <i className="rexonance-gate-orbit is-inner" />
        <div className="rexonance-gate-stars">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="rexonance-gate-prism">
          <i className="is-one" />
          <i className="is-two" />
          <i className="is-three" />
        </div>
        <div className="rexonance-gate-horizon">
          <span className="is-cyan" />
          <span className="is-pink" />
        </div>
        <span className="rexonance-gate-rush is-left" />
        <span className="rexonance-gate-rush is-right" />
        <div className="rexonance-gate-sigil">
          <i />
          <b>R</b>
        </div>
      </div>
      {/* The wordmark alone: no status line under it (2026-10-23). */}
      <div className="rexonance-gate-copy" aria-hidden="true">
        <strong>REXONANCE</strong>
      </div>
    </>
  );
}

const ROOT: Record<FormTheme, string> = {
  rexonance: "rexonance-gate",
  explom: "form-gate explom-gate",
  kemonohen: "form-gate kemonohen-gate",
  // Custom has no cover (it is not in FORM_GATES); the entry keeps the map total.
  custom: "form-gate",
};

/** The cover itself (portalled to the body by FormPickup). Its own life
 * animation ending hands the reader to the record. */
export function FormGate({ theme, scene, life, status, onLifeEnd }: GateProps) {
  // The status region is in place before its words, so they are announced.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnnounce(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  let art: ReactNode = null;
  if (theme === "rexonance") art = <RexonanceGateArt />;
  else if (theme === "explom") art = <ExplomGateArt scene={scene} />;
  else if (theme === "kemonohen") art = <KemonohenGateArt />;
  // 犭's eyes open where the card's art has them (or at the frame's centre).
  const [lx, ly, rx, ry] = scene.eyes ?? [scene.x - 16, scene.y, scene.x + 16, scene.y];
  return (
    <div
      className={ROOT[theme]}
      data-form-theme={theme}
      style={vars({
        "--x": px(scene.x),
        "--y": px(scene.y),
        "--lx": px(lx),
        "--ly": px(ly),
        "--rx": px(rx),
        "--ry": px(ry),
        "--gap": px(Math.max(18, Math.hypot(rx - lx, ry - ly))),
      })}
      onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
        if (event.currentTarget !== event.target || event.animationName !== life) return;
        onLifeEnd();
      }}
    >
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce ? status : ""}
      </p>
      {art}
    </div>
  );
}

/** The record's side of the hand-over, inside the dialog: the frame the
 * cover's light comes to rest in, and the cover's last frame clearing. */
export function FormArrival({ theme }: { theme?: FormTheme }) {
  if (theme === "explom")
    return (
      <>
        <div className="form-seam explom-frame" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <div className="form-arrival explom-arrival" aria-hidden="true">
          <i className="explom-arrival-void" />
        </div>
      </>
    );
  if (theme === "kemonohen")
    return (
      <div className="form-arrival kemonohen-arrival" aria-hidden="true">
        <i className="kemonohen-arrival-dark" />
        <KemonohenClaws />
        <div className="kemonohen-arrival-eyes">
          <KemonohenEyes />
        </div>
      </div>
    );
  return null;
}
