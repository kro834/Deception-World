import { WORLD_CAST_ROSTER } from "./world-annex-data";
import {
  activateCastDirectoryFilter,
  CAST_DIRECTORY_FILTERS,
  castDirectoryCounts,
  type CastDirectoryFilter,
} from "./world-cast-directory-model";

const LABELS: Record<CastDirectoryFilter, string> = {
  all: "すべて",
  riders: "ライダーの資料",
  managers: "六詠の資料",
  characters: "関連人物の資料",
  profile: "プロフィールのみ",
};
const COUNTS = castDirectoryCounts(WORLD_CAST_ROSTER);

/** A local way into the existing portrait wall; the cards remain its source. */
export function WorldCastDirectory({
  filter,
  onChange,
}: {
  filter: CastDirectoryFilter;
  onChange: (filter: CastDirectoryFilter) => void;
}) {
  return (
    <div className="wa-directory">
      <div className="wa-directory-heading">
        <p className="wa-directory-label">資料の種類から選ぶ</p>
        <p className="wa-directory-count" role="status" aria-live="polite" aria-atomic="true">
          <span>{LABELS[filter]}</span>
          <strong>{COUNTS[filter]}</strong> / {COUNTS.all}人
        </p>
      </div>
      <div className="wa-directory-controls" role="group" aria-label="人物資料の絞り込み">
        {CAST_DIRECTORY_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            aria-controls="cast-roster"
            onClick={(event) => activateCastDirectoryFilter(value, event.currentTarget, onChange)}
          >
            <span>{LABELS[value]}</span>
            <span className="wa-directory-badge" aria-hidden="true">
              {COUNTS[value]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
