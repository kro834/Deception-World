export function LiquidPointerGlow() {
  return <span className="liquid-pointer-glow" aria-hidden="true" />;
}

export function LiquidLens() {
  return (
    <>
      <span className="liquid-rail-surface" aria-hidden="true">
        <span className="liquid-contact-glow" />
        <span className="liquid-contact-reflection" />
      </span>
      <span className="liquid-selection-lens" aria-hidden="true">
        {/* lg-lens-target: the glass option's swollen lens, the hook for its
            refraction (styles-liquid-glass-controls.css, section 6). */}
        <span className="liquid-selection-surface lg-lens-target">
          <span className="liquid-lens-reflection" />
        </span>
      </span>
    </>
  );
}

