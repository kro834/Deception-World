type RexonanceForm = "standard" | "max" | "ultra";

const CHAPTERS = [
  {
    href: "#performance",
    number: "01",
    code: "PERFORMANCE",
    label: "性能",
    detail: "標準カタログ値の比較",
  },
  {
    href: "#p14",
    number: "02",
    code: "P14",
    label: "演算基盤",
    detail: "第14世代の演算基盤",
  },
  {
    href: "#assembly",
    number: "03",
    code: "SUIT-UP",
    label: "変身",
    detail: "スクロールで装甲が形成される",
  },
  {
    href: "#stages",
    number: "04",
    code: "3 STAGES",
    label: "三つの形態",
    detail: "レクソナンス／マックス／ウルトラ",
  },
  {
    href: "#system",
    number: "05",
    code: "SELF-RESONANCE",
    label: "共鳴構造",
    detail: "悠真自身の自己共鳴構造",
  },
] as const;

/** Static page map: real anchors, no scroll listeners or extra startup work. */
export function RexonanceChapterMap() {
  return (
    <nav className="rxs-chapter-index rxe-chapter-map" aria-label="レクソナンスの見どころ">
      <p className="rxe-chapter-map-heading">
        <span>CONTENTS</span>
        <small>01 — 05</small>
      </p>
      {CHAPTERS.map((chapter) => (
        <a key={chapter.href} href={chapter.href}>
          <b aria-hidden="true">{chapter.number}</b>
          <small>{chapter.code}</small>
          <span>{chapter.label}</span>
          <em>{chapter.detail}</em>
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

/** Read-only context beside the existing form tabs; the tablist owns input. */
export function RexonanceFormStatus({
  stage,
  label,
  code,
  purpose,
  accent,
}: {
  stage: RexonanceForm;
  label: string;
  code: string;
  purpose: string;
  accent: string;
}) {
  const index = stage === "standard" ? 1 : stage === "max" ? 2 : 3;
  return (
    <div
      className="rxe-form-status"
      data-stage={stage}
      style={{ ["--rxs-stage-accent" as string]: accent }}
    >
      <div className="rxe-form-status-heading">
        <span>FORM SEQUENCE</span>
        <span>{String(index).padStart(2, "0")} / 03</span>
      </div>
      <div className="rxe-form-status-track" aria-hidden="true">
        <i className={index >= 1 ? "is-reached" : ""} />
        <i className={index >= 2 ? "is-reached" : ""} />
        <i className={index >= 3 ? "is-reached" : ""} />
      </div>
      <p>
        <span>選択中の形態</span>
        <strong>{label}</strong>
        <small>{code}</small>
        <em>{purpose}</em>
      </p>
    </div>
  );
}
