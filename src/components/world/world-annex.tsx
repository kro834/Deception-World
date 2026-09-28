import { GuardedLink } from "@/components/load-gate";
import { NameText, RELATED_NAV, RIDER_NAV, RIKUEI_NAV } from "./dossier-nav";
import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
  WORLD_QUOTES,
  type WorldAnnexLine,
} from "./world-annex-data";

/* The World annex: five text sections from the owner's story source, in two
   groups after the chapters they extend (world-home.tsx): the contents, the
   world brief and the people after 02 RIDERS, the episode lines, glossary and
   quotes after 03 RECORDS. Nothing sits between the column rail and the
   riders heading, which verify-world-reveal presses beside part-lit type. They are static documents: no reveal, no scroll motion, no rail.
   The topbar's three chapter links stay as they are; the contents list below
   is the way into the annex. Styles: styles-world-annex.css. */

const ANNEX_CONTENTS: readonly { href: string; label: string }[] = [
  { href: "#world-brief", label: "世界と組織" },
  { href: "#cast-roster", label: "人物一覧" },
  { href: "#episode-notes", label: "エピソードの言葉" },
  { href: "#glossary", label: "用語集" },
  { href: "#quotes", label: "名台詞" },
];

const DOSSIER_ASSETS = new Map<string, readonly string[]>(
  [...RIKUEI_NAV, ...RIDER_NAV, ...RELATED_NAV]
    .filter((item) => item.href)
    .map((item) => [item.href as string, item.assets]),
);
DOSSIER_ASSETS.set("/characters/yoake-mamori", ["/character-yoake-mamori.jpeg"]);

const pad = (value: number) => String(value).padStart(2, "0");

function AnnexQuote({ text, by }: { text: string; by?: string }) {
  return (
    <figure className="wa-quote">
      <blockquote>
        <p>「{text}」</p>
      </blockquote>
      {by ? <figcaption>{by}</figcaption> : null}
    </figure>
  );
}

function AnnexHeading({
  id,
  code,
  title,
  count,
}: {
  id: string;
  code: string;
  title: string;
  count: string;
}) {
  return (
    <header className="wa-heading">
      <p className="wa-code">{code}</p>
      <h2 id={id}>{title}</h2>
      <span className="wa-count">{count}</span>
    </header>
  );
}

function Lines({ lines }: { lines: readonly WorldAnnexLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <AnnexQuote key={line.text} text={line.text} by={line.by} />
      ))}
    </>
  );
}

/** The annex contents and the world brief. */
function WorldAnnexBrief() {
  return (
    <>
      <nav className="wa-contents" aria-labelledby="wa-contents-title">
        <div className="wa-contents-inner">
          <p className="wa-code">ARCHIVE INDEX</p>
          <h2 id="wa-contents-title">資料目次</h2>
          <ol>
            {ANNEX_CONTENTS.map(({ href, label }, index) => (
              <li key={href}>
                <a href={href}>
                  <small aria-hidden="true">{pad(index + 1)}</small>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <section id="world-brief" className="world-annex" aria-labelledby="world-brief-title">
        <div className="wa-inner">
          <AnnexHeading
            id="world-brief-title"
            code="WORLD BRIEF"
            title="世界と組織"
            count={`${pad(WORLD_BRIEF.length)} FILES`}
          />
          <div className="wa-brief-grid">
            {WORLD_BRIEF.map((entry) => (
              <article
                key={entry.id}
                className={`wa-plate wa-brief is-${entry.id}`}
                aria-labelledby={`wa-brief-${entry.id}`}
              >
                <p className="wa-code">{entry.code}</p>
                <h3 id={`wa-brief-${entry.id}`}>{entry.name}</h3>
                {entry.body.map((paragraph) => (
                  <p key={paragraph} className="wa-prose">
                    {paragraph}
                  </p>
                ))}
                {entry.mission ? (
                  <p className="wa-mission">
                    <b lang="en">{entry.mission.code}</b>
                    <span>{entry.mission.text}</span>
                  </p>
                ) : null}
                <Lines lines={entry.said} />
                {entry.hud?.length ? (
                  <ul className="wa-readout" lang="en">
                    {entry.hud.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {entry.docs?.map((doc) => (
                  <section key={doc.office} className="wa-doc" aria-label={doc.office}>
                    <h4>{doc.office}</h4>
                    <p className="wa-doc-subject">
                      <b>件名</b>
                      <span>{doc.subject}</span>
                    </p>
                    <AnnexQuote text={doc.excerpt} />
                    <p className="wa-doc-verdict">
                      <b>最終判定</b>
                      <span>{doc.verdict}</span>
                    </p>
                  </section>
                ))}
              </article>
            ))}
          </div>
          <section className="wa-locations" aria-labelledby="wa-locations-title">
            <p className="wa-code">LOCATIONS</p>
            <h3 id="wa-locations-title">舞台</h3>
            <ol>
              {WORLD_LOCATIONS.map((place, index) => (
                <li key={place.name}>
                  <span className="wa-index" aria-hidden="true">
                    {pad(index + 1)}
                  </span>
                  <b>{place.name}</b>
                  <p>{place.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </section>
    </>
  );
}

/** After 02 RIDERS: the contents, the world brief and the people, text first. */
export function WorldAnnexRiders() {
  return (
    <>
      <WorldAnnexBrief />
      <section id="cast-roster" className="world-annex" aria-labelledby="cast-roster-title">
        <div className="wa-inner">
          <AnnexHeading
            id="cast-roster-title"
            code="CHARACTERS"
            title="人物一覧"
            count={`${pad(WORLD_CAST_ROSTER.length)} PERSONS`}
          />
          <ol className="wa-roster">
            {WORLD_CAST_ROSTER.map((entry, index) => (
              <li key={entry.id}>
                <article className="wa-plate wa-person" aria-labelledby={`wa-person-${entry.id}`}>
                  <span className="wa-index" aria-hidden="true">
                    {pad(index + 1)}
                  </span>
                  <p className="wa-role">{entry.role}</p>
                  <h3 id={`wa-person-${entry.id}`}>
                    <NameText value={entry.name} />
                  </h3>
                  {entry.profile.map((item) =>
                    item.by ? (
                      <AnnexQuote key={item.text} text={item.text} by={item.by} />
                    ) : (
                      <p key={item.text} className="wa-prose">
                        {item.text}
                      </p>
                    ),
                  )}
                  {entry.line ? <AnnexQuote text={entry.line} /> : null}
                  {entry.to ? (
                    <GuardedLink
                      className="wa-open"
                      to={entry.to}
                      assets={DOSSIER_ASSETS.get(entry.to) ?? []}
                      aria-label={`${entry.name}の個別資料を開く`}
                    >
                      <span>OPEN DOSSIER</span>
                    </GuardedLink>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

/** After 03 RECORDS: lines per episode, the glossary and the quotes band. */
export function WorldAnnexRecords() {
  return (
    <>
      <section id="episode-notes" className="world-annex" aria-labelledby="episode-notes-title">
        <div className="wa-inner">
          <AnnexHeading
            id="episode-notes-title"
            code="EPISODE LINES"
            title="エピソードの言葉"
            count={`EP.${WORLD_EPISODE_NOTES[0].no}–${WORLD_EPISODE_NOTES[WORLD_EPISODE_NOTES.length - 1].no}`}
          />
          <ol className="wa-episodes">
            {WORLD_EPISODE_NOTES.map((episode) => (
              <li key={episode.no} className="wa-plate wa-episode">
                <p className="wa-episode-head">
                  <span>
                    EPISODE <b>{episode.no}</b>
                  </span>
                  <strong lang="en">{episode.title}</strong>
                  <small>
                    <i lang="en">STAGE</i> {episode.stage}
                  </small>
                </p>
                <Lines lines={episode.lines} />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="glossary" className="world-annex" aria-labelledby="glossary-title">
        <div className="wa-inner">
          <AnnexHeading
            id="glossary-title"
            code="KEYWORDS"
            title="用語集"
            count={`${pad(WORLD_GLOSSARY.length)} TERMS`}
          />
          <dl className="wa-glossary">
            {WORLD_GLOSSARY.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>
                  {entry.body.map((paragraph) => (
                    <p key={paragraph} className="wa-prose">
                      {paragraph}
                    </p>
                  ))}
                  <Lines lines={entry.said} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="quotes" className="world-annex wa-quotes" aria-labelledby="quotes-title">
        <div className="wa-inner">
          <AnnexHeading
            id="quotes-title"
            code="QUOTES"
            title="名台詞"
            count={`${pad(WORLD_QUOTES.length)} LINES`}
          />
          <ol className="wa-quote-band">
            {WORLD_QUOTES.map((quote) => (
              <li key={quote.text} className="wa-plate">
                <AnnexQuote text={quote.text} by={quote.by} />
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
