import { useEffect, useRef } from "react";

type WarpParticle = {
  x: number;
  y: number;
  z: number;
  speed: number;
  width: number;
  alpha: number;
  color: readonly [number, number, number];
};

type RenderProfile = {
  count: number;
  dpr: number;
  glowPass: boolean;
  label: "cinematic" | "balanced" | "efficient";
};

const TAU = Math.PI * 2;
const WARP_COLORS = [
  [202, 244, 255],
  [123, 224, 244],
  [116, 241, 211],
  [240, 215, 138],
  [255, 255, 255],
] as const;

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function selectProfile(width: number, height: number): RenderProfile {
  const device = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const coarse = window.matchMedia("(any-pointer: coarse)").matches;
  const lowPower =
    device.connection?.saveData === true ||
    (device.hardwareConcurrency || 4) <= 4 ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 4);
  const compact = coarse || width < 760;
  const maxPixels = compact ? 1_350_000 : 3_200_000;
  const pixelBudgetDpr = Math.sqrt(maxPixels / Math.max(1, width * height));
  const dprCap = compact ? 1.45 : lowPower ? 1.35 : 1.85;
  const dpr = Math.max(0.8, Math.min(window.devicePixelRatio || 1, dprCap, pixelBudgetDpr));

  if (lowPower) {
    return { count: compact ? 46 : 64, dpr, glowPass: false, label: "efficient" };
  }
  if (compact) {
    return { count: 68, dpr, glowPass: false, label: "balanced" };
  }
  return {
    count: width >= 1500 ? 132 : 108,
    dpr,
    glowPass: true,
    label: "cinematic",
  };
}

function seedParticles(
  count: number,
  width: number,
  height: number,
  random: () => number,
): WarpParticle[] {
  const aspectX = width / Math.max(1, Math.min(width, height));
  const aspectY = height / Math.max(1, Math.min(width, height));

  return Array.from({ length: count }, () => {
    const angle = random() * TAU;
    const radius = 0.035 + Math.pow(random(), 1.35) * 0.72;
    return {
      x: Math.cos(angle) * radius * aspectX,
      y: Math.sin(angle) * radius * aspectY,
      z: 0.11 + random() * 0.91,
      speed: 0.48 + random() * 0.72,
      width: 0.55 + random() * 1.3,
      alpha: 0.34 + random() * 0.58,
      color: WARP_COLORS[Math.floor(random() * WARP_COLORS.length)],
    };
  });
}

function resetParticle(
  particle: WarpParticle,
  random: () => number,
  width: number,
  height: number,
) {
  const angle = random() * TAU;
  const radius = 0.035 + Math.pow(random(), 1.35) * 0.72;
  const minSide = Math.max(1, Math.min(width, height));
  particle.x = Math.cos(angle) * radius * (width / minSide);
  particle.y = Math.sin(angle) * radius * (height / minSide);
  particle.z = 1.02 + random() * 0.16;
  particle.speed = 0.48 + random() * 0.72;
  particle.width = 0.55 + random() * 1.3;
  particle.alpha = 0.34 + random() * 0.58;
  particle.color = WARP_COLORS[Math.floor(random() * WARP_COLORS.length)];
}

export function DiveVelocityCanvas({ active, arriving }: { active: boolean; arriving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrivingRef = useRef(arriving);
  arrivingRef.current = arriving;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) return;

    if (!active) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.dataset.diveQuality = "idle";
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      canvas.dataset.diveQuality = "reduced";
      return;
    }

    let frame = 0;
    let running = true;
    let visible = !document.hidden;
    let width = 1;
    let height = 1;
    let profile = selectProfile(width, height);
    let activeCount = profile.count;
    let particles: WarpParticle[] = [];
    let previousTime = performance.now();
    let elapsed = 0;
    let slowFrames = 0;
    const random = createRandom((Date.now() ^ Math.round(performance.now() * 1000)) >>> 0);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width || window.innerWidth));
      height = Math.max(1, Math.round(bounds.height || window.innerHeight));
      profile = selectProfile(width, height);
      activeCount = profile.count;
      canvas.width = Math.max(1, Math.round(width * profile.dpr));
      canvas.height = Math.max(1, Math.round(height * profile.dpr));
      context.setTransform(profile.dpr, 0, 0, profile.dpr, 0, 0);
      context.lineCap = "round";
      particles = seedParticles(profile.count, width, height, random);
      canvas.dataset.diveQuality = profile.label;
      canvas.dataset.diveDensity = String(profile.count);
    };

    const drawAtmosphere = (centerX: number, centerY: number, intensity: number) => {
      const minSide = Math.min(width, height);
      const glow = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        minSide * 0.42,
      );
      glow.addColorStop(0, `rgba(224, 251, 255, ${0.19 * intensity})`);
      glow.addColorStop(0.12, `rgba(97, 225, 211, ${0.11 * intensity})`);
      glow.addColorStop(0.32, `rgba(88, 179, 226, ${0.065 * intensity})`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalCompositeOperation = "lighter";
      for (let index = 0; index < 3; index += 1) {
        const progress = (elapsed * (arrivingRef.current ? 1.42 : 0.82) + index / 3) % 1;
        const radius = minSide * (0.035 + progress * 0.58);
        const alpha = (1 - progress) * 0.16 * intensity;
        context.beginPath();
        context.strokeStyle = `rgba(${index === 1 ? "240, 215, 138" : "146, 229, 247"}, ${alpha})`;
        context.lineWidth = 0.6 + progress * 1.35;
        context.arc(centerX, centerY, radius, 0, TAU);
        context.stroke();
      }
      context.restore();
    };

    const draw = (timestamp: number) => {
      frame = 0;
      if (!running || !visible) return;

      const rawDelta = timestamp - previousTime;
      previousTime = timestamp;
      const delta = Math.min(0.034, Math.max(0.001, rawDelta / 1000));
      elapsed += delta;
      if (rawDelta > 29) slowFrames += 1;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames >= 7 && activeCount > 38) {
        activeCount = Math.max(38, Math.floor(activeCount * 0.78));
        slowFrames = 0;
        canvas.dataset.diveQuality = "adaptive";
        canvas.dataset.diveDensity = String(activeCount);
      }

      context.clearRect(0, 0, width, height);
      const arrivingNow = arrivingRef.current;
      const velocity = arrivingNow ? 2.05 : 1;
      const intensity = arrivingNow ? 1.35 : 1;
      const centerX = width * 0.5 + Math.sin(elapsed * 1.7) * width * 0.0035;
      const centerY = height * 0.5 + Math.cos(elapsed * 1.35) * height * 0.003;
      const perspective = Math.min(width, height) * 0.59;
      drawAtmosphere(centerX, centerY, intensity);

      context.save();
      context.globalCompositeOperation = "lighter";
      for (let index = 0; index < activeCount; index += 1) {
        const particle = particles[index];
        particle.z -= delta * particle.speed * velocity;
        if (particle.z <= 0.065) resetParticle(particle, random, width, height);

        const tailZ = Math.min(
          1.28,
          particle.z + (arrivingNow ? 0.2 : 0.1) + particle.speed * 0.025,
        );
        const headX = centerX + (particle.x / particle.z) * perspective;
        const headY = centerY + (particle.y / particle.z) * perspective;
        const tailX = centerX + (particle.x / tailZ) * perspective;
        const tailY = centerY + (particle.y / tailZ) * perspective;
        const margin = Math.max(width, height) * 0.3;
        if (
          headX < -margin ||
          headX > width + margin ||
          headY < -margin ||
          headY > height + margin
        ) {
          resetParticle(particle, random, width, height);
          continue;
        }

        const depth = Math.min(1, Math.max(0.08, 1.05 - particle.z));
        const [red, green, blue] = particle.color;
        const alpha = particle.alpha * (0.28 + depth * 0.72) * intensity;
        const lineWidth = particle.width * (0.72 + depth * 1.65);

        if (profile.glowPass) {
          context.beginPath();
          context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.18})`;
          context.lineWidth = lineWidth * 3.4;
          context.moveTo(tailX, tailY);
          context.lineTo(headX, headY);
          context.stroke();
        }

        context.beginPath();
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${Math.min(0.96, alpha)})`;
        context.lineWidth = lineWidth;
        context.moveTo(tailX, tailY);
        context.lineTo(headX, headY);
        context.stroke();
      }
      context.restore();

      frame = requestAnimationFrame(draw);
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      previousTime = performance.now();
      if (visible && !frame) frame = requestAnimationFrame(draw);
    };

    resize();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    frame = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="cine-dive-velocity"
      data-dive-quality="idle"
      aria-hidden="true"
    />
  );
}
