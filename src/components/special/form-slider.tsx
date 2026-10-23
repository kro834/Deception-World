import { forwardRef, type PointerEvent } from "react";
import { LiquidLens } from "@/components/world/liquid-rail";

/* The special sites' form slider (owner, 2026-10-24: 「スライダーの形も統一させて」):
   ONE shape for every form selector — Rexonance's #stages rail is the
   canonical design (.rxs-stage-tabs.liquid-swipe-tabs: a liquid-glass rail,
   its lens under the chosen form, each form's light as --liquid-accent).
   A tablist of buttons, roving tabindex, aria-selected/-controls; the page
   wires the rail's gestures (initRail: tap, long-press, drag, arrow keys)
   on the forwarded element and keeps the state. `className` adds the page's
   scope class only (never a new shape). */

export type FormSliderItem<K extends string> = {
  readonly key: K;
  readonly label: string;
  readonly accent: string;
};

type Props<K extends string> = {
  readonly items: readonly FormSliderItem<K>[];
  readonly value: K;
  readonly onSelect: (key: K) => void;
  /** Ids: each tab is `${idPrefix}-${key}`, all control `panelId`. */
  readonly idPrefix: string;
  readonly panelId: string;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly ariaDescribedBy?: string;
  readonly onTabPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
};

function FormSliderInner<K extends string>(
  {
    items,
    value,
    onSelect,
    idPrefix,
    panelId,
    className,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    onTabPointerUp,
  }: Props<K>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={`rxs-stage-tabs liquid-swipe-tabs${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-liquid-glass="true"
      data-stage={value}
    >
      <LiquidLens />
      {items.map(({ key, label, accent }) => (
        <button
          key={key}
          id={`${idPrefix}-${key}`}
          type="button"
          role="tab"
          aria-selected={value === key}
          aria-controls={panelId}
          tabIndex={value === key ? 0 : -1}
          className={value === key ? "is-active" : ""}
          style={{ ["--liquid-accent" as string]: accent }}
          onClick={() => onSelect(key)}
          onPointerUp={onTabPointerUp}
        >
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export const FormSlider = forwardRef(FormSliderInner) as <K extends string>(
  props: Props<K> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof FormSliderInner>;
