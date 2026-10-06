import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { useDialogHistoryDismiss } from "@/components/world/use-dialog-history-dismiss";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock";
import { GALLERY_ARTWORKS, GALLERY_CATEGORIES, type GalleryArtwork } from "./gallery-data";

const imageSizes = "(max-width: 640px) 90vw, (max-width: 1000px) 44vw, 30vw";
const numberFor = (artwork: GalleryArtwork) => artwork.id.slice(1).padStart(3, "0");
const categoryFor = (artwork: GalleryArtwork) =>
  GALLERY_CATEGORIES.find((category) => category.id === artwork.category)?.label;

export function GalleryPage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<(typeof GALLERY_CATEGORIES)[number]["id"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);
  const works = GALLERY_ARTWORKS.filter((work) => category === "all" || work.category === category);
  const selected = works.find((work) => work.id === selectedId) ?? null;
  const selectedIndex = works.findIndex((work) => work.id === selectedId);
  const viewerOpen = selected !== null;
  const featured = GALLERY_ARTWORKS[2];

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
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
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
    if (category !== "all" && category !== work.category) setCategory("all");
    setFailedId(null);
    setSelectedId(work.id);
  };
  const closeViewer = () => {
    dialogRef.current?.close();
    setSelectedId(null);
  };
  const moveWork = (step: number) => {
    const next = works[(selectedIndex + step + works.length) % works.length];
    if (next) {
      setFailedId(null);
      setSelectedId(next.id);
    }
  };

  return (
    <div id="gallery-top" className="world gallery-page" data-gallery-page="true">
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
              aria-label={`${featured.title}を拡大して鑑賞`}
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
              <span>FEATURED / {numberFor(featured)}</span>
              <span>{featured.title}</span>
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
              {category === "all" ? "全" : "展示中 "}
              {works.length}点
            </p>
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
                data-gallery-artwork={work.id}
                key={work.id}
              >
                <a
                  className="gallery-work-open"
                  href={work.full}
                  onClick={(event) => openWork(event, work)}
                  aria-label={`${numberFor(work)} ${work.title}を拡大して鑑賞`}
                  aria-haspopup="dialog"
                  aria-controls="gallery-viewer"
                >
                  <span className="gallery-work-frame">
                    <img
                      src={work.thumb}
                      srcSet={work.srcSet}
                      sizes={
                        work.width > work.height
                          ? "(max-width: 640px) 90vw, (max-width: 1000px) 90vw, 62vw"
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
                  <div>
                    <h3>{work.title}</h3>
                    <p>{categoryFor(work)}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
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
        onCancel={() => {
          restoreFocusRef.current = true;
        }}
        onKeyDown={(event) => {
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
                <p className="gallery-eyebrow">COLLECTION / {numberFor(selected)}</p>
                <h2 id="gallery-viewer-title">{selected.title}</h2>
              </div>
              <button type="button" className="gallery-viewer-close" onClick={closeViewer}>
                閉じる <span aria-hidden="true">×</span>
              </button>
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
              <button type="button" onClick={() => moveWork(-1)}>
                ← 前の作品
              </button>
              <p aria-live="polite">
                {selectedIndex + 1} / {works.length}
              </p>
              <button type="button" onClick={() => moveWork(1)}>
                次の作品 →
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}
