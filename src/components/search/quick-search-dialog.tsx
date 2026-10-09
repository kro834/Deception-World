import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { useLoadGate } from "@/components/load-gate";
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
import quickSearchCssUrl from "../../styles-quick-search.css?url";

const PER_GROUP = 3;
const MAX_RESULTS = 9;
const CATEGORY_ORDER = SEARCH_CATEGORIES.slice(1).map((item) => item.id as string);
const categoryLabel = (id: string) => SEARCH_CATEGORIES.find((item) => item.id === id)?.label ?? "";

const SHORTCUTS = [
  { to: "/search", label: "資料検索", code: "SEARCH" },
  { to: "/library", label: "資料室・しおり", code: "LIBRARY" },
  { to: "/world", label: "ディセプションワールド", code: "WORLD" },
  { to: "/dream-chapter", label: "夢の章", code: "DREAM CHAPTER" },
] as const;

type Option =
  | { kind: "result"; id: string; result: SearchResult }
  | { kind: "all"; id: string; count: number }
  | { kind: "recent"; id: string; query: string }
  | { kind: "link"; id: string; to: string; label: string; code: string };

export default function QuickSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);
  const [composing, setComposing] = useState(false);
  const typed = useDeferredValue(draft);
  const trimmed = typed.trim();
  const recent = useRecentSearches();
  const openResult = useOpenResult();
  const { go } = useLoadGate();
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const results = useMemo(
    () => (trimmed ? searchDocuments(SEARCH_DOCUMENTS, trimmed) : []),
    [trimmed],
  );
  const suggestions = useMemo(
    () => (trimmed && !results.length ? suggestSearchQueries(SEARCH_DOCUMENTS, trimmed, 3) : []),
    [results.length, trimmed],
  );

  const { sections, options } = useMemo(() => {
    const list: Option[] = [];
    const parts: { label: string; code?: string; items: Option[] }[] = [];
    if (trimmed) {
      let left = MAX_RESULTS;
      for (const group of groupSearchResults(results, CATEGORY_ORDER, true)) {
        if (left <= 0) break;
        const items: Option[] = group.results
          .slice(0, Math.min(PER_GROUP, left))
          .map((result) => ({ kind: "result", id: `qs-${result.document.id}`, result }));
        left -= items.length;
        parts.push({ label: categoryLabel(group.category), items });
        list.push(...items);
      }
      if (results.length) {
        const all: Option = { kind: "all", id: "qs-all", count: results.length };
        parts.push({ label: "", items: [all] });
        list.push(all);
      }
    } else {
      if (recent.length) {
        const items: Option[] = recent.map((query, index) => ({
          kind: "recent",
          id: `qs-recent-${index}`,
          query,
        }));
        parts.push({ label: "最近の検索", items });
        list.push(...items);
      }
      const links: Option[] = SHORTCUTS.map((link) => ({
        kind: "link",
        id: `qs-link-${link.code}`,
        ...link,
      }));
      parts.push({ label: "ページ", items: links });
      list.push(...links);
    }
    return { sections: parts, options: list };
  }, [recent, results, trimmed]);

  useEffect(() => setActive(-1), [trimmed]);
  const activeOption = active >= 0 ? options[active] : undefined;
  useEffect(() => {
    if (activeOption)
      document.getElementById(activeOption.id)?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  const closeThen = (action: () => void) => {
    onClose();
    // Let the dialog hand focus back before the route changes.
    window.requestAnimationFrame(action);
  };

  const choose = (option: Option, fromKeyboard: boolean) => {
    if (option.kind === "recent") {
      setDraft(option.query);
      inputRef.current?.focus();
      return;
    }
    if (trimmed) rememberSearch(trimmed);
    if (option.kind === "result") closeThen(() => openResult(option.result, fromKeyboard));
    else if (option.kind === "all")
      closeThen(() => void router.navigate({ to: "/search", search: { q: trimmed } }));
    else closeThen(() => void go({ to: option.to, focusDestination: fromKeyboard }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const native = event.nativeEvent;
    if (composing || native.isComposing || native.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        stepActive(current, options.length, event.key === "ArrowDown" ? 1 : -1),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = activeOption ?? (trimmed && results.length ? options.at(-1) : undefined);
      if (target) choose(target, true);
    } else if (event.key === "Escape" && draft) {
      // First Escape clears the field; the next one closes.
      event.preventDefault();
      setDraft("");
    }
  };

  const linkClick = (option: Option) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    choose(option, event.detail === 0);
  };

  return (
    <dialog
      ref={dialogRef}
      className="quick-search"
      aria-labelledby="quick-search-title"
      onClose={onClose}
      onCancel={(event) => {
        if (draft) {
          event.preventDefault();
          setDraft("");
        }
      }}
      onClick={(event) => {
        // A press on the backdrop (the dialog box itself, outside the panel) closes.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* React hoists this into <head> and holds the overlay until it loads. */}
      <link rel="stylesheet" href={quickSearchCssUrl} precedence="default" />
      <div className="quick-search-panel">
        <div className="quick-search-head">
          <p id="quick-search-title">
            <span>QUICK SEARCH</span>クイック検索
          </p>
          <button type="button" className="quick-search-close" onClick={onClose}>
            閉じる<kbd aria-hidden="true">Esc</kbd>
          </button>
        </div>
        <div className="quick-search-field">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m15.5 15.5 5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="資料を検索"
            aria-expanded={options.length > 0}
            aria-controls="quick-search-list"
            aria-autocomplete="list"
            aria-activedescendant={activeOption?.id}
            aria-describedby="quick-search-hint"
            value={draft}
            maxLength={120}
            placeholder="人物名・ライダー名・用語"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => setDraft(event.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              setComposing(false);
              setDraft(event.currentTarget.value);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div
          id="quick-search-list"
          role="listbox"
          aria-label={trimmed ? `「${trimmed}」の検索結果` : "最近の検索とページ"}
          className="quick-search-list"
          hidden={!options.length}
        >
          {sections.map((section, index) => (
            <div
              key={section.label || `section-${index}`}
              role="group"
              aria-label={section.label || undefined}
              className="quick-search-group"
            >
              {section.label ? (
                <div className="quick-search-group-label" role="presentation" aria-hidden="true">
                  {section.label}
                </div>
              ) : null}
              {section.items.map((option) => {
                const isActive = activeOption?.id === option.id;
                if (option.kind === "result") {
                  const { result } = option;
                  return (
                    <ResultOption
                      key={option.id}
                      id={option.id}
                      result={result}
                      active={isActive}
                      className="quick-search-option"
                      onOpen={(_, fromKeyboard) => choose(option, fromKeyboard)}
                    >
                      <span className="quick-search-option-title">
                        <HighlightedName text={result.document.title} ranges={result.titleRanges} />
                      </span>
                      <span className="quick-search-option-place">
                        {result.section ?? placeLabel(result.document)}
                      </span>
                      <span className="quick-search-option-snippet">
                        <Highlighted text={result.snippet} ranges={result.snippetRanges} />
                      </span>
                    </ResultOption>
                  );
                }
                const href =
                  option.kind === "all"
                    ? `/search?q=${encodeURIComponent(trimmed)}`
                    : option.kind === "link"
                      ? option.to
                      : `/search?q=${encodeURIComponent(option.query)}`;
                return (
                  <a
                    key={option.id}
                    id={option.id}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive ? "true" : undefined}
                    tabIndex={-1}
                    href={href}
                    className={`quick-search-option is-${option.kind}`}
                    onClick={linkClick(option)}
                  >
                    {option.kind === "all" ? (
                      <>
                        <span className="quick-search-option-title">
                          「{trimmed}」の検索結果をすべて見る
                        </span>
                        <span className="quick-search-option-place">{option.count}件</span>
                      </>
                    ) : option.kind === "recent" ? (
                      <span className="quick-search-option-title">{option.query}</span>
                    ) : (
                      <>
                        <span className="quick-search-option-title">{option.label}</span>
                        <span className="quick-search-option-place">{option.code}</span>
                      </>
                    )}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        {trimmed && !results.length ? (
          <div className="quick-search-empty" role="status">
            <p>一致する資料が見つかりませんでした。</p>
            {suggestions.length ? (
              <div>
                <span>もしかして</span>
                {suggestions.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setDraft(term);
                      inputRef.current?.focus();
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="quick-search-foot">
          <p id="quick-search-hint">
            <span className="quick-search-keys">↑↓で選択・Enterで開く・Escで閉じる</span>
            <span className="quick-search-count" role="status">
              {trimmed ? `${results.length}件` : ""}
            </span>
          </p>
          {!trimmed && recent.length ? (
            <button type="button" onClick={clearRecentSearches}>
              検索履歴を消す
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
