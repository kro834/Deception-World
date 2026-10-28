import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";

type ParticleTone = "ice" | "gold" | "prism";

type Particle = {
  x: number;
  y: number;
  // The last drawn position: the streak between it and (x, y) is the motion blur.
  px: number;
  py: number;
  vx: number;
  vy: number;
  // The logo point this particle condenses onto, and its moment on the clock.
  tx: number;
  ty: number;
  delay: number;
  // Its own curl-noise offset, so no two particles share a path.
  nx: number;
  ny: number;
  r: number;
  a: number;
  phase: number;
  tone: ParticleTone;
  // Plain dust after the burst.
  dx: number;
  dy: number;
  sway: number;
};

// The condensation storyboard (seconds from the title's first playing frame;
// the same clock as the CSS depth push in styles-opening-cinema.css):
//   0.2-1.46  the dust is drawn in from the dark along a curl-noise field and
//             condenses onto the logo's silhouette while the DOM logo pushes
//             in from depth at low light (op-logo-arrive)
//   1.5       the lock: the DOM logo snaps to full light; the dust flashes,
//             a shockwave ring leaves the lockup, the points are thrown out
//   1.5-2.4   the burst slows into drifting dust, which stays
// Audit mode (?opening-audit) seeks the same deterministic simulation.
const ASSEMBLE = { start: 0.2, end: 1.46 } as const;
const LOCK = { at: 1.5, burstEnd: 2.4, waveEnd: 2.1 } as const;
const SAMPLE_WIDTH = 168;
const FLASH_WIDTH = 1024;
const STEP = 1 / 60;

const TONE_RGB: Record<ParticleTone, string> = {
  gold: "240, 215, 138",
  prism: "242, 132, 220",
  ice: "159, 212, 255",
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// A seeded generator: the same dust on every replay and on every audit frame.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A cheap divergence-free field: the curl of a sum of drifting sines. Each
// particle samples it at its own offset, so the flow reads as turbulence
// without a noise table.
function curlField(x: number, y: number, t: number, out: { x: number; y: number }) {
  const s1 = Math.sin(x * 1.7 + t * 0.9) * Math.cos(y * 1.3 - t * 0.7);
  const s2 = Math.sin(x * 3.1 - t * 1.3 + 1.7) * Math.cos(y * 2.6 + t * 1.1);
  // d/dy of the potential gives the x velocity, -d/dx the y velocity.
  const dpy =
    -1.3 * Math.sin(x * 1.7 + t * 0.9) * Math.sin(y * 1.3 - t * 0.7) -
    0.5 * 2.6 * Math.sin(x * 3.1 - t * 1.3 + 1.7) * Math.sin(y * 2.6 + t * 1.1);
  const dpx =
    1.7 * Math.cos(x * 1.7 + t * 0.9) * Math.cos(y * 1.3 - t * 0.7) +
    0.5 * 3.1 * Math.cos(x * 3.1 - t * 1.3 + 1.7) * Math.cos(y * 2.6 + t * 1.1);
  out.x = dpy + s2 * 0.1;
  out.y = -dpx + s1 * 0.1;
}

type Box = { left: number; top: number; width: number; height: number };

function tinted(image: HTMLImageElement, width: number, height: number, fill: string | null) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);
  if (fill) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
}

/** The logo's silhouette as canvas points (the logo's alpha), in stage space. */
function sampleLogo(image: HTMLImageElement, box: Box, count: number, random: () => number) {
  const ratio = image.naturalHeight / image.naturalWidth || 2 / 3;
  const width = SAMPLE_WIDTH;
  const height = Math.max(1, Math.round(width * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }
  // Edges first: a point next to transparency is where the light condenses.
  const solid: number[] = [];
  const edge: number[] = [];
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= 96) continue;
    const index = (i - 3) / 4;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbour =
      x > 0 && data[i - 4] <= 96
        ? true
        : x < width - 1 && data[i + 4] <= 96
          ? true
          : y > 0 && data[i - width * 4] <= 96
            ? true
            : y < height - 1 && data[i + width * 4] <= 96;
    (neighbour ? edge : solid).push(index);
  }
  if (solid.length + edge.length < 24) return null;
  const points: Array<[number, number]> = [];
  for (let n = 0; n < count; n += 1) {
    const pool = edge.length > 0 && random() < 0.45 ? edge : solid.length > 0 ? solid : edge;
    const index = pool[Math.floor(random() * pool.length)];
    const px = (index % width) + random();
    const py = Math.floor(index / width) + random();
    points.push([box.left + (px / width) * box.width, box.top + (py / height) * box.height]);
  }
  return points;
}

function seed(
  count: number,
  w: number,
  h: number,
  targets: Array<[number, number]> | null,
  random: () => number,
) {
  const cx = w / 2;
  const cy = h / 2;
  return Array.from({ length: count }, (_, index): Particle => {
    const roll = random();
    const tone: ParticleTone = roll > 0.84 ? "prism" : roll > 0.54 ? "gold" : "ice";
    const target = targets?.[index];
    // The scatter: a wide ring around the title, so the gather reads as
    // light drawn in from every side; without targets, plain dust.
    const angle = random() * Math.PI * 2;
    const reach = (0.6 + random() * 0.8) * Math.max(w, h);
    const sx = target ? cx + Math.cos(angle) * reach : random() * w;
    const sy = target ? cy + Math.sin(angle) * reach * 0.72 : random() * h;
    const tx = target ? target[0] : sx;
    const ty = target ? target[1] : sy;
    return {
      x: sx,
      y: sy,
      px: sx,
      py: sy,
      vx: 0,
      vy: 0,
      tx,
      ty,
      delay: random() * 0.45,
      nx: random() * 40,
      ny: random() * 40,
      r: random() * 1.5 + 0.4,
      a: 0.18 + random() * 0.58,
      phase: random() * Math.PI * 2,
      tone,
      dx: (random() - 0.5) * 0.2,
      dy: -0.09 - random() * 0.18,
      sway: 0.06 + random() * 0.12,
    };
  });
}

export function Particles({
  active,
  lockupRef,
  logoRef,
  seekRef,
}: {
  active: boolean;
  /** The title lockup: the box the dust condenses onto. */
  lockupRef?: RefObject<HTMLElement | null>;
  /** The logo (decoded, same origin): the silhouette and the flash's art. */
  logoRef?: RefObject<HTMLImageElement | null>;
  /** Audit hook: set, the canvas has no clock and draws the frame it is seeked to. */
  seekRef?: MutableRefObject<((t: number) => void) | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!active) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const audit = Boolean(seekRef);
    let raf = 0;
    let particles: Particle[] = [];
    let flash: { box: Box; art: HTMLCanvasElement } | null = null;
    let assembling = false;
    let burstStarted = false;
    let running = true;
    let visible = !document.hidden;
    const startedAt = performance.now();
    let pausedAt = 0;
    let clockOffset = 0;
    // The simulation clock: fixed steps, so a seek and a frame agree.
    let simulated = 0;
    let w = window.innerWidth;
    let h = window.innerHeight;
    const flow = { x: 0, y: 0 };

    const stageBox = (): Box => {
      const stage = canvas.parentElement;
      const rect = stage?.getBoundingClientRect();
      return rect && rect.width > 0
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    };

    const lockupBox = (): Box | null => {
      const lockup = lockupRef?.current;
      const rect = lockup?.getBoundingClientRect();
      if (!rect || rect.width < 40 || rect.height < 20) return null;
      const stage = stageBox();
      return {
        left: rect.left - stage.left,
        top: rect.top - stage.top,
        width: rect.width,
        height: rect.height,
      };
    };

    const prepareFlash = (image: HTMLImageElement, box: Box) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.min(FLASH_WIDTH, Math.max(64, Math.round(box.width * dpr)));
      const ratio = image.naturalHeight / image.naturalWidth || 2 / 3;
      const height = Math.max(1, Math.round(width * ratio));
      const art = tinted(image, width, height, "rgb(232 248 255 / 0.95)");
      return art ? { box, art } : null;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
      const small = w < 600 || lowPower;
      // The condensation only exists while the title is still arriving; a
      // resize later in the sequence reseeds plain dust.
      const elapsed = audit ? simulated : (performance.now() - startedAt - clockOffset) / 1000;
      const image = logoRef?.current ?? null;
      const box = lockupBox();
      const canAssemble =
        elapsed < ASSEMBLE.end && !!image && image.complete && image.naturalWidth > 0 && !!box;
      const random = mulberry32(0x5a6a);
      const targets = canAssemble ? sampleLogo(image, box, small ? 460 : 820, random) : null;
      assembling = targets !== null;
      const count = targets ? targets.length : small ? 38 : 72;
      particles = seed(count, w, h, targets, random);
      flash = canAssemble && box ? prepareFlash(image, box) : null;
      burstStarted = false;
      simulated = 0;
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (!visible) {
        pausedAt = performance.now();
        return;
      }
      // The clock does not run while hidden: the sequence resumes where it was.
      if (pausedAt) {
        clockOffset += performance.now() - pausedAt;
        pausedAt = 0;
      }
      if (!raf && !audit) raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);

    // One fixed step of the simulation at clock time `t`.
    const step = (t: number) => {
      const gather = assembling && t < LOCK.at;
      const burst = assembling && t >= LOCK.at ? 1 - smooth(LOCK.at, LOCK.burstEnd, t) : 0;
      const field = Math.min(w, h);
      if (burst > 0 && !burstStarted) {
        // Thrown out from the lock, away from the lockup's centre.
        burstStarted = true;
        for (const p of particles) {
          const angle = Math.atan2(p.y - h / 2, p.x - w / 2) + (p.phase % 1) - 0.5;
          const speed = (90 + (p.phase % 2) * 150) * (0.4 + p.r);
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed - 30;
        }
      }
      for (const p of particles) {
        p.px = p.x;
        p.py = p.y;
        p.phase += 0.018;
        if (gather) {
          const local = clamp01((t - ASSEMBLE.start - p.delay) / (ASSEMBLE.end - ASSEMBLE.start - 0.45));
          if (local <= 0) continue;
          // A spring to the target that stiffens as the lock nears, through a
          // curl field that lets go as the point arrives: the dust streams in
          // on turbulent paths and settles cleanly.
          curlField(p.x / field * 4 + p.nx, p.y / field * 4 + p.ny, t, flow);
          const k = 12 + 80 * local * local;
          const ax = (p.tx - p.x) * k + flow.x * (1 - local) ** 1.5 * field * 2.2;
          const ay = (p.ty - p.y) * k + flow.y * (1 - local) ** 1.5 * field * 2.2;
          const drag = 1 - Math.min(0.5, (4.5 + 10 * local) * STEP);
          p.vx = (p.vx + ax * STEP) * drag;
          p.vy = (p.vy + ay * STEP) * drag;
          p.x += p.vx * STEP;
          p.y += p.vy * STEP;
          continue;
        }
        if (burst > 0) {
          p.x += p.vx * burst * burst * STEP + p.dx;
          p.y += p.vy * burst * burst * STEP + p.dy;
        } else {
          p.x += p.dx + Math.sin(p.phase) * p.sway;
          p.y += p.dy;
        }
        if (p.y < -6) {
          p.y = h + 6;
          p.py = p.y;
        }
        if (p.y > h + 6) {
          p.y = -6;
          p.py = p.y;
        }
        if (p.x < -6) {
          p.x = w + 6;
          p.px = p.x;
        }
        if (p.x > w + 6) {
          p.x = -6;
          p.px = p.x;
        }
      }
    };

    const advance = (t: number) => {
      if (t < simulated) {
        resize();
      }
      while (simulated + STEP <= t) {
        simulated += STEP;
        step(simulated);
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const gather = assembling && t < LOCK.at;
      const burst = assembling && t >= LOCK.at ? 1 - smooth(LOCK.at, LOCK.burstEnd, t) : 0;
      const glow = gather || burst > 0;
      ctx.globalCompositeOperation = glow ? "lighter" : "source-over";
      ctx.lineCap = "round";
      for (const p of particles) {
        const rgb = TONE_RGB[p.tone];
        let alpha: number;
        if (gather) {
          const local = clamp01((t - ASSEMBLE.start - p.delay) / (ASSEMBLE.end - ASSEMBLE.start - 0.45));
          if (local <= 0) continue;
          alpha = (0.3 + 0.7 * local) * (0.6 + 0.4 * Math.sin(p.phase * 2.2) ** 2);
        } else if (burst > 0) {
          alpha = p.a * (0.5 + 0.5 * burst) * (0.78 + 0.22 * Math.sin(p.phase * 1.4));
        } else {
          alpha = p.a * (0.78 + 0.22 * Math.sin(p.phase * 1.4));
        }
        // Motion blur: the streak of this step, brighter and longer with speed.
        const dx = p.x - p.px;
        const dy = p.y - p.py;
        const speed = Math.hypot(dx, dy);
        if (glow && speed > 0.8) {
          const tail = Math.min(2.4, 1 + speed * 0.25);
          ctx.strokeStyle = `rgba(${rgb}, ${(alpha * 0.55).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.6, p.r * 0.95);
          ctx.beginPath();
          ctx.moveTo(p.x - dx * tail, p.y - dy * tail);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        if (!glow && p.r > 1.25) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.22).toFixed(3)})`;
          ctx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r * (gather ? 1.3 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      // The lock: the logo's own light flashes once and a shockwave ring
      // leaves the lockup.
      if (flash && t >= LOCK.at - 0.03 && t < LOCK.waveEnd) {
        const { box, art } = flash;
        const u = clamp01((t - LOCK.at + 0.03) / (LOCK.waveEnd - LOCK.at + 0.03));
        ctx.globalCompositeOperation = "lighter";
        const k = 1 - easeOutCubic(clamp01(u * 2.2));
        if (k > 0.01) {
          ctx.globalAlpha = 0.42 * k;
          ctx.drawImage(art, box.left, box.top, box.width, box.height);
        }
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const reach = easeOutCubic(u);
        const rx = box.width * (0.42 + 0.75 * reach);
        const ry = box.height * (0.5 + 1.1 * reach);
        ctx.globalAlpha = (1 - u) ** 1.6 * 0.75;
        ctx.lineWidth = 1 + 5 * (1 - u);
        ctx.strokeStyle = "rgb(198 245 255)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgb(240 207 134)";
        ctx.globalAlpha = (1 - u) ** 2 * 0.6;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const tick = () => {
      raf = 0;
      if (!running || !visible) return;
      const t = (performance.now() - startedAt - clockOffset) / 1000;
      advance(t);
      draw(t);
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (seekRef) {
      seekRef.current = (t: number) => {
        if (!running) return;
        advance(t);
        draw(t);
      };
      seekRef.current(0);
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (seekRef) seekRef.current = null;
      flash = null;
    };
  }, [active, lockupRef, logoRef, seekRef]);

  return (
    <canvas
      ref={canvasRef}
      className="cine-particles pointer-events-none absolute inset-0"
      aria-hidden
    />
  );
}
