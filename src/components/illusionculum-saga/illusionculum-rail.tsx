import { memo, useEffect, useState } from "react";

/* ILLUSIONCULUM SAGA — the right-edge chapter rail (as /rexonance-saga's):
   six marks, the chapter in view lit (a reading line 40% down the screen),
   each a link to its chapter (named for assistive tech; wide screens only —
   the bar carries the navigation everywhere else). */
const CHAPTERS = [
  ["overview", "概要", ["overview", "specs", "comparison"]],
  ["suitup", "変身", ["suitup"]],
  ["forms", "形態", ["forms"]],
  ["armour", "装甲・外観", ["armour"]],
  ["arsenal", "専用武装", ["arsenal"]],
  ["abilities", "能力", ["abilities", "finishers"]],
] as const;

export const IllusionculumRail = memo(function IllusionculumRail() {
  const [current, setCurrent] = useState(-1);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const owner = new Map<Element, number>();
    CHAPTERS.forEach(([, , ids], index) =>
      ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) owner.set(element, index);
      }),
    );
    const inside = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) inside.add(entry.target);
          else inside.delete(entry.target);
        });
        let next = -1;
        inside.forEach((element) => (next = Math.max(next, owner.get(element) ?? -1)));
        setCurrent(next);
      },
      { rootMargin: "-40% 0px -59% 0px" },
    );
    owner.forEach((_, element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="ics-rail" aria-label="章" data-current={current >= 0 ? current : undefined}>
      <ol>
        {CHAPTERS.map(([id, label], index) => (
          <li key={id} data-on={index === current || undefined}>
            <a
              href={`#${id}`}
              aria-label={label}
              aria-current={index === current ? "location" : undefined}
            >
              <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
});
