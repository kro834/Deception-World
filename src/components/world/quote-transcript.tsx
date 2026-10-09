import { memo } from "react";
import { transcriptGraphemes } from "@/lib/quote-transcript.js";

/** The source stays selectable, searchable and readable by assistive technology.
 * Only the aria-hidden facsimile is transcribed; neither layer edits the words. */
export const QuoteTranscript = memo(function QuoteTranscript({ text }: { text: string }) {
  return (
    <span className="wa-transcript" data-quote-transcript>
      <span className="wa-transcript-source">{text}</span>
      <span className="wa-transcript-visual" aria-hidden="true" data-echo={text}>
        {transcriptGraphemes(text).map((glyph: string, index: number) => (
          <span className="wa-transcript-glyph" key={index}>
            {glyph}
          </span>
        ))}
      </span>
    </span>
  );
});
