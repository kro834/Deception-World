import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  gold: boolean;
};

function seed(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 1.4 + 0.3,
    vx: (Math.random() - 0.5) * 0.18,
    vy: -0.08 - Math.random() * 0.16,
    a: 0.15 + Math.random() * 0.55,
    gold: Math.random() > 0.72,
  }));
}

export function Particles({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let particles: Particle[] = [];
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 600 ? 46 : 90;
      particles = seed(count, w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      if (!running) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      if (active) {
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -4) {
            p.y = h + 4;
            p.x = Math.random() * w;
          }
          if (p.x < -4) p.x = w + 4;
          if (p.x > w + 4) p.x = -4;
          ctx.beginPath();
          ctx.fillStyle = p.gold
            ? `rgba(240, 215, 138, ${p.a})`
            : `rgba(159, 212, 255, ${p.a})`;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
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
