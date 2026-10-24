import { useId, useState, type CSSProperties } from "react";
import { DREAM_CASES } from "./dream-chapter-data";

/** A manually operated stage: no autoplay, scroll interception or extra artwork. */
export function DreamChapterStage() {
  const id = useId();
  const [selection, setSelection] = useState({ index: 0, direction: 1, turn: 0 });
  const episode = DREAM_CASES[selection.index];
  const select = (index: number) => {
    const next = Math.max(0, Math.min(DREAM_CASES.length - 1, index));
    setSelection((current) =>
      current.index === next
        ? current
        : {
            index: next,
            direction: next > current.index ? 1 : -1,
            turn: current.turn + 1,
          },
    );
  };

  return (
    <section
      id="dream-chapter-stage"
      tabIndex={-1}
      aria-label="六章の舞台"
      className="dream-chapter-stage"
      data-direction={selection.direction}
      data-operated={selection.turn > 0 ? "true" : "false"}
    >
      <div className="dream-chapter-stage-scene">
        <div className="dream-chapter-stage-wings" aria-hidden="true">
          {DREAM_CASES.map((item, index) => (
            <span
              key={item.no}
              data-selected={index === selection.index}
              style={{ "--wing-offset": index - selection.index } as CSSProperties}
            >
              <b>{item.no}</b>
            </span>
          ))}
        </div>
        <div className="dream-chapter-stage-sheet" key={selection.turn}>
          <span className="dream-chapter-stage-numeral" aria-hidden="true">
            {episode.no}
          </span>
          <div className="dream-chapter-stage-copy" id={`${id}-preview`}>
            <p className="dream-chapter-stage-case">CASE {episode.no}</p>
            <h3>{episode.title}</h3>
            <p className="dream-chapter-stage-lead">{episode.lead}</p>
            <a className="dream-chapter-stage-enter" href={`#dream-case-${episode.no}`}>
              この章を読む <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
      <div className="dream-chapter-stage-console">
        <button
          type="button"
          onClick={() => select(selection.index - 1)}
          disabled={selection.index === 0}
          aria-label="前の章をプレビュー"
          aria-controls={`${id}-preview`}
        >
          ←
        </button>
        <label className="dream-chapter-stage-slider">
          <span>
            章をめくる{" "}
            <output htmlFor={`${id}-range`}>
              {episode.no} · {episode.title}
            </output>
          </span>
          <input
            id={`${id}-range`}
            type="range"
            min="0"
            max={DREAM_CASES.length - 1}
            step="1"
            value={selection.index}
            aria-valuetext={`CASE ${episode.no}「${episode.title}」`}
            aria-controls={`${id}-preview`}
            onChange={(event) => select(Number(event.target.value))}
          />
          <span className="dream-chapter-stage-ticks" aria-hidden="true">
            {DREAM_CASES.map((item) => (
              <i key={item.no}>{item.no}</i>
            ))}
          </span>
        </label>
        <button
          type="button"
          onClick={() => select(selection.index + 1)}
          disabled={selection.index === DREAM_CASES.length - 1}
          aria-label="次の章をプレビュー"
          aria-controls={`${id}-preview`}
        >
          →
        </button>
      </div>
    </section>
  );
}
