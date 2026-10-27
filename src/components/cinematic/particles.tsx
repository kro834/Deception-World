import { useEffect, useRef, type RefObject } from "react";

type ParticleTone = "ice" | "gold" | "prism";

type Particle = {
  x: number;
  y: number;
  // The scattered start and the logo point this particle assembles onto.
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  // Its own moment on the assembly clock (seconds) and its burst heading.
  delay: number;
  bx: number;
  by: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  phase: number;
  sway: number;
  tone: ParticleTone;
};

// The assembly storyboard (seconds from the title's first playing frame; the
// same clock as the CSS arrival in styles-opening-cinema.css):
//   0.2-1.46  the dust gathers onto the ice logo's silhouette, point by point,
//             while the DOM logo opens from its sliver (op-logo-arrive)
//   0.85-1.5  the hologram: the logo projected in sliced rows that jitter in
//             with a cyan/magenta chromatic split and lock at the impact
//   1.5       the impact: the hologram snaps aligned, the points burst out
//   1.5-1.95  the projection cools away; the DOM logo (open at 1.46) carries on
//   after     the same drifting dust as before
const ASSEMBLE = { start: 0.2, end: 1.46 } as const;
const HOLO = { start: 0.85, lock: 1.5, end: 1.95 } as const;
const HOLO_ROWS = 12;
const SAMPLE_WIDTH = 168;
const TINT_WIDTH = 1024;

const TONE_RGB: Record<ParticleTone, string> = {
  gold: "240, 215, 138",
  prism: "242, 132, 220",
  ice: "159, 212, 255",
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// A cheap deterministic flicker: the same at the same clock on every device.
const flicker = (t: number, row: number) =>
  0.5 + 0.5 * Math.sin(t * 37 + row * 1.7) * Math.sin(t * 23 + row * 0.9);

type Box = { left: number; top: number; width: number; height: number };

type Hologram = {
  box: Box;
  cyan: HTMLCanvasElement;
  magenta: HTMLCanvasElement;
  plain: HTMLCanvasElement;
};

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

/** The logo's silhouette as canvas points (the ice logo's alpha), in stage space. */
function sampleLogo(image: HTMLImageElement, box: Box, count: number) {
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
  const solid: number[] = [];
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 96) solid.push((i - 3) / 4);
  }
  if (solid.length < 24) return null;
  const points: Array<[number, number]> = [];
  for (let n = 0; n < count; n += 1) {
    const index = solid[Math.floor(Math.random() * solid.length)];
    const px = (index % width) + Math.random();
    const py = Math.floor(index / width) + Math.random();
    points.push([box.left + (px / width) * box.width, box.top + (py / height) * box.height]);
  }
  return points;
}

function seed(count: number, w: number, h: number, targets: Array<[number, number]> | null) {
  const cx = w / 2;
  const cy = h / 2;
  return Array.from({ length: count }, (_, index): Particle => {
    const roll = Math.random();
    const tone: ParticleTone = roll > 0.84 ? "prism" : roll > 0.54 ? "gold" : "ice";
    const target = targets?.[index];
    // The scatter: a wide ring around the title, so the gather reads as
    // light drawn in from every side; without targets, plain dust.
    const angle = Math.random() * Math.PI * 2;
    const reach = (0.55 + Math.random() * 0.75) * Math.max(w, h);
    const sx = target ? cx + Math.cos(angle) * reach : Math.random() * w;
    const sy = target ? cy + Math.sin(angle) * reach * 0.7 : Math.random() * h;
    const tx = target ? target[0] : sx;
    const ty = target ? target[1] : sy;
    const burstAngle = Math.atan2(ty - cy, tx - cx) + (Math.random() - 0.5) * 0.9;
    const burstSpeed = 2.4 + Math.random() * 4.2;
    return {
      x: sx,
      y: sy,
      sx,
      sy,
      tx,
      ty,
      delay: Math.random() * 0.5,
      bx: Math.cos(burstAngle) * burstSpeed,
      by: Math.sin(burstAngle) * burstSpeed - 0.6,
      r: Math.random() * 1.55 + 0.35,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -0.09 - Math.random() * 0.18,
      a: 0.18 + Math.random() * 0.58,
      phase: Math.random() * Math.PI * 2,
      sway: 0.06 + Math.random() * 0.12,
      tone,
    };
  });
}

export function Particles({
  active,
  lockupRef,
  logoRef,
}: {
  active: boolean;
  /** The title lockup: the box the dust assembles onto and the hologram projects into. */
  lockupRef?: RefObject<HTMLElement | null>;
  /** The ice logo (decoded, same origin): the silhouette and the projection's art. */
  logoRef?: RefObject<HTMLImageElement | null>;
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

    let raf = 0;
    let particles: Particle[] = [];
    let hologram: Hologram | null = null;
    let assembling = false;
    let running = true;
    let visible = !document.hidden;
    const startedAt = performance.now();
    let pausedAt = 0;

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

    const prepareHologram = (image: HTMLImageElement, box: Box) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.min(TINT_WIDTH, Math.max(64, Math.round(box.width * dpr)));
      const ratio = image.naturalHeight / image.naturalWidth || 2 / 3;
      const height = Math.max(1, Math.round(width * ratio));
      const cyan = tinted(image, width, height, "rgb(122 232 255 / 0.9)");
      const magenta = tinted(image, width, height, "rgb(255 92 200 / 0.85)");
      const plain = tinted(image, width, height, null);
      if (!cyan || !magenta || !plain) return null;
      return { box, cyan, magenta, plain };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
      const small = w < 600 || lowPower;
      // The assembly only exists while the title is still arriving; a resize
      // later in the sequence reseeds plain dust (as before).
      const elapsed = (performance.now() - startedAt) / 1000;
      const image = logoRef?.current ?? null;
      const box = lockupBox();
      const canAssemble =
        elapsed < ASSEMBLE.end && !!image && image.complete && image.naturalWidth > 0 && !!box;
      const targets = canAssemble ? sampleLogo(image, box, small ? 420 : 760) : null;
      assembling = targets !== null;
      const count = targets ? targets.length : small ? 38 : 72;
      particles = seed(count, w, h, targets);
      hologram = canAssemble && box ? prepareHologram(image, box) : null;
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (!visible) {
        pausedAt = performance.now();
        return;
      }
      // The clock does not run while hidden: the sequence resumes where it was.
      if (pausedAt) {
        const away = performance.now() - pausedAt;
        pausedAt = 0;
        clockOffset += away;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    let clockOffset = 0;

    resize();
    window.addEventListener("resize", resize);

    const drawHologram = (t: number) => {
      const holo = hologram;
      if (!holo || t < HOLO.start || t > HOLO.end) return;
      const { box, cyan, magenta, plain } = holo;
      const rise = smooth(HOLO.start, HOLO.lock - 0.12, t);
      const cool = 1 - smooth(HOLO.lock, HOLO.end, t);
      const split = t < HOLO.lock ? (1 - rise) * 1 + 0.25 : 0;
      const rowHeight = box.height / HOLO_ROWS;
      const srcRow = cyan.height / HOLO_ROWS;
      ctx.globalCompositeOperation = "lighter";
      for (let row = 0; row < HOLO_ROWS; row += 1) {
        const f = t < HOLO.lock ? flicker(t, row) : 1;
        const alpha = (t < HOLO.lock ? rise * (0.35 + 0.65 * f) : cool) * 0.78;
        if (alpha <= 0.01) continue;
        const sign = row % 2 === 0 ? 1 : -1;
        const jitter = t < HOLO.lock ? sign * (1 - rise) ** 2 * box.width * 0.06 : 0;
        const dx = split * Math.min(14, box.width * 0.012);
        const y = box.top + row * rowHeight;
        const sy = row * srcRow;
        ctx.globalAlpha = alpha * (t < HOLO.lock ? 0.42 : 0.3);
        ctx.drawImage(
          cyan,
          0,
          sy,
          cyan.width,
          srcRow,
          box.left + jitter - dx,
          y,
          box.width,
          rowHeight,
        );
        ctx.drawImage(
          magenta,
          0,
          sy,
          magenta.width,
          srcRow,
          box.left + jitter + dx,
          y,
          box.width,
          rowHeight,
        );
        ctx.globalAlpha = alpha * (t < HOLO.lock ? 0.26 : 0.55);
        ctx.drawImage(
          plain,
          0,
          sy,
          plain.width,
          srcRow,
          box.left + jitter,
          y,
          box.width,
          rowHeight,
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const tick = () => {
      raf = 0;
      if (!running) return;
      if (!visible) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const t = (performance.now() - startedAt - clockOffset) / 1000;
      ctx.clearRect(0, 0, w, h);
      const gather = assembling && t < HOLO.lock;
      const bursting = assembling && t >= HOLO.lock;
      const burst = bursting ? 1 - smooth(HOLO.lock, HOLO.lock + 0.9, t) : 0;
      if (gather || burst > 0) ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        p.phase += 0.018;
        let alpha: number;
        if (gather) {
          // Its own arrival: late points are still on the way at the impact.
          const span = ASSEMBLE.end - ASSEMBLE.start - 0.5;
          const u = easeOutExpo(clamp01((t - ASSEMBLE.start - p.delay) / span));
          const px = p.x;
          const py = p.y;
          p.x = p.sx + (p.tx - p.sx) * u;
          p.y = p.sy + (p.ty - p.sy) * u;
          alpha = (0.35 + 0.65 * u) * (0.55 + 0.45 * Math.sin(p.phase * 2.2) ** 2);
          const rgb = TONE_RGB[p.tone];
          // A short comet tail while it is still travelling.
          const speed = Math.hypot(p.x - px, p.y - py);
          if (u < 0.985 && speed > 0.6) {
            // Capped, so the fastest first frames draw sparks, not a web.
            const tail = Math.min(2.2, 26 / speed);
            const tx = p.x - (p.x - px) * tail;
            const ty = p.y - (p.y - py) * tail;
            ctx.strokeStyle = `rgba(${rgb}, ${alpha * 0.45})`;
            ctx.lineWidth = Math.max(0.6, p.r * 0.9);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
          ctx.arc(p.x, p.y, p.r * (1 + 0.5 * u), 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (bursting) {
          if (burst > 0) {
            // Thrown out from the impact, slowing into dust.
            p.x += p.bx * burst * burst + p.vx;
            p.y += p.by * burst * burst + p.vy;
          } else {
            p.x += p.vx + Math.sin(p.phase) * p.sway;
            p.y += p.vy;
          }
          alpha = p.a * (0.5 + 0.5 * burst) * (0.78 + 0.22 * Math.sin(p.phase * 1.4));
        } else {
          p.x += p.vx + Math.sin(p.phase) * p.sway;
          p.y += p.vy;
          alpha = p.a * (0.78 + 0.22 * Math.sin(p.phase * 1.4));
        }
        if (p.y < -6) {
          p.y = h + 6;
          p.x = Math.random() * w;
        }
        if (p.y > h + 6) p.y = -6;
        if (p.x < -6) p.x = w + 6;
        if (p.x > w + 6) p.x = -6;

        const rgb = TONE_RGB[p.tone];

        if (p.r > 1.25) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.22})`;
          ctx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // The impact flash: one soft pulse of the logo's own light at the lock.
      if (hologram && t >= HOLO.lock - 0.04 && t < HOLO.lock + 0.3) {
        const k = 1 - easeOutCubic(clamp01((t - HOLO.lock + 0.04) / 0.34));
        const { box } = hologram;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.28 * k;
        ctx.drawImage(hologram.plain, box.left, box.top, box.width, box.height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      drawHologram(t);
      raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      hologram = null;
    };
  }, [active, lockupRef, logoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="cine-particles pointer-events-none absolute inset-0"
      aria-hidden
    />
  );
}
