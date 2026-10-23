import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DREAM_CAST_ROSTER,
  DREAM_CHARACTERS,
  DREAM_CASES,
  DREAM_DOLMINENCE,
} from "./dream-chapter-data";
import { DREAM_ATLAS, DREAM_CHRONICLE } from "./dream-chapter-extra-data";
import {
  buildDreamRecordOptions,
  buildDreamRecordFacets,
  dreamRecordExcerpt,
  dreamRecordHighlight,
  dreamRecordNeighbours,
  filterDreamRecords,
  resolveDreamRecordLinks,
} from "@/lib/dream-record-index";
import {
  createDreamRecordCollection,
  dreamRecordCollectionFocus,
  watchDreamRecordCollection,
  type DreamRecordCollectionState,
} from "@/lib/dream-record-collection.js";

const PAGE_SIZE = 8;

const DREAM_RECORD_PEOPLE = [
  ...DREAM_CHARACTERS.map((person) => ({
    name: person.name,
    href: `#dream-character-${person.id}`,
  })),
  ...DREAM_CAST_ROSTER.map((person) => ({ name: person.name, href: `#dream-roster-${person.id}` })),
  ...DREAM_DOLMINENCE.map((person) => ({
    name: person.name,
    href: `#dream-dolminence-${person.id}`,
  })),
];

const DREAM_RECORD_OPTIONS = buildDreamRecordOptions(DREAM_CHRONICLE);
const DREAM_RECORD_IDS = DREAM_CHRONICLE.map((record) => record.no);

const DREAM_RECORD_QUICK_TAGS = [
  "悪夢",
  "ベルベットルーム",
  "サードアイ",
  "ロードナイト",
  "博麗神社",
  "永遠亭",
  "十二神将",
  "ディルクルム",
] as const;

export function DreamRecordExplorer() {
  const [filters, setFilters] = useState({ query: "", case: "", person: "", place: "" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [savedOnly, setSavedOnly] = useState(false);
  const savedOnlyRef = useRef(savedOnly);
  savedOnlyRef.current = savedOnly;
  const [collection, setCollection] = useState<DreamRecordCollectionState>({
    ids: [],
    available: true,
  });
  const [collectionReady, setCollectionReady] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState("");
  const collectionRef = useRef<ReturnType<typeof createDreamRecordCollection> | null>(null);
  const savedViewRef = useRef<HTMLButtonElement>(null);
  const resultCountRef = useRef<HTMLParagraphElement>(null);
  const saveButtons = useRef(new Map<number, HTMLButtonElement>());
  const pendingFocus = useRef<number | "collection" | "results" | null>(null);
  useEffect(() => {
    const current = createDreamRecordCollection(DREAM_RECORD_IDS, window);
    collectionRef.current = current;
    setCollection(current.snapshot());
    setCollectionReady(true);
    const stopWatching = watchDreamRecordCollection(
      current,
      (next) => {
        if (savedOnlyRef.current) {
          const rendered = [...saveButtons.current.entries()];
          const focused = rendered.findIndex(([, button]) =>
            button.closest(".dream-record-card")?.contains(document.activeElement),
          );
          if (focused >= 0 && !next.ids.includes(rendered[focused][0])) {
            const neighbors = [
              ...rendered.slice(focused + 1),
              ...rendered.slice(0, focused).reverse(),
            ];
            pendingFocus.current =
              neighbors.find(([id]) => next.ids.includes(id))?.[0] ?? "collection";
          }
        }
        setCollection(next);
      },
      window,
    );
    return () => {
      stopWatching();
      collectionRef.current = null;
    };
  }, []);
  const savedIds = useMemo(() => new Set(collection.ids), [collection.ids]);
  const facets = useMemo(
    () =>
      buildDreamRecordFacets(
        savedOnly ? DREAM_CHRONICLE.filter((record) => savedIds.has(record.no)) : DREAM_CHRONICLE,
        filters,
      ),
    [filters, savedOnly, savedIds],
  );
  const results = useMemo(
    () =>
      filterDreamRecords(DREAM_CHRONICLE, filters).filter(
        (record) => !savedOnly || savedIds.has(record.no),
      ),
    [filters, savedOnly, savedIds],
  );
  const caseDistribution = useMemo(() => {
    const maxCount = Math.max(1, ...Object.values(facets.cases));
    return DREAM_CASES.map((episode) => {
      const count = facets.cases[episode.no] ?? 0;
      return {
        no: episode.no,
        title: episode.title,
        count,
        ratio: Math.round((count / maxCount) * 100),
      };
    });
  }, [facets]);
  const visibleResults = results.slice(0, visibleCount);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "results") {
      resultCountRef.current?.focus({ preventScroll: true });
      resultCountRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    } else {
      const element = typeof target === "number" ? saveButtons.current.get(target) : null;
      const destination = element ?? savedViewRef.current;
      destination?.focus({ preventScroll: true });
      destination?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [results, visibleCount]);
  const hasFacets = Boolean(filters.case || filters.person || filters.place);
  const hasQuery = Boolean(filters.query.trim());
  const hasFilters = hasQuery || hasFacets;
  const activeFilters = [
    { key: "query", label: "キーワード", value: filters.query.trim() },
    { key: "case", label: "章", value: filters.case ? `CASE ${filters.case}` : "" },
    { key: "person", label: "人物", value: filters.person },
    { key: "place", label: "舞台", value: filters.place },
  ] as const;
  const highlighted = (text: string) =>
    dreamRecordHighlight(text, filters.query).map((run, index) =>
      run.match ? <mark key={index}>{run.text}</mark> : run.text,
    );

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(PAGE_SIZE);
  };
  const clearFilters = () => {
    setFilters({ query: "", case: "", person: "", place: "" });
    setVisibleCount(PAGE_SIZE);
  };
  const clearFacets = () => {
    setFilters((current) => ({ ...current, case: "", person: "", place: "" }));
    setVisibleCount(PAGE_SIZE);
  };
  const toggleSaved = (record: (typeof DREAM_CHRONICLE)[number]) => {
    const current = collectionRef.current;
    if (!current) return;
    const removing = savedIds.has(record.no);
    if (removing && savedOnly) {
      pendingFocus.current =
        dreamRecordCollectionFocus(
          visibleResults.map((item) => item.no),
          record.no,
        ) ?? "collection";
    }
    const next = current.setSaved(record.no, !removing);
    setCollection(next);
    setCollectionMessage(
      removing
        ? `「${record.title.text}」を手控えから外しました。`
        : `「${record.title.text}」を${next.available ? "手控えに保存しました。" : "このページの間だけ手控えに残しました。"}`,
    );
  };
  const followClue = (key: "person" | "place", value: string) => {
    setFilters({ query: "", case: "", person: "", place: "", [key]: value });
    setSavedOnly(false);
    setVisibleCount(PAGE_SIZE);
    pendingFocus.current = "results";
  };

  return (
    <section
      id="dream-record-explorer"
      className="dream-record-explorer"
      aria-labelledby="dream-record-explorer-title"
      tabIndex={-1}
      data-dream-reveal
    >
      <header className="dream-record-explorer-heading">
        <p lang="en">FIELD INDEX / CHRONICLE</p>
        <h3 id="dream-record-explorer-title">記録を探す</h3>
        <span>全{DREAM_CHRONICLE.length}件の出来事から、言葉と手掛かりを辿る</span>
      </header>

      <div className="dream-record-collection" aria-labelledby="dream-record-collection-title">
        <div className="dream-record-collection-heading">
          <h4 id="dream-record-collection-title">記録の手控え</h4>
          <span>{collectionReady ? `${collection.ids.length}件` : "準備中"}</span>
        </div>
        <p>気になる出来事を残して、あとから辿れます。手控えはこのブラウザーだけに保存されます。</p>
        <div className="dream-record-collection-views" role="group" aria-label="記録の表示範囲">
          <button
            type="button"
            aria-pressed={!savedOnly}
            onClick={() => {
              setSavedOnly(false);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            すべての記録
          </button>
          <button
            ref={savedViewRef}
            type="button"
            aria-pressed={savedOnly}
            disabled={!collectionReady}
            onClick={() => {
              setSavedOnly(true);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            手控えを見る（{collection.ids.length}件）
          </button>
        </div>
        {!collection.available ? (
          <p className="dream-record-collection-warning">
            この環境では保存できません。手控えはこのページを離れると消えます。
          </p>
        ) : null}
        <p
          className="dream-record-collection-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {collectionMessage}
        </p>
      </div>

      <div className="dream-record-search">
        <label htmlFor="dream-record-query">記録の中の言葉を探す</label>
        <div className="dream-record-search-field">
          <span aria-hidden="true">⌕</span>
          <input
            id="dream-record-query"
            type="search"
            value={filters.query}
            onChange={(event) => updateFilter("query", event.target.value)}
            placeholder="人物の名前、場所、台詞の一節…"
            aria-describedby="dream-record-search-help"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p id="dream-record-search-help">
          見出し・本文・人物・舞台を検索。空白で区切ると、すべての言葉を含む記録に絞ります。
        </p>
        <div className="dream-record-quick-tags" role="group" aria-label="注目キーワード">
          <span className="dream-record-quick-label">注目語句</span>
          {DREAM_RECORD_QUICK_TAGS.map((tag) => {
            const active = filters.query.trim() === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => updateFilter("query", active ? "" : tag)}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      </div>

      <p className="dream-record-facet-help" id="dream-record-facet-help">
        件数は、ほかの条件を保って選んだときの記録数です。
        {savedOnly ? "手控えの中から数えています。" : ""}
      </p>
      <div className="dream-record-filters" aria-label="記録の絞り込み">
        <label>
          <span>章</span>
          <select
            value={filters.case}
            aria-describedby="dream-record-facet-help"
            onChange={(event) => updateFilter("case", event.target.value)}
          >
            <option value="">すべての章</option>
            {DREAM_RECORD_OPTIONS.cases.map((no) => {
              const episode = DREAM_CASES.find((item) => item.no === no);
              return (
                <option
                  key={no}
                  value={no}
                  label={`CASE ${no}「${episode?.title ?? ""}」（${facets.cases[no] ?? 0}件）`}
                  aria-label={`CASE ${no}「${episode?.title ?? ""}」（${facets.cases[no] ?? 0}件）`}
                >
                  CASE {no}「{episode?.title ?? ""}」
                </option>
              );
            })}
          </select>
        </label>
        <label>
          <span>人物</span>
          <select
            value={filters.person}
            aria-describedby="dream-record-facet-help"
            onChange={(event) => updateFilter("person", event.target.value)}
          >
            <option value="">すべての人物</option>
            {DREAM_RECORD_OPTIONS.people.map((person) => (
              <option
                key={person}
                value={person}
                label={`${person}（${facets.people[person] ?? 0}件）`}
                aria-label={`${person}（${facets.people[person] ?? 0}件）`}
              >
                {person}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>舞台</span>
          <select
            value={filters.place}
            aria-describedby="dream-record-facet-help"
            onChange={(event) => updateFilter("place", event.target.value)}
          >
            <option value="">すべての舞台</option>
            {DREAM_RECORD_OPTIONS.places.map((place) => (
              <option
                key={place}
                value={place}
                label={`${place}（${facets.places[place] ?? 0}件）`}
                aria-label={`${place}（${facets.places[place] ?? 0}件）`}
              >
                {place}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={clearFilters} disabled={!hasFilters}>
          条件をクリア
        </button>
      </div>

      <div className="dream-record-telemetry" role="group" aria-label="章別の記録件数">
        {caseDistribution.map((item) => {
          const selected = filters.case === item.no;
          return (
            <button
              key={item.no}
              type="button"
              className="dream-record-telemetry-bar"
              aria-pressed={selected}
              onClick={() => updateFilter("case", selected ? "" : item.no)}
            >
              <span className="dream-record-telemetry-head">
                <small lang="en">CASE {item.no}</small>
                <strong>{item.count}件</strong>
              </span>
              <span className="dream-record-telemetry-title">{item.title}</span>
              <span className="dream-record-telemetry-track" aria-hidden="true">
                <i style={{ width: `${item.ratio}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {hasFilters ? (
        <ul className="dream-record-active-filters" aria-label="検索中の条件">
          {activeFilters
            .filter((filter) => filter.value)
            .map((filter) => (
              <li key={filter.key}>
                <button
                  type="button"
                  onClick={() => updateFilter(filter.key, "")}
                  aria-label={`${filter.label}「${filter.value}」の条件を外す`}
                >
                  <span>{filter.label}</span>
                  <b>{filter.value}</b>
                  <i aria-hidden="true">×</i>
                </button>
              </li>
            ))}
        </ul>
      ) : null}

      <p
        ref={resultCountRef}
        tabIndex={-1}
        className="dream-record-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {results.length}件の記録 / 全{DREAM_CHRONICLE.length}件
        {savedOnly ? "（手控えの中から表示）" : ""}
        {results.length > visibleResults.length ? `（${visibleResults.length}件を表示）` : ""}
      </p>

      {results.length ? (
        <ol className="dream-record-results">
          {visibleResults.map((record) => {
            const neighbours = dreamRecordNeighbours(DREAM_CHRONICLE, record.no);
            const links = resolveDreamRecordLinks(record, {
              cases: DREAM_CASES,
              places: DREAM_ATLAS,
              people: DREAM_RECORD_PEOPLE,
            });
            return (
              <li key={record.no}>
                <article className="dream-record-card">
                  <p className="dream-record-meta">
                    <span>CASE {record.case}</span>
                    <span>{highlighted(record.place)}</span>
                  </p>
                  <h4>{highlighted(record.title.text)}</h4>
                  <button
                    ref={(element) => {
                      if (element) saveButtons.current.set(record.no, element);
                      else saveButtons.current.delete(record.no);
                    }}
                    type="button"
                    className="dream-record-save"
                    disabled={!collectionReady}
                    aria-pressed={savedIds.has(record.no)}
                    aria-label={`${record.title.text}：${savedIds.has(record.no) ? "手控えから外す" : "手控えに残す"}`}
                    onClick={() => toggleSaved(record)}
                  >
                    <span aria-hidden="true">{savedIds.has(record.no) ? "✓" : "＋"}</span>
                    {savedIds.has(record.no) ? "手控えに記録済み · 外す" : "手控えに残す"}
                  </button>
                  <p className="dream-record-excerpt">
                    {highlighted(dreamRecordExcerpt(record, 132, filters.query))}
                  </p>
                  <p className="dream-record-cast">
                    <span>人物</span>
                    {highlighted(record.cast.join("・"))}
                  </p>
                  <details className="dream-record-reading">
                    <summary>
                      本文をこの場で読む
                      <span aria-hidden="true" />
                    </summary>
                    <div className="dream-record-reading-body">
                      {record.segments ? (
                        record.segments.map((segment, index) => (
                          <p key={index}>
                            {segment.by ? (
                              <b className="dream-record-speaker">{segment.by}</b>
                            ) : null}
                            {highlighted(segment.text)}
                          </p>
                        ))
                      ) : (
                        <>
                          {record.text.split("\n").map((line, index) => (
                            <p key={index}>{highlighted(line)}</p>
                          ))}
                          {record.by ? <p className="dream-record-speaker">{record.by}</p> : null}
                        </>
                      )}
                      <div
                        className="dream-record-context"
                        role="navigation"
                        aria-label={`${record.title.text}の前後の出来事`}
                      >
                        <p>出来事全体の前後を辿る</p>
                        {neighbours.previous ? (
                          <a href={`#dream-chronicle-event-${neighbours.previous.no}`} rel="prev">
                            <small>前の記録 · CASE {neighbours.previous.case}</small>
                            <span>{neighbours.previous.title.text}</span>
                          </a>
                        ) : null}
                        {neighbours.next ? (
                          <a href={`#dream-chronicle-event-${neighbours.next.no}`} rel="next">
                            <small>次の記録 · CASE {neighbours.next.case}</small>
                            <span>{neighbours.next.title.text}</span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </details>
                  <details className="dream-record-clues">
                    <summary>人物・舞台からほかの記録を探す</summary>
                    <div>
                      <button type="button" onClick={() => followClue("place", record.place)}>
                        舞台：{record.place}
                      </button>
                      {record.cast.map((person) => (
                        <button
                          key={person}
                          type="button"
                          onClick={() => followClue("person", person)}
                        >
                          人物：{person}
                        </button>
                      ))}
                    </div>
                  </details>
                  <nav aria-label={`${record.title.text}の関連記録`}>
                    {links.chronicleHref ? <a href={links.chronicleHref}>出来事を読む</a> : null}
                    {links.synopsisHref ? (
                      <a href={links.synopsisHref}>CASE {record.case}のあらすじ</a>
                    ) : null}
                    {links.placeHref ? (
                      <a href={links.placeHref}>舞台記録：{record.place}</a>
                    ) : null}
                    {links.people.map((person) => (
                      <a key={`${record.no}-${person.name}`} href={person.href}>
                        人物資料：{person.name}
                      </a>
                    ))}
                  </nav>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="dream-record-empty">
          <p>
            {savedOnly && !collection.ids.length
              ? "手控えにはまだ記録がありません。"
              : "この条件に合う記録はありません。"}
          </p>
          <span>
            {savedOnly && !collection.ids.length
              ? "すべての記録から「手控えに残す」を選ぶと、ここから再訪できます。"
              : "言葉を短くするか、章・人物・舞台の条件を外して探し直せます。"}
          </span>
          <div>
            {savedOnly ? (
              <button
                type="button"
                onClick={() => {
                  setSavedOnly(false);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                すべての記録へ戻る
              </button>
            ) : null}
            {hasQuery && hasFacets ? (
              <>
                <button type="button" onClick={() => updateFilter("query", "")}>
                  キーワードを外す
                </button>
                <button type="button" onClick={clearFacets}>
                  章・人物・舞台を外す
                </button>
              </>
            ) : null}
            <button type="button" onClick={clearFilters} disabled={!hasFilters}>
              条件をクリア
            </button>
          </div>
        </div>
      )}

      {results.length > visibleResults.length ? (
        <button
          className="dream-record-more"
          type="button"
          onClick={() => setVisibleCount((count) => Math.min(results.length, count + PAGE_SIZE))}
        >
          続きを表示（残り{results.length - visibleResults.length}件）
        </button>
      ) : null}
    </section>
  );
}
