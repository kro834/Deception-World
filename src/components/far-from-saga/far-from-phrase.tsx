import type { ReactNode } from "react";

/* FAR FROM SAGA — a phrase of the record on the page (polish sweep,
   2026-10-23). The owner's words stay character for character; this only
   says where a line may break: each unit is one run (.ffs-phrase-unit,
   white-space: nowrap), and a line breaks between units alone. */

/** A phrase with its 「／」 kept at line ends: a line may break only after a
 * slash, never before it and never inside a name (ミドル／ハイ／… on phones,
 * FARFROM DRIVE／多重供給接続). `word-break: keep-all` alone still let a
 * line open with 「／」 (a fullwidth solidus is no CJK letter to it), so the
 * run up to and including each slash is set unbreakable. A phrase without
 * a slash comes back as it is. */
export function withSlashBreaks(text: string): ReactNode[] {
  const parts = text.split("／");
  if (parts.length < 2) return [text];
  return parts.map((part, index) => (
    <span key={index} className="ffs-phrase-unit">
      {index < parts.length - 1 ? `${part}／` : part}
    </span>
  ));
}

/** A call (FAR FROM！FAR FROM！…, SA-GA！DEUS！…) kept in its units: a line
 * may break after a 「！」 (or a run of them) and nowhere else, so a unit
 * with a space in it (FAR FROM！, GRAND FINALE！！) never splits at the
 * space. A call of one unit comes back as it is. */
export function withCallBreaks(call: string): ReactNode[] {
  const units = call.match(/[^！]+！+|[^！]+$/g);
  if (!units || units.length < 2) return [call];
  return units.map((unit, index) => (
    <span key={index} className="ffs-phrase-unit">
      {unit}
    </span>
  ));
}
