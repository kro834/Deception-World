// Owner (2026-11-22): 「ドリームチャプターは上映が終了している的なやつも追加して」.
// Dream Chapter's run has ended. This is a status label, not a block: the page
// and everything on it stay open. Wherever the film is listed it wears the
// small badge; on its own page it gets a quiet end-of-run notice.
export const SCREENING_ENDED_LABEL = "上映終了";
export const SCREENING_ENDED_KICKER = "SCREENING ENDED";
export const SCREENING_ENDED_NOTE = "ドリームチャプターの上映は終了しました。";

/** True for a route that belongs to the Dream Chapter. */
export const isScreeningEnded = (to: string) => to === "/dream-chapter";

export function ScreeningEndedBadge({ className }: { className?: string }) {
  return (
    <span className={className ? `screening-ended-badge ${className}` : "screening-ended-badge"}>
      {SCREENING_ENDED_LABEL}
    </span>
  );
}

export function ScreeningEndedNotice() {
  return (
    <aside className="dream-screening-ended" aria-label={SCREENING_ENDED_LABEL}>
      <p className="dream-screening-ended-kicker" aria-hidden="true">
        {SCREENING_ENDED_KICKER}
      </p>
      <p className="dream-screening-ended-stamp">{SCREENING_ENDED_LABEL}</p>
      <p className="dream-screening-ended-note">{SCREENING_ENDED_NOTE}</p>
    </aside>
  );
}
