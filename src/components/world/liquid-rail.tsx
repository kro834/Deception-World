import type { ReactNode } from "react";

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
        <span className="liquid-selection-surface">
          <span className="liquid-lens-reflection" />
        </span>
      </span>
    </>
  );
}

export function LiquidTab({
  id,
  active,
  accent,
  children,
  onSelect,
}: {
  id: string;
  active: boolean;
  accent: string;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={active ? "is-active" : ""}
      style={{ ["--liquid-accent" as string]: accent }}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
