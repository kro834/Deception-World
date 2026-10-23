import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LIBRARY_ENTRIES, LIBRARY_KINDS } from "@/lib/library-data";
import { pathArt, titleRunStyle } from "@/lib/record-art";
import { RECENT_LIMIT, type LibrarySaved } from "@/lib/library-storage";
import {
  buildLibraryExport,
  continueReading,
  formatVisitClock,
  formatVisitTime,
  groupVisits,
} from "@/lib/library-hub";
import {
  clearRecentSearches,
  readRecentSearches,
  useRecentSearches,
} from "@/components/search/search-recent";
import {
  clearLibraryAll,
  clearLibraryBookmarks,
  clearLibraryRecent,
  toggleBookmark,
} from "./library-store";
import { RecordArtFrame } from "./record-art";

const byId = new Map(LIBRARY_ENTRIES.map((entry) => [entry.id, entry]));
const SAVED_PREVIEW_LIMIT = 6;

function downloadExport(saved: LibrarySaved) {
  const data = buildLibraryExport(saved, readRecentSearches(), Date.now());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `deception-world-library-${data.exportedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The reader's own shelf: where they left off, saved records, history, searches. */
export function LibraryHub({
  saved,
  ready,
  error = "",
  onBrowseSaved,
}: {
  saved: LibrarySaved;
  ready: boolean;
  error?: string;
  onBrowseSaved?: () => void;
}) {
  const searches = useRecentSearches();
  const [now, setNow] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<"all" | "bookmarks" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clearIncomplete, setClearIncomplete] = useState(false);
  const [notice, setNotice] = useState("");
  const shelfTitleRef = useRef<HTMLHeadingElement>(null);
  const hubTitleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const removedRef = useRef<{ id: string; candidates: string[] } | null>(null);
  const completedFocusRef = useRef<"all" | "bookmarks" | null>(null);
  useEffect(() => {
    if (ready) setNow(Date.now());
  }, [ready, saved]);

  const resume = continueReading(saved);
  const groups = now === null ? [] : groupVisits(saved.recent, now);
  const bookmarks = saved.bookmarks.flatMap((id) => byId.get(id) ?? []);
  const shownBookmarks = expanded ? bookmarks : bookmarks.slice(0, SAVED_PREVIEW_LIMIT);
  const empty = !saved.recent.length && !bookmarks.length && !searches.length;

  useLayoutEffect(() => {
    if (confirming) {
      document
        .getElementById(`library-confirm-clear-${confirming}`)
        ?.focus({ preventScroll: true });
      return;
    }
    if (completedFocusRef.current) {
      (completedFocusRef.current === "bookmarks" ? shelfTitleRef : hubTitleRef).current?.focus({
        preventScroll: true,
      });
      completedFocusRef.current = null;
    } else if (returnFocusRef.current) {
      const opener = returnFocusRef.current;
      (opener.isConnected && !opener.disabled ? opener : hubTitleRef.current)?.focus({
        preventScroll: true,
      });
    }
    returnFocusRef.current = null;
  }, [confirming]);

  useLayoutEffect(() => {
    const removed = removedRef.current;
    if (!removed) return;
    removedRef.current = null;
    // The store keeps its old snapshot on refusal; leave focus on that button.
    if (saved.bookmarks.includes(removed.id)) return;
    const next = removed.candidates
      .map((id) => document.getElementById(`library-saved-${id}`)?.querySelector("button"))
      .find((button) => button instanceof HTMLElement);
    (next || shelfTitleRef.current)?.focus({ preventScroll: true });
  }, [saved.bookmarks, error]);

  const beginClear = (kind: "all" | "bookmarks", button: HTMLButtonElement) => {
    returnFocusRef.current = button;
    setNotice("");
    setConfirming(kind);
  };
  const finishClear = () => {
    const kind = confirming;
    if (!kind) return;
    const libraryCleared = kind === "all" ? clearLibraryAll() : clearLibraryBookmarks();
    if (kind === "all") {
      const searchesCleared = clearRecentSearches();
      setClearIncomplete(!libraryCleared || !searchesCleared);
      setNotice(
        libraryCleared && searchesCleared
          ? "しおり・閲覧履歴・検索履歴をすべて消去しました。"
          : "一部の保存データを消去できませんでした。ブラウザーの保存設定を確認して、もう一度お試しください。",
      );
    } else {
      setNotice(libraryCleared ? "しおりをすべて解除しました。" : "しおりを解除できませんでした。");
    }
    // A successful clear removes or disables the initiating button.
    if (libraryCleared) completedFocusRef.current = kind;
    setConfirming(null);
  };

  return (
    <section
      className="library-hub"
      id="my-library"
      aria-labelledby="library-hub-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && confirming) {
          event.preventDefault();
          setConfirming(null);
        }
      }}
    >
      <header className="library-hub-heading">
        <p className="library-eyebrow">MY LIBRARY</p>
        <h2 id="library-hub-title" ref={hubTitleRef} tabIndex={-1}>
          マイライブラリー
        </h2>
        <p>しおり・閲覧履歴・検索履歴は、このブラウザーにだけ保存されます。</p>
      </header>
      {error ? <p className="library-error">{error}</p> : null}
      {!ready || now === null ? (
        <p className="library-hub-loading" role="status">
          保存データを確認しています…
        </p>
      ) : (
        <div className="library-hub-grid">
          <article className="library-continue" aria-labelledby="library-continue-title">
            <h3 id="library-continue-title">
              <span>CONTINUE</span>続きから
            </h3>
            {resume ? (
              <>
                <RecordArtFrame
                  art={pathArt(resume.entry.path, resume.entry.hash)}
                  title={resume.entry.title}
                  className="is-continue"
                />
                <p className="library-continue-kind">
                  {LIBRARY_KINDS[resume.entry.kind]}
                  <span>{formatVisitTime(resume.at, now)}に開いた資料</span>
                </p>
                <p className="library-continue-title" style={titleRunStyle(resume.entry.title)}>
                  <DisplayName value={resume.entry.title} />
                </p>
                <div className="library-continue-actions">
                  <GuardedLink
                    to={resume.entry.path}
                    hash={resume.entry.hash}
                    assets={[]}
                    className="library-primary-link"
                  >
                    続きを読む <span aria-hidden="true">↗</span>
                  </GuardedLink>
                  {resume.next ? (
                    <GuardedLink to={resume.next.path} hash={resume.next.hash} assets={[]}>
                      次の章：{resume.next.title} <span aria-hidden="true">→</span>
                    </GuardedLink>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="library-hub-empty">
                {error
                  ? "保存データを確認できないため、続きから読む資料を表示できません。"
                  : "人物資料や章のページを開くと、ここから続きを読めます。"}
              </p>
            )}
          </article>

          <section className="library-shelf" aria-labelledby="library-shelf-title">
            <div className="library-hub-subhead">
              <h3 id="library-shelf-title" ref={shelfTitleRef} tabIndex={-1}>
                <span>SAVED</span>しおり
              </h3>
              <b>{bookmarks.length}</b>
            </div>
            {bookmarks.length ? (
              <ul className="library-rows" id="library-saved-list">
                {shownBookmarks.map((entry, index) => (
                  <li key={entry.id} id={`library-saved-${entry.id}`}>
                    <GuardedLink to={entry.path} hash={entry.hash} assets={[]}>
                      <RecordArtFrame
                        art={pathArt(entry.path, entry.hash)}
                        title={entry.title}
                        className="is-row"
                      />
                      <small>{LIBRARY_KINDS[entry.kind]}</small>
                      <span>
                        <DisplayName value={entry.title} />
                      </span>
                    </GuardedLink>
                    <button
                      type="button"
                      aria-label={`${entry.title}のしおりを解除`}
                      onClick={() => {
                        removedRef.current = {
                          id: entry.id,
                          candidates: [
                            ...bookmarks.slice(index + 1),
                            ...bookmarks.slice(0, index).reverse(),
                          ].map((item) => item.id),
                        };
                        toggleBookmark(entry.id);
                      }}
                    >
                      解除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="library-hub-empty">
                {error
                  ? "しおりを確認できません。すべての資料は引き続き探せます。"
                  : "下の資料カードの「しおり ＋」や、メニューの「資料を保存」から追加できます。"}
              </p>
            )}
            <div className="library-shelf-tools">
              {bookmarks.length > SAVED_PREVIEW_LIMIT ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls="library-saved-list"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded
                    ? "最初の6件に戻す"
                    : `残り${bookmarks.length - SAVED_PREVIEW_LIMIT}件を表示`}
                </button>
              ) : null}
              {bookmarks.length > 0 && onBrowseSaved ? (
                <button type="button" onClick={onBrowseSaved}>
                  しおりを絞り込む
                </button>
              ) : null}
              {bookmarks.length > 1 ? (
                <button
                  type="button"
                  className="library-text-button"
                  onClick={(event) => beginClear("bookmarks", event.currentTarget)}
                >
                  しおりをすべて解除
                </button>
              ) : null}
            </div>
            {confirming === "bookmarks" ? (
              <div
                className="library-clear-confirmation"
                role="group"
                aria-label="しおりの一括解除"
              >
                <p>しおりをすべて解除します。元に戻せません。</p>
                <button
                  type="button"
                  id="library-confirm-clear-bookmarks"
                  className="library-danger"
                  onClick={finishClear}
                >
                  すべて解除する
                </button>
                <button type="button" onClick={() => setConfirming(null)}>
                  やめる
                </button>
              </div>
            ) : null}
          </section>

          <section className="library-history" aria-labelledby="library-history-title">
            <div className="library-hub-subhead">
              <h3 id="library-history-title">
                <span>HISTORY</span>閲覧履歴
              </h3>
              <b>{saved.recent.length}</b>
            </div>
            {groups.length ? (
              groups.map((group) => (
                <div key={group.label} className="library-history-day">
                  <p>{group.label}</p>
                  <ul className="library-rows">
                    {group.visits.map(({ entry, at }) => (
                      <li key={entry.id}>
                        <GuardedLink to={entry.path} hash={entry.hash} assets={[]}>
                          <RecordArtFrame
                            art={pathArt(entry.path, entry.hash)}
                            title={entry.title}
                            className="is-row"
                          />
                          <small>{formatVisitClock(at, now)}</small>
                          <span>
                            <DisplayName value={entry.title} />
                          </span>
                        </GuardedLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="library-hub-empty">
                {error ? "閲覧履歴を確認できません。" : "閲覧履歴はまだありません。"}
              </p>
            )}
            <p className="library-hub-note">
              直近{RECENT_LIMIT}件まで。読了を示すものではありません。
            </p>
            {saved.recent.length ? (
              <button
                type="button"
                className="library-text-button"
                onClick={() => {
                  const cleared = clearLibraryRecent();
                  setNotice(
                    cleared ? "閲覧履歴を消去しました。" : "閲覧履歴を消去できませんでした。",
                  );
                  if (cleared) hubTitleRef.current?.focus({ preventScroll: true });
                }}
              >
                履歴を消去
              </button>
            ) : null}
          </section>

          <section className="library-searches" aria-labelledby="library-searches-title">
            <div className="library-hub-subhead">
              <h3 id="library-searches-title">
                <span>SEARCHES</span>最近の検索
              </h3>
              <b>{searches.length}</b>
            </div>
            {searches.length ? (
              <ul className="library-search-chips">
                {searches.map((query) => (
                  <li key={query}>
                    <Link to="/search" search={{ q: query }}>
                      {query}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="library-hub-empty">
                資料検索やクイック検索（「/」キー）で探した言葉が、ここに残ります。
              </p>
            )}
            {searches.length ? (
              <button
                type="button"
                className="library-text-button"
                onClick={() => {
                  const cleared = clearRecentSearches();
                  setNotice(
                    cleared
                      ? "検索履歴を消去しました。"
                      : "検索履歴をこのページの表示から削除しましたが、ブラウザーの保存データは消去できませんでした。",
                  );
                  hubTitleRef.current?.focus({ preventScroll: true });
                }}
              >
                検索履歴を消す
              </button>
            ) : null}
          </section>

          <div className="library-data-controls">
            <p>保存データ</p>
            <button
              type="button"
              disabled={empty}
              onClick={() => {
                try {
                  downloadExport(saved);
                  setNotice("保存データの書き出しを開始しました。");
                } catch {
                  setNotice("書き出しを開始できませんでした。もう一度お試しください。");
                }
              }}
            >
              書き出す（JSON）
            </button>
            {confirming === "all" ? (
              <>
                <button
                  type="button"
                  id="library-confirm-clear-all"
                  className="library-danger"
                  onClick={finishClear}
                >
                  本当に消去する
                </button>
                <button type="button" onClick={() => setConfirming(null)}>
                  やめる
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={empty && !clearIncomplete}
                onClick={(event) => beginClear("all", event.currentTarget)}
              >
                すべて消去
              </button>
            )}
            <p className="library-hub-note" role="status">
              {confirming === "all"
                ? "しおり・閲覧履歴・検索履歴を消去します。元に戻せません。"
                : notice}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
