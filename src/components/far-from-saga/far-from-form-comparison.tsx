import { memo, useState } from "react";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import {
  FAR_FROM_SAGA_ARTWORK,
  FAR_FROM_SAGA_STAGE_ORDER,
  farFromImage,
  type FarFromStageKey,
} from "@/lib/far-from-saga-artwork";

/* FAR FROM SAGA — the five forms side by side (2026-10-22 redesign).

   The Rexonance stage's comparison drawer (rexonance-form-comparison.tsx)
   for five forms: a native <details> under the stage panel whose cards
   show each form's number, picture and name (katakana only: ミドル to
   ウルトラ), and a button that selects it on the rail above. Opt-in: closed, the drawer creates no image request. */

export const FarFromFormComparison = memo(function FarFromFormComparison({
  selected,
  onChoose,
}: {
  selected: FarFromStageKey;
  onChoose: (stage: FarFromStageKey) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="ffs-form-comparison" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span lang="en">FORM COMPARISON</span>
        <strong>五つの形態を並べて比較</strong>
        <span className="ffs-comparison-codes" aria-hidden="true">
          {FAR_FROM_SAGA_STAGE_ORDER.map((key) => (
            <b key={key} style={{ ["--ffs-code-accent" as string]: FAR_FROM_SAGA.stages[key].accent }}>
              {FAR_FROM_SAGA.stages[key].label}
            </b>
          ))}
        </span>
        <i aria-hidden="true">＋</i>
      </summary>
      {open ? (
        <div className="ffs-comparison-grid" role="group" aria-label="表示する形態">
          {FAR_FROM_SAGA_STAGE_ORDER.map((key, index) => {
            const form = FAR_FROM_SAGA.stages[key];
            const art = FAR_FROM_SAGA_ARTWORK[key];
            return (
              <article
                key={key}
                className="ffs-comparison-card"
                data-selected={selected === key}
                style={{ ["--ffs-accent" as string]: form.accent }}
              >
                <p>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </p>
                <img
                  src={art.src}
                  srcSet={farFromImage(key).srcSet}
                  sizes="(max-width: 700px) 70vw, 18vw"
                  width={art.width}
                  height={art.height}
                  alt={form.alt}
                  loading="lazy"
                  decoding="async"
                />
                <h3>{form.label}</h3>
                <button
                  type="button"
                  aria-controls="ffs-stage-panel"
                  aria-pressed={selected === key}
                  onClick={(event) => {
                    onChoose(key);
                    const keyboard = event.detail === 0;
                    // The selected panel precedes this drawer: show the result
                    // without sweeping back through the page.
                    requestAnimationFrame(() => {
                      const rail = document.querySelector(".ffs-stage-tabs");
                      const header = document.querySelector(".rxs-local-nav");
                      if (rail)
                        scrollBy({
                          top:
                            rail.getBoundingClientRect().top -
                            (header?.getBoundingClientRect().height ?? 0) -
                            24,
                          behavior: "instant",
                        });
                      if (keyboard)
                        document
                          .getElementById(`ffs-stage-tab-${key}`)
                          ?.focus({ preventScroll: true });
                    });
                  }}
                >
                  {selected === key ? `${form.label}を表示中` : `${form.label}を表示`}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </details>
  );
});
