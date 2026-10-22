import { useId, useRef, useState, type KeyboardEvent } from "react";
import { DREAM_CASES } from "./dream-chapter-data";

const VOLUMES = ["零", "一", "二", "三", "四", "五"] as const;

/** An optional preview desk: every destination remains a regular document link. */
export function DreamKarakuriCabinet() {
  const [selected, setSelected] = useState(0);
  const [reveal, setReveal] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const identity = useId();
  const panelId = (index: number) => `${identity}-chapter-${index}`;
  const tabId = (index: number) => `${identity}-volume-${index}`;

  const selectChapter = (index: number, focus = false) => {
    if (index !== selected) {
      setSelected(index);
      setReveal((current) => current + 1);
    }
    if (focus) tabs.current[index]?.focus();
  };

  const moveChapter = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = DREAM_CASES.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % DREAM_CASES.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + last) % DREAM_CASES.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    selectChapter(target, true);
  };

  return (
    <section
      className="dream-karakuri-cabinet"
      id="dream-karakuri-cabinet"
      data-dream-karakuri
      aria-labelledby={`${identity}-title`}
    >
      <header className="dream-karakuri-heading">
        <div>
          <p lang="en">SIX CHAPTERS / KARAKURI INDEX</p>
          <h2 id={`${identity}-title`}>からくり章案内</h2>
        </div>
        <p>章の札を引くと、障子の奥に物語の入口が開きます。</p>
      </header>

      <div className="dream-karakuri-woodwork">
        <div className="dream-karakuri-drawer-label" aria-hidden="true">
          <span>物語之匣</span>
          <span>六章収録</span>
        </div>
        <div className="dream-karakuri-tabs" role="tablist" aria-label="あらすじを選ぶ">
          {DREAM_CASES.map((chapter, index) => (
            <button
              key={chapter.no}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId(index)}
              data-karakuri-tab={chapter.no}
              aria-selected={selected === index}
              aria-controls={panelId(index)}
              tabIndex={selected === index ? 0 : -1}
              className="dream-karakuri-tab"
              onClick={() => selectChapter(index)}
              onKeyDown={(event) => moveChapter(event, index)}
            >
              <span className="dream-karakuri-tab-number">巻之{VOLUMES[index]}</span>
              <strong>{chapter.title}</strong>
              <span className="dream-karakuri-handle" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="dream-karakuri-theatre">
          {DREAM_CASES.map((episode, index) => (
            <div
              key={episode.no}
              className="dream-karakuri-paper"
              role="tabpanel"
              id={panelId(index)}
              data-karakuri-panel={episode.no}
              data-selected={selected === index ? "true" : "false"}
              aria-labelledby={tabId(index)}
              aria-hidden={selected !== index}
              inert={selected !== index}
              tabIndex={selected === index ? 0 : -1}
            >
              <div className="dream-karakuri-paper-topline" aria-hidden="true">
                <span>第四幕・物語の記録</span>
                <span>{String(index + 1).padStart(2, "0")} / 06</span>
              </div>
              <div className="dream-karakuri-chapter-heading">
                <span className="dream-karakuri-seal" aria-hidden="true">
                  {VOLUMES[index]}
                </span>
                <div>
                  <p lang="en">
                    CASE {episode.no} / {episode.reading}
                  </p>
                  <h3>{episode.title}</h3>
                </div>
              </div>
              <p className="dream-karakuri-lead">{episode.lead}</p>
              <p className="dream-karakuri-excerpt">{episode.paragraphs[0]}</p>
              <div className="dream-karakuri-actions">
                <a href={`#dream-case-${episode.no}`}>
                  CASE {episode.no} のあらすじへ<span aria-hidden="true"> ↗</span>
                </a>
                <a href="#dream-reading-room-entry">
                  読書室の入口へ<span aria-hidden="true"> ↗</span>
                </a>
              </div>
            </div>
          ))}
          <div
            key={reveal}
            className="dream-karakuri-shoji"
            data-reveal={reveal > 0 ? "true" : undefined}
            aria-hidden="true"
          >
            <span className="dream-karakuri-shoji-leaf dream-karakuri-shoji-left" />
            <span className="dream-karakuri-shoji-leaf dream-karakuri-shoji-right" />
          </div>
        </div>

        <footer className="dream-karakuri-footer">
          <p>札は矢印キーでも選べます。</p>
          <nav aria-label="六章のあらすじへ直接移動">
            {DREAM_CASES.map((chapter) => (
              <a
                key={chapter.no}
                href={`#dream-case-${chapter.no}`}
                aria-label={`CASE ${chapter.no}「${chapter.title}」のあらすじへ`}
              >
                <span lang="en">{chapter.no}</span>
                <span className="dream-karakuri-direct-title">{chapter.title}</span>
              </a>
            ))}
          </nav>
        </footer>
      </div>
    </section>
  );
}
