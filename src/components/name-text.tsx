import { Fragment } from "react";
import { nameWords } from "@/lib/name-breaks";

/** Explicit name boundaries, with a narrow-column fallback for long words. */
export function DisplayName({ value }: { value: string }) {
  return (
    <>
      {nameWords(value).map((word, index) => (
        <Fragment key={`${index}-${word.text}`}>
          {index > 0 ? <wbr /> : null}
          <span className={`name-word${word.protected ? " name-word--protected" : ""}`}>
            {word.text}
          </span>
        </Fragment>
      ))}
    </>
  );
}
