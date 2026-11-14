import { useEffect, useState, type RefObject } from "react";
import { SAGA_CINEMA_FILMS } from "./saga-cinema-data";

export function useCinemaPreferences() {
  const [preferences, setPreferences] = useState({ calm: true, ready: false, visible: true });
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const update = () =>
      setPreferences({
        calm: media.matches || root.dataset.worldEffects === "economy",
        ready: true,
        visible: !document.hidden,
      });
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-world-effects"] });
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return preferences;
}

export function useCinemaMotion(
  pageRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  chapter: number,
  calm: boolean,
  ready: boolean,
  paused: boolean,
) {
  useEffect(() => {
    const page = pageRef.current;
    if (!page || !ready) return;
    const elements = [...page.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (calm || !("IntersectionObserver" in window)) {
      page.classList.remove("motion-ready");
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -24px 0px" },
    );
    elements
      .filter((element) => !element.classList.contains("is-visible"))
      .forEach((element) => observer.observe(element));
    page.classList.add("motion-ready");
    return () => {
      observer.disconnect();
      page.classList.remove("motion-ready");
    };
  }, [pageRef, calm, ready]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d", { alpha: true });
    } catch {
      return;
    }
    if (!context) return;
    const drawing = context;
    let frame = 0;
    let width = 0;
    let height = 0;
    const [r, g, b] = SAGA_CINEMA_FILMS[chapter].palette;
    const color = `${r},${g},${b}`;
    const dustCount = window.innerWidth < 768 ? 14 : 26;
    const particles = Array.from({ length: dustCount }, (_, index) => {
      const u = ((index * 0.61803398875) % 1 + Math.random() * 0.18) % 1;
      const v = ((index * 0.38196601125) % 1 + Math.random() * 0.18) % 1;
      return {
        u,
        v,
        radius: 0.55 + (index % 4) * 0.32 + Math.random() * 0.35,
        luster: 0.45 + (index % 3) * 0.22,
      };
    });
    const draw = (elapsed = 0) => {
      drawing.clearRect(0, 0, width, height);
      if (paused || width <= 0 || height <= 0) return;
      const settle = calm ? 0.78 : 0.62 + 0.38 * Math.min(1, elapsed / 1400);
      const drift = calm ? 0 : elapsed * 0.006;

      // Diagonal anamorphic projection cone from upper-right booth across the stage.
      const srcX = width * 0.89;
      const srcY = height * 0.03;
      const coneGrad = drawing.createLinearGradient(srcX, srcY, width * 0.22, height * 0.88);
      coneGrad.addColorStop(0, `rgba(${color},${(0.18 * settle).toFixed(4)})`);
      coneGrad.addColorStop(0.28, `rgba(${color},${(0.105 * settle).toFixed(4)})`);
      coneGrad.addColorStop(0.68, `rgba(${color},${(0.038 * settle).toFixed(4)})`);
      coneGrad.addColorStop(1, `rgba(${color},0)`);
      drawing.save();
      drawing.beginPath();
      drawing.moveTo(srcX - width * 0.03, srcY);
      drawing.lineTo(srcX + width * 0.05, srcY + height * 0.04);
      drawing.lineTo(width * 0.72, height * 1.02);
      drawing.lineTo(width * 0.08, height * 0.92);
      drawing.closePath();
      drawing.fillStyle = coneGrad;
      drawing.fill();

      // Focused core slit beam inside the projection cone.
      const coreGrad = drawing.createLinearGradient(srcX, srcY, width * 0.36, height * 0.78);
      coreGrad.addColorStop(0, `rgba(255,248,240,${(0.085 * settle).toFixed(4)})`);
      coreGrad.addColorStop(0.22, `rgba(${color},${(0.115 * settle).toFixed(4)})`);
      coreGrad.addColorStop(0.75, `rgba(${color},${(0.025 * settle).toFixed(4)})`);
      coreGrad.addColorStop(1, `rgba(${color},0)`);
      drawing.beginPath();
      drawing.moveTo(srcX - width * 0.008, srcY);
      drawing.lineTo(srcX + width * 0.018, srcY + height * 0.02);
      drawing.lineTo(width * 0.56, height * 0.94);
      drawing.lineTo(width * 0.25, height * 0.84);
      drawing.closePath();
      drawing.fillStyle = coreGrad;
      drawing.fill();

      // Horizontal anamorphic lens flare streak across the upper aperture plane.
      const streakY = height * 0.135;
      const streakGrad = drawing.createLinearGradient(width * 0.24, streakY, width * 0.98, streakY);
      streakGrad.addColorStop(0, `rgba(${color},0)`);
      streakGrad.addColorStop(0.58, `rgba(${color},${(0.09 * settle).toFixed(4)})`);
      streakGrad.addColorStop(0.82, `rgba(255,248,240,${(0.14 * settle).toFixed(4)})`);
      streakGrad.addColorStop(1, `rgba(${color},0)`);
      drawing.fillStyle = streakGrad;
      drawing.fillRect(width * 0.24, streakY - 1, width * 0.74, 2.2);
      drawing.restore();

      // Ambient stage bounce around the poster screen.
      const radius = Math.max(width, height) * 0.62;
      const gradient = drawing.createRadialGradient(
        width * 0.72,
        height * 0.38,
        0,
        width * 0.72,
        height * 0.38,
        radius,
      );
      gradient.addColorStop(0, `rgba(${color},${(0.065 * settle).toFixed(4)})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      drawing.fillStyle = gradient;
      drawing.fillRect(0, 0, width, height);

      // Volumetric dust scattering illuminated within the projection cone.
      particles.forEach((particle) => {
        const beamT = 0.08 + particle.u * 0.84;
        const axisX = srcX + (width * 0.38 - srcX) * beamT;
        const axisY = srcY + (height * 0.86 - srcY) * beamT;
        const spread = (width * 0.04 + beamT * width * 0.22) * (particle.v - 0.5) * 2;
        const px = axisX + spread - drift * 0.35 * particle.luster;
        const py = axisY + spread * 0.28 - drift * particle.luster;
        const inCore = Math.max(0, 1 - Math.abs(particle.v - 0.5) * 1.85);
        const alpha = (0.07 + inCore * 0.22) * particle.luster * settle;

        drawing.fillStyle = `rgba(${color},${(alpha * 0.38).toFixed(4)})`;
        drawing.beginPath();
        drawing.arc(px, py, particle.radius * 2.6, 0, Math.PI * 2);
        drawing.fill();

        drawing.fillStyle = `rgba(255,248,240,${alpha.toFixed(4)})`;
        drawing.beginPath();
        drawing.arc(px, py, particle.radius, 0, Math.PI * 2);
        drawing.fill();
      });
    };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(calm ? 1400 : 0);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    // A finite settling beat; the canvas is static after this, with no idle loop.
    const start = performance.now();
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        last = now;
        draw(Math.min(now - start, 1400));
      }
      if (now - start < 1400) frame = requestAnimationFrame(tick);
    };
    if (!calm && !paused) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      drawing.clearRect(0, 0, width, height);
    };
  }, [canvasRef, chapter, calm, ready, paused]);
}
