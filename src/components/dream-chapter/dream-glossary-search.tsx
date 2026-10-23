import { useId, useRef, useState } from "react";
import { DREAM_GLOSSARY } from "./dream-chapter-data";
import { DREAM_GLOSSARY_SUPPLEMENT } from "./dream-chapter-extra-data";
import {
  buildDreamGlossarySearch,
  dreamGlossaryExcerpt,
  filterDreamGlossarySearch,
  focusDreamGlossaryTerm,
} from "@/lib/dream-glossary-search";
import { dreamRecordHighlight } from "@/lib/dream-record-index";

const ENTRIES = buildDreamGlossarySearch(DREAM_GLOSSARY, DREAM_GLOSSARY_SUPPLEMENT);

function MatchedText({ text, query }: { text: string; query: string }) {
  return dreamRecordHighlight(text, query).map((run, index) =>
    run.match ? <mark key={index}>{run.text}</mark> : run.text,
  );
}

export function DreamGlossarySearch() {
  const id = useId();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = filterDreamGlossarySearch(ENTRIES, query);
  const searching = query.trim().length > 0;
  const clear = () => {
    setQuery("");
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="dream-glossary-search" id="dream-glossary-search">
      <div className="dream-glossary-search-heading">
        <p>言葉を手掛かりに</p>
        <span>用語本文への索引</span>
      </div>
      <form role="search" aria-label="用語集を検索" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={`${id}-query`}>語句・読み・説明から探す</label>
        <div className="dream-glossary-search-field">
          <input
            ref={inputRef}
            id={`${id}-query`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.nativeEvent.isComposing || !query) return;
              event.preventDefault();
              event.stopPropagation();
              clear();
            }}
            autoComplete="off"
            enterKeyHint="search"
            aria-describedby={`${id}-help ${id}-count`}
            aria-controls={`${id}-results`}
            placeholder="例：げんそうきょう、悪夢 恐怖"
          />
          <button type="button" onClick={clear} disabled={!query}>
            検索をクリア
          </button>
        </div>
        <p id={`${id}-help`} className="dream-glossary-search-help">
          ひらがな・カタカナのどちらでも検索できます。空白で区切ると、すべての言葉を含む用語を探せます。
        </p>
      </form>
      <p
        id={`${id}-count`}
        className="dream-glossary-search-count"
        role="status"
        aria-atomic="true"
      >
        {searching
          ? `検索結果 ${results.length} / ${ENTRIES.length} 語`
          : `全 ${ENTRIES.length} 語の索引`}
      </p>
      <nav id={`${id}-results`} className="dream-glossary-jump" aria-label="用語集の索引">
        {results.length ? (
          <ol className="dream-glossary-search-results">
            {results.map((entry) => (
              <li key={entry.href}>
                <a
                  href={entry.href}
                  onClick={(event) => {
                    // The shared fragment handler prevents the default for a
                    // repeat jump. Its stable scroll still needs keyboard focus.
                    const sameFragment =
                      event.currentTarget.ownerDocument.defaultView?.location.hash === entry.href;
                    if (
                      (event.defaultPrevented && !sameFragment) ||
                      event.detail !== 0 ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    focusDreamGlossaryTerm(entry.href.slice(1), event.currentTarget.ownerDocument);
                  }}
                >
                  <span className="dream-glossary-search-number" aria-hidden="true">
                    {String(entry.number).padStart(2, "0")}
                  </span>
                  <span className="dream-glossary-search-word">
                    <strong>
                      <MatchedText text={entry.term} query={query} />
                    </strong>
                    {searching && entry.reading ? (
                      <small>
                        <MatchedText text={entry.reading} query={query} />
                      </small>
                    ) : null}
                    {searching ? (
                      <span className="dream-glossary-search-excerpt">
                        <MatchedText text={dreamGlossaryExcerpt(entry, query)} query={query} />
                      </span>
                    ) : null}
                  </span>
                  <span className="dream-glossary-search-open">
                    本文へ<span aria-hidden="true"> ↗</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <div className="dream-glossary-search-empty">
            <p>一致する用語がありません。言葉を短くするか、別の語句でお試しください。</p>
            <button type="button" onClick={clear}>
              検索をクリアして全語を表示
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
