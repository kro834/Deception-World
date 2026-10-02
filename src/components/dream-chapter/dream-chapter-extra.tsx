// Dream Chapter archive: the four new corners (出来事, 舞台, 繋がり, 武装), the VOICES leaf
// inside 名台詞 and the supplements that make the owner's existing parts richer (dossier
// RECORD sections, 人物一覧 profiles, the agent roster, the record sheet, 縫妖師 / 永守組 and
// 用語集 with its INDEX leaf). Pure render over dream-chapter-extra-data.ts: no effects, no
// handlers, no images, no dialogs. Mounted from dream-chapter.tsx; drawn by
// styles-dream-extra.css. The owner's own text stays where it is; every Japanese string here
// comes from the data file (the source's wording), the rest are English HUD labels.
import { DREAM_CASES } from "./dream-chapter-data";
import {
  DREAM_AGENT_ADDITIONS,
  DREAM_AGENT_SUPPLEMENT,
  DREAM_ARCHIVE_CORNERS,
  DREAM_ARCHIVE_LABELS,
  DREAM_ARSENAL,
  DREAM_ATLAS,
  DREAM_CHRONICLE,
  DREAM_DOSSIER_SUPPLEMENT,
  DREAM_FACTION_SUPPLEMENT,
  DREAM_GLOSSARY_INDEX,
  DREAM_GLOSSARY_SUPPLEMENT,
  DREAM_RECORD_SUPPLEMENT,
  DREAM_RELATION_CIRCLES,
  DREAM_RELATIONS,
  DREAM_ROSTER_SUPPLEMENT,
  DREAM_VOICES,
  type DreamArchiveCorner,
  type DreamArchiveCornerId,
  type DreamArchivePassage,
  type DreamArchiveSegment,
} from "./dream-chapter-extra-data";

const CORNERS = Object.fromEntries(
  DREAM_ARCHIVE_CORNERS.map((corner) => [corner.id, corner]),
) as Record<DreamArchiveCornerId, DreamArchiveCorner>;

const pad2 = (value: number) => String(value).padStart(2, "0");

const KANJI_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/** 1 → 一, 12 → 十二, 40 → 四十: the seals' numerals (as the programme's captions). */
function toKanjiNumber(value: number) {
  if (value < 10) return KANJI_DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? "" : KANJI_DIGITS[tens]}十${ones ? KANJI_DIGITS[ones] : ""}`;
}

/** "0" → "00"; letters stay as they are (the owner's agent roster rule). */
const agentCode = (code: string) => (/^\d+$/.test(code) ? code.padStart(2, "0") : code);

/** 「…」 around a spoken line unless the source already brackets it. */
const spoken = (text: string) => (/^[「『【❰]/.test(text) ? text : `「${text}」`);

/** A passage's words as one string (an exchange keeps its speakers). */
const passageText = (passage: DreamArchivePassage) =>
  passage.segments
    ? passage.segments
        .map((segment) => (segment.by ? `${segment.by} ${segment.text}` : segment.text))
        .join("\n")
    : passage.text;

const joinClasses = (...names: (string | undefined)[]) =>
  names.filter(Boolean).join(" ") || undefined;

/** Narration: one paragraph per source line. The first may carry the host's lead class. */
function Lines({
  text,
  className,
  leadClassName,
}: {
  text: string;
  className?: string;
  leadClassName?: string;
}) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <p
          key={`${index}:${line}`}
          className={joinClasses(className, index === 0 ? leadClassName : undefined)}
        >
          {line}
        </p>
      ))}
    </>
  );
}

/** Speech runs: the speaker in bold before the words; narration runs plain. */
function Segments({
  segments,
  className,
  leadClassName,
}: {
  segments: readonly DreamArchiveSegment[];
  className?: string;
  leadClassName?: string;
}) {
  return (
    <>
      {segments.map((segment, index) => (
        <p
          key={`${index}:${segment.text}`}
          className={joinClasses(
            "dream-archive-said",
            className,
            index === 0 ? leadClassName : undefined,
          )}
        >
          {segment.by ? <b>{segment.by}</b> : null}
          {segment.text}
        </p>
      ))}
    </>
  );
}

/** A quoted excerpt: one speaker's words with the caption, or an exchange, or narration. */
function ArchiveQuote({
  passage,
  className,
}: {
  passage: DreamArchivePassage;
  className?: string;
}) {
  return (
    <figure className={joinClasses("dream-annex-quote dream-archive-quote", className)}>
      <blockquote>
        {passage.segments ? (
          <Segments segments={passage.segments} />
        ) : passage.by ? (
          <p>{spoken(passage.text)}</p>
        ) : (
          <Lines text={passage.text} />
        )}
      </blockquote>
      {passage.by && !passage.segments ? <figcaption>{passage.by}</figcaption> : null}
    </figure>
  );
}

/** A passage in a narrative host: paragraphs, or a captioned quote when one person speaks. */
function ArchivePassage({
  passage,
  className,
  leadClassName,
  quoteClassName,
}: {
  passage: DreamArchivePassage;
  className?: string;
  leadClassName?: string;
  quoteClassName?: string;
}) {
  if (passage.segments) {
    return (
      <Segments segments={passage.segments} className={className} leadClassName={leadClassName} />
    );
  }
  if (passage.by)
    return <ArchiveQuote passage={passage} className={quoteClassName ?? leadClassName} />;
  return <Lines text={passage.text} className={className} leadClassName={leadClassName} />;
}

function CornerHeading({ id, count }: { id: DreamArchiveCornerId; count: number }) {
  const corner = CORNERS[id];
  return (
    <header className="dream-annex-heading">
      <p lang="en">{corner.kicker}</p>
      <h2 id={`${id}-title`}>{corner.title.text}</h2>
      <span lang="en">
        {pad2(count)} {corner.unit}
      </span>
    </header>
  );
}

/** A fold's 48px row: HUD mark, title (with its reading), count and the drawn ＋ cell. */
function FoldSummary({
  mark,
  title,
  titleId,
  reading,
  count,
}: {
  mark: string;
  title?: string;
  titleId?: string;
  reading?: string;
  count: string;
}) {
  return (
    <summary>
      <span className="dream-archive-fold-mark" lang="en">
        {mark}
      </span>
      {title ? (
        <span className="dream-archive-fold-title" id={titleId}>
          {title}
          {reading ? <small lang="en">{reading}</small> : null}
        </span>
      ) : null}
      <span className="dream-archive-fold-count" lang="en">
        {count}
      </span>
      <i aria-hidden="true" />
    </summary>
  );
}

/* ---------- Corners ---------- */

export function DreamChronicle({ id }: { id: "chronicle" }) {
  return (
    <section
      id={id}
      className="dream-annex dream-archive dream-chronicle"
      aria-labelledby="chronicle-title"
    >
      <CornerHeading id={id} count={DREAM_CHRONICLE.length} />
      <ol className="dream-chronicle-cases" data-dream-reveal>
        {DREAM_CASES.map((episode, index) => {
          const events = DREAM_CHRONICLE.filter((event) => event.case === episode.no);
          return (
            <li key={episode.no}>
              <details className="dream-archive-fold" open={index === 0}>
                <FoldSummary
                  mark={`CASE ${episode.no}`}
                  title={episode.title}
                  reading={episode.reading}
                  count={`${pad2(events.length)} EVENTS`}
                />
                <ol className="dream-chronicle-list">
                  {events.map((event) => (
                    <li key={event.no} className="dream-chronicle-item">
                      <span className="dream-archive-seal" aria-hidden="true">
                        {toKanjiNumber(event.no)}
                      </span>
                      <p className="dream-chronicle-meta">
                        <span className="dream-chronicle-place">{event.place}</span>
                        <span lang="en">CAST</span>
                        <span className="dream-chronicle-cast">{event.cast.join("・")}</span>
                      </p>
                      <h3>{event.title.text}</h3>
                      <div className="dream-chronicle-body">
                        <ArchivePassage passage={event} />
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function DreamAtlas({ id }: { id: "atlas" }) {
  return (
    <section
      id={id}
      className="dream-annex dream-archive dream-atlas"
      aria-labelledby="atlas-title"
    >
      <CornerHeading id={id} count={DREAM_ATLAS.length} />
      <ol className="dream-atlas-grid" data-dream-reveal>
        {DREAM_ATLAS.map((place, index) => (
          <li key={place.name}>
            <article aria-labelledby={`dream-atlas-${index + 1}`}>
              <p className="dream-atlas-kicker" lang="en">
                {place.kicker}
              </p>
              <h3 id={`dream-atlas-${index + 1}`}>{place.name}</h3>
              <div className="dream-atlas-body">
                {place.passages.map((passage) => (
                  <ArchivePassage key={passage.lines} passage={passage} />
                ))}
              </div>
              <i className="dream-atlas-wave" aria-hidden="true" />
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DreamRelations({ id }: { id: "relations" }) {
  return (
    <section
      id={id}
      className="dream-annex dream-archive dream-relations"
      aria-labelledby="relations-title"
    >
      <CornerHeading id={id} count={DREAM_RELATIONS.length} />
      <div className="dream-relations-circles" data-dream-reveal>
        {DREAM_RELATION_CIRCLES.map((circle, index) => {
          const ties = DREAM_RELATIONS.filter((tie) => tie.circle === circle);
          const titleId = `dream-relations-c${index + 1}`;
          return (
            <details key={circle} className="dream-archive-fold" open={index === 0}>
              <FoldSummary
                mark={`CIRCLE ${pad2(index + 1)}`}
                title={circle}
                titleId={titleId}
                count={`${pad2(ties.length)} TIES`}
              />
              <ol className="dream-relations-list" aria-labelledby={titleId}>
                {ties.map((tie) => (
                  <li key={`${tie.a}/${tie.b}/${tie.label.lines}`} className="dream-relations-tie">
                    <span className="dream-relations-name">{tie.a}</span>
                    <span className="dream-relations-knot">
                      <i aria-hidden="true" />
                      <b>{tie.label.text}</b>
                      <i aria-hidden="true" />
                    </span>
                    <span className="dream-relations-name">{tie.b}</span>
                    <ArchiveQuote passage={tie.quote} />
                  </li>
                ))}
              </ol>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export function DreamArsenal({ id }: { id: "arsenal" }) {
  const total = DREAM_ARSENAL.reduce((sum, group) => sum + group.entries.length, 0);
  return (
    <section
      id={id}
      className="dream-annex dream-archive dream-arsenal"
      aria-labelledby="arsenal-title"
    >
      <CornerHeading id={id} count={total} />
      <div className="dream-arsenal-groups" data-dream-reveal>
        {DREAM_ARSENAL.map((group) => (
          <details key={group.group} className="dream-archive-fold">
            <FoldSummary
              mark={group.kicker}
              title={group.group}
              count={`${pad2(group.entries.length)} ENTRIES`}
            />
            <dl className="dream-arsenal-list">
              {group.entries.map((entry) => (
                <div key={entry.name}>
                  <dt>
                    {entry.name}
                    {entry.owner ? <small>{entry.owner}</small> : null}
                  </dt>
                  <dd>
                    <ArchivePassage passage={entry} />
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Inside the owner's #quotes, after the tanzaku band: one fold per speaker, the first open. */
export function VoicesLeaf() {
  return (
    <div className="dream-voices">
      <p className="dream-archive-leaf-label" lang="en">
        {DREAM_ARCHIVE_LABELS.voices} — {pad2(DREAM_VOICES.length)} SPEAKERS
      </p>
      <ol className="dream-voices-grid" data-dream-reveal>
        {DREAM_VOICES.map((voice, index) => (
          <li key={voice.speaker}>
            <details className="dream-archive-fold" open={index === 0}>
              <FoldSummary
                mark={pad2(index + 1)}
                title={voice.speaker}
                count={`${pad2(voice.quotes.length)} LINES`}
              />
              <ol className="dream-voices-list">
                {voice.quotes.map((quote) => (
                  <li key={quote.lines}>
                    <figure className="dream-annex-quote dream-archive-quote">
                      <blockquote>
                        {quote.segments ? (
                          <Segments segments={quote.segments} />
                        ) : (
                          <p>{spoken(quote.text)}</p>
                        )}
                      </blockquote>
                      {quote.by ? <figcaption>{quote.by}</figcaption> : null}
                    </figure>
                  </li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Supplements to the owner's parts ---------- */

/** One more numbered section at the end of a dossier: the source's own testimony. */
export function DossierSupplement({ id, after }: { id: string; after: number }) {
  const passages = DREAM_DOSSIER_SUPPLEMENT[id as keyof typeof DREAM_DOSSIER_SUPPLEMENT];
  if (!passages?.length) return null;
  return (
    <section className="dream-archive-record">
      <header>
        <span>{pad2(after + 1)}</span>
        <h3 lang="en">{DREAM_ARCHIVE_LABELS.record}</h3>
      </header>
      {passages.map((passage) => (
        <ArchivePassage key={passage.lines} passage={passage} />
      ))}
    </section>
  );
}

/** After the owner's profile paragraphs inside .dream-roster-body. */
export function RosterSupplement({ id }: { id: string }) {
  const passages = DREAM_ROSTER_SUPPLEMENT[id];
  if (!passages?.length) return null;
  return (
    <div className="dream-archive-add dream-roster-archive">
      <p className="dream-archive-eyebrow" lang="en">
        {DREAM_ARCHIVE_LABELS.record}
      </p>
      {passages.map((passage) => (
        <ArchivePassage key={passage.lines} passage={passage} className="dream-roster-profile" />
      ))}
    </div>
  );
}

/** Rider, device, a note and a line after the owner's row of an existing agent code. */
export function AgentSupplement({ code }: { code: string }) {
  const supplement = DREAM_AGENT_SUPPLEMENT[code];
  if (!supplement) return null;
  return (
    <div className="dream-archive-add dream-agent-archive">
      {supplement.rider ? (
        <p className="dream-agent-rider">
          <span>
            <small lang="en">RIDER</small>
            {supplement.rider.text}
          </span>
          {supplement.device ? (
            <span>
              <small lang="en">DEVICE</small>
              {supplement.device.text}
            </span>
          ) : null}
        </p>
      ) : null}
      {supplement.note ? (
        <ArchivePassage passage={supplement.note} className="dream-agent-note" />
      ) : null}
      {supplement.line ? (
        <p className="dream-agent-line dream-archive-line">
          {spoken(passageText(supplement.line))}
        </p>
      ) : null}
    </div>
  );
}

/** Codes the owner's roster does not list yet, in the roster's own grammar, after its list.
 *  A closed fold: twelve more rows would make the phone ledger a third longer again. */
export function AgentAdditions() {
  return (
    <div className="dream-archive-additions" data-dream-reveal>
      <details className="dream-archive-fold is-leaf">
        <FoldSummary
          mark={DREAM_ARCHIVE_LABELS.additions}
          count={`${pad2(DREAM_AGENT_ADDITIONS.length)} CODES`}
        />
        <ol className="dream-agent-roster">
          {DREAM_AGENT_ADDITIONS.map((agent) => (
            <li key={agent.code}>
              <span className="dream-agent-code">
                <small>CODE</small>
                <b className={agent.code.length > 2 ? "is-long" : undefined}>
                  {agentCode(agent.code)}
                </b>
              </span>
              <div className="dream-agent-copy">
                <h5>{agent.name}</h5>
                <p className="dream-agent-rider">
                  <span>
                    <small lang="en">RIDER</small>
                    {agent.rider.text}
                  </span>
                </p>
                <ArchivePassage passage={agent.note} className="dream-agent-note" />
                <p className="dream-agent-line dream-archive-line">
                  {spoken(passageText(agent.line))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

/** After the owner's note of a record-sheet row (行動, 目的). */
export function RecordSupplement({ label }: { label: string }) {
  const passages = DREAM_RECORD_SUPPLEMENT[label];
  if (!passages?.length) return null;
  return (
    <>
      {passages.map((passage, index) => (
        <ArchivePassage
          key={passage.lines}
          passage={passage}
          className="dream-record-note"
          leadClassName={index === 0 ? "dream-archive-add" : undefined}
        />
      ))}
    </>
  );
}

/** A second paragraph under a member the owner already lists (inside its dd). */
export function FactionMemberNote({ id, name }: { id: string; name: string }) {
  const note = DREAM_FACTION_SUPPLEMENT[id]?.memberNotes?.[name];
  if (!note) return null;
  return (
    <ArchivePassage
      passage={note}
      className="dream-faction-member-note"
      leadClassName="dream-archive-add"
    />
  );
}

/** The last child of a faction card: statements, members and paragraphs from the source. */
export function FactionSupplement({ id }: { id: string }) {
  const supplement = DREAM_FACTION_SUPPLEMENT[id];
  if (!supplement) return null;
  const { statements, members, paragraphs } = supplement;
  if (!statements?.length && !members?.length && !paragraphs?.length) return null;
  return (
    <div className="dream-archive-add dream-faction-archive">
      <p className="dream-archive-eyebrow" lang="en">
        {DREAM_ARCHIVE_LABELS.record}
      </p>
      {statements?.map((passage) => (
        <ArchivePassage
          key={passage.lines}
          passage={passage}
          className="dream-faction-archive-text"
        />
      ))}
      {members?.length ? (
        <dl className="dream-faction-members">
          {members.map((member) => (
            <div key={member.name}>
              <dt>{member.name}</dt>
              <dd>
                <ArchivePassage passage={member.note} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {paragraphs?.map((passage) => (
        <ArchivePassage
          key={passage.lines}
          passage={passage}
          className="dream-faction-archive-text"
        />
      ))}
    </div>
  );
}

/** One more passage inside a glossary term's dd. */
export function GlossarySupplement({ term }: { term: string }) {
  const passage = DREAM_GLOSSARY_SUPPLEMENT[term];
  if (!passage) return null;
  return <ArchivePassage passage={passage} leadClassName="dream-archive-add" />;
}

/** After the owner's list: the source's other words, in the same dt/dd grammar, behind a
 *  closed fold (fifteen open entries doubled 用語集 on phones). */
export function GlossaryIndex() {
  return (
    <div className="dream-glossary-index" data-dream-reveal>
      <details className="dream-archive-fold is-leaf">
        <FoldSummary
          mark={DREAM_ARCHIVE_LABELS.index}
          count={`${pad2(DREAM_GLOSSARY_INDEX.length)} WORDS`}
        />
        <dl className="dream-glossary">
          {DREAM_GLOSSARY_INDEX.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>
                <ArchivePassage passage={entry} />
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
