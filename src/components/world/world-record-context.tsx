import { WORLD_EPISODE_INDEX, WORLD_RECORD_CONTEXTS } from "./world-record-context.ts";

export function WorldEpisodeIndex() {
  return (
    <nav className="wr-record-index" aria-label="エピソードの索引">
      <ol>
        {WORLD_EPISODE_INDEX.map((episode) => (
          <li key={episode.no}>
            <a href={episode.href}>
              <span className="wr-record-number">EP.{episode.no}</span>
              <span lang="en">{episode.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function WorldRecordContext({ episodeNo }: { episodeNo: string }) {
  const context = WORLD_RECORD_CONTEXTS.find(({ no }) => no === episodeNo);
  if (!context?.groups.length) return null;

  return (
    <nav className="wr-record-context" aria-label={`EP.${episodeNo}の関連資料`}>
      {context.groups.map((group) => (
        <div className="wr-record-group" key={group.label}>
          <p className="wr-record-group-label">{group.label}</p>
          <ul>
            {group.links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
