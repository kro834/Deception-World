import { useId, useState, type CSSProperties } from "react";
import { DREAM_CASES } from "./dream-chapter-data";

/** A manually operated stage: no autoplay, scroll interception or extra artwork. */
export function DreamChapterStage() {
  const id = useId();
  const [selection, setSelection] = useState({ index: 0, direction: 1, turn: 0 });
  const episode = DREAM_CASES[selection.index];
  const palette = ["#b28ac7", "#df9b87", "#8dbbbd", "#a99bd0", "#c8b175", "#adbedb"][
    selection.index
  ];
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
      <div
        className="dream-chapter-stage-scene"
        style={{ "--stage-accent": palette } as CSSProperties}
      >
        <div className="dream-chapter-stage-theatre" aria-hidden="true">
          <div className="dream-chapter-stage-corridor" key={selection.turn}>
            <span className="dream-chapter-stage-moon" />
            <span className="dream-chapter-stage-horizon" />
            <div className="dream-chapter-stage-wings">
              {DREAM_CASES.map((item, index) => (
                <span key={item.no} style={{ "--layer": index } as CSSProperties}>
                  <b>{item.no}</b>
                </span>
              ))}
            </div>
            <div className="dream-chapter-stage-door">
              <i />
              <i />
            </div>
            <span className="dream-chapter-stage-numeral">{episode.no}</span>
          </div>
          <span className="dream-chapter-stage-plinth" />
        </div>
        <div className="dream-chapter-stage-controls">
          <div className="dream-chapter-stage-chapters" role="group" aria-label="舞台で章を選ぶ">
            {DREAM_CASES.map((item, index) => (
              <button
                key={item.no}
                type="button"
                aria-pressed={index === selection.index}
                aria-controls={`${id}-preview`}
                aria-label={`CASE ${item.no}「${item.title}」をプレビュー`}
                onClick={() => select(index)}
              >
                <span aria-hidden="true">{item.no}</span>
                <b>{item.title}</b>
              </button>
            ))}
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
              <span className="dream-chapter-stage-range-label">章をめくる</span>
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
        </div>
        <div className="dream-chapter-stage-sheet">
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
    </section>
  );
}
