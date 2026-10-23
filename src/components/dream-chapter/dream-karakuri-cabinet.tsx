import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  describeDreamCabinetChapter,
  watchDreamCabinetBookmark,
  type DreamCabinetBookmark,
} from "@/lib/dream-cabinet-guide.js";
import { DREAM_CASES } from "./dream-chapter-data";
import { DREAM_CHRONICLE } from "./dream-chapter-extra-data";

const VOLUMES = ["零", "一", "二", "三", "四", "五"] as const;
const CHAPTER_GUIDES = DREAM_CASES.map((chapter) =>
  describeDreamCabinetChapter(chapter, DREAM_CHRONICLE),
);

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
        <div>
          <p lang="en">SIX CHAPTERS / KARAKURI INDEX</p>
          <h2 id={`${identity}-title`}>からくり章案内</h2>
        </div>
        <p>六枚の札から、読みたい章を選ぶ。障子の奥で冒頭と章の見取り図を確かめられます。</p>
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
            ) : (
              <span>
                {reader.available
                  ? "最初から読むときも、気になる章から読むときも、下の札から。"
                  : "しおりを読み出せない場合も、下の札から各章のあらすじを読めます。"}
              </span>
            )}
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
              <span className="dream-karakuri-tab-number">
                巻之{VOLUMES[index]}
                <span className="dream-karakuri-tab-position"> / 0{index + 1}</span>
              </span>
              <strong>{chapter.title}</strong>
              <span className="dream-karakuri-tab-count">
                {CHAPTER_GUIDES[index].paragraphs}段落
              </span>
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
              <div className="dream-karakuri-reading-layout">
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
                  </div>
                </div>
                <aside className="dream-karakuri-guide" aria-label={`CASE ${episode.no}の見取り図`}>
                  <h4>この章の見取り図</h4>
                  <dl>
                    <div>
                      <dt>あらすじ</dt>
                      <dd>
                        <b>{CHAPTER_GUIDES[index].paragraphs}</b>段落
                      </dd>
                    </div>
                    <div>
                      <dt>本文量</dt>
                      <dd>
                        <b>{CHAPTER_GUIDES[index].characters.toLocaleString("ja-JP")}</b>字
                      </dd>
                    </div>
                    <div>
                      <dt>出来事</dt>
                      <dd>
                        <b>{CHAPTER_GUIDES[index].events}</b>件
                      </dd>
                    </div>
                  </dl>
                  <a href={`#dream-chronicle-case-${episode.no}`}>
                    この章の出来事を辿る<span aria-hidden="true"> ↗</span>
                  </a>
                </aside>
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
