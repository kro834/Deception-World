import { Fragment, useState } from "react";
import {
  REPORT_PARTS,
  REPORT_TABLES,
  type ReportBlock,
  type ReportPart,
  type ReportTableKey,
} from "./far-from-report-data";

/* #report — the owner's comparison text in full (2026-10-22).

   Two documents, each with its own anchor (#report-rexonance, #report-saga;
   registered in special-site-sections.ts): the title, the opening
   paragraphs, then one disclosure panel per 【 】 chapter. Every line of the
   owner's text is printed verbatim from far-from-report-data.ts, the two
   tables as real tables with their ※ notes. The panels are native
   <details>: keyboard and screen-reader support come with the element, and
   the browser's find-in-page opens a closed panel that holds a match. The
   first chapter of each document starts open. */

const PART_CODES: Record<ReportPart["id"], string> = {
  "report-rexonance": "REPORT 01 / VS REXONANCE",
  "report-saga": "REPORT 02 / ULTIMATE FORMS",
};

function ReportTableView({ tableKey }: { tableKey: ReportTableKey }) {
  const table = REPORT_TABLES[tableKey];
  return (
    <figure className="ffs-report-table">
      <div className="ffs-table-scroll" role="region" aria-label={table.title} tabIndex={0}>
        {/* Explicit roles: on phones the rows are laid out as cards
            (display: grid), which would otherwise drop the table semantics
            in some browsers. */}
        <table role="table">
          <caption className="ffs-visually-hidden">{table.title}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                {table.corner}
              </th>
              {table.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  role="columnheader"
                  data-current={column === "ファーフロム" || undefined}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {table.rows.map((row) => (
              <tr key={row.label} role="row">
                <th scope="row" role="rowheader">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={`${row.label}-${index}`}
                    role="cell"
                    data-label={table.columns[index]}
                    data-current={index === 3 || undefined}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption>{table.note}</figcaption>
    </figure>
  );
}

function Blocks({ blocks }: { blocks: readonly ReportBlock[] }) {
  return (
    <>
      {blocks.map((block, index) =>
        block.kind === "p" ? (
          <p key={index}>{block.text}</p>
        ) : (
          <ReportTableView key={block.table} tableKey={block.table} />
        ),
      )}
    </>
  );
}

function ReportDocument({ part, number }: { part: ReportPart; number: number }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(part.chapters.slice(0, 1).map((chapter) => chapter.id)),
  );
  const allOpen = open.size === part.chapters.length;
  const titleId = `${part.id}-title`;

  return (
    <article id={part.id} className="ffs-report rxs-reveal" aria-labelledby={titleId}>
      <header className="ffs-report-head">
        <small lang="en">{PART_CODES[part.id]}</small>
        {/* A narrow screen breaks the title after its 「・」 (the text is unchanged). */}
        <h3 id={titleId}>
          {part.title.split("・").map((segment, index) => (
            <Fragment key={segment}>
              {index > 0 ? (
                <>
                  ・<wbr />
                </>
              ) : null}
              {segment}
            </Fragment>
          ))}
        </h3>
        {part.subtitle ? (
          <p className="ffs-report-sub" lang="en">
            {part.subtitle}
          </p>
        ) : null}
        <p className="ffs-report-count">
          資料{number}・全{part.chapters.length}章
        </p>
      </header>

      {part.intro.length ? (
        <div className="ffs-report-intro">
          <Blocks blocks={part.intro} />
        </div>
      ) : null}

      <div className="ffs-report-tools">
        <button
          type="button"
          aria-controls={part.chapters.map((chapter) => chapter.id).join(" ")}
          onClick={() =>
            setOpen(allOpen ? new Set() : new Set(part.chapters.map((chapter) => chapter.id)))
          }
        >
          {allOpen ? "すべて閉じる" : "すべて開く"}
        </button>
      </div>

      <ol className="ffs-report-chapters">
        {part.chapters.map((chapter) => (
          <li key={chapter.id}>
            <details
              id={chapter.id}
              open={open.has(chapter.id)}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpen((current) => {
                  if (current.has(chapter.id) === isOpen) return current;
                  const next = new Set(current);
                  if (isOpen) next.add(chapter.id);
                  else next.delete(chapter.id);
                  return next;
                });
              }}
            >
              <summary>
                <span aria-hidden="true">{chapter.index}</span>
                <h4>{chapter.title}</h4>
                <i aria-hidden="true" />
              </summary>
              <div className="ffs-report-body">
                <Blocks blocks={chapter.blocks} />
              </div>
            </details>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function FarFromReport() {
  return (
    <div className="ffs-reports">
      {REPORT_PARTS.map((part, index) => (
        <ReportDocument key={part.id} part={part} number={index + 1} />
      ))}
    </div>
  );
}
