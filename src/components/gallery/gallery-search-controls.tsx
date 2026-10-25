import { useId, useRef } from "react";

type GallerySearchControlsProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export function GallerySearchControls({ query, onQueryChange }: GallerySearchControlsProps) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  return (
    <div className="gallery-search">
      <label htmlFor={inputId}>作品を検索</label>
      <div className="gallery-search-input-row">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => onQueryChange(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (
              event.key !== "Escape" ||
              composingRef.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229 ||
              !query
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onQueryChange("");
          }}
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
      <p className="gallery-search-description" id={helpId}>
        番号・画像の説明・公開タイトルから検索できます。
      </p>
      <details className="gallery-search-tips">
        <summary>検索のヒント</summary>
        <dl className="gallery-search-examples">
          <div>
            <dt>青 金</dt>
            <dd>空白で区切ると、すべての語を含む作品</dd>
          </div>
          <div>
            <dt>003 ／ 080–089</dt>
            <dd>番号の完全一致、または番号の範囲</dd>
          </div>
          <div>
            <dt>U001</dt>
            <dd>投稿された作品の番号</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
