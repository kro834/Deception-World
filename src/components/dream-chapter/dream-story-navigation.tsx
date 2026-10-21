import { useLayoutEffect, useRef, useState } from "react";
import { mountDreamChapterNavigation } from "@/lib/dream-chapter-navigation.js";
import {
  DREAM_READER_DEFAULTS,
  mountDreamReader,
  type DreamReaderState,
} from "@/lib/dream-reader-state.js";
import { DREAM_CASES, DREAM_CAST_ROSTER } from "./dream-chapter-data";
import { DREAM_CHRONICLE, type DreamChronicleEvent } from "./dream-chapter-extra-data";

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
    <div
      ref={supportRef}
      className="dream-reader-support"
      aria-label="読書の支度"
      data-dream-reveal
    >
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

const CHAPTER_CAST_LINKS = [
  { match: ["シエル"], label: "シエル", kind: "FILE 01", href: "#dream-character-ciel" },
  { match: ["慶弥"], label: "東風谷 慶弥", kind: "FILE 02", href: "#dream-character-keiya" },
  { match: ["怪作"], label: "怪作", kind: "FILE 03", href: "#dream-character-kaisaku" },
  {
    match: ["ロードナイト", "ワン"],
    label: "ロードナイト",
    kind: "AGENT 01",
    href: "#dream-dolminence-lord-knight",
  },
  {
    match: ["ロードケイオス", "ケイオス"],
    label: "ロードケイオス",
    kind: "AGENT 02",
    href: "#dream-dolminence-lord-chaos",
  },
  {
    match: ["シンソウ", "ドレッド"],
    label: "ドレッド / シンソウ",
    kind: "AGENT 03",
    href: "#dream-dolminence-dread",
  },
  {
    match: ["サヨ", "ルパン"],
    label: "ルパン / サヨ",
    kind: "AGENT 04",
    href: "#dream-dolminence-lupin",
  },
  { match: ["霊夢"], label: "博麗 霊夢", kind: "ROSTER", href: "#dream-roster-reimu" },
  { match: ["早苗"], label: "東風谷 早苗", kind: "ROSTER", href: "#dream-roster-sanae" },
  { match: ["咲夜"], label: "十六夜 咲夜", kind: "ROSTER", href: "#dream-roster-sakuya" },
  { match: ["鈴仙"], label: "鈴仙・U・イナバ", kind: "ROSTER", href: "#dream-roster-reisen" },
  { match: ["永琳"], label: "八意 永琳", kind: "ROSTER", href: "#dream-roster-eirin" },
  { match: ["輝夜"], label: "蓬莱山 輝夜", kind: "ROSTER", href: "#dream-roster-kaguya" },
  { match: ["狗瓦"], label: "狗瓦", kind: "ROSTER", href: "#dream-roster-kugawara" },
  { match: ["花火屋"], label: "花火屋", kind: "ROSTER", href: "#dream-roster-hanabiya" },
  { match: ["幽々子"], label: "西行寺 幽々子", kind: "ROSTER", href: "#dream-roster-yuyuko" },
  { match: ["妖夢"], label: "魂魄 妖夢", kind: "ROSTER", href: "#dream-roster-youmu" },
  { match: ["さとり"], label: "古明地 さとり", kind: "ROSTER", href: "#dream-roster-satori" },
  { match: ["こいし"], label: "古明地 こいし", kind: "ROSTER", href: "#dream-roster-koishi" },
  {
    match: ["ヴァルトマン"],
    label: "ヴァルトマン",
    kind: "ROSTER",
    href: "#dream-roster-waldmann",
  },
] as const;

type ChapterCastLink = {
  match: readonly string[];
  label: string;
  kind: string;
  href: string;
};

const ROSTER_PREFIX = "#dream-roster-";
const ROSTER_IDS = new Set(DREAM_CAST_ROSTER.map((entry) => entry.id));

/** A cast chip lands on its roster plate when the roster files that person;
    otherwise on the first canonical event of this chapter they appear in, so
    no chip ever points at an id the page does not render. */
function resolveChapterCastLink(
  entry: ChapterCastLink,
  events: readonly DreamChronicleEvent[],
): ChapterCastLink | null {
  if (!entry.href.startsWith(ROSTER_PREFIX)) return entry;
  if (ROSTER_IDS.has(entry.href.slice(ROSTER_PREFIX.length))) return entry;
  const event = events.find((item) =>
    item.cast.some((member) => entry.match.some((keyword) => member.includes(keyword))),
  );
  return event ? { ...entry, kind: "EVENT", href: `#dream-chronicle-event-${event.no}` } : null;
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
  const toggleAllCases = (nextOpen: boolean) => {
    const page = navRef.current?.closest(".dream-page");
    if (!page) return;
    const folds = page.querySelectorAll<HTMLDetailsElement>(".dream-story-case");
    folds.forEach((fold) => {
      fold.open = nextOpen;
    });
    setLocation((current) => ({
      ...current,
      open: nextOpen ? DREAM_CASES.map((episode) => episode.no) : [],
    }));
  };
  const allOpen = location.open.length === DREAM_CASES.length;
  const anyOpen = location.open.length > 0;

  return (
    <>
      <DreamReaderSupport />
      <nav
        ref={navRef}
        id="dream-chapter-index"
        className="dream-reader-index"
        aria-label="六章の目次"
        tabIndex={-1}
        data-dream-reveal
      >
        <div className="dream-reader-index-head">
          <p>六章を辿る</p>
          <span>CASE 0–5</span>
        </div>
        <ol>
          {DREAM_CASES.map((episode) => {
            const eventCount = DREAM_CHRONICLE.filter((event) => event.case === episode.no).length;
            const charCount = episode.paragraphs.reduce((sum, p) => sum + p.length, 0);
            return (
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
                    <small>
                      {eventCount}件 · {charCount.toLocaleString("ja-JP")}字
                    </small>
                    <small>{location.open.includes(episode.no) ? "開いている" : "あらすじ"}</small>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
        {/* The bulk toggles follow the six links in the focus order (the keyboard
            reaches the chapters first); the sheet sets them as the index's foot,
            so what the eye sees follows the same order. */}
        <div className="dream-reader-index-actions" role="group" aria-label="全章の開閉">
          <button type="button" onClick={() => toggleAllCases(true)} aria-pressed={allOpen}>
            全章を開く
          </button>
          <button type="button" onClick={() => toggleAllCases(false)} disabled={!anyOpen}>
            全章を閉じる
          </button>
        </div>
      </nav>
    </>
  );
}

/** Canonical event titles and places belonging to this case, hidden until requested. */
export function DreamChapterCompanion({ no }: { no: string }) {
  const events = DREAM_CHRONICLE.filter((event) => event.case === no);
  if (!events.length) return null;
  const places = [...new Set(events.map((event) => event.place))];
  const castMembers = events.flatMap((event) => event.cast);
  const appearingCast = CHAPTER_CAST_LINKS.filter((entry) =>
    entry.match.some((keyword) => castMembers.some((member) => member.includes(keyword))),
  ).flatMap((entry) => {
    const resolved = resolveChapterCastLink(entry, events);
    return resolved ? [resolved] : [];
  });

  return (
    <details className="dream-chapter-companion">
      <summary>
        <span>この章の出来事・登場人物</span>
        <small>
          {events.length}件の記録 · {appearingCast.length}名
        </small>
      </summary>
      <div className="dream-chapter-companion-body">
        <p className="dream-chapter-companion-places">
          <span>舞台</span>
          {places.join("・")}
        </p>
        {appearingCast.length ? (
          <div className="dream-chapter-companion-cast" aria-label={`CASE ${no}の主な登場人物`}>
            <span>主な登場人物</span>
            <div>
              {appearingCast.map((person) => (
                <a key={person.href} href={person.href}>
                  <small lang="en">{person.kind}</small>
                  <b>{person.label}</b>
                </a>
              ))}
            </div>
          </div>
        ) : null}
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
