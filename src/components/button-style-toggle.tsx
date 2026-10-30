import { useSyncExternalStore } from "react";
import {
  getButtonStyleServerSnapshot,
  getButtonStyleSnapshot,
  setButtonStyle,
  subscribeButtonStyle,
} from "@/lib/button-style.js";

/** Side-menu switch: the buttons' material. The state lives on <html>. */
export function ButtonStyleToggle() {
  const style = useSyncExternalStore(
    subscribeButtonStyle,
    getButtonStyleSnapshot,
    getButtonStyleServerSnapshot,
  );
  const on = style === "liquid";
  return (
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
  );
}
