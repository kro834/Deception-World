import { GuardedLink } from "@/components/load-gate";
import { dossierImage } from "@/lib/dossier-images";
import { DisplayName } from "@/components/name-text";
import { CIEL_PORTRAIT, cielPortrait } from "@/lib/thumbnail-images";
import { useWorldMode } from "./use-world-mode";
import { NameText, RE_DIVE_RIKUEI_NAV } from "./dossier-nav";
import { FormPickup } from "./manager-stub";
import { DossierContents, DossierReader, PhrasedText } from "./dossier-reader";
import { RIDER_DOSSIERS } from "./rider-page";
import { DossierTopbar } from "./world-chrome";
import { CharacterChapterTools, CharacterRelatedRecords } from "./character-reading-tools";

/* シエル (月城悠真), RE DIVE's 六詠 I: his own page (/characters/ciel).

   For now his record is the one the eight riders keep for 月城悠真
   (rider-page.tsx, Saga): the same profile, quotes, facts, chapters, the
   Kamen Rider forms and the special site, without the nightmare pickup
   (マキャベル). It is headed by his name and his illustration, in his
   colours: emerald green and light blue (styles-ciel.css). The layout and
   the reading aids are the rider dossier's own classes, so they stay in step
   with it. */

const SAGA = RIDER_DOSSIERS.find((rider) => rider.id === "saga") ?? RIDER_DOSSIERS[0];
const CIEL = RE_DIVE_RIKUEI_NAV[0];
// The section he is reached from (re-dive-section.tsx RE_DIVE_SECTION_ID).
const RE_DIVE_HASH = "re-dive";

const CIEL_EMERALD = "#1ccf9d";
const CIEL_AQUA = "#86d9ff";

export function CielPage() {
  useWorldMode();
  const pickupForms = SAGA.forms.filter((form) => form.featuredPickup);
  const portrait = CIEL_PORTRAIT.variants[CIEL_PORTRAIT.variants.length - 1];
  return (
    <main
      className="manager-page rider-dossier-page ciel-dossier-page dg-focus-scope"
      style={{
        ["--manager-accent" as string]: CIEL_EMERALD,
        ["--manager-accent-soft" as string]: CIEL_AQUA,
        ["--rider-tone" as string]: CIEL_EMERALD,
        ["--archive-accent" as string]: CIEL_EMERALD,
        ["--archive-accent-soft" as string]: CIEL_AQUA,
        ["--future-hud-primary" as string]: CIEL_AQUA,
      }}
    >
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      {/* A file shows no file line in its top bar (2026-10-23, the dossier
          sheets); the label names the brand link's way back. */}
      <DossierTopbar
        fileLabel={`${CIEL.name}の資料`}
        returnHash={RE_DIVE_HASH}
        returnLabel="六詠一覧へ戻る"
      />
      <i className="dg-rail" aria-hidden="true" />
      <section className="manager-hero" id="dossier-profile">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src={portrait.path}
              {...cielPortrait()}
              alt="シエルのキャラクタービジュアル"
              width={1122}
              height={1402}
              style={{ objectPosition: "60% 6%", objectFit: "cover" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <i className="dossier-arrive-scan" aria-hidden="true" />
          </div>
        </div>
        <div className="manager-introduction">
          <header className="dossier-identity">
            {/* RE DIVE's 六詠 I: the numeral in outline over the name, as on
                every file (decorative). */}
            <span className="dossier-file-numeral" data-numerals="roman" aria-hidden="true">
              {CIEL.id}
            </span>
            <h1>
              <span
                className="manager-display-name"
                style={{ ["--name-len" as string]: [...CIEL.name].length }}
              >
                <NameText value={CIEL.name} />
              </span>
            </h1>
            <p className="manager-title"># {SAGA.epithet}</p>
          </header>
          <div className="manager-quotes">
            {SAGA.quotes.map((quote) => (
              <q key={quote}>{quote}</q>
            ))}
          </div>
          <dl className="manager-facts">
            {SAGA.facts.map((fact) => (
              <div key={fact.dt}>
                <dt>{fact.dt}</dt>
                <dd>
                  <NameText value={fact.dd} seams />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DossierReader name={CIEL.name} identity forms={pickupForms.length > 0} />
      <section
        className="rider-archive-identity-records"
        id="identity-records"
        aria-label="変身前記録"
      >
        <figure className="rider-archive-civilian">
          <div className="rider-archive-civilian-visual">
            <img
              src={SAGA.civilianImg}
              srcSet={dossierImage(SAGA.civilianImg).srcSet}
              sizes="(max-width: 760px) 92vw, (max-width: 1120px) 44vw, 520px"
              alt=""
              style={{ objectPosition: SAGA.civilianPos }}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
            <i className="rider-archive-civilian-shade" />
          </div>
          <figcaption>
            <p>{SAGA.civilian.kicker}</p>
            <small>変身前の姿</small>
            <h2>{SAGA.civilian.name}</h2>
            <p>{SAGA.civilian.body}</p>
            {SAGA.civilian.cv ? <p>CV {SAGA.civilian.cv}</p> : null}
          </figcaption>
        </figure>
      </section>
      <section className="manager-dossier" id="dossier-index" aria-label="シエルの人物資料">
        <DossierContents sections={SAGA.sections} />
        <div className="manager-sections">
          {SAGA.sections.map((section) => (
            <article
              className="manager-copy-section dg-reveal"
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
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                ))}
              </div>
              <CharacterChapterTools
                sections={SAGA.sections}
                currentNo={section.no}
                continuation={
                  pickupForms.length ? { href: "#form-records", title: "変身記録" } : undefined
                }
              />
            </article>
          ))}
        </div>
        <CharacterRelatedRecords
          records={[
            {
              to: "/riders/saga",
              assets: [SAGA.civilianImg],
              title: "仮面ライダーサーガ",
            },
            ...(SAGA.special
              ? [
                  {
                    to: SAGA.special.to,
                    hash: SAGA.special.hash,
                    assets: SAGA.special.assets,
                    title: `仮面ライダー${SAGA.special.name}`,
                  },
                ]
              : []),
          ]}
        />
      </section>
      {pickupForms.length ? (
        <div className="rider-form-pickup-stack" id="form-records">
          {pickupForms.map((form, index) => (
            <FormPickup
              key={`${form.name}-${form.sub ?? "base"}`}
              rider={{
                img: form.img,
                pos: form.pos,
                system: form.system,
                name: form.displayName ?? (index === 0 ? SAGA.ja : form.name),
                sub: form.sub ?? (index === 0 && form.name !== SAGA.ja ? form.name : undefined),
                calls: form.calls,
                quote: form.quote,
                overview: form.overview,
                theme: form.theme,
                stats: form.stats,
                abilities: form.abilities,
                arsenal: form.arsenal,
                finishers: form.finishers,
                weaponGallery: form.weaponGallery,
                // As on the Saga page: the other forms ride with each pickup.
                extraForms:
                  form.theme === "rexonance"
                    ? undefined
                    : SAGA.forms.filter(
                        (candidate) => !candidate.featuredPickup || candidate === form,
                      ),
              }}
            />
          ))}
        </div>
      ) : null}
      {SAGA.special ? (
        <section
          className="rider-special-site"
          id="special-site"
          aria-labelledby="rider-special-site-title"
        >
          <article className="rider-special-site-card">
            <div className="rider-special-site-visual">
              <img
                src={SAGA.special.img}
                alt={`仮面ライダー${SAGA.special.name}のビジュアル`}
                style={{ objectPosition: SAGA.special.pos }}
                width="1080"
                height="1440"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
            </div>
            <div className="rider-special-site-copy">
              <p>{SAGA.special.kicker}</p>
              <h2 id="rider-special-site-title">
                <span>仮面ライダー</span>
                <b>
                  <DisplayName value={SAGA.special.name} />
                </b>
              </h2>
              {SAGA.special.sub ? <em>{SAGA.special.sub}</em> : null}
              <q>{SAGA.special.quote}</q>
              <GuardedLink
                to={SAGA.special.to}
                hash={SAGA.special.hash}
                assets={SAGA.special.assets}
                className="rider-special-site-link"
                aria-label={`仮面ライダー${SAGA.special.name}の特設サイトを開く`}
              >
                <span>{SAGA.special.label}</span>
                <i aria-hidden="true">↗</i>
              </GuardedLink>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
