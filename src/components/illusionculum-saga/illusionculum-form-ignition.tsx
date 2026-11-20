import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ILLUSIONCULUM_ARTWORK,
  illusionculumImage,
  type IllusionculumFormKey,
} from "@/lib/illusionculum-saga-artwork";

/* ILLUSIONCULUM SAGA — #forms: the switch into ウルトラ by red fire (owner,
   2026-11-20). An overlay over the panel's new picture: the old picture,
   then the burn on a canvas (src/lib/illusionculum-form-ignition.ts, a lazy
   chunk). It removes itself once the new picture holds the frame. */
export function IllusionculumFormIgnition({
  previous,
  stage,
  destinationRef,
}: {
  previous: IllusionculumFormKey;
  stage: IllusionculumFormKey;
  destinationRef: RefObject<HTMLImageElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const portrait = portraitRef.current;
    const destination = destinationRef.current;
    if (!canvas || !portrait || !destination) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import("@/lib/illusionculum-form-ignition").then(
      ({ mountIllusionculumFormIgnition }) => {
        if (cancelled) return;
        dispose = mountIllusionculumFormIgnition(canvas, portrait, destination, previous, stage, () =>
          setFinished(true),
        );
      },
      () => setFinished(true),
    );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [previous, stage, destinationRef]);

  if (finished) return null;
  const art = ILLUSIONCULUM_ARTWORK[previous];
  return (
    <span className="ics-ignition" aria-hidden="true">
      <img
        ref={portraitRef}
        src={art.src}
        {...illusionculumImage(previous)}
        alt=""
        width={art.width}
        height={art.height}
      />
      <canvas ref={canvasRef} />
    </span>
  );
}
