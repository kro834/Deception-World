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
      {/* An opening bracket stays with what follows it (WebKit broke after 『). */}
      {/^[『「（《]./u.test(part) ? (
        <>
          <span className="ics-nb">{part.slice(0, 2)}</span>
          {part.slice(2)}
        </>
      ) : (
        part
      )}
    </Fragment>
  ));
}

/** The owner's prose with <wbr> at its phrase seams, for keep-all (WebKit has
 * no auto-phrase and otherwise splits 「関係／性」): after a run of kana that
 * closes a phrase (a particle, an ending) before a new word, after 、。and a
 * closing bracket, and before an opening one. The words are unchanged. */
const PROSE_SEAM =
  /(?<=[\p{Script=Hiragana}])(?=[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9『「（《])|(?<=[、。])(?=[^、。』」）》])|(?<=[』」）》])(?=[^\p{Script=Hiragana}、。』」）》])/gu;

export function prose(text: string): ReactNode {
  const parts = text.split(PROSE_SEAM);
  if (parts.length < 2) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {/* An opening bracket stays with what follows it (WebKit broke after 『). */}
      {/^[『「（《]./u.test(part) ? (
        <>
          <span className="ics-nb">{part.slice(0, 2)}</span>
          {part.slice(2)}
        </>
      ) : (
        part
      )}
    </Fragment>
  ));
}
