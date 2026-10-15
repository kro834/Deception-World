import { DREAM_CASES, DREAM_POSTERS } from "./dream-chapter-data";
import { DREAM_CHRONICLE } from "./dream-chapter-extra-data";

const routes = [
  {
    no: "01",
    kind: "SCREENING",
    title: "絵看板を見る",
    href: "#posters",
    count: `${DREAM_POSTERS.length}点の絵看板`,
    mark: "観る",
  },
  {
    no: "02",
    kind: "READING",
    title: "六章を読む",
    href: "#dream-chapter-index",
    count: `CASE 0–${DREAM_CASES.at(-1)?.no ?? "5"}`,
    mark: "読む",
  },
  {
    no: "03",
    kind: "ARCHIVE",
    title: "記録を探す",
    href: "#dream-record-explorer",
    count: `${DREAM_CHRONICLE.length}件の出来事`,
    mark: "探す",
  },
] as const;

/** Three existing ways into the programme, without adding story material. */
export function DreamProgrammeDesk() {
  return (
    <section className="dream-programme-desk" aria-labelledby="dream-programme-title">
      <header className="dream-programme-heading">
        <p lang="en">DREAM CHAPTER / PROGRAMME</p>
        <h2 id="dream-programme-title">劇場案内</h2>
        <span>絵看板、六章、出来事の記録から辿る。</span>
      </header>
      <nav className="dream-programme-routes" aria-label="ドリームチャプターの入口">
        {routes.map((route) => (
          <a className="dream-programme-ticket" href={route.href} key={route.no}>
            <span className="dream-programme-ticket-head">
              <small>{route.no}</small>
              <small lang="en">{route.kind}</small>
            </span>
            <span className="dream-programme-ticket-main">
              <span aria-hidden="true">{route.mark}</span>
              <strong>{route.title}</strong>
            </span>
            <span className="dream-programme-ticket-foot">
              <small>{route.count}</small>
              <span aria-hidden="true">↗</span>
            </span>
          </a>
        ))}
      </nav>
    </section>
  );
}
