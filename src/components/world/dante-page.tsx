import { useWorldMode } from "./use-world-mode";
import { DossierNav } from "./dossier-nav";
import { DossierTopbar } from "./world-chrome";
import { DossierContents, DossierReader, PhrasedText } from "./dossier-reader";
import { FormPickup } from "./manager-stub";
import { VARG_FACTS, VARG_SECTIONS } from "./varg-data";
import { CharacterChapterTools, CharacterRelatedRecords } from "./character-reading-tools";
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
        fileLabel="SECOND DOG / DANTE / VARG"
        returnHash="manager-archive-dogs"
        returnLabel="犬の一覧へ戻る"
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
            <i className="dossier-arrive-scan" aria-hidden="true" />
            <span className="manager-numeral">01</span>
          </div>
        </div>
        <div className="manager-introduction">
          <header className="dossier-identity">
            <p className="manager-file-number">SCARS // No.1</p>
            <h1>
              <small>DANTE / VARG</small>
              <span className="manager-display-name">ダンテ／ヴァルグ</span>
            </h1>
            <p className="manager-title"># 管理人殺し ／ 第二の犬</p>
            <a className="dossier-read-link" href="#dossier-index">
              人物資料を読む <span aria-hidden="true">↓</span>
            </a>
          </header>
          <div className="manager-quotes">
            {DANTE_QUOTES.map((quote) => (
              <q key={quote}>{quote}</q>
            ))}
          </div>
          <dl className="manager-facts" aria-label="宿主・ダンテの人物録">
            {DANTE_FACTS.map((fact) => (
              <div key={fact.dt}>
                <dt>{fact.dt}</dt>
                <dd>{fact.dd}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DossierReader name="ダンテ／ヴァルグ" forms />
      <section
        className="manager-dossier"
        id="dossier-index"
        aria-label="ダンテ／ヴァルグの人物資料"
      >
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
                <h2>
                  <PhrasedText text={section.title} />
                </h2>
              </div>
              <div className="manager-copy-body">
                {section.no === "04" ? (
                  <figure className="varg-portrait">
                    <img
                      src="/character-varg-20261021-720.webp"
                      srcSet="/character-varg-20261021-360.webp 360w, /character-varg-20261021-720.webp 720w, /character-varg-20261021.webp 1088w"
                      sizes="(max-width: 760px) calc(100vw - 40px), 640px"
                      width={1088}
                      height={1445}
                      alt="第二の犬・ヴァルグの本来形態。漆黒の巨躯、深紅の棘と紋様、浮遊する深紅冠。"
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption>
                      第二の犬・ヴァルグ ／ 本来形態
                      <br />
                      <a href="/character-varg-20261021-original.webp">原寸画像を見る</a>
                    </figcaption>
                  </figure>
                ) : null}
                {section.no === "04" ? (
                  <dl className="manager-facts" aria-label="ヴァルグの人物録">
                    {VARG_FACTS.map((fact) => (
                      <div key={fact.dt}>
                        <dt>{fact.dt}</dt>
                        <dd>{fact.dd}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {section.body.map((body) => (
                  <p key={body}>{body}</p>
                ))}
              </div>
              <CharacterChapterTools
                sections={DANTE_SECTIONS}
                currentNo={section.no}
                continuation={{ href: "#form-records", title: "ルーラーの変身記録" }}
              />
            </article>
          ))}
        </div>
        <CharacterRelatedRecords
          records={[
            {
              href: `#character-section-${VARG_SECTIONS[0].no}`,
              title: VARG_SECTIONS[0].title,
              context: "第二の犬・ヴァルグの記録へ",
            },
            ...DANTE_FORMS.map((form) => ({
              href: `#${form.id}`,
              title: form.name,
              context: "変身記録へ",
            })),
          ]}
        />
      </section>
      <div id="form-records">
        {DANTE_FORMS.map((rider) => (
          <div id={rider.id} key={rider.id} className="character-reading-target">
            <FormPickup rider={rider} />
          </div>
        ))}
      </div>
      <DossierNav
        items={UNMANAGED_NAV}
        currentHref="/characters/dante"
        indexLabel="犬"
        returnHash="manager-archive-dogs"
      />
    </main>
  );
}
