import { useEffect, useState } from "react";
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
export function LibraryHub({ saved, ready }: { saved: LibrarySaved; ready: boolean }) {
  const searches = useRecentSearches();
  const [now, setNow] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (ready) setNow(Date.now());
  }, [ready, saved]);

  const resume = continueReading(saved);
  const groups = now === null ? [] : groupVisits(saved.recent, now);
  const bookmarks = saved.bookmarks.flatMap((id) => byId.get(id) ?? []);
  const empty = !saved.recent.length && !bookmarks.length && !searches.length;

  return (
    <section className="library-hub" id="my-library" aria-labelledby="library-hub-title">
      <header className="library-hub-heading">
        <p className="library-eyebrow">MY LIBRARY</p>
        <h2 id="library-hub-title">マイライブラリー</h2>
        <p>しおり・閲覧履歴・検索履歴は、このブラウザーにだけ保存されます。</p>
      </header>
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
                人物資料や章のページを開くと、ここから続きを読めます。
              </p>
            )}
          </article>

          <section className="library-shelf" aria-labelledby="library-shelf-title">
            <div className="library-hub-subhead">
              <h3 id="library-shelf-title">
                <span>SAVED</span>しおり
              </h3>
              <b>{bookmarks.length}</b>
            </div>
            {bookmarks.length ? (
              <ul className="library-rows">
                {bookmarks.map((entry) => (
                  <li key={entry.id}>
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
                      onClick={() => toggleBookmark(entry.id)}
                    >
                      解除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="library-hub-empty">
                下の資料カードの「しおり ＋」や、メニューの「資料を保存」から追加できます。
              </p>
            )}
            {bookmarks.length > 1 ? (
              <button type="button" className="library-text-button" onClick={clearLibraryBookmarks}>
                しおりをすべて解除
              </button>
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
              <p className="library-hub-empty">閲覧履歴はまだありません。</p>
            )}
            <p className="library-hub-note">
              直近{RECENT_LIMIT}件まで。読了を示すものではありません。
            </p>
            {saved.recent.length ? (
              <button type="button" className="library-text-button" onClick={clearLibraryRecent}>
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
              <button type="button" className="library-text-button" onClick={clearRecentSearches}>
                検索履歴を消す
              </button>
            ) : null}
          </section>

          <div className="library-data-controls">
            <p>保存データ</p>
            <button type="button" disabled={empty} onClick={() => downloadExport(saved)}>
              書き出す（JSON）
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="library-danger"
                  onClick={() => {
                    clearLibraryAll();
                    clearRecentSearches();
                    setConfirming(false);
                    setNotice("しおり・閲覧履歴・検索履歴をすべて消去しました。");
                  }}
                >
                  本当に消去する
                </button>
                <button type="button" onClick={() => setConfirming(false)}>
                  やめる
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={empty}
                onClick={() => {
                  setNotice("");
                  setConfirming(true);
                }}
              >
                すべて消去
              </button>
            )}
            <p className="library-hub-note" role="status">
              {confirming ? "しおり・閲覧履歴・検索履歴を消去します。元に戻せません。" : notice}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
