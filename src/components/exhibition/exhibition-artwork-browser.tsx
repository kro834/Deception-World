import { useRef, useState } from "react";
import { GALLERY_ARTWORKS } from "@/components/gallery/gallery-data";
import {
  exhibitionBrowsePage,
  findExhibitionArtworks,
  type ExhibitionFormat,
} from "./exhibition-artwork-browse";

const PAGE_SIZE = 12;

export function ExhibitionArtworkBrowser({
  currentIndex,
  onSelect,
}: {
  currentIndex: number;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ExhibitionFormat>("all");
  const [requestedPage, setPage] = useState(() => Math.floor(currentIndex / PAGE_SIZE));
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
        <label className="exhibition-shelf-search">
          <span>作品を探す</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="題名・描写・作品番号"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(0);
            }}
          />
        </label>
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
                onClick={() => onSelect(artwork.id)}
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
                    <span className="exhibition-shelf-selected">展示中</span>
                  ) : null}
                </span>
                <span className="exhibition-shelf-work-caption">
                  <span>{String(index + 1).padStart(3, "0")}</span>
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
          <span aria-label={`${count}ページ中${page + 1}ページ`}>
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
