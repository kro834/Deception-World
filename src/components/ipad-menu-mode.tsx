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

/** iPad defaults to compact navigation; an explicit personal OFF is retained. */
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
        iPadでは自動でオンになります。上部のバーが画面外に出ると、小さなメニューボタンに変わります。設定はこのiPadに保存されます。
      </p>
    </div>
  );
}
