import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { watchDreamCabinetBookmark, type DreamCabinetBookmark } from "@/lib/dream-cabinet-guide.js";
import { DREAM_CASES } from "./dream-chapter-data";

const VOLUMES = ["零", "一", "二", "三", "四", "五"] as const;

/** An optional preview desk: every destination remains a regular document link. */
export function DreamKarakuriCabinet() {
  const [selected, setSelected] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [reader, setReader] = useState<DreamCabinetBookmark>({ bookmark: null, available: true });
  const cabinet = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const identity = useId();
  const panelId = (index: number) => `${identity}-chapter-${index}`;
  const tabId = (index: number) => `${identity}-volume-${index}`;
  const savedChapter = DREAM_CASES.find((chapter) => chapter.no === reader.bookmark?.caseNo);
  useEffect(() => watchDreamCabinetBookmark(cabinet.current, DREAM_CASES, setReader), []);

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
      ref={cabinet}
      className="dream-karakuri-cabinet"
      id="dream-karakuri-cabinet"
      data-dream-karakuri
      aria-labelledby={`${identity}-title`}
    >
      <header className="dream-karakuri-heading">
        <h2 id={`${identity}-title`}>からくり章案内</h2>
      </header>

      <div className="dream-karakuri-woodwork">
        <div className="dream-karakuri-resume" data-has-bookmark={Boolean(savedChapter)}>
          <div className="dream-karakuri-resume-mark" aria-hidden="true">
            栞
          </div>
          <div className="dream-karakuri-resume-copy">
            <p>{savedChapter ? "しおりのある場所" : "六章の入口"}</p>
            {savedChapter && reader.bookmark ? (
              <span>
                CASE {savedChapter.no}「{savedChapter.title}」・{reader.bookmark.paragraph}段落目
              </span>
            ) : !reader.available ? (
              <span>しおりを読み出せない場合も、下の札から各章のあらすじを読めます。</span>
            ) : null}
          </div>
          {savedChapter && reader.bookmark ? (
            <a
              className="dream-karakuri-resume-link"
              href={`#dream-case-${savedChapter.no}-paragraph-${reader.bookmark.paragraph}`}
              aria-label={`CASE ${savedChapter.no}「${savedChapter.title}」の${reader.bookmark.paragraph}段落目、しおりから再開`}
            >
              しおりから再開<span aria-hidden="true"> ↗</span>
            </a>
          ) : (
            <a className="dream-karakuri-resume-link" href="#dream-case-0">
              CASE 0から読む<span aria-hidden="true"> ↗</span>
            </a>
          )}
        </div>
        <div className="dream-karakuri-drawer-label" aria-hidden="true">
          <span>物語之匣</span>
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
              </div>
              <div className="dream-karakuri-chapter-heading">
                <span className="dream-karakuri-seal" aria-hidden="true">
                  {VOLUMES[index]}
                </span>
                <div>
                  <p lang="en">CASE {episode.no}</p>
                  <h3>{episode.title}</h3>
                </div>
              </div>
              <div className="dream-karakuri-opening">
                <p className="dream-karakuri-lead">{episode.lead}</p>
                <p className="dream-karakuri-excerpt">{episode.paragraphs[0]}</p>
                <div className="dream-karakuri-actions">
                  <a href={`#dream-case-${episode.no}`}>
                    CASE {episode.no} のあらすじへ<span aria-hidden="true"> ↗</span>
                  </a>
                  <a href="#dream-reading-room-entry">
                    読書室の入口へ<span aria-hidden="true"> ↗</span>
                  </a>
                  <a href={`#dream-chronicle-case-${episode.no}`}>
                    この章の出来事を辿る<span aria-hidden="true"> ↗</span>
                  </a>
                </div>
              </div>
              <p className="dream-karakuri-scope">
                冒頭・あらすじ・出来事には、物語の展開を含みます。
              </p>
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

      </div>
    </section>
  );
}
