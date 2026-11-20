import { useEffect, useRef, type RefObject } from "react";
import { mountMetaUnitasFormIgnition } from "@/lib/meta-unitas-form-ignition";
import { META_UNITAS_ARTWORK, metaUnitasImage } from "@/lib/meta-unitas-saga-artwork";

/** #stages' switch into ウルトラ (owner, 2026-11-20): ミドル's portrait over
 * the panel, then its cutout burning in white fire until ウルトラ is
 * revealed from the flame (src/lib/meta-unitas-form-ignition.ts). */
export function MetaUnitasIgnition({
  destinationRef,
  onDone,
}: {
  destinationRef: RefObject<HTMLImageElement | null>;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const portrait = portraitRef.current;
    if (!canvas || !portrait) return;
    return mountMetaUnitasFormIgnition(canvas, portrait, destinationRef.current, onDone);
  }, [destinationRef, onDone]);
  const middle = META_UNITAS_ARTWORK.middle;
  const image = metaUnitasImage("middle");
  return (
    <span className="mus-ignition" aria-hidden="true">
      <canvas ref={canvasRef} />
      <img
        ref={portraitRef}
        src={middle.src}
        srcSet={image.srcSet}
        sizes={image.sizes}
        alt=""
        width={middle.width}
        height={middle.height}
      />
    </span>
  );
}
