import { useLayoutEffect, useRef, useState } from "react";
import { mountDreamChapterNavigation } from "@/lib/dream-chapter-navigation.js";
import { DREAM_CASES } from "./dream-chapter-data";

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
              <span>{episode.title}</span>
              {location.open.includes(episode.no) ? (
                <small>開いている</small>
              ) : (
                <small>あらすじ</small>
              )}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DreamStoryNavigation({ no }: { no: string }) {
  const index = DREAM_CASES.findIndex((episode) => episode.no === no);
  const previous = DREAM_CASES[index - 1];
  const next = DREAM_CASES[index + 1];
  return (
    <div className="dream-reader-footer">
      <nav className="dream-reader-related" aria-label={`CASE ${no}の関連資料`}>
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
    <nav className="dream-reader-backlinks" aria-label={`CASE ${no}の関連資料`}>
      <a href={`#dream-case-${no}`}>CASE {no}のあらすじ</a>
      <a href={from === "note" ? `#dream-chronicle-case-${no}` : `#dream-case-note-${no}`}>
        {from === "note" ? "出来事" : "章の言葉"}
      </a>
    </nav>
  );
}
