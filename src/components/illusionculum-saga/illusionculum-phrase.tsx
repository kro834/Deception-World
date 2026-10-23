import { Fragment, type ReactNode } from "react";
import { withWordBreaks } from "@/lib/name-breaks";

/* ILLUSIONCULUM SAGA — where the owner's headings may break (2026-10-23,
   owner: 「改行も改善して」). The words stay character for character; this
   only adds <wbr> at phrase seams — the names' own (仮面ライダー / イリュージョン
   / クルム / サーガ, after 「・」 and 「／」, the shared name-break rules) and
   after a 「の」 that closes a phrase — for headings set in keep-all, so a
   line never splits a word or leaves one character alone (a unit wider than
   the line still wraps by overflow-wrap). */
const SEAM = "​";

export function phrase(text: string): ReactNode {
  const seamed = withWordBreaks(text).replace(/(の)(?=[^\s、。」』）]{2,})/gu, `$1${SEAM}`);
  const parts = seamed.split(SEAM).filter(Boolean);
  if (parts.length < 2) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}
