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
          <div className="mus-copy">
            {item.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
