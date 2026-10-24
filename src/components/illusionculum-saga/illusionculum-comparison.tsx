import {
  ILLUSIONCULUM_FORM_ORDER,
  type IllusionculumFormKey,
} from "@/lib/illusionculum-saga-artwork";
import { ILLUSIONCULUM_COMPARISON, ILLUSIONCULUM_FORMS, type IcPassage } from "./illusionculum-data";
import { IcLead } from "./illusionculum-parts";
import { phrase, prose } from "./illusionculum-phrase";

/* ILLUSIONCULUM SAGA — #comparison, the owner's 究極形態総合性能比較 for this
   form (2026-10-23): the two tables, then the four passages (性能評価, 支援・
   戦闘機能の比較, P14・P16の技術的な差, 総合評価), every word the owner's
   (illusionculum-data.ts; never against レクソナンス, owner's ruling).

   The tables carry it: the form's own rows lit in its light (ウルトラ in its
   crimson), and a bar under each figure that draws the column — the
   strikes and the jump against the column's largest, the 100 m against the
   fastest on a log scale (the column spans three orders of magnitude). */

type Row = { readonly cells: readonly string[]; readonly added?: true };

const SELF = /^イリュージョンクルム/;
const ULTRA = /ウルトラ$/;

/** A figure's number ("205.6t〜" → 205.6). */
const value = (cell: string) => Number.parseFloat(cell.replace(/[^\d.]/g, ""));

/** Each cell's bar (0–1) per column: larger is better, except the time. */
function bars(rows: readonly Row[], head: readonly string[]) {
  return head.map((title, column) => {
    if (column === 0) return rows.map(() => 0);
    // A figure column only (the acceleration units' names are not figures).
    if (rows.some((row) => !/^\d/.test(row.cells[column]))) return rows.map(() => 0);
    const values = rows.map((row) => value(row.cells[column]));
    if (/走力/.test(title)) {
      const best = Math.min(...values);
      const worst = Math.max(...values);
      const span = Math.log(worst / best) || 1;
      return values.map((entry) => 0.12 + 0.88 * (1 - Math.log(entry / best) / span));
    }
    const max = Math.max(...values);
    return values.map((entry) => entry / max);
  });
}

/** The row the chosen form reads from: ウルトラ's own, or the standard's. */
const rowFor = (form: IllusionculumFormKey, rows: readonly Row[]) => {
  const ultra = form === "ultra" || form === "ultraMore";
  const own = rows.find((row) => SELF.test(row.cells[0]) && ULTRA.test(row.cells[0]) === ultra);
  return (own ?? rows.find((row) => SELF.test(row.cells[0])))?.cells[0];
};

function ComparisonTable({
  id,
  table,
  form,
}: {
  id: string;
  form: IllusionculumFormKey;
  table: {
    readonly title: string;
    readonly head: readonly string[];
    readonly rows: readonly Row[];
    readonly note: readonly string[];
  };
}) {
  const scale = bars(table.rows, table.head);
  const current = rowFor(form, table.rows);
  const numeric = table.head.map((_, column) => column > 0 && scale[column].some(Boolean));
  return (
    <div className="ics-table-block rxs-reveal">
      <h3 id={`${id}-title`}>{phrase(table.title)}</h3>
      <div className="ics-table-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-title`}>
        <table className="ics-table" aria-labelledby={`${id}-title`}>
          <thead>
            <tr>
              {table.head.map((title, column) => (
                <th key={title} scope="col" data-numeric={numeric[column] || undefined}>
                  {phrase(title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => {
              const [name, ...cells] = row.cells;
              return (
                <tr
                  key={name}
                  data-self={SELF.test(name) || undefined}
                  data-ultra={(SELF.test(name) && ULTRA.test(name)) || undefined}
                  data-current={name === current || undefined}
                >
                  <th scope="row">{phrase(name)}</th>
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex} data-numeric={numeric[cellIndex + 1] || undefined}>
                      <span lang="en">{cell}</span>
                      {numeric[cellIndex + 1] ? (
                        <i
                          aria-hidden="true"
                          style={{
                            ["--ics-bar" as string]: scale[cellIndex + 1][index].toFixed(3),
                          }}
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {table.note.map((note) => (
        <p key={note} className="ics-note">
          {prose(note)}
        </p>
      ))}
    </div>
  );
}

const text = (passage: IcPassage) => passage.fragments.join("");

export function IllusionculumComparison({
  form,
  onChoose,
}: {
  form: IllusionculumFormKey;
  onChoose: (form: IllusionculumFormKey) => void;
}) {
  const { title, partners, basic, compute, sections } = ILLUSIONCULUM_COMPARISON;
  return (
    <section
      id="comparison"
      className="rxs-section ics-chapter ics-subchapter ics-comparison"
      aria-labelledby="ics-comparison-title"
    >
      <header className="rxs-section-heading ics-heading rxs-reveal">
        <h2 id="ics-comparison-title">{phrase(title)}</h2>
        <p className="ics-partners" lang="en">
          {partners}
        </p>
      </header>
      {/* The page's form, chosen here too: its rows light in its colour. */}
      <div className="ics-compare-pick rxs-reveal" role="group" aria-label="比較する形態">
        {ILLUSIONCULUM_FORM_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={form === key}
            style={{ ["--ics-pick" as string]: ILLUSIONCULUM_FORMS[key].accent }}
            onClick={() => onChoose(key)}
          >
            {ILLUSIONCULUM_FORMS[key].label}
          </button>
        ))}
      </div>
      <div className="ics-tables">
        <ComparisonTable id="ics-basic" table={basic} form={form} />
        <ComparisonTable id="ics-compute" table={compute} form={form} />
      </div>
      <div className="ics-evaluations">
        {sections.map((section) => (
          <article key={section.title} className="ics-evaluation rxs-reveal">
            <h3>{phrase(section.title)}</h3>
            <IcLead body={section.body.map(text)} />
          </article>
        ))}
      </div>
    </section>
  );
}
