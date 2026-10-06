import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { useDialogHistoryDismiss } from "@/components/world/use-dialog-history-dismiss";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock";
import { GALLERY_ARTWORKS, GALLERY_CATEGORIES, type GalleryArtwork } from "./gallery-data";
import {
  filterGalleryArtworks,
  GALLERY_FAVORITES_KEY,
  readGalleryFavorites,
  toggleGalleryFavorite,
  type GalleryFavorites,
} from "./gallery-discovery";
import { GalleryCurtain } from "./gallery-curtain";
import {
  GALLERY_TITLE_LIMIT,
  GALLERY_TITLES_KEY,
  readGalleryTitles,
  saveGalleryTitle,
  type GalleryTitles,
} from "./gallery-titles";

const imageSizes = "(max-width: 640px) 46vw, (max-width: 1000px) 30vw, 22vw";
const numberFor = (artwork: GalleryArtwork) => artwork.id.slice(1).padStart(3, "0");

export function GalleryPage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<(typeof GALLERY_CATEGORIES)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<GalleryFavorites>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [titles, setTitles] = useState<GalleryTitles>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [arriving, setArriving] = useState(true);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocusRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);
  const viewerWorksRef = useRef<GalleryArtwork[]>([]);
  const works = filterGalleryArtworks(GALLERY_ARTWORKS, {
    category,
    query,
    favoritesOnly,
    favorites,
    titles,
  });
  const selected = GALLERY_ARTWORKS.find((work) => work.id === selectedId) ?? null;
  const viewerWorks = viewerWorksRef.current.length ? viewerWorksRef.current : works;
  const selectedIndex = viewerWorks.findIndex((work) => work.id === selectedId);
  const viewerOpen = selected !== null;
  const featured = GALLERY_ARTWORKS[2];

  useEffect(() => {
    const load = () => {
      try {
        setTitles(readGalleryTitles(window.localStorage));
      } catch {
        setSaveError("このブラウザーでは保存領域を利用できません。");
      }
    };
    const loadFavorites = () => {
      try {
        setFavorites(readGalleryFavorites(window.localStorage, GALLERY_ARTWORKS.map((work) => work.id)));
      } catch {
        setSaveError("このブラウザーでは保存領域を利用できません。");
      }
    };
    load();
    loadFavorites();
    if (document.documentElement.dataset.routeCover) setArriving(false);
    const onStorage = (event: StorageEvent) => {
      if (event.key === GALLERY_TITLES_KEY || event.key === null) load();
      if (event.key === GALLERY_FAVORITES_KEY || event.key === null) loadFavorites();
    };
    window.addEventListener("storage", onStorage);
    // A direct visit opens the cloth too; a managed route entry already owns its curtain.
    const timer = window.setTimeout(() => setArriving(false), 1400);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (editing) titleInputRef.current?.focus({ preventScroll: true });
    else if (restoreEditFocusRef.current) {
      editButtonRef.current?.focus({ preventScroll: true });
      restoreEditFocusRef.current = false;
    }
  }, [editing]);

  const resetEditor = () => {
    setEditing(false);
    setSaveMessage("");
    setSaveError("");
  };
  const cancelEditor = () => {
    restoreEditFocusRef.current = true;
    resetEditor();
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The server-rendered exhibition is always visible. Animation starts only
    // on entry; an unavailable observer never leaves an artwork hidden.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
          entry.target.dataset.galleryEnter = "true";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 },
    );
    grid.querySelectorAll("[data-gallery-artwork]").forEach((work) => observer.observe(work));
    return () => observer.disconnect();
  }, [category]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!viewerOpen || !dialog) return;
    try {
      if (!dialog.open) dialog.showModal();
    } catch {
      setSelectedId(null);
      return;
    }
    dialog.focus({ preventScroll: true });
    const cycleFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      restoreFocusRef.current = true;
      // Listen on the DOM dialog: the shared world button is portalled here
      // from a different React tree, so its events do not bubble through JSX.
      // Explicit cycling also respects button focus on WebKit installations
      // whose native Tab preference skips buttons.
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (node) =>
          node.tabIndex >= 0 &&
          node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility !== "hidden",
      );
      if (!controls.length) return;
      const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        activeIndex < 0
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (activeIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[nextIndex].focus({ preventScroll: true });
    };
    dialog.addEventListener("keydown", cycleFocus);
    const release = acquireViewportScrollLock();
    return () => {
      dialog.removeEventListener("keydown", cycleFocus);
      if (dialog.open) dialog.close();
      release();
      if (restoreFocusRef.current) openerRef.current?.focus({ preventScroll: true });
      else if (document.activeElement === openerRef.current) openerRef.current?.blur();
      restoreFocusRef.current = false;
    };
  }, [viewerOpen]);

  useDialogHistoryDismiss(dialogRef, () => {
    restoreFocusRef.current = false;
    dialogRef.current?.close();
    setSelectedId(null);
  });

  const openWork = (event: MouseEvent<HTMLAnchorElement>, work: GalleryArtwork) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    openerRef.current = event.currentTarget;
    restoreFocusRef.current = event.detail === 0;
    const navigationWorks = works.some((item) => item.id === work.id)
      ? works
      : GALLERY_ARTWORKS.filter((item) => category === "all" || item.category === work.category);
    viewerWorksRef.current = navigationWorks.some((item) => item.id === work.id)
      ? navigationWorks
      : [...navigationWorks, work];
    if (category !== "all" && category !== work.category) setCategory("all");
    setFailedId(null);
    resetEditor();
    setSelectedId(work.id);
  };
  const closeViewer = () => {
    resetEditor();
    dialogRef.current?.close();
    setSelectedId(null);
    viewerWorksRef.current = [];
  };
  const moveWork = (step: number) => {
    const next = viewerWorks[(selectedIndex + step + viewerWorks.length) % viewerWorks.length];
    if (next) {
      resetEditor();
      setFailedId(null);
      setSelectedId(next.id);
    }
  };
  const changeFavorite = (id: string) => {
    try {
      setFavorites(
        toggleGalleryFavorite(window.localStorage, id, GALLERY_ARTWORKS.map((work) => work.id)),
      );
      setSaveError("");
    } catch {
      setSaveError("お気に入りを保存できませんでした。ブラウザーの保存設定や空き容量をご確認ください。");
    }
  };
  const resetDiscovery = () => {
    setQuery("");
    setCategory("all");
    setFavoritesOnly(false);
  };

  return (
    <div id="gallery-top" className="world gallery-page" data-gallery-page="true">
      {arriving && (
        <div className="gallery-arrival">
          <GalleryCurtain phase="revealing" />
        </div>
      )}
      <header className="gallery-topbar">
        <Link className="gallery-brand" to="/world">
          DECEPTION WORLD<span>VISUAL COLLECTION</span>
        </Link>
        <div className="gallery-topbar-actions">
          <a href="#gallery-collection">作品を見る</a>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
      <main id="gallery-main">
        <section className="gallery-intro" aria-labelledby="gallery-title">
          <div className="gallery-intro-copy">
            <p className="gallery-eyebrow">DECEPTION WORLD / GALLERY</p>
            <h1 id="gallery-title">
              光と影の、
              <br />
              <span>展示室。</span>
            </h1>
            <p className="gallery-intro-description">
              戦いの一瞬から、静かな横顔まで。
              <br />
              ディセプションワールドの景色を、一点ずつ巡るギャラリー。
            </p>
            <a className="gallery-enter" href="#gallery-collection">
              展示室へ<span aria-hidden="true">↓</span>
            </a>
            <p className="gallery-edition">
              COLLECTION <b>{GALLERY_ARTWORKS.length}</b> WORKS
            </p>
          </div>
          <figure className="gallery-feature">
            <a
              className="gallery-feature-open"
              href={featured.full}
              onClick={(event) => openWork(event, featured)}
              aria-haspopup="dialog"
              aria-controls="gallery-viewer"
              aria-label={`${numberFor(featured)}を拡大して鑑賞`}
            >
              <img
                src={featured.medium}
                srcSet={featured.srcSet}
                sizes="(max-width: 760px) 90vw, 56vw"
                alt={featured.alt}
                width={featured.width}
                height={featured.height}
                fetchPriority="high"
                decoding="async"
              />
            </a>
            <figcaption>
              <span>{numberFor(featured)}</span>
              {titles[featured.id] && <span>{titles[featured.id]}</span>}
            </figcaption>
          </figure>
        </section>
        <section
          id="gallery-collection"
          className="gallery-collection"
          aria-labelledby="gallery-collection-title"
        >
          <div className="gallery-collection-heading">
            <div>
              <p className="gallery-eyebrow">THE COLLECTION</p>
              <h2 id="gallery-collection-title">作品を巡る</h2>
            </div>
            <p className="gallery-count" aria-live="polite">
              {works.length} / {GALLERY_ARTWORKS.length}点を表示
            </p>
          </div>
          <div className="gallery-discovery-controls">
            <label className="gallery-search">
              <span>作品を検索</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="番号・代替テキスト・個人タイトル"
                aria-label="作品を番号、画像の説明、個人タイトルで検索"
              />
            </label>
            <button
              type="button"
              className="gallery-favorites-filter"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((current) => !current)}
            >
              お気に入りのみ <span>{favorites.length}</span>
            </button>
          </div>
          <nav className="gallery-filters" aria-label="展示の分類">
            {GALLERY_CATEGORIES.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
                <span>
                  {item.id === "all"
                    ? GALLERY_ARTWORKS.length
                    : GALLERY_ARTWORKS.filter((work) => work.category === item.id).length}
                </span>
              </button>
            ))}
          </nav>
          <div className="gallery-grid" ref={gridRef}>
            {works.map((work) => (
              <figure
                className={`gallery-work${work.width > work.height ? " gallery-work-wide" : ""}`}
                style={{ ["--gallery-ar" as string]: (work.width / work.height).toFixed(3) }}
                data-gallery-artwork={work.id}
                key={work.id}
              >
                <a
                  className="gallery-work-open"
                  href={work.full}
                  onClick={(event) => openWork(event, work)}
                  aria-label={`${numberFor(work)}、${work.alt}。拡大して鑑賞`}
                  aria-haspopup="dialog"
                  aria-controls="gallery-viewer"
                >
                  <span className="gallery-work-frame">
                    <img
                      src={work.thumb}
                      srcSet={work.srcSet}
                      sizes={
                        work.width > work.height
                          ? "(max-width: 640px) 92vw, (max-width: 1000px) 60vw, 44vw"
                          : imageSizes
                      }
                      alt={work.alt}
                      width={work.width}
                      height={work.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="gallery-work-hint">
                    拡大して鑑賞 <span aria-hidden="true">↗</span>
                  </span>
                </a>
                <figcaption>
                  <span className="gallery-work-number">{numberFor(work)}</span>
                  {titles[work.id] && <h3>{titles[work.id]}</h3>}
                  <button
                    type="button"
                    className="gallery-favorite-toggle"
                    aria-pressed={favorites.includes(work.id)}
                    aria-label={`${numberFor(work)}を${favorites.includes(work.id) ? "お気に入りから解除" : "お気に入りに追加"}`}
                    onClick={() => changeFavorite(work.id)}
                  >
                    {favorites.includes(work.id) ? "♥ お気に入り" : "♡ お気に入り"}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
          {works.length === 0 && (
            <div className="gallery-empty" role="status">
              <p>条件に合う作品はありません。</p>
              <button type="button" onClick={resetDiscovery}>絞り込みを解除</button>
            </div>
          )}
          {saveError && <p className="gallery-save-message is-error" role="alert">{saveError}</p>}
        </section>
      </main>
      <footer className="gallery-footer">
        <p>
          DECEPTION WORLD<span>GALLERY / VISUAL COLLECTION</span>
        </p>
        <Link to="/world">
          ワールドへ戻る <span aria-hidden="true">↗</span>
        </Link>
      </footer>
      <SideMenuLayer context="gallery" open={menuOpen} onOpenChange={setMenuOpen} />
      <dialog
        id="gallery-viewer"
        className="gallery-viewer"
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby="gallery-viewer-title"
        onClose={() => setSelectedId(null)}
        onCancel={(event) => {
          if (editing) {
            event.preventDefault();
            cancelEditor();
            return;
          }
          restoreFocusRef.current = true;
        }}
        onKeyDown={(event) => {
          if (editing || event.target instanceof HTMLInputElement) return;
          if (event.key === "Escape") restoreFocusRef.current = true;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            restoreFocusRef.current = true;
            moveWork(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {selected && (
          <div className="gallery-viewer-shell">
            <header className="gallery-viewer-header">
              <div>
                <h2 id="gallery-viewer-title">
                  {numberFor(selected)}
                  {titles[selected.id] && (
                    <span className="gallery-personal-title">{titles[selected.id]}</span>
                  )}
                </h2>
                <p className="gallery-storage-note">タイトルはこのブラウザーだけに保存されます。</p>
              </div>
              <div className="gallery-viewer-actions">
                <button
                  type="button"
                  className="gallery-viewer-close"
                  ref={editButtonRef}
                  disabled={editing}
                  onClick={() => {
                    setDraft(titles[selected.id] ?? "");
                    setSaveMessage("");
                    setSaveError("");
                    setEditing(true);
                  }}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="gallery-viewer-close"
                  aria-pressed={favorites.includes(selected.id)}
                  disabled={editing}
                  onClick={() => changeFavorite(selected.id)}
                >
                  {favorites.includes(selected.id) ? "♥ お気に入り" : "♡ お気に入り"}
                </button>
                <button type="button" className="gallery-viewer-close" onClick={closeViewer}>
                  閉じる <span aria-hidden="true">×</span>
                </button>
              </div>
              {editing && (
                <form
                  className="gallery-title-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    try {
                      const nextTitles = saveGalleryTitle(window.localStorage, selected.id, draft);
                      setTitles(nextTitles);
                      setSaveError("");
                      setSaveMessage("このブラウザーに保存しました。");
                      restoreEditFocusRef.current = true;
                      setEditing(false);
                    } catch {
                      setSaveError(
                        "保存できませんでした。ブラウザーの保存設定や空き容量を確認して、もう一度お試しください。",
                      );
                    }
                  }}
                >
                  <label htmlFor="gallery-title-input">タイトル</label>
                  <input
                    id="gallery-title-input"
                    ref={titleInputRef}
                    value={draft}
                    maxLength={GALLERY_TITLE_LIMIT}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="空欄で保存すると番号だけに戻ります"
                    aria-describedby="gallery-title-help"
                  />
                  <p id="gallery-title-help">
                    100文字まで。ほかの端末やブラウザーとは共有されません。
                  </p>
                  <div className="gallery-viewer-actions">
                    <button type="submit" className="gallery-viewer-close">
                      保存
                    </button>
                    <button type="button" className="gallery-viewer-close" onClick={cancelEditor}>
                      キャンセル
                    </button>
                  </div>
                </form>
              )}
              {saveMessage && (
                <p className="gallery-save-message" role="status">
                  {saveMessage}
                </p>
              )}
              {saveError && (
                <p className="gallery-save-message is-error" role="alert">
                  {saveError}
                </p>
              )}
            </header>
            <div className="gallery-viewer-stage">
              {failedId !== selected.id ? (
                <img
                  key={selected.id}
                  src={selected.full}
                  alt={selected.alt}
                  width={selected.width}
                  height={selected.height}
                  decoding="async"
                  onError={() => setFailedId(selected.id)}
                />
              ) : (
                <p className="gallery-image-error">
                  画像を読み込めませんでした。
                  <a href={selected.medium} target="_blank" rel="noreferrer">
                    画像を別のタブで開く
                  </a>
                </p>
              )}
            </div>
            <footer className="gallery-viewer-footer">
              <button type="button" disabled={editing} onClick={() => moveWork(-1)}>
                ← 前の作品
              </button>
              <p aria-live="polite">
                {selectedIndex + 1} / {viewerWorks.length}
              </p>
              <button type="button" disabled={editing} onClick={() => moveWork(1)}>
                次の作品 →
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}
