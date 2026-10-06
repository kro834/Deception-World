import type { CSSProperties, MouseEvent, ReactNode, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { episodeThumbnail, managerThumbnail, portraitThumbnail } from "@/lib/thumbnail-images";
import { DisplayName } from "@/components/name-text";
import { NameText, RELATED_NAV, RIDER_NAV, RIKUEI_NAV } from "./dossier-nav";
import { UiVectorIcon } from "./ui-vector-icon";
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
   empty socket. Crops are static (object-position, a fixed scale).
   Delivery: the dossier portraits come as right-sized candidates for the
   tile (portraitThumbnail: 360 / 720 px and the full file); the 六詠 faces
   keep the cards' own candidates and sizes, so they stay cache hits. A quote
   chip and the ID photo ask with the tile's sizes, so they reuse its file. */
type Portrait = {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
  pos: string;
  zoom?: number;
  origin?: string;
  /** Pale grounds take a deeper veil, so the wall never outshines 六詠. */
  pale?: boolean;
};

const civilian = (src: string, width: number, height: number, pos: string, zoom?: number) =>
  ({ src, ...portraitThumbnail(src), width, height, pos, zoom }) satisfies Portrait;

const manager = (key: "rex-loi" | "reemu" | "shuza", width: number, height: number, pos: string) =>
  ({
    src: `/manager-${key}-thumb.jpeg`,
    ...managerThumbnail(key),
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
    ...portraitThumbnail("/character-james-20260829.webp"),
    width: 720,
    height: 1165,
    pos: "50% 8%",
    pale: true,
  },
  luna: {
    src: "/character-luna.webp",
    ...portraitThumbnail("/character-luna.webp"),
    width: 1028,
    height: 1800,
    pos: "50% 12%",
  },
  terra: {
    src: "/character-terra.webp",
    ...portraitThumbnail("/character-terra.webp"),
    width: 1080,
    height: 1431,
    pos: "50% 10%",
    pale: true,
  },
  yoake: {
    src: "/character-yoake-mamori.jpeg",
    ...portraitThumbnail("/character-yoake-mamori.jpeg"),
    width: 736,
    height: 976,
    pos: "50% 12%",
  },
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
                sizes={voice.sizes}
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
    <span
      className={portrait.pale ? "wa-portrait is-pale" : "wa-portrait"}
      aria-hidden="true"
      style={cropStyle(portrait)}
    >
      <img
        src={portrait.src}
        srcSet={portrait.srcSet}
        sizes={portrait.sizes}
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
                  {/* A rider name breaks after 仮面ライダー, never inside it
                      (アルゲノ / ム), and keeps its dash company. */}
                  <p className="wa-role"><DisplayName value={entry.role} /></p>
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
                    {...portraitThumbnail("/character-james-20260829.webp")}
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

function readQuoteStops(rail: HTMLDivElement) {
  const inset = Number.parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0;
  const origin = rail.getBoundingClientRect().left + rail.clientLeft;
  const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
  return Array.from(rail.querySelectorAll<HTMLElement>(".wa-quote-band > li")).map((item) =>
    Math.min(
      max,
      Math.max(0, rail.scrollLeft + item.getBoundingClientRect().left - origin - inset),
    ),
  );
}

/* The quotes log scrolls sideways below 700px and is a still list above.
   Only a rail that scrolls is a Tab stop (its lines hold no control, so the
   keyboard needs the stop to scroll it); on a desktop the still list was an
   empty stop. The server and the first client render keep the stop, so
   hydration matches; a resize past 700px updates it. */
function QuoteRail({ children }: { children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<number[]>([]);
  const activeRef = useRef(0);
  const cancelSettleRef = useRef<(() => void) | null>(null);
  const [scrolls, setScrolls] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let settleTimer = 0;
    const sync = () => {
      targetsRef.current = readQuoteStops(rail);
      // On wider phones the final two cards can share the clamped endpoint.
      // Keep an explicitly selected card when those distances are equal.
      let nearest = Math.min(activeRef.current, Math.max(0, targetsRef.current.length - 1));
      let distance = Math.abs(rail.scrollLeft - (targetsRef.current[nearest] ?? 0));
      targetsRef.current.forEach((left, index) => {
        const delta = Math.abs(rail.scrollLeft - left);
        if (delta < distance) {
          distance = delta;
          nearest = index;
        }
      });
      activeRef.current = nearest;
      setActive(nearest);
    };
    const cancelSettle = () => window.clearTimeout(settleTimer);
    cancelSettleRef.current = cancelSettle;
    const onScroll = () => {
      cancelSettle();
      // Read the position once scrolling settles, not every animation frame.
      // Rapid taps retain their requested index while smooth scrolling runs.
      settleTimer = window.setTimeout(sync, 150);
    };
    const update = () => {
      cancelSettle();
      setScrolls(rail.scrollWidth > rail.clientWidth + 1);
      sync();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    if (rail.firstElementChild) observer.observe(rail.firstElementChild);
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", onScroll);
      cancelSettle();
      cancelSettleRef.current = null;
    };
  }, []);

  const moveTo = (index: number) => {
    const rail = railRef.current;
    if (!rail) return;
    // Fonts can change the overflow extent without resizing the rail itself.
    const targets = readQuoteStops(rail);
    targetsRef.current = targets;
    if (!targets.length) return;
    const next = Math.max(0, Math.min(targets.length - 1, index));
    cancelSettleRef.current?.();
    activeRef.current = next;
    setActive(next);
    rail.scrollTo({
      left: targets[next],
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  return (
    <>
      <div
        ref={railRef}
        className="wa-quote-rail"
        role="region"
        tabIndex={scrolls ? 0 : undefined}
        aria-labelledby="quotes-title"
        id="world-quotes-rail"
        aria-describedby={scrolls ? "world-quotes-help" : undefined}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !scrolls) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          let next = activeRef.current;
          if (event.key === "Home") next = 0;
          else if (event.key === "End") next = targetsRef.current.length - 1;
          else if (event.key === "ArrowLeft") next -= 1;
          else if (event.key === "ArrowRight") next += 1;
          else return;
          event.preventDefault();
          moveTo(next);
        }}
      >
        {children}
      </div>
      <div className="wa-quote-controls" hidden={!scrolls}>
        <div>
          <output aria-live="polite" aria-atomic="true" aria-label="表示中の名台詞">
            {pad(active + 1)} / {pad(WORLD_QUOTES.length)}
          </output>
          <span id="world-quotes-help">スワイプ・左右キーで切替</span>
        </div>
        <button
          type="button"
          aria-label="前の名台詞へ"
          aria-controls="world-quotes-rail"
          disabled={active === 0}
          onClick={() => moveTo(activeRef.current - 1)}
        >
          <UiVectorIcon kind="arrow-left" size={20} />
        </button>
        <button
          type="button"
          aria-label="次の名台詞へ"
          aria-controls="world-quotes-rail"
          disabled={active === WORLD_QUOTES.length - 1}
          onClick={() => moveTo(activeRef.current + 1)}
        >
          <UiVectorIcon kind="arrow-right" size={20} />
        </button>
      </div>
    </>
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
          <QuoteRail>
            <ol className="wa-quote-band">
              {WORLD_QUOTES.map((quote) => (
                <li key={quote.text}>
                  <AnnexQuote text={quote.text} by={quote.by} />
                </li>
              ))}
            </ol>
          </QuoteRail>
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
