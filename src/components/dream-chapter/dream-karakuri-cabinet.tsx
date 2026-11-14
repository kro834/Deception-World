import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
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
      style={{ "--karakuri-index": selected } as CSSProperties}
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
          <span className="dream-karakuri-gearbox">
            <svg
              className="dream-karakuri-gear dream-karakuri-gear--drive"
              viewBox="0 0 36 36"
              focusable="false"
            >
              <circle
                cx="18"
                cy="18"
                r="13.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.6"
                strokeDasharray="3.534 3.534"
              />
              <circle
                cx="18"
                cy="18"
                r="10.8"
                fill="#1d1215"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M18 7.5v21M7.5 18h21M10.6 10.6l14.8 14.8M25.4 10.6L10.6 25.4"
                stroke="currentColor"
                strokeWidth="1.35"
              />
              <circle cx="18" cy="18" r="3.6" fill="currentColor" />
              <circle cx="18" cy="18" r="1.4" fill="#1b1013" />
            </svg>
            <svg
              className="dream-karakuri-gear dream-karakuri-gear--pinion"
              viewBox="0 0 28 28"
              focusable="false"
            >
              <circle
                cx="14"
                cy="14"
                r="9.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeDasharray="3.848 3.848"
              />
              <circle
                cx="14"
                cy="14"
                r="7.4"
                fill="#1d1215"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M14 6.8v14.4M6.8 14h14.4" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="14" cy="14" r="2.8" fill="currentColor" />
              <circle cx="14" cy="14" r="1.1" fill="#1b1013" />
            </svg>
          </span>
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
              <span className="dream-karakuri-handle" aria-hidden="true">
                <svg className="dream-karakuri-handle-svg" viewBox="0 0 44 18" focusable="false">
                  <g transform="translate(22 8)">
                    <g className="dream-karakuri-handle-cog">
                      <circle
                        r="5.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeDasharray="2.042 2.042"
                      />
                      <circle r="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M0-3.6v7.2M-3.6 0h7.2" stroke="currentColor" strokeWidth="1" />
                    </g>
                  </g>
                  <circle cx="8" cy="5.5" r="2.1" fill="currentColor" />
                  <circle cx="36" cy="5.5" r="2.1" fill="currentColor" />
                  <path
                    className="dream-karakuri-handle-bail"
                    d="M8 5.5v4.5c0 3 2.6 5.2 6.2 5.2h15.6c3.6 0 6.2-2.2 6.2-5.2V5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
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
