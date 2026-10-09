import { memo } from "react";

const CHAPTERS = [
  "“犬”──世界を必要とするもの",
  "“イサク”──創造された世界の名",
  "悠真の勝利が変えたもの",
  "フェイブルが捉えた観測",
  "介入の理由と、勝利の代償",
  "二つの世界に残る重複",
  "まだ、答えのない問い",
] as const;

/** Preserve the record verbatim; emphasis is rendered as text, never HTML. */
export function MysteryTerms({ text }: { text: string }) {
  return text.split(/(“犬”|“イサク”)/u).map((part, index) =>
    part === "“犬”" || part === "“イサク”" ? (
      <strong className="world-mystery-term" key={index}>
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export const MysteryColumnProse = memo(function MysteryColumnProse({
  paragraphs,
}: {
  paragraphs: readonly string[];
}) {
  return (
    <div className="world-mystery-reading">
      <p className="world-mystery-note">
        レックスの記録とフェイブルの解析を照合した考察です。観測主体や世界の重複の正体は、まだ確定していません。
      </p>
      {paragraphs.map((paragraph, index) => (
        <section className="world-mystery-chapter" key={paragraph.slice(0, 18)}>
          <h4>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {CHAPTERS[index]}
          </h4>
          <p>
            <MysteryTerms text={paragraph} />
          </p>
        </section>
      ))}
      <p className="world-mystery-end" aria-hidden="true">
        END OF RECORD / 未解決
      </p>
    </div>
  );
});
