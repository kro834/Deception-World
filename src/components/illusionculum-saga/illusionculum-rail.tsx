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
        {CHAPTERS.map(([id, label], index) => {
          const isOn = index === current;
          return (
            <li key={id} data-on={isOn || undefined}>
              <a
                href={`#${id}`}
                aria-label={label}
                aria-current={isOn ? "location" : undefined}
                style={{ position: "relative" }}
              >
                {isOn ? (
                  <span
                    className="ics-rail-optical-beacon"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "50%",
                      translate: "50% -50%",
                      width: 4,
                      height: 16,
                      background:
                        "linear-gradient(180deg, rgb(166 230 255), rgb(233 184 102), rgb(255 143 210))",
                      borderRadius: 1,
                      boxShadow: "0 0 10px rgb(233 184 102 / 80%), 0 0 4px #ffffff",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
                <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
