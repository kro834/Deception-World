import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { GuardedLink } from "@/components/load-gate";
import { RecordArtFrame } from "@/components/library/record-art";
import { documentArt } from "@/lib/record-art";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { SEARCH_CATEGORIES, SEARCH_DOCUMENTS } from "./search-data";
import {
  groupSearchResults,
  searchDocuments,
  suggestSearchQueries,
  type SearchResult,
} from "./search-engine";
import { clearRecentSearches, rememberSearch, useRecentSearches } from "./search-recent";
import { Highlighted, HighlightedName, ResultOption } from "./search-ui";
import { placeLabel, stepActive } from "./search-ui-helpers";
import { useOpenResult } from "./use-open-result";

const PAGE_SIZE = 24;
const GROUP_PREVIEW = 4;
const BROWSE_PREVIEW = 6;
const URL_DELAY_MS = 280;
const STARTING_QUERIES = ["ゼウス", "月城悠真", "六詠", "エクスプリーム", "Dream"];
const CATEGORY_ORDER = SEARCH_CATEGORIES.slice(1).map((item) => item.id as string);

// Each record's place in the index, printed on its card as a file number.
const RECORD_NUMBER = new Map(SEARCH_DOCUMENTS.map((document, index) => [document.id, index + 1]));

const categoryLabel = (id: string) => SEARCH_CATEGORIES.find((item) => item.id === id)?.label ?? "";
const categoryCode = (id: string) => SEARCH_CATEGORIES.find((item) => item.id === id)?.code ?? "";

type Option =
  | { kind: "result"; id: string; result: SearchResult }
  | { kind: "more"; id: string; category: string; count: number };

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
  const [active, setActive] = useState(-1);
  const [composing, setComposing] = useState(false);
  const compositionEndedRef = useRef(-Infinity);
  const writtenRef = useRef(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const listboxId = useId().replace(/:/g, "") + "-records";
  const recent = useRecentSearches();
  const openResult = useOpenResult();
  const onQueryChangeRef = useRef(onQueryChange);
  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  });

  // Results follow the field as it is typed; React may skip stale renders.
  const typed = useDeferredValue(draft);
  const trimmed = typed.trim();
  const all = useMemo(() => searchDocuments(SEARCH_DOCUMENTS, typed), [typed]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const result of all)
      map.set(result.document.category, (map.get(result.document.category) ?? 0) + 1);
    return map;
  }, [all]);
  const filtered = category === "all" ? all : all.filter((r) => r.document.category === category);
  const suggestions = useMemo(
    () => (trimmed && !all.length ? suggestSearchQueries(SEARCH_DOCUMENTS, trimmed) : []),
    [all.length, trimmed],
  );

  const { groups, options } = useMemo(() => {
    const list: Option[] = [];
    const sections: { category: string; total: number; items: Option[] }[] = [];
    if (category === "all") {
      for (const group of groupSearchResults(all, CATEGORY_ORDER, Boolean(trimmed))) {
        const limit = trimmed ? GROUP_PREVIEW : BROWSE_PREVIEW;
        const items: Option[] = group.results.slice(0, limit).map((result) => ({
          kind: "result",
          id: `${listboxId}-${result.document.id}`,
          result,
        }));
        if (group.results.length > limit)
          items.push({
            kind: "more",
            id: `${listboxId}-more-${group.category}`,
            category: group.category,
            count: group.results.length,
          });
        sections.push({ category: group.category, total: group.results.length, items });
        list.push(...items);
      }
    } else {
      const items: Option[] = filtered.slice(0, shown).map((result) => ({
        kind: "result",
        id: `${listboxId}-${result.document.id}`,
        result,
      }));
      if (items.length) sections.push({ category, total: filtered.length, items });
      list.push(...items);
    }
    return { groups: sections, options: list };
  }, [all, category, filtered, listboxId, shown, trimmed]);

  // A new query or kind starts again from the field.
  useEffect(() => setActive(-1), [typed, category]);

  // Back/Forward or a link changed ?q=: show it. Our own writes are skipped.
  useEffect(() => {
    if (query === writtenRef.current) return;
    writtenRef.current = query;
    setDraft(query);
  }, [query]);

  // Keep ?q= in step with the field, after a pause in typing.
  useEffect(() => {
    if (composing || draft === writtenRef.current) return;
    const timer = window.setTimeout(() => {
      writtenRef.current = draft;
      onQueryChangeRef.current(draft);
    }, URL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [composing, draft]);

  const flushQuery = () => {
    if (draft !== writtenRef.current) {
      writtenRef.current = draft;
      onQueryChange(draft);
    }
  };

  const activeOption = active >= 0 ? options[active] : undefined;
  useEffect(() => {
    if (!activeOption) return;
    document.getElementById(activeOption.id)?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  const setQuery = (value: string, focus = true) => {
    setDraft(value);
    writtenRef.current = value;
    onQueryChange(value);
    if (focus) inputRef.current?.focus({ preventScroll: true });
  };

  const open = (result: SearchResult, fromKeyboard: boolean) => {
    if (draft.trim()) rememberSearch(draft);
    flushQuery();
    openResult(result, fromKeyboard);
  };

  // Cards keep one handler, so moving the active option re-renders two cards.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const openStable = useCallback(
    (result: SearchResult, fromKeyboard: boolean) => openRef.current(result, fromKeyboard),
    [],
  );

  const choose = (option: Option, fromKeyboard: boolean) => {
    if (option.kind === "more") {
      onCategoryChange(option.category);
      inputRef.current?.focus({ preventScroll: true });
    } else open(option.result, fromKeyboard);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const native = event.nativeEvent;
    if (composing || native.isComposing || native.keyCode === 229) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        stepActive(current, options.length, event.key === "ArrowDown" ? 1 : -1),
      );
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      choose(activeOption, true);
    } else if (event.key === "Escape") {
      if (active >= 0) {
        event.preventDefault();
        setActive(-1);
      } else if (draft) {
        event.preventDefault();
        setQuery("");
      }
    }
  };

  const selectedLabel = categoryLabel(category) || "すべて";
  const total = category === "all" ? all.length : filtered.length;

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
            <span>RECORDS</span>
            <strong>{String(SEARCH_DOCUMENTS.length).padStart(3, "0")}</strong>
            <span className="search-index-wide">ONE CONNECTED WORLD</span>
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
              if (composing || performance.now() - compositionEndedRef.current < 50) return;
              if (draft.trim()) rememberSearch(draft);
              flushQuery();
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
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeOption?.id}
                value={draft}
                maxLength={120}
                placeholder="人物名・ライダー名・用語を入力"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-describedby="record-query-help"
                onChange={(event) => setDraft(event.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={(event) => {
                  setComposing(false);
                  compositionEndedRef.current = performance.now();
                  setDraft(event.currentTarget.value);
                }}
                onKeyDown={onKeyDown}
              />
              {draft && (
                <button
                  className="search-clear"
                  type="button"
                  aria-label="検索語を消す"
                  onClick={() => setQuery("")}
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
              ひらがな・カタカナ・ローマ字でも検索できます。複数の言葉はスペースで区切ってください。
              <span className="search-key-hint">↑↓で選んでEnterで開く。Escで消去。</span>
            </p>
          </form>
          {recent.length ? (
            <div className="search-suggestions search-recent" aria-label="最近の検索">
              <span>最近の検索</span>
              {recent.map((term) => (
                <button key={term} type="button" onClick={() => setQuery(term)}>
                  {term}
                </button>
              ))}
              <button type="button" className="search-recent-clear" onClick={clearRecentSearches}>
                履歴を消す
              </button>
            </div>
          ) : (
            <div className="search-suggestions" aria-label="検索のヒント">
              <span>例えば</span>
              {STARTING_QUERIES.map((term) => (
                <button key={term} type="button" onClick={() => setQuery(term)}>
                  {term}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          )}
          <div className="search-categories" role="group" aria-label="資料の分類">
            {SEARCH_CATEGORIES.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => onCategoryChange(item.id)}
              >
                {item.label}
                <span>{item.id === "all" ? all.length : (counts.get(item.id) ?? 0)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="search-results" aria-labelledby="record-results-heading">
          <div className="search-results-heading">
            <h2 id="record-results-heading" ref={resultsRef} tabIndex={-1}>
              {trimmed ? "検索結果" : "公開資料の索引"}
              <span>{selectedLabel}</span>
            </h2>
            <p role="status" aria-live="polite" aria-atomic="true">
              <strong>{total}</strong> 件{trimmed && <span>「{trimmed}」</span>}
            </p>
          </div>
          <div
            id={listboxId}
            role="listbox"
            aria-label={trimmed ? `「${trimmed}」の検索結果` : "公開資料の索引"}
            className="search-groups"
            hidden={!options.length}
          >
            {groups.map((group) => (
              <div
                key={group.category}
                role="group"
                aria-labelledby={`${listboxId}-${group.category}-label`}
                className="search-group"
                data-category={group.category}
              >
                <div className="search-group-head" role="presentation">
                  <span id={`${listboxId}-${group.category}-label`}>
                    {categoryLabel(group.category)}
                  </span>
                  <i aria-hidden="true">{categoryCode(group.category)}</i>
                  <b>{group.total}</b>
                </div>
                <div className="search-result-grid" role="presentation">
                  {group.items.map((option) =>
                    option.kind === "more" ? (
                      <a
                        key={option.id}
                        id={option.id}
                        role="option"
                        aria-selected={activeOption?.id === option.id}
                        data-active={activeOption?.id === option.id ? "true" : undefined}
                        tabIndex={-1}
                        href={`/search?${new URLSearchParams({
                          ...(trimmed ? { q: trimmed } : {}),
                          category: option.category,
                        })}`}
                        className="search-more-option"
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                            return;
                          event.preventDefault();
                          choose(option, event.detail === 0);
                        }}
                      >
                        <span>{categoryLabel(option.category)}をすべて見る</span>
                        <b>{option.count}件</b>
                      </a>
                    ) : (
                      <ResultCard
                        key={option.id}
                        option={option}
                        active={activeOption?.id === option.id}
                        onOpen={openStable}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
          {category !== "all" && shown < filtered.length ? (
            <button
              type="button"
              className="search-more"
              onClick={() => onShownChange(shown + PAGE_SIZE)}
            >
              さらに {Math.min(PAGE_SIZE, filtered.length - shown)} 件を表示
              <span>
                {Math.min(shown, filtered.length)} / {filtered.length}
              </span>
            </button>
          ) : null}
          {!options.length ? (
            <EmptyState
              query={trimmed}
              filtered={category !== "all"}
              elsewhere={all.length}
              suggestions={suggestions}
              onSuggest={setQuery}
              onClearCategory={() => onCategoryChange("all")}
              onClearQuery={() => setQuery("")}
            />
          ) : null}
        </section>
        <p className="search-scope-note">
          公開資料の見出し・紹介文・本文・用語を検索しています。ギャラリーの公開タイトルは、展示室内の検索から探せます。
        </p>
      </main>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}

const ResultCard = memo(function ResultCard({
  option,
  active,
  onOpen,
}: {
  option: Extract<Option, { kind: "result" }>;
  active: boolean;
  onOpen: (result: SearchResult, fromKeyboard: boolean) => void;
}) {
  const { result } = option;
  const { document } = result;
  const place = placeLabel(document);
  return (
    <ResultOption
      result={result}
      id={option.id}
      active={active}
      className="search-result-card"
      onOpen={onOpen}
    >
      <RecordArtFrame
        art={documentArt(document, RECORD_NUMBER.get(document.id) ?? 0)}
        title={document.title}
      />
      <span className="search-result-meta">
        <span>{categoryLabel(document.category)}</span>
        {place ? <span>{place}</span> : null}
      </span>
      <span className="search-result-title">
        <HighlightedName text={document.title} ranges={result.titleRanges} />
      </span>
      {result.via ? <span className="search-result-via">{result.via}</span> : null}
      {result.section ? <span className="search-result-section">{result.section}</span> : null}
      <span className="search-result-snippet">
        <Highlighted text={result.snippet} ranges={result.snippetRanges} />
      </span>
      <span className="search-result-open">
        {result.section ? "この章を読む" : result.hash ? "該当箇所を読む" : "資料を読む"}
        <span aria-hidden="true">↗</span>
      </span>
    </ResultOption>
  );
});

function EmptyState({
  query,
  filtered,
  elsewhere,
  suggestions,
  onSuggest,
  onClearCategory,
  onClearQuery,
}: {
  query: string;
  filtered: boolean;
  elsewhere: number;
  suggestions: readonly string[];
  onSuggest: (value: string) => void;
  onClearCategory: () => void;
  onClearQuery: () => void;
}) {
  return (
    <div className="search-empty">
      <SearchGlyph />
      <h3>一致する資料が見つかりませんでした。</h3>
      {suggestions.length ? (
        <div className="search-close-matches">
          <p>もしかして</p>
          <div>
            {suggestions.map((term) => (
              <button key={term} type="button" onClick={() => onSuggest(term)}>
                {term}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p>名前の一部や短い言葉で探してみてください。分類を解除すると、ほかの資料も検索できます。</p>
      <div>
        {filtered && elsewhere ? (
          <button type="button" onClick={onClearCategory}>
            すべての分類で探す（{elsewhere}件）
          </button>
        ) : filtered ? (
          <button type="button" onClick={onClearCategory}>
            すべての分類で探す
          </button>
        ) : null}
        {query ? (
          <button type="button" onClick={onClearQuery}>
            検索語を消す
          </button>
        ) : null}
      </div>
    </div>
  );
}
