import { memo, useEffect, useRef, useState } from "react";

/** Cycles-rendered architecture only. Artwork and readable type remain separate
 * DOM layers, so no source illustration is baked, tinted or resampled here.
 * Static ray-traced light also works with reduced motion and without WebGL. */
export const ArchitecturalBackdrop = memo(function ArchitecturalBackdrop({
  variant,
}: {
  variant: "world" | "dream" | "opening";
}) {
  const environment = variant === "dream" ? "dream" : "world";
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached SSR image can finish before hydration installs onLoad. Read
    // its decoded state as well; otherwise a successful plate stays hidden.
    const image = imageRef.current;
    if (image?.complete) {
      setReady(image.naturalWidth > 0);
      setFailed(image.naturalWidth === 0);
    }
  }, [environment]);
  return (
    <div
      className="architectural-backdrop"
      data-environment={environment}
      data-ready={ready ? "true" : "false"}
      data-failed={failed ? "true" : "false"}
      aria-hidden="true"
    >
      <picture>
        <img
          ref={imageRef}
          src={`/architectural-heroes/${environment}-1280.webp`}
          srcSet={`/architectural-heroes/${environment}-1280.webp 1280w, /architectural-heroes/${environment}-2560.webp 2560w`}
          sizes="100vw"
          alt=""
          width={2560}
          height={1600}
          decoding="async"
          fetchPriority="high"
          onLoad={() => {
            setReady(true);
            setFailed(false);
          }}
          onError={() => {
            setReady(false);
            setFailed(true);
          }}
        />
      </picture>
    </div>
  );
});
