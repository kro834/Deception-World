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
      <form role="search" aria-label="用語集を検索" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={`${id}-query`}>
          <svg
            className="dream-glossary-search-crest"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M13.5 6.2V5.3a1.8 1.8 0 0 0-1.8-1.8H5.5a1.8 1.8 0 0 0-1.8 1.8v14.2l4.9-2.9 4.9 2.9v-5.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="15.8"
              cy="10.2"
              r="3.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M18.6 13l3.1 3.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          語句・読み・説明から探す
        </label>
        <div className="dream-glossary-search-field">
          <div className="dream-glossary-search-input-wrap" data-has-query={query ? "true" : undefined}>
            <svg
              className="dream-glossary-search-loupe"
              viewBox="0 0 20 20"
              width="18"
              height="18"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="8.6"
                cy="8.6"
                r="5.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
              />
              <path
                d="M6.4 6.7a3.1 3.1 0 0 1 3.6-.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <path
                d="M12.6 12.6l4.1 4.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
              />
            </svg>
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
            {query ? (
              <span className="dream-glossary-search-esc" aria-hidden="true">
                Esc
              </span>
            ) : null}
          </div>
          <button type="button" onClick={clear} disabled={!query}>
            検索をクリア
          </button>
        </div>
        {/* How the field matches stays with it for assistive tech; the placeholder
            shows it to the eye (Owner, 2026-10-23). */}
        <p id={`${id}-help`} className="dream-glossary-search-help dream-visually-hidden">
          ひらがな・カタカナのどちらでも検索できます。空白で区切ると、すべての言葉を含む用語を探せます。
        </p>
      </form>
      <p
        id={`${id}-count`}
        className="dream-glossary-search-count"
        role="status"
        aria-atomic="true"
      >
        {searching ? `検索結果 ${results.length} / ${ENTRIES.length} 語` : ""}
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
                  <span className="dream-glossary-search-open" aria-hidden="true">
                    <svg
                      className="dream-glossary-search-ribbon"
                      viewBox="0 0 12 16"
                      width="11"
                      height="14"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M2 1.2h8v13.2L6 11.7l-4 2.7V1.2Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>↗</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <div className="dream-glossary-search-empty">
            <svg
              className="dream-glossary-search-empty-ornament"
              viewBox="0 0 120 26"
              width="120"
              height="26"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 13h38M78 13h38"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeOpacity="0.65"
              />
              <path
                d="M49.5 4.5h9.6v16l-4.8-3.2-4.8 3.2v-16Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinejoin="round"
              />
              <circle
                cx="65"
                cy="11.5"
                r="4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M68.1 14.6l3.2 3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
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
