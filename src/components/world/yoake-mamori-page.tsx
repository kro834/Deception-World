import { useWorldMode } from "./use-world-mode";
import { DossierContents, DossierReader } from "./dossier-reader";
import { DossierTopbar } from "./world-chrome";
import { YOAKE_MAMORI_SECTIONS } from "./yoake-mamori-data";

const facts = [
  ["名前", "▢▢▢　▢▢"],
  ["名前の読み", "▢▢▢　▢▢▢"],
  ["神名", "夜明護尊"],
  ["神名の読み", "よあけまもりのみこと"],
  ["年齢", "不詳"],
  ["能力", "▢▢▢▢▢▢▢▢▢"],
  ["種族", "神"],
  ["身長", "186.4cm"],
  ["体重", "78.7kg"],
  ["好き", "シュザ"],
  ["嫌い", "その他全て"],
  ["一人称", "俺"],
  ["二人称", "お前"],
];

const sections = YOAKE_MAMORI_SECTIONS;

export function YoakeMamoriPage() {
  useWorldMode();
  return (
    <main className="manager-page" style={{ ["--manager-accent" as string]: "#a8c7ff" }}>
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <DossierTopbar
        fileLabel="CHARACTER FILE // 05"
        returnHash="manager-archive-other"
        returnLabel="その他の人物一覧へ戻る"
      />
      <section className="manager-hero" id="dossier-profile">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src="/character-yoake-mamori.jpeg"
              alt="夜明護尊のキャラクタービジュアル"
              width={736}
              height={976}
              style={{ objectFit: "contain" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <i className="dossier-arrive-scan" aria-hidden="true" />
            <span className="manager-numeral">05</span>
          </div>
        </div>
        <div className="manager-introduction">
          <header className="dossier-identity">
            <p className="manager-file-number">CHARACTER FILE // 05</p>
            <h1>
              <small>よあけまもりのみこと</small>
              <span className="manager-display-name">夜明護尊</span>
            </h1>
            <p className="manager-title">武、風、理解の神</p>
            <a className="dossier-read-link" href="#dossier-index">
              人物資料を読む <span aria-hidden="true">↓</span>
            </a>
          </header>
          <dl className="manager-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value.includes("▢") ? "is-redacted" : undefined}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DossierReader name="夜明護尊" />
      <section className="manager-dossier" id="dossier-index" aria-label="夜明護尊の人物資料">
        <div className="manager-section-index">
          <span>05</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <DossierContents sections={sections} />
        <div className="manager-sections">
          {sections.map((section) => (
            <article
              className="manager-copy-section"
              id={`character-section-${section.no}`}
              key={section.no}
            >
              <div className="manager-copy-heading">
                <span>{section.no}</span>
                <p>{section.kicker}</p>
                <h2>{section.title}</h2>
              </div>
              <div className="manager-copy-body">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
