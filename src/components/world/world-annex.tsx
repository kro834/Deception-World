import type { CSSProperties, MouseEvent, SyntheticEvent } from "react";
import { GuardedLink } from "@/components/load-gate";
import { dossierImage } from "@/lib/dossier-images";
import { episodeThumbnail, managerThumbnail } from "@/lib/thumbnail-images";
import { NameText, RELATED_NAV, RIDER_NAV, RIKUEI_NAV } from "./dossier-nav";
import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
  WORLD_QUOTES,
  type WorldAnnexLine,
  type WorldCastEntry,
} from "./world-annex-data";

/* The World annex: the owner's story source as three chapters after 03
   RECORDS, entered through the contents strip: 04 CAST FILES (a portrait
   wall), 05 WORLD FILES (world brief and locations), 06 ARCHIVE LOG (episode
   lines, glossary, quotes), which hands off to the finale. 01-03 stay back to
   back, so nothing sits between the column rail and the riders heading
   (verify-world-reveal presses the rail beside part-lit type). Static
   documents: no reveal, no scroll motion; chapter openers are a still clone of
   .section-index, never the class itself. Portraits reuse the dossiers' own
   files through the site's image helpers. Styles: styles-world-annex.css. */

const ANNEX_CONTENTS: readonly { href: string; code: string; label: string }[] = [
  { href: "#cast-roster", code: "04", label: "人物一覧" },
  { href: "#world-brief", code: "05", label: "世界と組織" },
  { href: "#episode-notes", code: "06.1", label: "エピソードの言葉" },
  { href: "#glossary", code: "06.2", label: "用語集" },
  { href: "#quotes", code: "06.3", label: "名台詞" },
];

const DOSSIER_ASSETS = new Map<string, readonly string[]>(
  [...RIKUEI_NAV, ...RIDER_NAV, ...RELATED_NAV]
    .filter((item) => item.href)
    .map((item) => [item.href as string, item.assets]),
);
DOSSIER_ASSETS.set("/characters/yoake-mamori", ["/character-yoake-mamori.jpeg"]);

const pad = (value: number) => String(value).padStart(2, "0");

/* Portrait crops for the cast wall, keyed by roster id. Existing files only:
   the civilians' dossier photos, the 六詠 card thumbnails (the same URLs the
   cards load) and the related characters' key art. アザト has no file: an
   empty socket. Crops are static (object-position, a fixed scale). */
type Portrait = {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  pos: string;
  zoom?: number;
  origin?: string;
  /** Pale grounds take a deeper veil, so the wall never outshines 六詠. */
  pale?: boolean;
};

const PORTRAIT_SIZES = "(max-width: 559px) 44vw, (max-width: 1099px) 24vw, 220px";

const civilian = (src: string, width: number, height: number, pos: string, zoom?: number) =>
  ({ src, srcSet: dossierImage(src).srcSet, width, height, pos, zoom }) satisfies Portrait;

const manager = (key: "rex-loi" | "reemu" | "shuza", width: number, height: number, pos: string) =>
  ({
    src: `/manager-${key}-thumb.jpeg`,
    srcSet: managerThumbnail(key).srcSet,
    width,
    height,
    pos,
  }) satisfies Portrait;

const CAST_PORTRAITS: Record<string, Portrait> = {
  yuma: {
    ...civilian("/civilian-yuma-20260826.jpeg", 960, 1280, "50% 10%", 1.3),
    origin: "50% 6%",
    pale: true,
  },
  bell: { ...civilian("/civilian-bell-20260826.jpeg", 853, 1280, "50% 12%", 1.3), pale: true },
  roa: { ...civilian("/civilian-lore.jpeg", 1200, 1800, "50% 0%", 1.08), pale: true },
  rex: manager("rex-loi", 640, 960, "50% 14%"),
  reemu: manager("reemu", 540, 960, "50% 6%"),
  shuza: manager("shuza", 640, 913, "50% 18%"),
  hanabi: civilian("/civilian-leddic.jpeg", 1086, 1448, "50% 12%"),
  chigiri: civilian("/civilian-naikami-chigiri.jpeg", 1050, 1400, "50% 16%"),
  mamoru: civilian("/civilian-argenome.jpeg", 1102, 1427, "50% 14%"),
  james: {
    src: "/character-james-20260829.webp",
    width: 720,
    height: 1165,
    pos: "50% 8%",
    pale: true,
  },
  luna: { src: "/character-luna.webp", width: 1028, height: 1800, pos: "50% 12%" },
  terra: { src: "/character-terra.webp", width: 1080, height: 1431, pos: "50% 10%", pale: true },
  yoake: { src: "/character-yoake-mamori.jpeg", width: 736, height: 976, pos: "50% 12%" },
};

/* A quoted speaker who is on the wall gets the wall's own crop as a chip. */
const PORTRAIT_BY_NAME = new Map(
  WORLD_CAST_ROSTER.filter((entry) => CAST_PORTRAITS[entry.id]).map((entry) => [
    entry.name,
    CAST_PORTRAITS[entry.id],
  ]),
);

const cropStyle = (portrait: Portrait) =>
  ({
    "--pos": portrait.pos,
    // A string, so the server and the client write the same value (a number
    // here hydrated as "1.3" against 1.3).
    "--zoom": String(portrait.zoom ?? 1),
    "--origin": portrait.origin ?? "50% 10%",
    ...(portrait.pale ? { "--veil": "34%" } : null),
  }) as CSSProperties;

/* The records' key art for the same three episodes, at the archive's crops. */
const EPISODE_ART: Record<string, { src: string; width: number; height: number; pos: string }> = {
  "01": { src: "/episode-01-hide-and-seek.jpeg", width: 1086, height: 1448, pos: "50% 30%" },
  "02": { src: "/episode-02-legends.jpeg", width: 1448, height: 1086, pos: "50% 50%" },
  "03": { src: "/episode-03-deception-world.jpeg", width: 1086, height: 1448, pos: "50% 18%" },
};

/* The six 六詠 card thumbnails, at the cards' own sizes (cache hits). */
const RIKUEI_KEYS = ["zeus", "rex-loi", "shuza", "lejas-portrait", "opus", "reemu"] as const;

/* Dossier kind, read off the existing link: the affiliation colour. */
const kindOf = (entry: WorldCastEntry) => entry.to?.split("/")[1] ?? "none";

function AnnexQuote({ text, by, signature }: { text: string; by?: string; signature?: boolean }) {
  const voice = by ? PORTRAIT_BY_NAME.get(by) : undefined;
  return (
    <figure className={signature ? "wa-quote is-signature" : "wa-quote"}>
      <blockquote>
        <p>「{text}」</p>
      </blockquote>
      {by ? (
        <figcaption className={voice ? "has-voice" : undefined}>
          {voice ? (
            <span className="wa-voice" aria-hidden="true" style={cropStyle(voice)}>
              <img
                src={voice.src}
                srcSet={voice.srcSet}
                sizes="28px"
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
              />
            </span>
          ) : null}
          {by}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* A still copy of the chapter numeral, rule and label (.section-index). */
function ChapterOpener({ no, label }: { no: string; label: string }) {
  return (
    <div className={`wa-chapter wa-chapter-${no}`} aria-hidden="true">
      <span>{no}</span>
      <small>{label}</small>
      <i />
    </div>
  );
}

function AnnexHeading({
  id,
  no,
  code,
  title,
  count,
}: {
  id: string;
  no?: string;
  code: string;
  title: string;
  count: string;
}) {
  return (
    <header className={no ? "wa-heading has-no" : "wa-heading"}>
      {no ? (
        <span className="wa-no" aria-hidden="true">
          {no}
        </span>
      ) : null}
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

function CastPortrait({ entry }: { entry: WorldCastEntry }) {
  const portrait = CAST_PORTRAITS[entry.id];
  if (!portrait) return <span className="wa-portrait is-vacant" aria-hidden="true" />;
  return (
    <span className="wa-portrait" aria-hidden="true" style={cropStyle(portrait)}>
      <img
        src={portrait.src}
        srcSet={portrait.srcSet}
        sizes={PORTRAIT_SIZES}
        alt=""
        width={portrait.width}
        height={portrait.height}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
    </span>
  );
}

/* An opened profile takes the row below its own and the next tile slides
   into the cell it left, so the switch would leave the finger (and a second
   tap would open the next person). The summary's top is noted on click and
   put back after the toggle with one instant scroll; opening then brings the
   text into view when it fits, never lifting the switch under the topbar
   (its scroll-margin-top). No click (find-in-page opening it): no scroll. */
const profileTops = new WeakMap<Element, number>();

function noteProfileTop(event: MouseEvent<HTMLElement>) {
  profileTops.set(event.currentTarget, event.currentTarget.getBoundingClientRect().top);
}

function keepProfileInPlace(event: SyntheticEvent<HTMLDetailsElement>) {
  const details = event.currentTarget;
  const summary = details.querySelector(":scope > summary");
  const before = summary ? profileTops.get(summary) : undefined;
  if (!summary || before === undefined) return;
  profileTops.delete(summary);
  const settle = (target: number, again: boolean) => {
    const shift = summary.getBoundingClientRect().top - target;
    if (Math.abs(shift) >= 1) window.scrollBy({ top: shift, behavior: "instant" });
    // Scroll anchoring may still move the page on the next layout.
    if (again) requestAnimationFrame(() => settle(target, false));
  };
  requestAnimationFrame(() => {
    let target = before;
    if (details.open) {
      const floor = Number.parseFloat(getComputedStyle(summary).scrollMarginTop) || 0;
      const shift = summary.getBoundingClientRect().top - before;
      const overflow = details.getBoundingClientRect().bottom - shift - (window.innerHeight - 16);
      target = before - Math.min(Math.max(overflow, 0), before - floor);
    }
    settle(target, true);
  });
}

/** 04 CAST FILES: the portrait wall. */
function CastFiles() {
  return (
    <section
      id="cast-roster"
      className="world-annex is-chapter"
      aria-labelledby="cast-roster-title"
    >
      <div className="wa-inner">
        <ChapterOpener no="04" label="CAST FILES" />
        <AnnexHeading
          id="cast-roster-title"
          code="CHARACTERS"
          title="人物一覧"
          count={`${pad(WORLD_CAST_ROSTER.length)} PERSONS`}
        />
        <ol className="wa-roster">
          {WORLD_CAST_ROSTER.map((entry, index) => (
            <li key={entry.id}>
              <article
                className={`wa-plate wa-person is-${kindOf(entry)}`}
                aria-labelledby={`wa-person-${entry.id}`}
              >
                <CastPortrait entry={entry} />
                <span className="wa-index" aria-hidden="true">
                  {pad(index + 1)}
                </span>
                <div className="wa-person-body">
                  <p className="wa-role">{entry.role}</p>
                  <h3 id={`wa-person-${entry.id}`}>
                    <NameText value={entry.name} />
                  </h3>
                  {entry.line ? <AnnexQuote text={entry.line} signature /> : null}
                  <details className="wa-profile" onToggle={keepProfileInPlace}>
                    <summary onClick={noteProfileTop}>
                      <span className="wa-sr">{entry.name}</span> <span lang="en">PROFILE</span>
                    </summary>
                    <div className="wa-profile-body">
                      {entry.profile.map((item) =>
                        item.by ? (
                          <AnnexQuote key={item.text} text={item.text} by={item.by} />
                        ) : (
                          <p key={item.text} className="wa-prose">
                            {item.text}
                          </p>
                        ),
                      )}
                    </div>
                  </details>
                </div>
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
  );
}

/** 05 WORLD FILES: the world brief and the locations. */
function WorldFiles() {
  return (
    <section
      id="world-brief"
      className="world-annex is-chapter"
      aria-labelledby="world-brief-title"
    >
      <div className="wa-inner">
        <ChapterOpener no="05" label="WORLD FILES" />
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
              {entry.id === "rikuei" ? (
                <span className="wa-signals" aria-hidden="true">
                  {RIKUEI_KEYS.map((key) => (
                    <img
                      key={key}
                      src={`/manager-${key}-thumb.jpeg`}
                      {...managerThumbnail(key)}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </span>
              ) : null}
              {entry.id === "code" ? (
                <span className="wa-id-photo" aria-hidden="true">
                  <img
                    src="/character-james-20260829.webp"
                    alt=""
                    width={720}
                    height={1165}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
              ) : null}
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
                <details key={doc.office} className="wa-doc" aria-label={doc.office}>
                  <summary>
                    <span className="wa-doc-office">{doc.office}</span>
                    <i aria-hidden="true" />
                  </summary>
                  <p className="wa-doc-subject">
                    <b>件名</b>
                    <span>{doc.subject}</span>
                  </p>
                  <AnnexQuote text={doc.excerpt} />
                  <p className="wa-doc-verdict">
                    <b>最終判定</b>
                    <span>{doc.verdict}</span>
                  </p>
                </details>
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
  );
}

/** 06 ARCHIVE LOG: lines per episode, the glossary and the quotes log. */
function ArchiveLog() {
  return (
    <>
      <section
        id="episode-notes"
        className="world-annex is-chapter"
        aria-labelledby="episode-notes-title"
      >
        <div className="wa-inner">
          <ChapterOpener no="06" label="ARCHIVE LOG" />
          <AnnexHeading
            id="episode-notes-title"
            no="06.1"
            code="EPISODE LINES"
            title="エピソードの言葉"
            count={`EP.${WORLD_EPISODE_NOTES[0].no}–${WORLD_EPISODE_NOTES[WORLD_EPISODE_NOTES.length - 1].no}`}
          />
          <ol className="wa-episodes">
            {WORLD_EPISODE_NOTES.map((episode) => {
              const art = EPISODE_ART[episode.no];
              return (
                <li key={episode.no} className={`wa-plate wa-episode is-ep-${episode.no}`}>
                  {art ? (
                    <span
                      className="wa-episode-art"
                      aria-hidden="true"
                      style={{ "--pos": art.pos } as CSSProperties}
                    >
                      <img
                        src={art.src}
                        {...episodeThumbnail(art.src)}
                        alt=""
                        width={art.width}
                        height={art.height}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                  ) : null}
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
              );
            })}
          </ol>
        </div>
      </section>

      <section id="glossary" className="world-annex" aria-labelledby="glossary-title">
        <div className="wa-inner">
          <AnnexHeading
            id="glossary-title"
            no="06.2"
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
            no="06.3"
            code="QUOTES"
            title="名台詞"
            count={`${pad(WORLD_QUOTES.length)} LINES`}
          />
          {/* A snap rail on phones (the region scrolls sideways; a vertical
              swipe still scrolls the page), a plate-less log from 700px. */}
          <div className="wa-quote-rail" role="region" tabIndex={0} aria-labelledby="quotes-title">
            <ol className="wa-quote-band">
              {WORLD_QUOTES.map((quote) => (
                <li key={quote.text}>
                  <AnnexQuote text={quote.text} by={quote.by} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}

/* world-home.tsx keeps this hook byte for byte (its SHA-256 is pinned);
   rendering nothing keeps 02 EIGHT RIDERS and 03 NEW RECORDS back to back. */
export function WorldAnnexRiders() {
  return null;
}

/** After 03 RECORDS: the contents strip, then chapters 04-06. */
export function WorldAnnexRecords() {
  return (
    <>
      <nav className="wa-contents" aria-labelledby="wa-contents-title">
        <div className="wa-contents-inner">
          <p className="wa-code">ARCHIVE INDEX</p>
          <h2 id="wa-contents-title">資料目次</h2>
          <ol>
            {ANNEX_CONTENTS.map(({ href, code, label }) => (
              <li key={href}>
                <a href={href}>
                  <small aria-hidden="true">{code}</small>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>
      <CastFiles />
      <WorldFiles />
      <ArchiveLog />
    </>
  );
}
