import { createContext, useContext } from "react";
import { sharedZeusButtonContext, type ZeusButtonSettings } from "@/lib/zeus-button-context";

const ZeusButtonContext = sharedZeusButtonContext ?? createContext<ZeusButtonSettings | null>(null);

export function ZeusButtonToggle() {
  const settings = useContext(ZeusButtonContext);
  if (!settings) return null;
  return (
    <button
      type="button"
      className="side-panel-zeus-toggle"
      aria-pressed={settings.enabled}
      onClick={() => settings.setEnabled(!settings.enabled)}
    >
      <span>
        <b>シエルボタン</b>
        <small>常駐ナビゲーション</small>
      </span>
      <i aria-hidden="true">
        <em>{settings.enabled ? "ON" : "OFF"}</em>
        <u />
      </i>
    </button>
  );
}
