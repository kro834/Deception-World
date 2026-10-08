import { useId, useRef } from "react";

type GallerySearchControlsProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export function GallerySearchControls({ query, onQueryChange }: GallerySearchControlsProps) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="gallery-search">
      <label htmlFor={inputId}>作品を検索</label>
      <div className="gallery-search-input-row">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="青 金 ／ 003 ／ 080–089"
          aria-label="作品を番号、画像の説明、公開タイトルで検索"
          aria-describedby={helpId}
        />
        {query && (
          <button
            type="button"
            className="gallery-search-clear"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            検索を解除
          </button>
        )}
      </div>
      <details className="gallery-search-tips">
        <summary>検索のヒント</summary>
        <p className="gallery-search-help" id={helpId}>
          空白で区切ると、すべての語を含む作品を検索します（例：青 金）。番号は完全一致で、
          080–089のような範囲も指定できます。投稿の番号はU001の形式です。
        </p>
      </details>
    </div>
  );
}
