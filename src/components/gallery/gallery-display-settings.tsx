import { useId, type KeyboardEvent } from "react";
import type {
  GalleryBackground,
  GalleryDensity,
  GalleryDisplayPreferences,
} from "./gallery-display-preferences";

const DENSITIES: ReadonlyArray<{ value: GalleryDensity; label: string }> = [
  { value: "standard", label: "標準" },
  { value: "compact", label: "コンパクト" },
  { value: "spacious", label: "ゆったり" },
];
const BACKGROUNDS: ReadonlyArray<{ value: GalleryBackground; label: string }> = [
  { value: "ink", label: "墨" },
  { value: "warm", label: "暖色" },
  { value: "light", label: "明色" },
];

function keepRadioNavigationLocal(event: KeyboardEvent<HTMLFieldSetElement>) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    event.stopPropagation();
}

function DisplayFeedback({ status = "", error = "" }: { status?: string; error?: string }) {
  return (
    <>
      {status && (
        <p className="gallery-display-feedback" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="gallery-display-feedback is-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function GalleryBackgroundControl({
  value,
  onChange,
  status,
  error,
}: {
  value: GalleryBackground;
  onChange: (background: GalleryBackground) => void;
  status?: string;
  error?: string;
}) {
  const name = useId();
  return (
    <div className="gallery-background-control">
      <fieldset className="gallery-display-field" onKeyDown={keepRadioNavigationLocal}>
        <legend>拡大画面の背景</legend>
        <div className="gallery-display-choices">
          {BACKGROUNDS.map((choice) => (
            <label className="gallery-display-choice" key={choice.value}>
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={value === choice.value}
                tabIndex={value === choice.value ? 0 : -1}
                onChange={() => onChange(choice.value)}
              />
              <span
                className="gallery-display-swatch"
                data-background={choice.value}
                aria-hidden="true"
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <DisplayFeedback status={status} error={error} />
    </div>
  );
}

export function GalleryDisplaySettings({
  value,
  onChange,
  onReset,
  status,
  error,
}: {
  value: GalleryDisplayPreferences;
  onChange: (patch: Partial<GalleryDisplayPreferences>) => void;
  onReset: () => void;
  status?: string;
  error?: string;
}) {
  const name = useId();
  return (
    <details className="gallery-display-settings">
      <summary>
        鑑賞の設定
        <span>
          {DENSITIES.find((choice) => choice.value === value.density)?.label}・
          {BACKGROUNDS.find((choice) => choice.value === value.background)?.label}
        </span>
      </summary>
      <div className="gallery-display-body">
        <p className="gallery-display-description">
          一覧の間隔と拡大画面の背景を、自分の見やすい表示に。このブラウザーに保存されます。
        </p>
        <fieldset className="gallery-display-field" onKeyDown={keepRadioNavigationLocal}>
          <legend>一覧の密度</legend>
          <div className="gallery-display-choices">
            {DENSITIES.map((choice) => (
              <label className="gallery-display-choice" key={choice.value}>
                <input
                  type="radio"
                  name={name}
                  value={choice.value}
                  checked={value.density === choice.value}
                  tabIndex={value.density === choice.value ? 0 : -1}
                  onChange={() => onChange({ density: choice.value })}
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <GalleryBackgroundControl
          value={value.background}
          onChange={(background) => onChange({ background })}
        />
        <button type="button" className="gallery-display-reset" onClick={onReset}>
          表示設定を標準に戻す
        </button>
        <DisplayFeedback status={status} error={error} />
      </div>
    </details>
  );
}
