import { useSyncExternalStore } from "react";
import {
  getButtonStyleServerSnapshot,
  getButtonStyleSnapshot,
  getGlassVariantServerSnapshot,
  getGlassVariantSnapshot,
  setButtonStyle,
  setGlassVariant,
  subscribeButtonStyle,
} from "@/lib/button-style.js";

const VARIANTS = [
  ["clear", "クリア"],
  ["tinted", "ティント"],
] as const;

/**
 * Side-menu switch: the buttons' material. The state lives on <html>.
 * While the glass is on, its variant follows: Clear (the default, the
 * original look) or Tinted (more opaque, higher contrast), as the
 * platform's own Liquid Glass setting offers. The variant is a pair of
 * pressed buttons in a fieldset, so it wears the side menu's glass pill
 * (its look: src/styles-liquid-glass.css, "The variant row").
 */
export function ButtonStyleToggle() {
  const style = useSyncExternalStore(
    subscribeButtonStyle,
    getButtonStyleSnapshot,
    getButtonStyleServerSnapshot,
  );
  const variant = useSyncExternalStore(
    subscribeButtonStyle,
    getGlassVariantSnapshot,
    getGlassVariantServerSnapshot,
  );
  const on = style === "liquid";
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="side-panel-zeus-toggle side-panel-glass-toggle"
        onClick={() => setButtonStyle(on ? "default" : "liquid")}
      >
        <span>
          <b>ボタン：リキッドグラス</b>
          <small>ガラス風の質感</small>
        </span>
        <i aria-hidden="true">
          <em>{on ? "ON" : "OFF"}</em>
          <u />
        </i>
      </button>
      {on && (
        <fieldset aria-label="ガラスの見え方" className="side-panel-glass-variant">
          <legend>ガラスの見え方</legend>
          {VARIANTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={variant === value}
              onClick={() => setGlassVariant(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
      )}
    </>
  );
}
