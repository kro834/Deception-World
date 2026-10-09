import { Fragment, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { nameWords } from "@/lib/name-breaks";
import type { MatchRange, SearchResult } from "./search-engine";
import { resultHref } from "./search-ui-helpers";

/** Text with its matched ranges marked. */
export function Highlighted({ text, ranges }: { text: string; ranges: readonly MatchRange[] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** A display name broken at its seams (as DisplayName) with matches marked. */
export function HighlightedName({ text, ranges }: { text: string; ranges: readonly MatchRange[] }) {
  let offset = 0;
  return (
    <>
      {nameWords(text).map((word, index) => {
        const start = offset;
        offset += word.text.length;
        const local = ranges
          .filter(([from, to]) => to > start && from < offset)
          .map(([from, to]): MatchRange => [
            Math.max(from, start) - start,
            Math.min(to, offset) - start,
          ]);
        return (
          <Fragment key={`${index}-${word.text}`}>
            {index > 0 ? <wbr /> : null}
            <span className={`name-word${word.protected ? " name-word--protected" : ""}`}>
              <Highlighted text={word.text} ranges={local} />
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

/** A result as a listbox option that is also a real link (new tab, copy link). */
export function ResultOption({
  result,
  id,
  active,
  className,
  onOpen,
  children,
}: {
  result: SearchResult;
  id: string;
  active: boolean;
  className?: string;
  onOpen: (result: SearchResult, fromKeyboard: boolean) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const preload = () => {
    void router.preloadRoute({ to: result.document.to as never }).catch(() => undefined);
  };
  return (
    <a
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      href={resultHref(result)}
      className={className}
      data-active={active ? "true" : undefined}
      onPointerEnter={preload}
      onTouchStart={preload}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onOpen(result, event.detail === 0);
      }}
    >
      {children}
    </a>
  );
}
