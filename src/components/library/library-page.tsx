import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { defaultParseSearch, Link } from "@tanstack/react-router";
import { LibraryInquiry } from "./library-inquiry";
import { GuardedLink, useLoadGate } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { useWorldMode } from "@/components/world/use-world-mode";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import {
  LIBRARY_ENTRIES,
  LIBRARY_KINDS,
  searchLibrary,
  type LibraryEntry,
  type LibraryKind,
} from "@/lib/library-data";
import { pathArt, RIDER_ART, titleRunStyle } from "@/lib/record-art";
import { recordImage } from "@/lib/record-images";
import { watchRecordArrival } from "@/lib/record-arrival";
import landingCssUrl from "@/styles-record-landing.css?url";
import {
  captureRecordReturn,
  finishRecordReturnOpening,
  recordReturnCardId,
  type RecordReturnContext,
} from "@/lib/record-return-state";
import {
  libraryBrowseKey,
  LIBRARY_QUERY_DELAY,
  LIBRARY_QUERY_LIMIT,
  validateLibraryBrowseSearch,
  type LibraryBrowseScope,
  type LibraryBrowseSelection,
} from "@/lib/library-browse-state";
import { filterLibraryBrowse } from "@/lib/library-browse-filter";
import { toggleBookmark, useLibraryStore } from "./library-store";
import { LibraryHub } from "./library-hub";
import { RecordArtFrame } from "./record-art";

const byPath = new Map(LIBRARY_ENTRIES.map((entry) => [entry.path, entry]));
// The hero's index read-out: how the entrances divide by kind.
const KIND_COUNTS = (Object.keys(LIBRARY_KINDS) as LibraryKind[]).map(
  (id) => [id, LIBRARY_ENTRIES.filter((entry) => entry.kind === id).length] as const,
);
const KIND_ART: Record<LibraryKind, string> = {
  page: "/world",
  person: "/characters/ciel",
  chapter: "/dream-chapter",
};
// The hero's visual index: the eight riders' files, in the World's order.
const CAST = RIDER_ART.flatMap((rider) => {
  const entry = byPath.get(`/riders/${rider.id}`);
  return entry ? [{ ...rider, entry }] : [];
});

function EntryCard({
  entry,
  query,
  bookmarked,
  ready,
  beforeOpen,
  onBookmark,
}: {
  entry: LibraryEntry;
  /** The field's words, for the landing reticle's tag. */
  query: string;
  bookmarked: boolean;
  ready: boolean;
  beforeOpen: (entry: LibraryEntry) => Promise<(() => RecordReturnContext | null) | undefined>;
  onBookmark: (id: string) => void;
}) {
  const { go } = useLoadGate();
  return (
    <article
      id={recordReturnCardId("library", entry.id)}
      className="library-card"
      data-kind={entry.kind}
      data-library-entry={entry.id}
      data-record-saved={bookmarked ? "true" : undefined}
      onClickCapture={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-library-open]");
        if (!link || !event.currentTarget.contains(link)) return;
        event.preventDefault();
        event.stopPropagation();
        const fromKeyboard = event.detail === 0;
        // GuardedLink's beforeNavigate is synchronous. Keep its native link
        // and intent warmers, but await the source URL before leaving it.
        void beforeOpen(entry)
          .then(async (commit) => {
            const captured = commit?.();
            if (!captured) return;
            try {
              watchRecordArrival(entry.path, entry.hash, {
                stylesheet: landingCssUrl,
                code: "FILE",
                label: query ? `「${query}」` : entry.title,
              });
              await go({
                to: entry.path,
                hash: entry.hash,
                assets: [],
                focusDestination: fromKeyboard,
              });
            } finally {
              finishRecordReturnOpening(captured, {
                pathname: window.location.pathname,
                search: defaultParseSearch(window.location.search),
                hash: window.location.hash,
              });
            }
          })
          .catch(() => link.focus({ preventScroll: true }));
      }}
    >
      <RecordArtFrame art={pathArt(entry.path, entry.hash)} title={entry.title} />
      <p className="library-card-kind">{LIBRARY_KINDS[entry.kind]}</p>
      <h3 style={titleRunStyle(entry.title)}>
        <GuardedLink to={entry.path} hash={entry.hash} assets={[]} data-library-open="true">
          <DisplayName value={entry.title} />
        </GuardedLink>
      </h3>
      <p className="library-card-description">{entry.description}</p>
      <div className="library-card-actions">
        <GuardedLink to={entry.path} hash={entry.hash} assets={[]} data-library-open="true">
          資料を開く <span aria-hidden="true">↗</span>
        </GuardedLink>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={bookmarked}
          aria-label={`${entry.title}のしおり${bookmarked ? "を解除" : "を保存"}`}
          onClick={() => onBookmark(entry.id)}
        >
          {bookmarked ? "保存済み ✓" : "しおり ＋"}
        </button>
      </div>
    </article>
  );
}
export function LibraryPage({
  guide,
  query,
  kind,
  scope,
  onBrowseChange,
  onGuideChange,
}: {
  guide?: string;
  query: string;
  kind: LibraryKind | "all";
  scope: LibraryBrowseScope;
  onBrowseChange: (next: LibraryBrowseSelection, options?: { replace?: boolean }) => Promise<void>;
  onGuideChange: (id: string) => void;
}) {
  useWorldMode();
  const [draft, setDraft] = useState(query);
  const [menuOpen, setMenuOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const draftRef = useRef(query);
  const composingRef = useRef(false);
  const compositionEndedRef = useRef(-Infinity);
  const timerRef = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLParagraphElement>(null);
  const bookmarkFocusRef = useRef<{ id: string; candidates: string[] } | undefined>(undefined);
  const bookmarkScrollCommitRef = useRef(false);
  const onBrowseChangeRef = useRef(onBrowseChange);
  const committedRef = useRef(libraryBrowseKey({ q: query, kind, scope }));
  const ownWritesRef = useRef(new Set<string>());
  const pendingWriteRef = useRef<{ key: string; promise: Promise<void> } | undefined>(undefined);
  const openSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  // Match-owned search values advance together. A global router history key
  // can advance before this match and must not produce an old-query/new-key
  // tuple that falsely cancels an in-flight source URL write.
  const sourceKey = JSON.stringify([query, kind, scope, guide]);
  const sourceRef = useRef(sourceKey);
  const { saved, ready, error } = useLibraryStore();

  useLayoutEffect(() => {
    if (!bookmarkScrollCommitRef.current) return;
    bookmarkScrollCommitRef.current = false;
    if (!window.location.hash) return;
    const scroller = document.scrollingElement;
    if (!scroller) return;
    const maxX = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const maxY = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const { scrollX: left, scrollY: top } = window;
    // A same-position instant scroll clears WebKit's pending native fragment
    // adjustment after the personal shelf changes height. Otherwise its next
    // press can move a filter before click. Do this once after our own save,
    // never during input or scroll, and do not clamp Safari rubber-band offsets.
    if (left < 0 || top < 0 || left > maxX || top > maxY) return;
    window.scrollTo({ left, top, behavior: "instant" });
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onBrowseChangeRef.current = onBrowseChange;
  });

  const cancelQueryWrite = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  const writeBrowse = useCallback((next: LibraryBrowseSelection, replace = true): Promise<void> => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const key = libraryBrowseKey(next);
    if (key === committedRef.current)
      return pendingWriteRef.current?.key === key
        ? pendingWriteRef.current.promise
        : Promise.resolve();
    const previous = committedRef.current;
    committedRef.current = key;
    ownWritesRef.current.add(key);
    setBrowseError("");
    const promise = Promise.resolve(onBrowseChangeRef.current(next, { replace }))
      .catch((reason: unknown) => {
        if (committedRef.current === key) committedRef.current = previous;
        ownWritesRef.current.delete(key);
        if (mountedRef.current)
          setBrowseError("検索条件を保存できませんでした。もう一度お試しください。");
        throw reason;
      })
      .finally(() => {
        if (pendingWriteRef.current?.promise === promise) pendingWriteRef.current = undefined;
      });
    pendingWriteRef.current = { key, promise };
    return promise;
  }, []);

  // Our own debounced URL acknowledgement must not erase newer typing. A
  // different matched search is authoritative; popstate below also restores
  // Back/Forward entries whose query and filters happen to be identical.
  useEffect(() => {
    if (sourceRef.current === sourceKey) return;
    sourceRef.current = sourceKey;
    const key = libraryBrowseKey({ q: query, kind, scope });
    committedRef.current = key;
    const ownWrite = ownWritesRef.current.has(key);
    if (ownWrite) {
      ownWritesRef.current.delete(key);
      return;
    }
    ownWritesRef.current.clear();
    openSequenceRef.current += 1;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    composingRef.current = false;
    setComposing(false);
    draftRef.current = query;
    setDraft(query);
  }, [sourceKey, query, kind, scope]);

  useEffect(() => {
    const restore = () => {
      openSequenceRef.current += 1;
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
      ownWritesRef.current.clear();
      if (window.location.pathname !== "/library") return;
      const next = validateLibraryBrowseSearch(defaultParseSearch(window.location.search));
      const q = next.q ?? "";
      committedRef.current = libraryBrowseKey({
        q,
        kind: next.kind ?? "all",
        scope: next.scope ?? "all",
      });
      composingRef.current = false;
      setComposing(false);
      draftRef.current = q;
      setDraft(q);
    };
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const next = { q: draft, kind, scope };
    if (composing || libraryBrowseKey(next) === committedRef.current) return;
    const timer = window.setTimeout(() => {
      const latest = { q: draftRef.current, kind, scope };
      if (composingRef.current) return;
      void writeBrowse(latest).catch(() => undefined);
    }, LIBRARY_QUERY_DELAY);
    timerRef.current = timer;
    return () => window.clearTimeout(timer);
  }, [draft, composing, kind, scope, writeBrowse]);

  const { counts, entries: visible } = useMemo(
    () => filterLibraryBrowse({ q: draft, kind, scope }, saved.bookmarks),
    [draft, kind, scope, saved.bookmarks],
  );
  const savedCount = filterLibraryBrowse({ q: draft, kind, scope: "saved" }, saved.bookmarks)
    .entries.length;
  const allCount = searchLibrary(draft, kind).length;
  // A kind with nothing: the other kinds that do hold the query (in scope).
  const otherKinds =
    kind === "all"
      ? []
      : (Object.keys(LIBRARY_KINDS) as LibraryKind[])
          .filter((id) => id !== kind && counts[id] > 0)
          .map((id) => [id, counts[id]] as const);
  const savedKnown = ready && (!error || saved.bookmarks.length > 0);
  const savedUnavailable = scope === "saved" && !savedKnown;
  const filtersActive = Boolean(draft.trim()) || kind !== "all" || scope !== "all";
  const selection = () => ({ q: draftRef.current, kind, scope });
  const flushQuery = () => writeBrowse(selection());
  const quietFlush = () => {
    openSequenceRef.current += 1;
    void flushQuery().catch(() => undefined);
  };
  const beforeOpen = async (entry: LibraryEntry) => {
    // GuardedLink calls this only for an unmodified same-tab activation.
    // Commit before capturing so the return shelf includes the latest field.
    const request = ++openSequenceRef.current;
    const source = selection();
    try {
      await writeBrowse(source);
    } catch (reason) {
      if (
        !mountedRef.current ||
        request !== openSequenceRef.current ||
        window.location.pathname !== "/library"
      )
        return;
      throw reason;
    }
    const isCurrent = () => {
      if (
        !mountedRef.current ||
        request !== openSequenceRef.current ||
        window.location.pathname !== "/library"
      )
        return false;
      const actual = validateLibraryBrowseSearch(defaultParseSearch(window.location.search));
      return (
        libraryBrowseKey({
          q: actual.q ?? "",
          kind: actual.kind ?? "all",
          scope: actual.scope ?? "all",
        }) === libraryBrowseKey(source) && actual.guide === guide
      );
    };
    if (!isCurrent()) return;
    // Capture and the caller's go() happen in the same synchronous turn after
    // this final guard; a newer click, Back, or unmount cannot revive an old A.
    return () => {
      if (!isCurrent()) return null;
      return captureRecordReturn(
        {
          source: {
            pathname: "/library",
            search: { ...source, guide },
            cardId: recordReturnCardId("library", entry.id),
          },
          target: { pathname: entry.path, hash: entry.hash },
        },
        true,
      );
    };
  };
  const setQuery = (value: string) => {
    openSequenceRef.current += 1;
    draftRef.current = value;
    setDraft(value);
  };
  const clearFilters = () => {
    composingRef.current = false;
    setComposing(false);
    setQuery("");
    void writeBrowse({ q: "", kind: "all", scope: "all" }).catch(() => undefined);
    inputRef.current?.focus({ preventScroll: true });
  };
  const changeKind = (next: LibraryKind | "all") => {
    openSequenceRef.current += 1;
    void writeBrowse({ ...selection(), kind: next }, false).catch(() => undefined);
  };
  // The hero's kinds: the shelf takes that kind, and the reader is taken to
  // its read-out (focus there too, as after a submitted search).
  const openKind = (next: LibraryKind) => {
    changeKind(next);
    window.requestAnimationFrame(() => {
      const motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
      resultsRef.current?.scrollIntoView({ block: "start", behavior: motion ? "smooth" : "auto" });
      resultsRef.current?.focus({ preventScroll: true });
    });
  };
  const changeScope = (next: LibraryBrowseScope) => {
    openSequenceRef.current += 1;
    void writeBrowse({ ...selection(), scope: next }, false).catch(() => undefined);
  };
  const onBookmark = (id: string) => {
    bookmarkScrollCommitRef.current = true;
    if (scope === "saved") {
      const index = visible.findIndex((entry) => entry.id === id);
      bookmarkFocusRef.current = {
        id,
        candidates: [visible[index + 1]?.id, visible[index - 1]?.id].filter(
          (value): value is string => Boolean(value),
        ),
      };
    }
    toggleBookmark(id);
  };
  useEffect(() => {
    const pending = bookmarkFocusRef.current;
    if (!pending) return;
    if (scope !== "saved") {
      bookmarkFocusRef.current = undefined;
      return;
    }
    if (saved.bookmarks.includes(pending.id)) {
      if (error) bookmarkFocusRef.current = undefined;
      return;
    }
    bookmarkFocusRef.current = undefined;
    const next =
      !error &&
      pending.candidates
        .map((id) =>
          document
            .getElementById(recordReturnCardId("library", id))
            ?.querySelector<HTMLAnchorElement>("a[href]"),
        )
        .find(Boolean);
    (next || resultsRef.current)?.focus({ preventScroll: true });
  }, [saved.bookmarks, scope, error]);

  // Browsing everything reads best shelved by kind; a search or filter is one list.
  const shelves =
    kind === "all" && !draft.trim() && scope === "all"
      ? (Object.keys(LIBRARY_KINDS) as LibraryKind[]).map((id) => ({
          id,
          entries: visible.filter((entry) => entry.kind === id),
        }))
      : [{ id: "results" as const, entries: visible }];
  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <div className="world library-page library-atelier command-records">
        <header className="library-topbar">
          <GuardedLink to="/world" assets={[]}>
            DECEPTION WORLD
          </GuardedLink>
          <div className="library-topbar-actions">
            <span>資料室 / LIBRARY</span>
            <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
          </div>
        </header>
        <main id="library-main" className="dg-focus-scope">
          <section className="library-intro">
            <div className="library-intro-copy">
              <p className="library-eyebrow">資料室</p>
              <h1>
                世界を辿る、
                <br />
                資料を見つける。
              </h1>
              <nav className="library-jump-links" aria-label="資料室内の移動">
                <a href="#my-library" onClick={quietFlush}>
                  しおり・履歴
                </a>
                <a href="#inquiry" onClick={quietFlush}>
                  問いから辿る
                </a>
              </nav>
              <GuardedLink to="/search" assets={[]} className="library-fulltext-link">
                全文検索 <span aria-hidden="true">↗</span>
              </GuardedLink>
            </div>
          </section>
          <section
            className="library-browser"
            id="library-browser"
            aria-labelledby="library-browser-title"
          >
            <div className="library-browser-heading">
              <h2 id="library-browser-title">資料を探す</h2>
            </div>
            <form
              className="library-browse-controls"
              role="search"
              action="/library#library-browser"
              method="get"
              aria-label="資料室の絞り込み"
              onSubmit={(event) => {
                event.preventDefault();
                if (composingRef.current || performance.now() - compositionEndedRef.current < 50)
                  return;
                quietFlush();
                resultsRef.current?.focus({ preventScroll: true });
                resultsRef.current?.scrollIntoView({ block: "start" });
              }}
            >
              <label className="library-search-label" htmlFor="library-search">
                資料名・人物名・キーワード
              </label>
              <div className="library-query-row">
                <div className="library-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    ref={inputRef}
                    id="library-search"
                    name="q"
                    type="search"
                    value={draft}
                    maxLength={LIBRARY_QUERY_LIMIT}
                    aria-describedby="library-query-help"
                    aria-controls="library-browse-results"
                    placeholder="例：シエル、saga、CASE 2"
                    autoComplete="off"
                    enterKeyHint="search"
                    onChange={(event) => setQuery(event.target.value)}
                    onCompositionStart={() => {
                      cancelQueryWrite();
                      composingRef.current = true;
                      setComposing(true);
                    }}
                    onCompositionEnd={(event) => {
                      composingRef.current = false;
                      compositionEndedRef.current = performance.now();
                      setComposing(false);
                      setQuery(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      const composingKey =
                        composingRef.current ||
                        event.nativeEvent.isComposing ||
                        event.nativeEvent.keyCode === 229;
                      if (event.key === "Enter" && composingKey) event.preventDefault();
                      // Escape clears the words (as on /search); an empty field
                      // leaves Escape to the page.
                      if (event.key === "Escape" && !composingKey && draft) {
                        event.preventDefault();
                        setQuery("");
                        void writeBrowse({ ...selection(), q: "" }).catch(() => undefined);
                      }
                    }}
                  />
                  {draft ? (
                    <button
                      className="library-query-clear"
                      type="button"
                      aria-label="資料の検索語を消す"
                      onClick={() => {
                        setQuery("");
                        void writeBrowse({ ...selection(), q: "" }).catch(() => undefined);
                        inputRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <button type="submit" className="library-browse-submit">
                  絞り込む <span aria-hidden="true">↗</span>
                </button>
              </div>
              {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
              {scope === "saved" ? <input type="hidden" name="scope" value="saved" /> : null}
              {guide ? <input type="hidden" name="guide" value={guide} /> : null}
              <p className="library-search-note" id="library-query-help">
                ひらがな・カタカナ、全角・半角に対応。複数の語はスペースで区切れます。
              </p>
              <div className="library-scope-row" role="group" aria-label="探す資料の範囲">
                <button
                  type="button"
                  aria-pressed={scope === "all"}
                  onClick={() => changeScope("all")}
                >
                  すべての資料 <span>{allCount}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={scope === "saved"}
                  onClick={() => changeScope("saved")}
                >
                  しおりのみ{" "}
                  <span
                    aria-label={
                      !savedKnown
                        ? !ready
                          ? "保存データを確認中"
                          : "保存データを確認できません"
                        : undefined
                    }
                  >
                    {!savedKnown ? "—" : savedCount}
                  </span>
                </button>
              </div>
              <div className="library-filter-row" role="group" aria-label="資料の種類">
                <button
                  type="button"
                  aria-pressed={kind === "all"}
                  onClick={() => changeKind("all")}
                >
                  すべて <span>{savedUnavailable ? "—" : counts.all}</span>
                </button>
                {Object.entries(LIBRARY_KINDS).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={kind === id}
                    onClick={() => changeKind(id as LibraryKind)}
                  >
                    {label} <span>{savedUnavailable ? "—" : counts[id as LibraryKind]}</span>
                  </button>
                ))}
              </div>
              <div className="library-active-filters" aria-label="現在の絞り込み">
                <p>
                  {scope === "saved" ? "しおりに保存した資料" : "すべての資料"} /{" "}
                  {kind === "all" ? "すべての種類" : LIBRARY_KINDS[kind]}
                </p>
                {draft.trim() ? (
                  <span className="library-query-summary">「{draft.trim()}」</span>
                ) : null}
                {filtersActive ? (
                  <button type="button" onClick={clearFilters}>
                    条件をリセット <span aria-hidden="true">×</span>
                  </button>
                ) : (
                  <span>条件は、このページのURLに保存されます。</span>
                )}
              </div>
            </form>
            {error ? (
              <p className="library-error" role="status">
                {error}
              </p>
            ) : null}
            {browseError ? (
              <p className="library-error" role="status">
                {browseError}
              </p>
            ) : null}
            <div
              className="library-results-heading"
              id="library-browse-results"
              aria-busy={savedUnavailable && !ready}
            >
              <p ref={resultsRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true">
                {savedUnavailable ? (
                  !ready ? (
                    "しおりを確認しています…"
                  ) : (
                    "しおりを確認できません"
                  )
                ) : (
                  <>
                    <strong>{visible.length}</strong>件の資料
                  </>
                )}
              </p>
              {draft.trim() && visible.length ? (
                <Link
                  to="/search"
                  search={{ q: draft.trim() }}
                  className="library-fulltext-inline"
                  onClick={quietFlush}
                >
                  「{draft.trim()}」を全文検索 <span aria-hidden="true">↗</span>
                </Link>
              ) : null}
            </div>
            {savedUnavailable ? (
              <div className="library-empty library-saved-state">
                <h3>{!ready ? "保存データを確認しています" : "保存データを利用できません"}</h3>
                <p>
                  {!ready
                    ? "このブラウザーのしおりを読み込んでいます。"
                    : "保存の確認ができないため、しおりの検索結果は表示していません。すべての資料は引き続き探せます。"}
                </p>
                <button type="button" onClick={() => changeScope("all")}>
                  すべての資料から探す
                </button>
              </div>
            ) : visible.length ? (
              shelves.map((shelf) =>
                shelf.entries.length ? (
                  <section
                    key={shelf.id}
                    className="library-shelf-section"
                    aria-label={shelf.id === "results" ? undefined : LIBRARY_KINDS[shelf.id]}
                  >
                    {shelf.id === "results" ? null : (
                      <h3 className="library-shelf-title">
                        {LIBRARY_KINDS[shelf.id]}
                        <span>{shelf.entries.length}</span>
                      </h3>
                    )}
                    <div className="library-grid">
                      {shelf.entries.map((entry) => (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          query={draft.trim()}
                          bookmarked={saved.bookmarks.includes(entry.id)}
                          ready={ready}
                          beforeOpen={beforeOpen}
                          onBookmark={onBookmark}
                        />
                      ))}
                    </div>
                  </section>
                ) : null,
              )
            ) : (
              <div className="library-empty">
                <p className="library-empty-code" aria-hidden="true">
                  NO MATCH
                </p>
                <h3>条件に合う資料が見つかりません</h3>
                <p>
                  {scope === "saved" && !saved.bookmarks.length
                    ? "「すべての資料」に切り替え、資料カードや人物資料のメニューからしおりを保存してください。"
                    : "短い名前や別の表記で検索するか、資料の種類・範囲を戻してください。"}
                </p>
                {otherKinds.length ? (
                  <div
                    className="library-empty-kinds"
                    role="group"
                    aria-label="ほかの種類にある資料"
                  >
                    {otherKinds.map(([id, count]) => (
                      <button key={id} type="button" onClick={() => changeKind(id)}>
                        {LIBRARY_KINDS[id]} <span>{count}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="library-empty-actions">
                  {scope === "saved" && allCount ? (
                    <button type="button" onClick={() => changeScope("all")}>
                      すべての資料から探す <span>{allCount}</span>
                    </button>
                  ) : null}
                  <button type="button" onClick={clearFilters}>
                    検索条件をクリア
                  </button>
                  {draft.trim() ? (
                    <Link
                      to="/search"
                      search={{ q: draft.trim() }}
                      className="library-fulltext-inline"
                      onClick={quietFlush}
                    >
                      「{draft.trim()}」を全文検索 <span aria-hidden="true">↗</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </section>
          <section className="library-discovery" aria-labelledby="library-discovery-title">
            <h2 id="library-discovery-title">種類から探す</h2>
            <div className="library-index-meter" role="group" aria-label="種類から探す">
              {KIND_COUNTS.map(([id, count]) => (
                <button
                  key={id}
                  type="button"
                  data-kind={id}
                  aria-pressed={kind === id}
                  onClick={() => openKind(id)}
                >
                  <RecordArtFrame
                    art={pathArt(KIND_ART[id])}
                    title={LIBRARY_KINDS[id]}
                    slot="continue"
                  />
                  <span className="library-kind-name">{LIBRARY_KINDS[id]}</span>
                  <span className="library-kind-count">
                    <b>{count}</b> 件の資料
                  </span>
                  <span className="library-kind-arrow" aria-hidden="true">
                    ↘
                  </span>
                </button>
              ))}
            </div>
          </section>
          <LibraryHub
            saved={saved}
            ready={ready}
            error={error}
            onBrowseSaved={() => {
              changeScope("saved");
              window.requestAnimationFrame(() => {
                resultsRef.current?.scrollIntoView({ block: "start" });
                resultsRef.current?.focus({ preventScroll: true });
              });
            }}
          />
          <LibraryInquiry
            guide={guide}
            onGuideChange={(id) => {
              void flushQuery()
                .then(() => onGuideChange(id))
                .catch(() => undefined);
            }}
          />
          <section className="library-cast-directory" aria-label="ライダーの人物資料">
            <div className="library-cast-board">
              <div className="library-cast-heading">
                <h2>八人のライダー</h2>
                <span>人物資料</span>
              </div>
              <nav
                className="library-cast"
                aria-label="ライダーの人物資料"
                onFocus={(event) => {
                  // Keep a keyboard-selected file fully visible on short screens.
                  const tile = event.target;
                  if (tile instanceof HTMLElement && tile.matches(":focus-visible"))
                    tile.scrollIntoView({ block: "nearest", inline: "nearest" });
                }}
              >
                {CAST.map(({ entry, no, tone, src, pos }) => (
                  <GuardedLink
                    key={entry.id}
                    to={entry.path}
                    assets={[]}
                    className="library-cast-tile"
                    style={{ "--cast-tone": tone } as CSSProperties}
                    beforeNavigate={quietFlush}
                  >
                    <span className="library-cast-art" aria-hidden="true">
                      {/* Reuse published delivery variants; later rows load lazily. */}
                      <img
                        {...recordImage(src, "cast")}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        style={{ objectPosition: pos }}
                      />
                    </span>
                    <span className="library-cast-no" aria-hidden="true">
                      RIDER {no}
                    </span>
                    <span className="library-cast-name">
                      <DisplayName value={entry.title} />
                    </span>
                  </GuardedLink>
                ))}
              </nav>
            </div>
          </section>
        </main>
        <footer className="library-footer">
          <p>物語の続きは、公開されている資料の中へ。</p>
          <GuardedLink to="/world" assets={[]}>
            世界へ戻る →
          </GuardedLink>
        </footer>
      </div>
    </>
  );
}
