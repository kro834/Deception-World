import { useLayoutEffect, useRef, useState } from "react";
import { mountDreamChapterNavigation } from "@/lib/dream-chapter-navigation.js";
import {
  DREAM_READER_DEFAULTS,
  mountDreamReader,
  type DreamReaderState,
} from "@/lib/dream-reader-state.js";
import { DREAM_CASES } from "./dream-chapter-data";
import { DREAM_CHRONICLE } from "./dream-chapter-extra-data";

/** Local reading preferences affect only the canonical synopsis paragraphs. */
export function DreamReaderSupport() {
  const supportRef = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountDreamReader> | null>(null);
  const [reader, setReader] = useState<DreamReaderState>({
    ...DREAM_READER_DEFAULTS,
    available: true,
  });
  useLayoutEffect(() => {
    const current = mountDreamReader(
      supportRef.current?.closest<HTMLElement>(".dream-reader") ?? null,
      DREAM_CASES,
      setReader,
    );
    controller.current = current;
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, []);
  const savedCase = DREAM_CASES.find((episode) => episode.no === reader.bookmark?.caseNo);
  return (
    <div ref={supportRef} className="dream-reader-support" aria-label="読書の支度">
      <div className="dream-reader-support-heading">
        <p>読書の支度</p>
        <span>このブラウザーに保存</span>
      </div>
      <div className="dream-reader-settings">
        <fieldset>
          <legend>文字サイズ</legend>
          <div>
            <button
              type="button"
              aria-pressed={reader.size === "standard"}
              onClick={() => controller.current?.setSize("standard")}
            >
              標準
            </button>
            <button
              type="button"
              aria-pressed={reader.size === "large"}
              onClick={() => controller.current?.setSize("large")}
            >
              大きく
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>行間</legend>
          <div>
            <button
              type="button"
              aria-pressed={reader.spacing === "standard"}
              onClick={() => controller.current?.setSpacing("standard")}
            >
              標準
            </button>
            <button
              type="button"
              aria-pressed={reader.spacing === "comfortable"}
              onClick={() => controller.current?.setSpacing("comfortable")}
            >
              ゆったり
            </button>
          </div>
        </fieldset>
      </div>
      <div className="dream-reader-bookmark">
        {savedCase && reader.bookmark ? (
          <>
            <p>
              <small>しおり</small>
              <span>
                CASE {savedCase.no}「{savedCase.title}」
              </span>
              <small>{reader.bookmark.paragraph}段落目</small>
            </p>
            <div className="dream-reader-bookmark-actions">
              <a href={`#dream-case-${savedCase.no}-paragraph-${reader.bookmark.paragraph}`}>
                続きから読む
              </a>
              <button type="button" onClick={() => controller.current?.clearBookmark()}>
                しおりを外す
              </button>
            </div>
          </>
        ) : (
          <p className="dream-reader-bookmark-empty">
            本文を読むと、読んでいる段落にしおりを残します。
          </p>
        )}
      </div>
      {!reader.available ? (
        <p className="dream-reader-storage-note" role="status">
          この環境ではしおりや設定を保存できません。今のページでは調整できます。
        </p>
      ) : null}
    </div>
  );
}

/** The six chapters remain independent native folds; the map names one URL location. */
export function DreamStoryIndex() {
  const navRef = useRef<HTMLElement>(null);
  const [location, setLocation] = useState<{ current: string | null; open: string[] }>({
    current: null,
    open: [],
  });
  useLayoutEffect(
    () => mountDreamChapterNavigation(navRef.current?.closest(".dream-page"), setLocation),
    [],
  );
  return (
    <>
      <DreamReaderSupport />
      <nav
        ref={navRef}
        id="dream-chapter-index"
        className="dream-reader-index"
        aria-label="六章の目次"
        tabIndex={-1}
      >
        <div className="dream-reader-index-head">
          <p>六章を辿る</p>
          <span>CASE 0–5</span>
        </div>
        <ol>
          {DREAM_CASES.map((episode) => (
            <li key={episode.no}>
              <a
                href={`#dream-case-${episode.no}`}
                aria-current={location.current === episode.no ? "location" : undefined}
              >
                <span className="dream-reader-index-number">{episode.no}</span>
                <span className="dream-reader-index-title">
                  <strong>{episode.title}</strong>
                  <span lang="en">{episode.reading}</span>
                </span>
                <span className="dream-reader-index-meta">
                  <small>{episode.paragraphs.length}段落</small>
                  <small>{location.open.includes(episode.no) ? "開いている" : "あらすじ"}</small>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

/** Canonical event titles and places belonging to this case, hidden until requested. */
export function DreamChapterCompanion({ no }: { no: string }) {
  const events = DREAM_CHRONICLE.filter((event) => event.case === no);
  if (!events.length) return null;
  const places = [...new Set(events.map((event) => event.place))];

  return (
    <details className="dream-chapter-companion">
      <summary>
        <span>この章の出来事</span>
        <small>{events.length}件の記録</small>
      </summary>
      <div className="dream-chapter-companion-body">
        <p className="dream-chapter-companion-places">
          <span>舞台</span>
          {places.join("・")}
        </p>
        <ol>
          {events.map((event) => (
            <li key={event.no}>
              <a href={`#dream-chronicle-event-${event.no}`}>
                <span>{String(event.no).padStart(2, "0")}</span>
                <strong>{event.title.text}</strong>
                <small>{event.place}</small>
              </a>
            </li>
          ))}
        </ol>
        <a className="dream-chapter-companion-all" href={`#dream-chronicle-case-${no}`}>
          CASE {no}の出来事へ
        </a>
      </div>
    </details>
  );
}

export function DreamStoryNavigation({ no }: { no: string }) {
  const index = DREAM_CASES.findIndex((episode) => episode.no === no);
  const previous = DREAM_CASES[index - 1];
  const next = DREAM_CASES[index + 1];
  return (
    <div className="dream-reader-footer">
      <nav className="dream-reader-related" aria-label={`CASE ${no}の章資料`}>
        <span>この章の資料</span>
        <a href={`#dream-case-note-${no}`}>章の言葉</a>
        <a href={`#dream-chronicle-case-${no}`}>出来事</a>
      </nav>
      <nav className="dream-reader-pagination" aria-label={`CASE ${no}から章を移動`}>
        {previous ? (
          <a href={`#dream-case-${previous.no}`}>
            <small>前の章</small>
            <span>← {previous.title}</span>
          </a>
        ) : (
          <span aria-hidden="true" />
        )}
        <a className="dream-reader-return" href="#dream-chapter-index">
          章の目次
        </a>
        {next ? (
          <a href={`#dream-case-${next.no}`}>
            <small>次の章</small>
            <span>{next.title} →</span>
          </a>
        ) : (
          <span className="dream-reader-end">CASE 0–5</span>
        )}
      </nav>
    </div>
  );
}

export function DreamStoryBacklinks({ no, from }: { no: string; from: "note" | "chronicle" }) {
  return (
    <nav
      className="dream-reader-backlinks"
      aria-label={`CASE ${no}の${from === "note" ? "章の言葉" : "出来事"}から移動`}
    >
      <a href={`#dream-case-${no}`}>CASE {no}のあらすじ</a>
      <a href={from === "note" ? `#dream-chronicle-case-${no}` : `#dream-case-note-${no}`}>
        {from === "note" ? "出来事" : "章の言葉"}
      </a>
    </nav>
  );
}
