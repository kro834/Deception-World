import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LibraryInquiry } from "./library-inquiry";
import { GuardedLink } from "@/components/load-gate";
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
import { toggleBookmark, useLibraryStore } from "./library-store";
import { LibraryHub } from "./library-hub";

function EntryCard({
  entry,
  bookmarked,
  ready,
}: {
  entry: LibraryEntry;
  bookmarked: boolean;
  ready: boolean;
}) {
  return (
    <article className="library-card">
      <p className="library-card-kind">{LIBRARY_KINDS[entry.kind]}</p>
      <h3>
        <GuardedLink to={entry.path} hash={entry.hash} assets={[]}>
          <DisplayName value={entry.title} />
        </GuardedLink>
      </h3>
      <p className="library-card-description">{entry.description}</p>
      <div className="library-card-actions">
        <GuardedLink to={entry.path} hash={entry.hash} assets={[]}>
          資料を開く <span aria-hidden="true">↗</span>
        </GuardedLink>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={bookmarked}
          aria-label={`${entry.title}のしおり${bookmarked ? "を解除" : "を保存"}`}
          onClick={() => toggleBookmark(entry.id)}
        >
          {bookmarked ? "保存済み ✓" : "しおり ＋"}
        </button>
      </div>
    </article>
  );
}
export function LibraryPage({
  guide,
  onGuideChange,
}: {
  guide?: string;
  onGuideChange: (id: string) => void;
}) {
  useWorldMode();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const { saved, ready, error } = useLibraryStore();
  const visible = searchLibrary(query, kind);
  // Browsing everything reads best shelved by kind; a search or filter is one list.
  const shelves =
    kind === "all" && !query.trim()
      ? (Object.keys(LIBRARY_KINDS) as LibraryKind[]).map((id) => ({
          id,
          entries: visible.filter((entry) => entry.kind === id),
        }))
      : [{ id: "results" as const, entries: visible }];
  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <div className="world library-page">
        <header className="library-topbar">
          <GuardedLink to="/world" assets={[]}>
            DECEPTION WORLD
          </GuardedLink>
          <div className="library-topbar-actions">
            <span>資料室 / LIBRARY</span>
            <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
          </div>
        </header>
        <main id="library-main">
          <section className="library-intro">
            <p className="library-eyebrow">THE REFERENCE ROOM</p>
            <h1>
              世界を辿る、
              <br />
              資料を見つける。
            </h1>
            <p>
              人物の名前から、物語の章へ。公開された資料を横断して探し、気になるページにしおりを残せます。
            </p>
            <div className="library-index-summary">
              <span>{LIBRARY_ENTRIES.length} 資料への入口</span>
              <span>人物 / 章 / 展示</span>
            </div>
            <GuardedLink to="/search" assets={[]} className="library-fulltext-link">
              本文から検索 <span aria-hidden="true">↗</span>
            </GuardedLink>
          </section>
          <LibraryHub saved={saved} ready={ready} />
          <LibraryInquiry guide={guide} onGuideChange={onGuideChange} />
          <section className="library-browser" aria-labelledby="library-browser-title">
            <div className="library-browser-heading">
              <h2 id="library-browser-title">資料を探す</h2>
              <p>{LIBRARY_ENTRIES.length}件の入口を、種類ごとに並べています。</p>
            </div>
            <p className="library-search-note">
              ここでは資料名・入口を検索できます。文章の中の言葉を探すには「本文から検索」を開いてください。
            </p>
            <label className="library-search-label" htmlFor="library-search">
              資料名・人物名・キーワード
            </label>
            <div className="library-search">
              <span aria-hidden="true">⌕</span>
              <input
                id="library-search"
                type="search"
                value={query}
                maxLength={160}
                placeholder="例：シエル、saga、CASE 2、ギャラリー"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <p className="library-search-note">
              ひらがな・カタカナ、英字の大文字・小文字、全角・半角に対応。複数の語はスペースで区切れます。
            </p>
            <div className="library-filter-row" role="group" aria-label="資料の種類">
              <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
                すべて
              </button>
              {Object.entries(LIBRARY_KINDS).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={kind === id}
                  onClick={() => setKind(id as LibraryKind)}
                >
                  {label}
                </button>
              ))}
            </div>
            {error ? (
              <p className="library-error" role="status">
                {error}
              </p>
            ) : null}
            <div className="library-results-heading">
              <p role="status">{`${visible.length}件の資料`}</p>
              {query.trim() ? (
                <Link to="/search" search={{ q: query.trim() }} className="library-fulltext-inline">
                  「{query.trim()}」を本文から検索 <span aria-hidden="true">↗</span>
                </Link>
              ) : null}
            </div>
            {visible.length ? (
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
                          bookmarked={saved.bookmarks.includes(entry.id)}
                          ready={ready}
                        />
                      ))}
                    </div>
                  </section>
                ) : null,
              )
            ) : (
              <div className="library-empty">
                <h3>条件に合う資料が見つかりません</h3>
                <p>短い名前や別の表記で検索するか、資料の種類を「すべて」に戻してください。</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setKind("all");
                  }}
                >
                  検索条件をクリア
                </button>
              </div>
            )}
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
