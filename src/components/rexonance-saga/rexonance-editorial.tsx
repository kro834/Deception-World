/* The page's editorial furniture: the chapter map under the hero and the
   hero's two doors. Static markup only: real anchors, no listeners.

   Owner (2026-10-23): 「不要なセカンダリラベルや説明を避ける。レイアウトに
   説明させるようにUIリライトして。」 The map is five numbered doors — the
   numeral and the chapter's name, as the bar numbers them. Its CONTENTS
   heading, count and codes went; each door's line on the chapter is read
   to assistive tech only (it names where the link leads). The form status
   beside the stage rail went too (the tabs and the panel carry the choice).
   The labels and lines keep this four-space form: the Mincho subsets are
   cut from them (scripts/rexonance-type-copy.mjs). */

const CHAPTERS = [
  {
    href: "#performance",
    number: "01",
    label: "性能",
    detail: "標準カタログ値の比較",
  },
  {
    href: "#p14",
    number: "02",
    label: "演算基盤",
    detail: "第14世代の演算基盤",
  },
  {
    href: "#assembly",
    number: "03",
    label: "変身",
    detail: "スクロールで装甲が形成される",
  },
  {
    href: "#stages",
    number: "04",
    label: "三つの形態",
    detail: "レクソナンス／マックス／ウルトラ",
  },
  {
    href: "#system",
    number: "05",
    label: "共鳴構造",
    detail: "悠真自身の自己共鳴構造",
  },
] as const;

/** Static page map: real anchors, no scroll listeners or extra startup work. */
export function RexonanceChapterMap() {
  return (
    <nav className="rxs-chapter-index rxe-chapter-map" aria-label="レクソナンスの見どころ">
      {CHAPTERS.map((chapter) => (
        <a key={chapter.href} href={chapter.href}>
          <b aria-hidden="true">{chapter.number}</b>
          <span>{chapter.label}</span>
          <em className="visually-hidden">{chapter.detail}</em>
          <i aria-hidden="true">↗</i>
        </a>
      ))}
    </nav>
  );
}

export function RexonanceHeroRail() {
  return (
    <div className="rxe-hero-rail">
      <a className="rxe-hero-primary" href="#assembly">
        <span>変身を体験</span>
        <i aria-hidden="true">↘</i>
      </a>
      <a className="rxe-hero-secondary" href="#stages">
        <span>三つの形態を見る</span>
        <i aria-hidden="true">↗</i>
      </a>
    </div>
  );
}
