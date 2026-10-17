import { useEffect, useRef } from "react";

type ParticleTone = "ice" | "gold" | "prism";

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  phase: number;
  sway: number;
  tone: ParticleTone;
};

function seed(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => {
    const roll = Math.random();
    const tone: ParticleTone =
      roll > 0.84 ? "prism" : roll > 0.54 ? "gold" : "ice";
    return {
      x: Math.random() * w,
      y: Math.random() * h,
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

export function Particles({ active }: { active: boolean }) {
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
    let running = true;
    let visible = !document.hidden;

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
      const count = w < 600 || lowPower ? 38 : 72;
      particles = seed(count, w, h);
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      raf = 0;
      if (!running) return;
      if (!visible) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.phase += 0.018;
        p.x += p.vx + Math.sin(p.phase) * p.sway;
        p.y += p.vy;
        if (p.y < -6) {
          p.y = h + 6;
          p.x = Math.random() * w;
        }
        if (p.x < -6) p.x = w + 6;
        if (p.x > w + 6) p.x = -6;

        const rgb =
          p.tone === "gold"
            ? "240, 215, 138"
            : p.tone === "prism"
              ? "242, 132, 220"
              : "159, 212, 255";
        const pulse = 0.78 + 0.22 * Math.sin(p.phase * 1.4);
        const alpha = p.a * pulse;

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
      raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="cine-particles pointer-events-none absolute inset-0"
      aria-hidden
    />
  );
}
