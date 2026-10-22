import { useState } from "react";
import {
  DREAM_CASE_NOTES,
  DREAM_CASES,
  DREAM_CAST_ROSTER,
  DREAM_CHARACTERS,
  DREAM_DOLMINENCE,
  DREAM_GLOSSARY,
  DREAM_POSTERS,
  DREAM_QUOTES,
} from "./dream-chapter-data";
import {
  DREAM_ARSENAL,
  DREAM_ATLAS,
  DREAM_CHRONICLE,
  DREAM_RELATIONS,
  DREAM_VOICES,
} from "./dream-chapter-extra-data";

const routes = [
  {
    no: "01",
    kind: "SCREENING",
    title: "絵看板を見る",
    href: "#posters",
    count: `${DREAM_POSTERS.length}点の絵看板`,
    mark: "観る",
  },
  {
    no: "02",
    kind: "READING",
    title: "六章を読む",
    href: "#dream-chapter-index",
    count: `CASE 0–${DREAM_CASES.at(-1)?.no ?? "5"}`,
    mark: "読む",
  },
  {
    no: "03",
    kind: "ARCHIVE",
    title: "記録を探す",
    href: "#dream-record-explorer",
    count: `${DREAM_CHRONICLE.length}件の出来事`,
    mark: "探す",
  },
] as const;

const totalArsenalItems = DREAM_ARSENAL.reduce((sum, group) => sum + group.entries.length, 0);
const totalVoiceLines =
  DREAM_QUOTES.length + DREAM_VOICES.reduce((sum, voice) => sum + voice.quotes.length, 0);

const ledgerItems = [
  {
    code: "ACT II",
    label: "主要人物資料",
    value: String(DREAM_CHARACTERS.length).padStart(2, "0"),
    unit: "FILES",
    href: "#characters",
  },
  {
    code: "ROSTER",
    label: "登場人物一覧",
    value: String(DREAM_CAST_ROSTER.length).padStart(2, "0"),
    unit: "CAST",
    href: "#cast-roster",
  },
  {
    code: "ACT III",
    label: "ドルミネンス機密",
    value: String(DREAM_DOLMINENCE.length).padStart(2, "0"),
    unit: "AGENTS",
    href: "#dolminence",
  },
  {
    code: "ATLAS",
    label: "舞台と領域",
    value: String(DREAM_ATLAS.length).padStart(2, "0"),
    unit: "PLACES",
    href: "#atlas",
  },
  {
    code: "BONDS",
    label: "因縁と繋がり",
    value: String(DREAM_RELATIONS.length).padStart(2, "0"),
    unit: "TIES",
    href: "#relations",
  },
  {
    code: "ARSENAL",
    label: "武装・能力・術式",
    value: String(totalArsenalItems).padStart(2, "0"),
    unit: "ITEMS",
    href: "#arsenal",
  },
  {
    code: "LEXICON",
    label: "用語集",
    value: String(DREAM_GLOSSARY.length).padStart(2, "0"),
    unit: "TERMS",
    href: "#glossary",
  },
  {
    code: "VOICES",
    label: "収録台詞・声",
    value: String(totalVoiceLines).padStart(2, "0"),
    unit: "LINES",
    href: "#quotes",
  },
] as const;

const dossierQuickLinks = [
  ...DREAM_CHARACTERS.map((item) => ({
    id: `dream-character-${item.id}`,
    badge: `CAST ${item.order}`,
    name: item.name,
    roman: item.roman,
    accent: item.accent,
  })),
  ...DREAM_DOLMINENCE.map((record) => ({
    id: `dream-dolminence-${record.id}`,
    badge: `AGENT ${record.order}`,
    name: record.name,
    roman: record.roman,
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
        <p lang="en">DREAM CHAPTER / PROGRAMME</p>
        <h2 id="dream-programme-title">劇場案内</h2>
        <span>絵看板、六章、出来事の記録から辿る。</span>
      </header>
      <nav className="dream-programme-routes" aria-label="ドリームチャプターの入口">
        {routes.map((route) => (
          <a className="dream-programme-ticket" href={route.href} key={route.no}>
            <span className="dream-programme-ticket-head">
              <small>{route.no}</small>
              <small lang="en">{route.kind}</small>
            </span>
            <span className="dream-programme-ticket-main">
              <span aria-hidden="true">{route.mark}</span>
              <strong>{route.title}</strong>
            </span>
            <span className="dream-programme-ticket-foot">
              <small>{route.count}</small>
              <span aria-hidden="true">↗</span>
            </span>
          </a>
        ))}
      </nav>

      <div className="dream-programme-dossiers" aria-label="主要人物・機密ファイル直通">
        <div className="dream-programme-ledger-head">
          <span lang="en">
            DOSSIER QUICK LAUNCH / {String(dossierQuickLinks.length).padStart(2, "0")} FILES
          </span>
          <small>選択すると詳細資料モーダルを直接開きます</small>
        </div>
        <ul className="dream-programme-dossier-strip">
          {dossierQuickLinks.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                className="dream-programme-dossier-chip"
                style={{ ["--dossier-chip-accent" as string]: entry.accent }}
              >
                <small lang="en">{entry.badge}</small>
                <strong>{entry.name}</strong>
                <span lang="en">{entry.roman}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="dream-programme-ledger" aria-label="収録アーカイブ総覧">
        <div className="dream-programme-ledger-head">
          <span lang="en">ARCHIVE CATALOGUE / DIRECT INDEX</span>
          <small>各記録コーナーへ直接移動できます</small>
        </div>
        <ul className="dream-programme-ledger-grid">
          {ledgerItems.map((item) => (
            <li key={item.code}>
              <a href={item.href} className="dream-programme-ledger-cell">
                <span className="dream-programme-ledger-code" lang="en">
                  {item.code}
                </span>
                <strong className="dream-programme-ledger-value">
                  {item.value}
                  <small lang="en">{item.unit}</small>
                </strong>
                <span className="dream-programme-ledger-label">{item.label}</span>
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
          <p id="dream-programme-reel-help">引き手を押すと、次の一葉が現れます。</p>
        </header>
        <div className="dream-programme-spotlight-meta">
          <span className="dream-programme-spotlight-kicker" lang="en">
            {reelMode === "quotes" ? "STAGE VOICE REEL" : "CASE MOTTO REEL"} ·{" "}
            {String(reelIndex + 1).padStart(2, "0")} / {String(reelTotal).padStart(2, "0")}
          </span>
          <div className="dream-programme-spotlight-modes" role="group" aria-label="表示切替">
            <button
              type="button"
              aria-pressed={reelMode === "quotes"}
              aria-controls="dream-programme-reel-paper"
              onClick={() => setReelMode("quotes")}
            >
              名台詞 ({DREAM_QUOTES.length})
            </button>
            <button
              type="button"
              aria-pressed={reelMode === "notes"}
              aria-controls="dream-programme-reel-paper"
              onClick={() => setReelMode("notes")}
            >
              章の言葉 ({DREAM_CASE_NOTES.length})
            </button>
          </div>
        </div>
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
              <span className="dream-programme-reel-folio" aria-hidden="true">
                {reelLabel} / 第{String(reelIndex + 1).padStart(2, "0")}葉
              </span>
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
                      CASE {activeNote.no} {activeNoteCase?.reading} — {activeNote.motto}
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
            className="dream-programme-reel-position"
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
          <div
            className="dream-programme-spotlight-controls"
            aria-describedby="dream-programme-reel-help"
          >
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
