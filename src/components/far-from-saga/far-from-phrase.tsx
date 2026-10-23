import type { ReactNode } from "react";

/* FAR FROM SAGA — a phrase of the record on the page (polish sweep,
   2026-10-23). The owner's words stay character for character; this only
   says where a line may break. */

/** A phrase with its 「／」 kept at line ends: every character stays (a <wbr>
 * adds none), and with `word-break: keep-all` on the element (.ffs-phrase)
 * a line may break only after a slash, never before it, so no line opens
 * with 「／」 (ミドル／ハイ／… on phones, FARFROM DRIVE／多重供給接続). */
export function withSlashBreaks(text: string): ReactNode[] {
  const parts = text.split("／");
  return parts.flatMap((part, index) =>
    index < parts.length - 1 ? [`${part}／`, <wbr key={index} />] : [part],
  );
}
