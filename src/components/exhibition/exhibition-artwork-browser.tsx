import { useId, useRef, useState, type CSSProperties } from "react";
import { GALLERY_ARTWORKS } from "@/components/gallery/gallery-data";
import {
  exhibitionBrowsePage,
  findExhibitionArtworks,
  type ExhibitionFormat,
} from "./exhibition-artwork-browse";

const PAGE_SIZE = 12;

function ArtworkFormatFrame({ width, height }: { width: number; height: number }) {
  const ratio = width / height;
  if (ratio > 1.15) {
    return (
      <svg
        aria-hidden="true"
        className="exhibition-shelf-format-frame exhibition-shelf-format-landscape"
        width="14"
        height="11"
        viewBox="0 0 16 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        <rect x="1" y="2" width="14" height="8" rx="1" />
        <line x1="1" y1="2" x2="4" y2="2" strokeWidth="1.8" />
      </svg>
    );
  }
  if (ratio < 0.85) {
    return (
      <svg
        aria-hidden="true"
        className="exhibition-shelf-format-frame exhibition-shelf-format-portrait"
        width="11"
        height="14"
        viewBox="0 0 12 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        <rect x="2" y="1" width="8" height="14" rx="1" />
        <line x1="2" y1="1" x2="2" y2="4" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="exhibition-shelf-format-frame exhibition-shelf-format-square"
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <rect x="1.5" y="1.5" width="11" height="11" rx="1" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" fillOpacity="0.6" stroke="none" />
    </svg>
  );
}

export function ExhibitionArtworkBrowser({
  currentIndex,
  onSelect,
}: {
  currentIndex: number;
  onSelect: (id: string, button: HTMLButtonElement) => void;
}) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ExhibitionFormat>("all");
  const [requestedPage, setPage] = useState(() => Math.floor(currentIndex / PAGE_SIZE));
  const searchInputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const matches = findExhibitionArtworks(GALLERY_ARTWORKS, query, format);
  const { count, page, start, end } = exhibitionBrowsePage(
    matches.length,
    requestedPage,
    PAGE_SIZE,
  );
  const reset = () => {
    setQuery("");
    setFormat("all");
    setPage(0);
    searchRef.current?.focus({ preventScroll: true });
  };
  const turnPage = (next: number) => {
    setPage(next);
    // Keep keyboard users at the start of the newly displayed shelf.
    headingRef.current?.focus();
  };

  return (
    <section className="exhibition-shelf" aria-labelledby="exhibition-shelf-heading">
      <div className="exhibition-shelf-heading">
        <div>
          <h2 id="exhibition-shelf-heading" ref={headingRef} tabIndex={-1}>
            次に飾る一枚を。
          </h2>
        </div>
        <a className="exhibition-shelf-return dg-control" href="#exhibition-current-work">
          <span>展示室へ戻る ↑</span>
          <span>
            {String(currentIndex + 1).padStart(3, "0")} {GALLERY_ARTWORKS[currentIndex].title}
          </span>
        </a>
      </div>
      <div className="exhibition-shelf-filters">
        <div className="exhibition-shelf-search">
          <label htmlFor={searchInputId}>作品を探す</label>
          <div className="exhibition-shelf-search-field">
            <input
              id={searchInputId}
              ref={searchRef}
              type="search"
              value={query}
              placeholder="題名・描写・作品番号"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setPage(0);
              }}
            />
            {query ? (
              <button
                type="button"
                className="exhibition-shelf-search-clear"
                aria-label="検索をクリア"
                onClick={() => {
                  setQuery("");
                  setPage(0);
                  searchRef.current?.focus({ preventScroll: true });
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>
        </div>
        <label>
          <span>構図</span>
          <select
            value={format}
            onChange={(event) => {
              setFormat(event.currentTarget.value as ExhibitionFormat);
              setPage(0);
            }}
          >
            <option value="all">すべての構図</option>
            <option value="portrait">縦長</option>
            <option value="landscape">横長</option>
            <option value="square">正方形</option>
          </select>
        </label>
        <button
          type="button"
          className="exhibition-shelf-current dg-control"
          onClick={() => {
            setQuery("");
            setFormat("all");
            setPage(Math.floor(currentIndex / PAGE_SIZE));
          }}
        >
          展示中を表示
        </button>
      </div>
      <p className="exhibition-shelf-count" role="status" aria-live="polite" aria-atomic="true">
        {matches.length > 0
          ? `${matches.length}作品中 ${start + 1}–${end}`
          : "条件に合う作品がありません。"}
      </p>
      {matches.length > 0 ? (
        <ul className="exhibition-shelf-grid">
          {matches.slice(start, end).map(({ artwork, index }) => (
            <li key={artwork.id}>
              <button
                type="button"
                className="exhibition-shelf-work dg-control"
                aria-pressed={index === currentIndex}
                aria-label={`${String(index + 1).padStart(3, "0")} ${artwork.title}を展示${index === currentIndex ? "（展示中）" : ""}`}
                onClick={(event) => onSelect(artwork.id, event.currentTarget)}
              >
                <span className="exhibition-shelf-image">
                  <img
                    src={artwork.thumb}
                    width={artwork.width}
                    height={artwork.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  {index === currentIndex ? (
                    <span className="exhibition-shelf-selected" role="status">
                      展示中
                    </span>
                  ) : null}
                </span>
                <span className="exhibition-shelf-work-caption">
                  <span className="exhibition-shelf-caption-num">
                    <ArtworkFormatFrame width={artwork.width} height={artwork.height} />
                    <span>{String(index + 1).padStart(3, "0")}</span>
                  </span>
                  <span>{artwork.title}</span>
                  <span aria-hidden="true">↗</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="exhibition-shelf-empty">
          <p>検索する言葉や構図を変えて、もう一度お探しください。</p>
          <button type="button" onClick={reset}>
            すべての作品に戻す
          </button>
        </div>
      )}
      {count > 1 ? (
        <nav className="exhibition-shelf-pagination" aria-label="作品一覧のページ">
          <button type="button" disabled={page === 0} onClick={() => turnPage(page - 1)}>
            ← 前の12作品
          </button>
          <span
            className="exhibition-ring-page"
            style={{ "--ring-p": ((page + 1) / Math.max(1, count)).toFixed(4) } as CSSProperties}
            aria-label={`${count}ページ中${page + 1}ページ`}
          >
            {page + 1} / {count}
          </span>
          <button type="button" disabled={page === count - 1} onClick={() => turnPage(page + 1)}>
            次の12作品 →
          </button>
        </nav>
      ) : null}
    </section>
  );
}
