import { memo, useState } from "react";
import { rexonanceImage } from "@/lib/rexonance-images";
import type { RexonanceStage } from "@/lib/rexonance-calls";

type ComparisonForm = {
  key: RexonanceStage;
  label: string;
  code: string;
  image: string;
  alt: string;
  title: string;
  points: readonly string[];
  accent: string;
};

/** Comparison is opt-in: closed cards never create image requests. */
export const RexonanceFormComparison = memo(function RexonanceFormComparison({
  forms,
  selected,
  onChoose,
}: {
  forms: readonly ComparisonForm[];
  selected: RexonanceStage;
  onChoose: (stage: RexonanceStage) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rxe-form-comparison"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>FORM COMPARISON</span>
        <strong>三つの形態を並べて比較</strong>
        {/* LAYOUT (2026-10-21): the drawer's bar lists what it holds. */}
        <span className="rxe-comparison-codes" aria-hidden="true">
          {forms.map((form) => (
            <b key={form.key} style={{ ["--rxe-code-accent" as string]: form.accent }}>
              {form.code}
            </b>
          ))}
        </span>
        <i aria-hidden="true">＋</i>
      </summary>
      {open ? (
        <div className="rxe-comparison-grid">
          {forms.map((form, index) => (
            <article
              className="rxe-comparison-card"
              key={form.key}
              data-selected={selected === form.key}
              style={{ ["--rxs-stage-accent" as string]: form.accent }}
            >
              <p>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{form.code}</b>
              </p>
              <img
                src={form.image}
                {...rexonanceImage(form.image)}
                sizes="(max-width: 700px) 70vw, 28vw"
                width={1086}
                height={1448}
                alt={form.alt}
                loading="lazy"
                decoding="async"
              />
              <h3>{form.label}</h3>
              <p className="rxe-comparison-title">{form.title}</p>
              <ul>
                {form.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <button
                type="button"
                aria-controls="rxs-stage-panel"
                aria-pressed={selected === form.key}
                onClick={() => onChoose(form.key)}
              >
                {selected === form.key ? "表示中の形態" : `${form.label}を表示`}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </details>
  );
});
