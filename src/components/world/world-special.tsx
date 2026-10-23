import { memo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import {
  EXTREME_SAGA_ENTER_ASSETS,
  FAR_FROM_SAGA_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
} from "@/lib/asset-loader";

/* SPECIAL (owner, 2026-10-23): the special sites' grammar on /world —
   the CONTENTS map after the title stage (a readout plate and the numbered
   chapter list), the right-edge chapter rail, and the doors to the three
   special sites at the end of the record. The chapter names in the map are
   the owner's own chapter headings (moved here, never reworded); every new
   line is an English HUD label or a number read from the page's data.
   Styles: styles-world-special.css. */

export const WORLD_CHAPTER_TOTAL = 6;

export const pad2 = (value: number) => String(value).padStart(2, "0");

type Chapter = {
  href: string;
  no: string;
  code: string;
  title: ReactNode;
  sub: string;
};

const CHAPTERS: readonly Chapter[] = [
  {
    href: "#story",
    no: "01",
    code: "WORLD / STORY",
    title: "救うべき世界は、現実にある。",
    sub: "THIS IS NOT A DREAM",
  },
  {
    href: "#riders",
    no: "02",
    code: "EIGHT RIDERS",
    title: "八人の戦いが交わる。",
    sub: "EIGHT RIDERS / ONE WORLD",
  },
  {
    href: "#records",
    no: "03",
    code: "NEW RECORDS",
    title: "戦いの記録を辿る。",
    sub: "POWER BEYOND THE BORDER",
  },
  { href: "#cast-roster", no: "04", code: "CAST FILES", title: "人物一覧", sub: "CHARACTERS" },
  { href: "#world-brief", no: "05", code: "WORLD FILES", title: "世界と組織", sub: "WORLD BRIEF" },
  {
    href: "#episode-notes",
    no: "06",
    code: "ARCHIVE LOG",
    title: "エピソードの記録",
    sub: "EPISODES / KEYWORDS / QUOTES",
  },
];

export type WorldReadout = { value: number; label: string };

/** After the opening ticker: the numbers, then the chapter map. */
export const WorldContents = memo(function WorldContents({
  readouts,
}: {
  readouts: readonly WorldReadout[];
}) {
  return (
    <nav className="ws-contents" aria-labelledby="ws-contents-title">
      <div className="ws-contents-inner">
        <header className="ws-contents-head">
          <p className="ws-code" aria-hidden="true">
            <span>00</span> INDEX
          </p>
          <h2 id="ws-contents-title" lang="en">
            CONTENTS
          </h2>
          <p className="ws-count" aria-hidden="true">
            {pad2(CHAPTERS.length)} CHAPTERS
          </p>
        </header>
        <dl className="ws-readouts" aria-label="記録の数">
          {readouts.map(({ value, label }) => (
            <div key={label}>
              <dt lang="en">{label}</dt>
              <dd>{pad2(value)}</dd>
            </div>
          ))}
        </dl>
        <ol className="ws-map">
          {CHAPTERS.map(({ href, no, code, title, sub }) => (
            <li key={href}>
              <a href={href}>
                <b aria-hidden="true">{no}</b>
                <small lang="en" aria-hidden="true">
                  {code}
                </small>
                <span>{title}</span>
                <em lang="en" aria-hidden="true">
                  {sub}
                </em>
                <i aria-hidden="true">↗</i>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
});

/* Which chapter each landmark belongs to (06 runs on through the glossary
   and the quotes; the finale and the footer light none). */
const RAIL_TARGETS: readonly [string, number][] = [
  ["story", 1],
  ["riders", 2],
  ["records", 3],
  ["cast-roster", 4],
  ["world-brief", 5],
  ["episode-notes", 6],
  ["glossary", 6],
  ["quotes", 6],
];

/** The right-edge chapter rail (wide screens; decorative, the header nav
    and the CONTENTS map carry the navigation). */
export const WorldChapterRail = memo(function WorldChapterRail() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = RAIL_TARGETS.map(
      ([id, no]) => [document.getElementById(id), no] as const,
    ).filter((entry): entry is readonly [HTMLElement, number] => entry[0] != null);
    if (!targets.length) return;
    const chapterOf = new Map<Element, number>(targets);
    const inside = new Set<Element>();
    // A reading line 38% down the screen: the chapter under it is current.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) inside.add(entry.target);
          else inside.delete(entry.target);
        });
        let next = 0;
        inside.forEach((target) => {
          next = Math.max(next, chapterOf.get(target) ?? 0);
        });
        setCurrent(next);
      },
      { rootMargin: "-38% 0px -61% 0px" },
    );
    targets.forEach(([target]) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="ws-rail"
      aria-hidden="true"
      data-current={current || undefined}
      style={{ ["--ws-rail-at" as string]: current }}
    >
      <span className="ws-rail-now">
        {current ? `${pad2(current)} / ${pad2(WORLD_CHAPTER_TOTAL)}` : ""}
      </span>
      <ol>
        {CHAPTERS.map(({ no }, index) => (
          <li key={no} data-on={index + 1 === current ? "" : undefined}>
            <b>{no}</b>
          </li>
        ))}
      </ol>
    </div>
  );
});

/** The end of the record: the doors to the three special sites. */
export function WorldSpecialDoors() {
  return (
    <nav className="ws-doors" aria-labelledby="ws-doors-title">
      <p id="ws-doors-title" className="ws-code" lang="en">
        SPECIAL SITES
      </p>
      <GuardedLink to="/extreme-saga" hash="top" assets={EXTREME_SAGA_ENTER_ASSETS}>
        <small lang="en" aria-hidden="true">
          SUPREME SITE
        </small>
        <span>
          <DisplayName value="エクスプリームサーガ" />
        </span>
        <i aria-hidden="true">↗</i>
      </GuardedLink>
      <GuardedLink to="/rexonance-saga" hash="top" assets={REXONANCE_SAGA_ENTER_ASSETS}>
        <small lang="en" aria-hidden="true">
          PERFORMANCE SITE
        </small>
        <span>
          <DisplayName value="レクソナンスサーガ" />
        </span>
        <i aria-hidden="true">↗</i>
      </GuardedLink>
      <GuardedLink to="/far-from-saga" hash="top" assets={FAR_FROM_SAGA_ENTER_ASSETS}>
        <small lang="en" aria-hidden="true">
          FINAL FORM SITE
        </small>
        <span>
          <DisplayName value="ファーフロムサーガ" />
        </span>
        <i aria-hidden="true">↗</i>
      </GuardedLink>
    </nav>
  );
}
