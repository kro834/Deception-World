import { useEffect, useRef, useState, type RefObject } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { SEARCH_CATEGORIES, SEARCH_DOCUMENTS } from "./search-data";
import { searchDocuments, type SearchResult } from "./search-engine";

const PAGE_SIZE = 24;
const STARTING_QUERIES = ["ゼウス", "月城悠真", "六詠", "エクスプリーム", "Dream"];

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SearchPage({
  query,
  category,
  shown,
  onQueryChange,
  onCategoryChange,
  onShownChange,
}: {
  query: string;
  category: string;
  shown: number;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onShownChange: (value: number) => void;
}) {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(query);
  const composingRef = useRef(false);
  const compositionEndedRef = useRef(-Infinity);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const matching = searchDocuments(SEARCH_DOCUMENTS, query);
  const results =
    category === "all"
      ? matching
      : matching.filter((result) => result.document.category === category);
  const selectedCategory =
    SEARCH_CATEGORIES.find((item) => item.id === category)?.label ?? "すべて";
  useEffect(() => {
    if (!composingRef.current) setDraft(query);
  }, [query]);

  return (
    <div className="world search-page" data-search-page="true">
      <header className="search-topbar">
        <GuardedLink to="/world" assets={[]} className="search-brand">
          DECEPTION WORLD<span>RECORD INDEX</span>
        </GuardedLink>
        <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
      </header>
      <main className="search-main">
        <section className="search-intro" aria-labelledby="search-title">
          <div>
            <p className="search-eyebrow">THE RECORDS / CROSS-REFERENCE</p>
            <h1 id="search-title">
              記録の先へ。<span>資料検索</span>
            </h1>
            <p className="search-lede">
              名前から、物語から、気になる言葉から。
              <br />
              散らばる記録をつなぎ、読みたい場所へ。
            </p>
          </div>
          <div
            className="search-index-mark"
            aria-label={`${SEARCH_DOCUMENTS.length}件の公開資料を検索できます`}
          >
            <span>PUBLIC RECORDS</span>
            <strong>{String(SEARCH_DOCUMENTS.length).padStart(3, "0")}</strong>
            <span>ONE CONNECTED WORLD</span>
          </div>
        </section>

        <section className="search-workbench" aria-label="資料を絞り込む">
          <form
            className="search-form"
            role="search"
            action="/search"
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              if (composingRef.current || performance.now() - compositionEndedRef.current < 50)
                return;
              resultsRef.current?.focus({ preventScroll: true });
              resultsRef.current?.scrollIntoView({ block: "start" });
            }}
          >
            <label htmlFor="record-query">どの記録を探しますか？</label>
            <div className="search-input-row">
              <SearchGlyph />
              <input
                ref={inputRef}
                id="record-query"
                name="q"
                type="search"
                value={draft}
                maxLength={120}
                placeholder="人物名・ライダー名・用語を入力"
                autoComplete="off"
                enterKeyHint="search"
                aria-describedby="record-query-help"
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (!composingRef.current) onQueryChange(event.target.value);
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  composingRef.current = false;
                  compositionEndedRef.current = performance.now();
                  setDraft(event.currentTarget.value);
                  onQueryChange(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (composingRef.current ||
                      event.nativeEvent.isComposing ||
                      event.nativeEvent.keyCode === 229)
                  )
                    event.preventDefault();
                }}
              />
              {query && (
                <button
                  className="search-clear"
                  type="button"
                  aria-label="検索語を消す"
                  onClick={() => {
                    onQueryChange("");
                    inputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
              <button className="search-submit" type="submit">
                検索<span aria-hidden="true">↗</span>
              </button>
            </div>
            {category !== "all" && <input type="hidden" name="category" value={category} />}
            <p id="record-query-help">
              ひらがな・カタカナでも検索できます。複数の言葉はスペースで区切ってください。
            </p>
          </form>
          <div className="search-suggestions" aria-label="検索のヒント">
            <span>例えば</span>
            {STARTING_QUERIES.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  onQueryChange(term);
                  inputRef.current?.focus({ preventScroll: true });
                }}
              >
                {term}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <div className="search-categories" role="group" aria-label="資料の分類">
            {SEARCH_CATEGORIES.map((item) => {
              const count =
                item.id === "all"
                  ? matching.length
                  : matching.filter((result) => result.document.category === item.id).length;
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={category === item.id}
                  onClick={() => onCategoryChange(item.id)}
                >
                  {item.label}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        <SearchResults
          key={`${query}\n${category}`}
          results={results}
          headingRef={resultsRef}
          categoryLabel={selectedCategory}
          query={query}
          limit={shown}
          onShowMore={() => onShownChange(shown + PAGE_SIZE)}
          filtered={category !== "all"}
          onClearCategory={() => onCategoryChange("all")}
          onClearQuery={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
        />
        <p className="search-scope-note">
          公開資料の見出し・紹介文・用語を検索しています。ギャラリーの公開タイトルは、展示室内の検索から探せます。
        </p>
      </main>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}

function SearchResults({
  results,
  headingRef,
  categoryLabel,
  query,
  limit,
  onShowMore,
  filtered,
  onClearCategory,
  onClearQuery,
}: {
  results: SearchResult[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  categoryLabel: string;
  query: string;
  limit: number;
  onShowMore: () => void;
  filtered: boolean;
  onClearCategory: () => void;
  onClearQuery: () => void;
}) {
  return (
    <section className="search-results" aria-labelledby="record-results-heading">
      <div className="search-results-heading">
        <h2 id="record-results-heading" ref={headingRef} tabIndex={-1}>
          {query.trim() ? "検索結果" : "公開資料の索引"}
          <span>{categoryLabel}</span>
        </h2>
        <p role="status" aria-live="polite" aria-atomic="true">
          <strong>{results.length}</strong> 件{query.trim() && <span>「{query.trim()}」</span>}
        </p>
      </div>
      {results.length ? (
        <>
          <ol className="search-result-grid">
            {results.slice(0, limit).map(({ document, snippet }, index) => (
              <li key={document.id}>
                <GuardedLink
                  to={document.to}
                  hash={document.hash}
                  assets={[]}
                  className="search-result-card"
                >
                  <div className="search-result-meta">
                    <span>
                      {SEARCH_CATEGORIES.find((item) => item.id === document.category)?.label}
                    </span>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3>
                    <DisplayName value={document.title} />
                  </h3>
                  <p>{snippet}</p>
                  <span className="search-result-open">
                    {document.hash ? "該当箇所を読む" : "資料を読む"}
                    <span aria-hidden="true">↗</span>
                  </span>
                </GuardedLink>
              </li>
            ))}
          </ol>
          {limit < results.length && (
            <button type="button" className="search-more" onClick={onShowMore}>
              さらに {Math.min(PAGE_SIZE, results.length - limit)} 件を表示
              <span>
                {Math.min(limit, results.length)} / {results.length}
              </span>
            </button>
          )}
        </>
      ) : (
        <div className="search-empty">
          <SearchGlyph />
          <h3>一致する資料が見つかりませんでした。</h3>
          <p>
            名前の一部や短い言葉で探してみてください。分類を解除すると、ほかの資料も検索できます。
          </p>
          <div>
            {filtered && (
              <button type="button" onClick={onClearCategory}>
                すべての分類で探す
              </button>
            )}
            {query && (
              <button type="button" onClick={onClearQuery}>
                検索語を消す
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
