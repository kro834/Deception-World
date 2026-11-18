import { useEffect, useRef, useState } from "react";
import { drawFarFromFormCombustion } from "@/lib/far-from-form-combustion";
import { FAR_FROM_SAGA_ARTWORK, farFromImage, type FarFromStageKey } from "@/lib/far-from-saga-artwork";

export const FAR_FROM_FORM_IGNITION_MS = 1000;
export const FAR_FROM_FORM_DEPLOY_MS = 680;
const PANEL_REACTOR_Y = 0.4;

export function FarFromFormIgnition({
  previous,
  stage,
  delayMs,
}: {
  previous: FarFromStageKey;
  stage: FarFromStageKey;
  delayMs: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let frame = 0;
    const startedAt = performance.now() + delayMs;
    const start = window.setTimeout(() => {
      const context = canvas.getContext("2d");
      if (!context || !canvas.clientWidth || !canvas.clientHeight) {
        setFinished(true);
        return;
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = Math.min(window.devicePixelRatio, coarse ? 1.2 : 1.5, 800 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

      const tick = (now: number) => {
        const progress = (now - startedAt) / FAR_FROM_FORM_IGNITION_MS;
        if (progress >= 1) {
          setFinished(true);
          return;
        }
        context.clearRect(0, 0, width, height);
        drawFarFromFormCombustion(context, stage, progress, width, height, coarse, PANEL_REACTOR_Y);
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(start);
      window.cancelAnimationFrame(frame);
    };
  }, [delayMs, stage]);

  if (finished) return null;
  const image = FAR_FROM_SAGA_ARTWORK[previous];
  return (
    <span className="ffs-ignition" aria-hidden="true">
      <img
        src={image.src}
        {...farFromImage(previous, previous !== "middle")}
        alt=""
        width={image.width}
        height={image.height}
      />
      <canvas ref={canvasRef} />
    </span>
  );
}
