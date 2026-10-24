import { Fragment, type ReactNode } from "react";
import type { MetaUnitasArticle } from "./meta-unitas-data";

/* META UNITAS SAGA — small shared pieces of the page (2026-10-23). Every
   word they print is the owner's (meta-unitas-data.ts, generated from the
   record); these only lay it out. */

/** A bracketed call or name (【…】, 『…』): the brackets stay in the text, drawn
 * as the page's light marks. */
export function Bracketed({ text }: { text: string }) {
  const match = /^([【『《]\s?)(.*?)(\s?[】』》])$/u.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <span className="mus-bracket">{match[1]}</span>
      {jp(match[2])}
      <span className="mus-bracket">{match[3]}</span>
    </>
  );
}

/** A call line, its chant split into its four SA-GA！DEUS！ chips. */
export function CallLine({ units }: { units: readonly string[] }) {
  if (units.length === 1)
    return (
      <span className="mus-call-text">
        <Bracketed text={`【${units[0]}】`} />
      </span>
    );
  return (
    <span className="mus-call-text">
      <span className="mus-bracket">【</span>
      {units.map((unit, index) => (
        <span key={`${index}-${unit}`} className="mus-call-chip">
          {unit}
        </span>
      ))}
      <span className="mus-bracket">】</span>
    </span>
  );
}

/** A heading, a name or a cell, kept in its phrases (2026-10-23, owner:
 * 「改行も改善して」): a line may break only between the record's own units —
 * after 「・」「／」「、」「。」, a closing bracket or a run of 「！」, and before
 * an opening bracket — never inside a word, so no line opens with 「／」 or
 * ends on one stray character. Each unit is one run (.mus-unit, nowrap);
 * the words are unchanged. */
export function jp(text: string): ReactNode {
  const units = text
    .match(/[（「『〈【]?[^・／、。）」』〉】！（「『〈【]*(?:[・／、。）」』〉】]|！+)*/gu)
    ?.filter(Boolean);
  if (!units || units.length < 2 || units.join("") !== text) return text;
  return units.map((unit, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      <span className="mus-unit">{unit}</span>
    </Fragment>
  ));
}

/** Line breaks only after the record's own separators (「／」, 「・」 stay
 * whole words), so a long Latin name never splits mid-word on a phone. */
export function phrase(text: string): ReactNode {
  const parts = text.split(/(?<=／)/u);
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

/** The record's articles (systems, abilities, armour): plates, each its own
 * independent cell of one grid — the form's own idea, laid out. */
export function Articles({
  items,
  label,
  variant,
}: {
  items: readonly MetaUnitasArticle[];
  label: string;
  variant: "system" | "ability" | "armor";
}) {
  return (
    <div className={`mus-articles is-${variant}`} role="list" aria-label={label}>
      {items.map((item, index) => (
        <article key={item.title} className="mus-article rxs-reveal" role="listitem">
          <span className="mus-article-no" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3>
            <span className="mus-article-name" lang="en">
              <span className="mus-bracket">『 </span>
              {phrase(item.name)}
              <span className="mus-bracket"> 』</span>
            </span>
            {item.reading ? <span className="mus-article-reading">（{item.reading}）</span> : null}
          </h3>
          <ArticleDiagram name={item.name} />
          <Lead body={item.body} />
        </article>
      ))}
    </div>
  );
}

/** The owner's first sentence, verbatim, as the item's lead; the rest of
 * the owner's text, complete and in order, behind one disclosure
 * (owner, 2026-10-24: 「説明多過ぎるので、洗練させて」). */
export function splitLead(body: readonly string[]) {
  const [first = "", ...others] = body;
  const end = first.indexOf("。");
  const lead = end >= 0 && end < first.length - 1 ? first.slice(0, end + 1) : first;
  const rest = first.slice(lead.length);
  return { lead, rest: rest ? [rest, ...others] : others };
}

export function Lead({ body, className = "" }: { body: readonly string[]; className?: string }) {
  const { lead, rest } = splitLead(body);
  return (
    <div className={`mus-copy mus-lead-block ${className}`.trim()}>
      <p className="mus-lead">{lead}</p>
      {rest.length ? (
        <details className="mus-more">
          <summary>
            <span>詳しく</span>
            <i aria-hidden="true" />
          </summary>
          <div className="mus-more-body">
            {rest.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Small drawn diagrams of the mechanisms (no text; decorative). */
export function ArticleDiagram({ name }: { name: string }) {
  const art = DIAGRAMS[name];
  if (!art) return null;
  return (
    <svg className="mus-diagram" viewBox="0 0 240 96" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}

const DIAGRAMS: Record<string, ReactNode> = {
  // 識別 → 維持 → 形成 → 安定化: four steps as a flow.
  "METAPARTITION ENGINE": (
    <g>
      {[0, 1, 2, 3].map((step) => (
        <g key={step} style={{ ["--d" as string]: step }} className="mus-dg-step">
          <rect x={14 + step * 58} y={34} width={36} height={28} rx={4} />
          {step < 3 ? (
            <path d={`M${54 + step * 58} 48h14m-5-4 5 4-5 4`} className="mus-dg-link" />
          ) : null}
        </g>
      ))}
    </g>
  ),
  // One whole, made divisible into independent parts.
  "DIVISIBILITY GRANT": (
    <g>
      <circle cx={60} cy={48} r={30} />
      <path d="M100 48h22m-5-4 5 4-5 4" className="mus-dg-link" />
      {[0, 1, 2, 3].map((part) => (
        <path
          key={part}
          className="mus-dg-step"
          style={{ ["--d" as string]: part }}
          transform={`translate(${172 + (part % 2 ? 8 : -8)} ${48 + (part < 2 ? -8 : 8)}) rotate(${part * 90})`}
          d="M0 -28A28 28 0 0 1 28 0L4 0A4 4 0 0 0 0 -4Z"
        />
      ))}
    </g>
  ),
  // The halo's orbits and the bits riding them.
  "UNITAS HALO": (
    <g>
      <ellipse cx={120} cy={48} rx={92} ry={20} />
      <ellipse cx={120} cy={48} rx={60} ry={34} className="mus-dg-alt" />
      <circle cx={120} cy={48} r={6} className="mus-dg-core" />
    </g>
  ),
  "META UNITAS BIT": (
    <g>
      <ellipse cx={120} cy={48} rx={96} ry={30} className="mus-dg-alt" />
      {[0, 1, 2, 3, 4, 5].map((bit) => {
        const a = (bit / 6) * Math.PI * 2;
        return (
          <path
            key={bit}
            className="mus-dg-step mus-dg-core"
            style={{ ["--d" as string]: bit }}
            transform={`translate(${(120 + Math.cos(a) * 96).toFixed(1)} ${(48 + Math.sin(a) * 30).toFixed(1)})`}
            d="M0 -7 5 0 0 7 -5 0Z"
          />
        );
      })}
    </g>
  ),
  // The arms deployed around one body.
  "TETRA MANUS": (
    <g>
      <circle cx={120} cy={48} r={12} className="mus-dg-core" />
      {[-150, -110, -70, -30].map((deg, arm) => {
        const r = (deg * Math.PI) / 180;
        const x = 120 + Math.cos(r) * 90;
        const y = 70 + Math.sin(r) * 60;
        return (
          <path
            key={arm}
            className="mus-dg-step"
            style={{ ["--d" as string]: arm }}
            d={`M120 48Q${((120 + x) / 2).toFixed(1)} ${(y - 10).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`}
          />
        );
      })}
    </g>
  ),
  // Independent zones held inside one field.
  "ULTRA PARTITION FIELD": (
    <g>
      <ellipse cx={120} cy={48} rx={104} ry={40} />
      {[
        [70, 44, 20],
        [126, 36, 16],
        [172, 54, 18],
        [112, 66, 10],
      ].map(([cx, cy, r], zone) => (
        <circle
          key={zone}
          className="mus-dg-step mus-dg-alt"
          style={{ ["--d" as string]: zone }}
          cx={cx}
          cy={cy}
          r={r}
        />
      ))}
    </g>
  ),
};
