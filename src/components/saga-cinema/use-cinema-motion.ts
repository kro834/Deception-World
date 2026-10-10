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
    const color = SAGA_CINEMA_FILMS[chapter].palette.join(",");
    const particles = Array.from({ length: window.innerWidth < 768 ? 6 : 12 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.35 + Math.random() * 0.55,
    }));
    const draw = (elapsed = 0) => {
      drawing.clearRect(0, 0, width, height);
      if (calm || paused) return;
      const radius = Math.max(width, height) * 0.64;
      const gradient = drawing.createRadialGradient(
        width * 0.72,
        height * 0.4,
        0,
        width * 0.72,
        height * 0.4,
        radius,
      );
      gradient.addColorStop(0, `rgba(${color},.04)`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      drawing.fillStyle = gradient;
      drawing.fillRect(0, 0, width, height);
      drawing.fillStyle = `rgba(${color},.08)`;
      particles.forEach((particle) => {
        drawing.beginPath();
        drawing.arc(
          particle.x * width,
          particle.y * height - elapsed * 0.001,
          particle.radius,
          0,
          Math.PI * 2,
        );
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
      draw();
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
