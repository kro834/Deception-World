import { useRouterState } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { CAST_ROSTER_SEARCH, isCastRosterOrigin } from "@/lib/dossier-origin";
import { PhrasedText } from "./dossier-reader";

type ReadingChapter = { no: string; title: string };
type ReadingDestination = { href: string; title: string };
export type CharacterRelatedRecord = {
  title: string;
  /** A line of the owner's own words under the title (an epithet); no
   * line that only says where the link goes (2026-10-23). */
  context?: string;
} & ({ to: string; hash?: string; assets: readonly string[] } | { href: string });

/** Small chapter-end controls complement the existing contents and sticky reader.
 * Native fragments preserve direct links, browser history and pre-hydration use.
 * The way on is the next title with its arrow at the chapter's foot (2026-10-23:
 * no 次の章 / 02 or 続けて読む caption); the nav's label names it for assistive tech. */
export function CharacterChapterTools({
  sections,
  currentNo,
  continuation,
}: {
  sections: readonly ReadingChapter[];
  currentNo: string;
  continuation?: ReadingDestination;
}) {
  const index = sections.findIndex((section) => section.no === currentNo);
  if (index < 0) return null;
  const previous = sections[index - 1];
  const next = sections[index + 1];
  const destination = next
    ? { href: `#character-section-${next.no}`, title: next.title }
    : continuation;

  return (
    <nav className="character-chapter-tools" aria-label={`第${currentNo}章から読み進める`}>
      <div className="character-chapter-shortcuts">
        {previous ? <a href={`#character-section-${previous.no}`}>← 前の章</a> : null}
        <a href="#dossier-index">章目次</a>
      </div>
      {destination ? (
        <a className="character-chapter-next" href={destination.href}>
          <span className="character-chapter-next-copy">
            <b>
              <PhrasedText text={destination.title} />
            </b>
          </span>
          <span className="character-chapter-next-arrow" aria-hidden="true">
            ↓
          </span>
        </a>
      ) : null}
    </nav>
  );
}

/** Only the existing named origin is forwarded; no referrer or scroll storage. */
export function CharacterRelatedRecords({
  records,
}: {
  records: readonly CharacterRelatedRecord[];
}) {
  const fromCastRoster = useRouterState({
    select: (state) => isCastRosterOrigin(state.location.search),
  });
  if (records.length === 0) return null;
  const originSearch = fromCastRoster ? CAST_ROSTER_SEARCH : undefined;
  return (
    <section
      className="character-related-records"
      id="character-related-records"
      aria-labelledby="character-related-heading"
    >
      <h2 id="character-related-heading">関連する記録を読む</h2>
      <ul>
        {records.map((record) => {
          const content = (
            <>
              <span className="character-related-copy">
                <b>
                  <PhrasedText text={record.title} />
                </b>
                {record.context ? <span>{record.context}</span> : null}
              </span>
              <span className="character-related-arrow" aria-hidden="true">
                ↗
              </span>
            </>
          );
          return (
            <li key={"to" in record ? record.to : record.href}>
              {"to" in record ? (
                <GuardedLink
                  to={record.to}
                  hash={record.hash}
                  search={originSearch}
                  assets={record.assets}
                >
                  {content}
                </GuardedLink>
              ) : (
                <a href={record.href}>{content}</a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
