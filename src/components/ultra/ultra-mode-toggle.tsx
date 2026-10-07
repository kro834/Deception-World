import { useId, useState, useSyncExternalStore } from "react";
import {
  getUltraModeServerSnapshot,
  getUltraModeSnapshot,
  setUltraMode,
  subscribeUltraMode,
} from "@/lib/ultra-mode.js";

/** Optional, browser-local graphics preference shown in the World side menu. */
export function UltraModeToggle() {
  const descriptionId = useId();
  const motionId = useId();
  const snapshot = useSyncExternalStore(
    subscribeUltraMode,
    getUltraModeSnapshot,
    getUltraModeServerSnapshot,
  );
  const [feedback, setFeedback] = useState("");

  const toggle = () => {
    try {
      setUltraMode(!snapshot.enabled);
      const updated = getUltraModeSnapshot();
      setFeedback(
        updated.storageAvailable
          ? "このブラウザーに設定を保存しました。"
          : "設定はこの画面に反映しましたが、保存できませんでした。再読み込み後は以前の設定に戻る場合があります。",
      );
    } catch {
      setFeedback("設定を変更できませんでした。現在の状態を保っています。");
    }
  };

  return (
    <div className="ultra-mode-setting">
      <button
        type="button"
        role="switch"
        className="side-panel-link-button ultra-mode-toggle"
        aria-label="ウルトラモード"
        aria-checked={snapshot.enabled}
        aria-describedby={`${descriptionId}${snapshot.ready && !snapshot.motionAllowed ? ` ${motionId}` : ""}`}
        disabled={!snapshot.ready}
        onClick={toggle}
      >
        <span>ウルトラモード</span>
        <i aria-hidden="true">{snapshot.enabled ? "ON" : "OFF"}</i>
      </button>
      <p id={descriptionId} className="ultra-mode-description">
        光・反射・粒子・質感の描写を高めます。端末の発熱や消費電力が増える場合があります。設定はこのブラウザーに保存します。いつでもOFFに戻せます。
      </p>
      <details className="ultra-mode-rendering-details">
        <summary>描画方式について</summary>
        <p>
          対応環境ではWebGL2で結晶・反射床・光・粒子を描画します。MetalFXやハードウェア・レイ・トレーシングではなく、Web用のレイマーチングです。非対応環境では静的な素材表現へ切り替わります。
        </p>
      </details>
      {snapshot.ready && !snapshot.motionAllowed && (
        <p id={motionId} className="ultra-mode-preference">
          動き・透明度の軽減やコントラスト・配色の設定を優先し、静的な素材表現で表示します。
        </p>
      )}
      <p className="ultra-mode-feedback" role="status" aria-live="polite">
        {feedback || (!snapshot.ready ? "設定を読み込んでいます。" : "")}
      </p>
    </div>
  );
}
