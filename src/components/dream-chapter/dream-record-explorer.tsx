import { useMemo, useState } from "react";
import {
  DREAM_CAST_ROSTER,
  DREAM_CHARACTERS,
  DREAM_CASES,
  DREAM_DOLMINENCE,
} from "./dream-chapter-data";
import { DREAM_ATLAS, DREAM_CHRONICLE } from "./dream-chapter-extra-data";
import {
  buildDreamRecordOptions,
  dreamRecordExcerpt,
  dreamRecordHighlight,
  filterDreamRecords,
  resolveDreamRecordLinks,
} from "@/lib/dream-record-index";

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
  const results = useMemo(() => filterDreamRecords(DREAM_CHRONICLE, filters), [filters]);
  const caseDistribution = useMemo(() => {
    const baseFilters = { ...filters, case: "" };
    const pool = filterDreamRecords(DREAM_CHRONICLE, baseFilters);
    const maxCount = Math.max(
      1,
      ...DREAM_CASES.map((episode) => pool.filter((item) => item.case === episode.no).length),
    );
    return DREAM_CASES.map((episode) => {
      const count = pool.filter((item) => item.case === episode.no).length;
      return {
        no: episode.no,
        title: episode.title,
        count,
        ratio: Math.round((count / maxCount) * 100),
      };
    });
  }, [filters]);
  const visibleResults = results.slice(0, visibleCount);
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

      <div className="dream-record-filters" aria-label="記録の絞り込み">
        <label>
          <span>章</span>
          <select
            value={filters.case}
            onChange={(event) => updateFilter("case", event.target.value)}
          >
            <option value="">すべての章</option>
            {DREAM_RECORD_OPTIONS.cases.map((no) => {
              const episode = DREAM_CASES.find((item) => item.no === no);
              return (
                <option key={no} value={no}>
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
            onChange={(event) => updateFilter("person", event.target.value)}
          >
            <option value="">すべての人物</option>
            {DREAM_RECORD_OPTIONS.people.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>舞台</span>
          <select
            value={filters.place}
            onChange={(event) => updateFilter("place", event.target.value)}
          >
            <option value="">すべての舞台</option>
            {DREAM_RECORD_OPTIONS.places.map((place) => (
              <option key={place} value={place}>
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

      <p className="dream-record-count" role="status" aria-live="polite" aria-atomic="true">
        {results.length}件の記録 / 全{DREAM_CHRONICLE.length}件
        {results.length > visibleResults.length ? `（${visibleResults.length}件を表示）` : ""}
      </p>

      {results.length ? (
        <ol className="dream-record-results">
          {visibleResults.map((record) => {
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
                  <p className="dream-record-excerpt">
                    {highlighted(dreamRecordExcerpt(record, 132, filters.query))}
                  </p>
                  <p className="dream-record-cast">
                    <span>人物</span>
                    {highlighted(record.cast.join("・"))}
                  </p>
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
          <p>この条件に合う記録はありません。</p>
          <span>言葉を短くするか、章・人物・舞台の条件を外して探し直せます。</span>
          <div>
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
            <button type="button" onClick={clearFilters}>
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
