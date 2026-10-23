import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import { FAR_FROM_SAGA_STAGE_ORDER, type FarFromStageKey } from "@/lib/far-from-saga-artwork";

/* FAR FROM SAGA — the page's editorial furniture (2026-10-22 redesign).

   The same pieces the Rexonance site carries (rexonance-editorial.tsx):
   the hero's two doors, the CONTENTS map under the hero, the key visual's
   slate and read-outs, and the form-sequence status beside the stage
   rail. Static markup only: real anchors, no listeners, no startup work.
   Every line of copy here is the site's own plain Japanese; the record's
   figures (the read-outs) come from the owner's spec table. */

/** The five chapters as the page numbers them (the Rexonance site's five,
 * owner 2026-10-23), each with the sections it holds. The codes match the
 * side menu's. */
export const FAR_FROM_CHAPTERS = [
  {
    href: "#overview",
    number: "01",
    code: "OVERVIEW",
    label: "概要・性能",
    detail: "変身音声と概要、スペック、比較コンソールと設定資料の全文",
  },
  { href: "#p16", number: "02", code: "P16", label: "演算加速機構", detail: "第16世代演算加速機構" },
  { href: "#suitup", number: "03", code: "SUIT-UP", label: "変身", detail: "スクロールで装着、ミドルからウルトラまで" },
  { href: "#stages", number: "04", code: "5 STAGES", label: "形態", detail: FAR_FROM_SAGA.stagesLine },
  {
    href: "#theories",
    number: "05",
    code: "SYSTEM",
    label: "中核機構",
    detail: "4つの新規理論・中核機構、装甲・OS、神属権限、武装、必殺技",
  },
] as const;

/** Static page map under the hero: real anchors, no scroll listeners. */
export function FarFromChapterMap() {
  return (
    <nav className="rxs-chapter-index ffs-chapter-map" aria-label="ファーフロムサーガの見どころ">
      <p className="ffs-chapter-map-heading">
        <span lang="en">CONTENTS</span>
        <small>01 — 05</small>
      </p>
      {FAR_FROM_CHAPTERS.map((chapter) => (
        <a key={chapter.href} href={chapter.href}>
          <b aria-hidden="true">{chapter.number}</b>
          <small lang="en">{chapter.code}</small>
          <span>{chapter.label}</span>
          <em>{chapter.detail}</em>
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

/** The key visual's slate: what the frame holds (decorative). */
export function FarFromStageSlate() {
  return (
    <span className="ffs-stage-slate">
      <b>01</b>
      <span>
        ミドル <span lang="en">/ STANDARD</span>
      </span>
      <small lang="en">KEY VISUAL</small>
    </span>
  );
}

/** Three read-outs beside the key visual, from the owner's spec table
 * (パンチ力, ジャンプ力, 認識・制御の『P16』); decorative, the table below
 * is the record. */
export function FarFromCallouts() {
  const spec = (dt: string) => FAR_FROM_SAGA.specs.find((row) => row.dt === dt)?.dd ?? "";
  return (
    <span className="ffs-callouts">
      <span className="ffs-callout is-punch">
        <span>
          <i />
          <b>{spec("パンチ力")}</b>
          <em lang="en">PUNCH</em>
        </span>
      </span>
      <span className="ffs-callout is-jump">
        <span>
          <i />
          <b>{spec("ジャンプ力")}</b>
          <em lang="en">JUMP</em>
        </span>
      </span>
      <span className="ffs-callout is-core">
        <span>
          <i />
          <b>P16</b>
          <em lang="en">PROCESSING CORE</em>
        </span>
      </span>
    </span>
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

/** Read-only context beside the stage rail; the tablist owns input. */
export function FarFromFormStatus({ stage }: { stage: FarFromStageKey }) {
  const index = FAR_FROM_SAGA_STAGE_ORDER.indexOf(stage) + 1;
  const form = FAR_FROM_SAGA.stages[stage];
  return (
    <div
      className="ffs-form-status"
      data-stage={stage}
      style={{ ["--ffs-accent" as string]: form.accent }}
    >
      <div className="ffs-form-status-heading">
        <span lang="en">FORM SEQUENCE</span>
        <span>
          {String(index).padStart(2, "0")} / {String(FAR_FROM_SAGA_STAGE_ORDER.length).padStart(2, "0")}
        </span>
      </div>
      <div className="ffs-form-status-track" aria-hidden="true">
        {FAR_FROM_SAGA_STAGE_ORDER.map((key, at) => (
          <i key={key} className={at < index ? "is-reached" : ""} />
        ))}
      </div>
      <p>
        <span>選択中の形態</span>
        <strong>{form.label}</strong>
      </p>
    </div>
  );
}
