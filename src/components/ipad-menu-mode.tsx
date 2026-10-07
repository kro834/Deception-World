import { useEffect, useId, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  getIpadMenuServerSnapshot,
  getIpadMenuSnapshot,
  refreshIpadMenuMode,
  setIpadMenuMode,
  subscribeIpadMenuMode,
  watchIpadMenuMode,
} from "@/lib/ipad-menu-mode.js";

/** One controller for route changes, modal locks and personal preferences. */
export function IpadMenuMode() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => watchIpadMenuMode(), []);
  useEffect(() => refreshIpadMenuMode(), [pathname]);
  return null;
}

/** Optional escape hatch: only an identified iPad sees this setting. */
export function IpadMenuToggle() {
  const descriptionId = useId();
  const mode = useSyncExternalStore(
    subscribeIpadMenuMode,
    getIpadMenuSnapshot,
    getIpadMenuServerSnapshot,
  );
  if (mode === "unavailable") return null;
  const enabled = mode === "on";
  return (
    <div className="ipad-menu-setting">
      <button
        type="button"
        className="side-panel-link-button ipad-menu-toggle"
        aria-pressed={enabled}
        aria-describedby={descriptionId}
        onClick={() => setIpadMenuMode(!enabled)}
      >
        <span>iPad省スペースメニュー</span>
        <i aria-hidden="true">{enabled ? "ON" : "OFF"}</i>
      </button>
      <p id={descriptionId} className="ipad-menu-description">
        上部が透ける場合、スクロール中は小さなメニューボタンで操作します。このiPadに保存されます。
      </p>
    </div>
  );
}
