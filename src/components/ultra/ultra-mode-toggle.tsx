import { useId, useState, useSyncExternalStore } from "react";
import {
  getUltraQualityServerSnapshot,
  getUltraQualitySnapshot,
  setUltraQuality,
  subscribeUltraQuality,
  type UltraQuality,
} from "@/lib/ultra-quality.js";
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
  const qualityDescriptionId = useId();
  const snapshot = useSyncExternalStore(
    subscribeUltraMode,
    getUltraModeSnapshot,
    getUltraModeServerSnapshot,
  );
  const qualitySnapshot = useSyncExternalStore(
    subscribeUltraQuality,
    getUltraQualitySnapshot,
    getUltraQualityServerSnapshot,
  );
  const [feedback, setFeedback] = useState("");

  const updateQuality = (quality: UltraQuality) => {
    try {
      setUltraQuality(quality);
      const updated = getUltraQualitySnapshot();
      const label = quality === "cinema" ? "シネマ" : "高精細";
      setFeedback(
        updated.storageAvailable
          ? `画質を「${label}」にして、このブラウザーに保存しました。`
          : "画質設定はこの画面に反映しましたが、保存できませんでした。再読み込み後は以前の設定に戻る場合があります。",
      );
    } catch {
      setFeedback("画質設定を変更できませんでした。現在の設定を保っています。");
    }
  };

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
        作品画像の周囲に金属・ガラスの額縁表現を加えます。端末の発熱や消費電力が増える場合があります。設定はこのブラウザーに保存します。いつでもOFFに戻せます。
      </p>
      {snapshot.enabled && (
        <fieldset className="ultra-quality-options" aria-describedby={qualityDescriptionId}>
          <legend>画質</legend>
          <label className="ultra-quality-option">
            <input
              type="radio"
              name="ultra-quality"
              value="high"
              checked={qualitySnapshot.quality === "high"}
              disabled={!qualitySnapshot.ready}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "high" || value === "cinema") updateQuality(value);
              }}
            />
            <span>
              <b>高精細</b>
              <small>額縁の金属面と縁の光を高精細に描写します。</small>
            </span>
          </label>
          <label className="ultra-quality-option">
            <input
              type="radio"
              name="ultra-quality"
              value="cinema"
              checked={qualitySnapshot.quality === "cinema"}
              disabled={!qualitySnapshot.ready}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "high" || value === "cinema") updateQuality(value);
              }}
            />
            <span>
              <b>シネマ</b>
              <small>額縁の反射と輪郭を、より高い描写密度で表示します。処理負荷が高くなります。</small>
            </span>
          </label>
          <p id={qualityDescriptionId} className="ultra-quality-description">
            選んだ画質はウルトラモードをOFFにしても保存されます。
          </p>
        </fieldset>
      )}
      <details className="ultra-mode-rendering-details">
        <summary>素材と表示について</summary>
        <p>
          Blenderで生成した透明な額縁素材を使い、作品画像そのものは加工しません。対応環境では額縁の金属・ガラス縁の質感を描写します。非対応環境では静的な額縁素材で表示し、動き・透明度・コントラスト・配色の設定が優先される場合は追加の演出を抑えます。
        </p>
      </details>
      {snapshot.ready && !snapshot.motionAllowed && (
        <p id={motionId} className="ultra-mode-preference">
          動き・透明度の軽減やコントラスト・配色の設定を優先し、追加の演出を抑えています。
        </p>
      )}
      <p className="ultra-mode-feedback" role="status" aria-live="polite">
        {feedback || (!snapshot.ready ? "設定を読み込んでいます。" : "")}
      </p>
    </div>
  );
}
