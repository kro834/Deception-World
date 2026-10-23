import { useState } from "react";
import { DisplayName } from "@/components/name-text";
import {
  DREAM_CASE_NOTES,
  DREAM_CASES,
  DREAM_CHARACTERS,
  DREAM_DOLMINENCE,
  DREAM_QUOTES,
} from "./dream-chapter-data";

// Three entrances, each its own colour on the ticket's edge; the seal and the
// title name the way in (no route number, HUD kind or tally).
const routes = [
  { title: "絵看板を見る", href: "#posters", mark: "観る" },
  { title: "六章を読む", href: "#dream-chapter-index", mark: "読む" },
  { title: "記録を探す", href: "#dream-record-explorer", mark: "探す" },
] as const;


// The three cast files, then the four agents: two companies, set apart by a gap
// and each file's own light on its top edge.
const dossierQuickLinks = [
  ...DREAM_CHARACTERS.map((item) => ({
    id: `dream-character-${item.id}`,
    kind: "cast",
    name: item.name,
    accent: item.accent,
  })),
  ...DREAM_DOLMINENCE.map((record) => ({
    id: `dream-dolminence-${record.id}`,
    kind: "agent",
    name: record.name,
    accent: record.accent,
  })),
];

function resolveSpeakerHref(by: string) {
  if (by.includes("シエル")) return "#dream-character-ciel";
  if (by.includes("慶弥")) return "#dream-character-keiya";
  if (by.includes("怪作")) return "#dream-character-kaisaku";
  return "#quotes";
}

/** The programme's routes and catalogue sit beside a manually operated paper reel. */
export function DreamProgrammeDesk() {
  const [reel, setReel] = useState({
    mode: "quotes" as "quotes" | "notes",
    quoteIndex: 0,
    noteIndex: 0,
    direction: "next",
    turn: 0,
  });
  const { mode: reelMode, quoteIndex, noteIndex } = reel;
  const activeQuote = DREAM_QUOTES[quoteIndex] ?? DREAM_QUOTES[0];
  const activeNote = DREAM_CASE_NOTES[noteIndex] ?? DREAM_CASE_NOTES[0];
  const activeNoteCase = DREAM_CASES.find((episode) => episode.no === activeNote?.no);

  const stepReel = (delta: number) => {
    setReel((current) => ({
      ...current,
      quoteIndex:
        current.mode === "quotes"
          ? (current.quoteIndex + delta + DREAM_QUOTES.length) % DREAM_QUOTES.length
          : current.quoteIndex,
      noteIndex:
        current.mode === "notes"
          ? (current.noteIndex + delta + DREAM_CASE_NOTES.length) % DREAM_CASE_NOTES.length
          : current.noteIndex,
      direction: delta < 0 ? "previous" : "next",
      turn: current.turn + 1,
    }));
  };

  const setReelMode = (mode: "quotes" | "notes") => {
    setReel((current) =>
      current.mode === mode
        ? current
        : { ...current, mode, direction: "next", turn: current.turn + 1 },
    );
  };

  const reelIndex = reelMode === "quotes" ? quoteIndex : noteIndex;
  const reelTotal = reelMode === "quotes" ? DREAM_QUOTES.length : DREAM_CASE_NOTES.length;
  const reelLabel = reelMode === "quotes" ? "名台詞" : "章の言葉";

  return (
    <section className="dream-programme-desk" aria-labelledby="dream-programme-title">
      <header className="dream-programme-heading">
        <h2 id="dream-programme-title">劇場案内</h2>
      </header>
      <nav className="dream-programme-routes" aria-label="ドリームチャプターの入口">
        {routes.map((route) => (
          <a className="dream-programme-ticket" href={route.href} key={route.href}>
            <span className="dream-programme-ticket-main">
              <span aria-hidden="true">{route.mark}</span>
              <strong>{route.title}</strong>
            </span>
            <span className="dream-programme-ticket-foot" aria-hidden="true">
              <span>↗</span>
            </span>
          </a>
        ))}
      </nav>

      <div className="dream-programme-dossiers" role="group" aria-label="人物資料・機密記録">
        <ul className="dream-programme-dossier-strip">
          {dossierQuickLinks.map((entry) => (
            <li key={entry.id} data-kind={entry.kind}>
              <a
                href={`#${entry.id}`}
                className="dream-programme-dossier-chip"
                style={{ ["--dossier-chip-accent" as string]: entry.accent }}
              >
                <strong>
                  <DisplayName value={entry.name} />
                </strong>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <aside
        className="dream-programme-spotlight dream-programme-reel"
        aria-labelledby="dream-programme-reel-title"
      >
        <header className="dream-programme-reel-heading">
          <div>
            <span className="dream-programme-reel-label">幕間の小道具</span>
            <h3 id="dream-programme-reel-title">ことばの巻取箱</h3>
          </div>
          <div className="dream-programme-spotlight-modes" role="group" aria-label="表示切替">
            <button
              type="button"
              aria-pressed={reelMode === "quotes"}
              aria-controls="dream-programme-reel-paper"
              onClick={() => setReelMode("quotes")}
            >
              名台詞
            </button>
            <button
              type="button"
              aria-pressed={reelMode === "notes"}
              aria-controls="dream-programme-reel-paper"
              onClick={() => setReelMode("notes")}
            >
              章の言葉
            </button>
          </div>
        </header>
        <div className="dream-programme-reel-frame" data-reel-direction={reel.direction}>
          <span className="dream-programme-reel-spine" aria-hidden="true">
            幕間言葉
          </span>
          <div className="dream-programme-reel-window" id="dream-programme-reel-paper">
            <div
              key={reel.turn}
              className="dream-programme-reel-sheet"
              data-reel-operated={reel.turn > 0 ? "true" : "false"}
            >
              {reelMode === "quotes" && activeQuote ? (
                <blockquote className="dream-programme-spotlight-quote">
                  <p>「{activeQuote.text}」</p>
                  <footer>
                    <strong>{activeQuote.by}</strong>
                    <a href={resolveSpeakerHref(activeQuote.by)}>関連記録へ ↗</a>
                  </footer>
                </blockquote>
              ) : activeNote ? (
                <blockquote className="dream-programme-spotlight-quote">
                  {activeNote.motto ? (
                    <small className="dream-programme-spotlight-motto" lang="en">
                      {activeNote.motto}
                    </small>
                  ) : null}
                  <p>「{activeNote.line}」</p>
                  <footer>
                    <strong>{activeNote.by}</strong>
                    <span>
                      CASE {activeNote.no}「{activeNoteCase?.title}」
                    </span>
                    <a href={`#dream-case-${activeNote.no}`}>この章を読む ↗</a>
                  </footer>
                </blockquote>
              ) : null}
            </div>
          </div>
          <span className="dream-programme-reel-seal" aria-hidden="true">
            夢
          </span>
        </div>
        <div className="dream-programme-reel-bottom">
          <p
            className="dream-programme-reel-position dream-visually-hidden"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {reelLabel} {reelIndex + 1} / {reelTotal}
            <span>
              {" "}
              —{" "}
              {reelMode === "quotes"
                ? activeQuote?.by
                : `CASE ${activeNote?.no}「${activeNoteCase?.title}」`}
            </span>
          </p>
          <div className="dream-programme-spotlight-controls">
            <button
              type="button"
              onClick={() => stepReel(-1)}
              aria-label={`前の${reelLabel}を表示`}
              aria-controls="dream-programme-reel-paper"
            >
              <span aria-hidden="true">←</span> 前へ
            </button>
            <button
              type="button"
              onClick={() => stepReel(1)}
              aria-label={`次の${reelLabel}を表示`}
              aria-controls="dream-programme-reel-paper"
            >
              次へ <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </aside>
    </section>
  );
}
