/* FAR FROM SAGA — the page's editorial furniture (2026-10-22 redesign).

   The same pieces the Rexonance site carries (rexonance-editorial.tsx): the
   hero's two doors and the chapter map under the hero. Static markup only:
   real anchors, no listeners, no startup work.

   Owner (2026-10-23): 「不要なセカンダリラベルや説明を避ける。レイアウトに
   説明させるようにUIリライトして。」 The map is five numbered doors — the
   numeral and the chapter's name, as the bar numbers them; its CONTENTS
   heading, count, codes and descriptions went, and so did the key visual's
   slate and read-outs and the form status beside the rail. */

/** The five chapters as the page numbers them (the Rexonance site's five,
 * owner 2026-10-23). */
export const FAR_FROM_CHAPTERS = [
  { href: "#overview", number: "01", label: "概要・性能" },
  { href: "#p16", number: "02", label: "演算加速機構" },
  { href: "#suitup", number: "03", label: "変身" },
  { href: "#stages", number: "04", label: "形態" },
  { href: "#theories", number: "05", label: "中核機構" },
] as const;

/** Static page map under the hero: real anchors, no scroll listeners. */
export function FarFromChapterMap() {
  return (
    <nav className="rxs-chapter-index ffs-chapter-map" aria-label="ファーフロムサーガの見どころ">
      {FAR_FROM_CHAPTERS.map((chapter) => (
        <a key={chapter.href} href={chapter.href}>
          <b aria-hidden="true">{chapter.number}</b>
          <span>{chapter.label}</span>
          <i aria-hidden="true">↗</i>
        </a>
      ))}
    </nav>
  );
}

/** The hero's two doors: the suit-up, and the five forms. */
export function FarFromHeroRail() {
  return (
    <div className="ffs-hero-rail">
      <a className="ffs-hero-primary" href="#suitup">
        <span>変身を体験</span>
        <i aria-hidden="true">↘</i>
      </a>
      <a className="ffs-hero-secondary" href="#stages">
        <span>五つの形態を見る</span>
        <i aria-hidden="true">↗</i>
      </a>
    </div>
  );
}

/** The aperture behind the key visual: static rings and graduations
 * (the Rexonance stage's plate, redrawn for five forms). */
export function FarFromAperture() {
  return (
    <svg
      className="ffs-aperture"
      viewBox="0 0 720 800"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="ffs-aperture-grid">
        <path d="M360 24v752M20 400h680M96 136l528 528M96 664 624 136" />
        <circle cx="360" cy="400" r="326" />
        <circle cx="360" cy="400" r="286" />
        <circle cx="360" cy="400" r="214" />
      </g>
      <g className="ffs-aperture-phase is-ice">
        <path d="M118 262A286 286 0 0 1 602 262" />
      </g>
      <g className="ffs-aperture-phase is-gold">
        <path d="M646 400a286 286 0 0 1-120 232" />
        <path d="M74 400a286 286 0 0 0 120 232" />
      </g>
      <g className="ffs-aperture-phase is-violet">
        <path d="M250 672a286 286 0 0 0 220 0" />
      </g>
      <g className="ffs-aperture-graduations">
        <path d="M360 34v18m0 696v18M34 400h18m616 0h18" />
        <path d="M186 762h348m-300 8h252m-196 8h140" />
      </g>
    </svg>
  );
}
