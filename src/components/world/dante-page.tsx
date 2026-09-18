import { useWorldMode } from "./use-world-mode";
import { DossierNav } from "./dossier-nav";
import { DossierTopbar } from "./world-chrome";
import { DossierContents, DossierReader } from "./dossier-reader";
import { FormPickup } from "./manager-stub";
import {
  DANTE_FACTS,
  DANTE_FORMS,
  DANTE_QUOTES,
  DANTE_SECTIONS,
  UNMANAGED_NAV,
} from "./dante-data";

export function DantePage() {
  useWorldMode();
  return (
    <main
      className="manager-page related-character-page dante-page"
      style={{
        ["--manager-accent" as string]: "#ed667e",
        ["--manager-accent-soft" as string]: "#ed667e",
        ["--future-hud-primary" as string]: "#ed667e",
      }}
    >
      <div className="dante-entry-glitch" aria-hidden="true">
        <span>DANTE // UNMANAGED</span>
        <i />
        <i />
      </div>
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <DossierTopbar
        fileLabel="UNMANAGED / DANTE"
        returnHash="manager-archive-unmanaged"
        returnLabel="管理外へ戻る"
      />
      <section className="manager-hero" id="dossier-profile">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src="/character-dante.webp"
              width={1000}
              height={1250}
              alt="ダンテのキャラクタービジュアル"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              style={{ objectFit: "contain", objectPosition: "50% 0%" }}
            />
            <span className="manager-numeral">01</span>
          </div>
        </div>
        <div className="manager-introduction">
          <header className="dossier-identity">
            <p className="manager-file-number">SCARS // No.1</p>
            <h1>
              <small>DANTE / UNMANAGED</small>
              <span className="manager-display-name">ダンテ</span>
            </h1>
            <p className="manager-title"># 管理人殺し</p>
            <a className="dossier-read-link" href="#dossier-index">
              人物資料を読む <span aria-hidden="true">↓</span>
            </a>
          </header>
          <div className="manager-quotes">
            {DANTE_QUOTES.map((quote) => (
              <q key={quote}>{quote}</q>
            ))}
          </div>
          <dl className="manager-facts">
            {DANTE_FACTS.map((fact) => (
              <div key={fact.dt}>
                <dt>{fact.dt}</dt>
                <dd>{fact.dd}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DossierReader name="ダンテ" forms />
      <section className="manager-dossier" id="dossier-index" aria-label="ダンテの人物資料">
        <div className="manager-section-index">
          <span>01</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <DossierContents sections={DANTE_SECTIONS} />
        <div className="manager-sections">
          {DANTE_SECTIONS.map((section) => (
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
                {section.body.map((body) => (
                  <p key={body}>{body}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <div id="form-records">
        {DANTE_FORMS.map((rider) => (
          <FormPickup key={rider.name} rider={rider} />
        ))}
      </div>
      <DossierNav items={UNMANAGED_NAV} currentHref="/characters/dante" indexLabel="UNMANAGED" />
    </main>
  );
}
