import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { farFromCompletedSuit, mountFarFromFormIgnition, type FarFromIgnitionOptions } from "@/lib/far-from-form-ignition";
import { FAR_FROM_SAGA_ARTWORK, farFromImage } from "@/lib/far-from-saga-artwork";

export function FarFromFormIgnition({
  previous, stage, delayMs, onReveal, destinationRef, children,
}: FarFromIgnitionOptions & {
  destinationRef: RefObject<HTMLImageElement | null>;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const portrait = portraitRef.current;
    const destination = destinationRef.current;
    if (!canvas || !portrait || !destination) return;
    return mountFarFromFormIgnition(canvas, portrait, destination,
      { previous, stage, delayMs, onReveal }, () => setFinished(true));
  }, [delayMs, previous, stage, onReveal, destinationRef, finished]);

  if (finished) return children;
  const image = FAR_FROM_SAGA_ARTWORK[previous];
  return (
    <span className="ffs-ignition" aria-hidden="true">
      <canvas ref={canvasRef} />
      <img ref={portraitRef} src={image.src} {...farFromImage(previous)}
        onError={({ currentTarget }) => {
          // A rapid switch can start from a full-body fallback whose original
          // portrait failed. Reuse that cutout while the next form loads.
          if (!currentTarget.hasAttribute("srcset")) return;
          currentTarget.src = farFromCompletedSuit(previous);
          currentTarget.removeAttribute("srcset");
          currentTarget.style.objectFit = "contain";
        }}
        alt="" width={image.width} height={image.height} />
    </span>
  );
}
