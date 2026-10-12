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

export function DreamRecordExplorer() {
  const [filters, setFilters] = useState({ case: "", person: "", place: "" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const results = useMemo(() => filterDreamRecords(DREAM_CHRONICLE, filters), [filters]);
  const visibleResults = results.slice(0, visibleCount);
  const hasFilters = Boolean(filters.case || filters.person || filters.place);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(PAGE_SIZE);
  };
  const clearFilters = () => {
    setFilters({ case: "", person: "", place: "" });
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section className="dream-record-explorer" aria-labelledby="dream-record-explorer-title">
      <header className="dream-record-explorer-heading">
        <p lang="en">FIELD INDEX / CHRONICLE</p>
        <h3 id="dream-record-explorer-title">記録を探す</h3>
        <span>章・人物・舞台を組み合わせて絞り込む</span>
      </header>

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

      <p className="dream-record-count" role="status" aria-live="polite" aria-atomic="true">
        {results.length}件の記録
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
                    <span>{record.place}</span>
                  </p>
                  <h4>{record.title.text}</h4>
                  <p className="dream-record-excerpt">{dreamRecordExcerpt(record)}</p>
                  <p className="dream-record-cast">
                    <span>人物</span>
                    {record.cast.join("・")}
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
          <button type="button" onClick={clearFilters}>
            条件をクリア
          </button>
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
