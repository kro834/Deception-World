import { memo, useEffect, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import {
  EXTREME_SAGA_ENTER_ASSETS,
  FAR_FROM_SAGA_ENTER_ASSETS,
  ILLUSIONCULUM_SAGA_ENTER_ASSETS,
  META_UNITAS_SAGA_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
} from "@/lib/asset-loader";
import { FAR_FROM_SAGA_MENU_TILE } from "@/lib/far-from-saga-artwork";
import { ILLUSIONCULUM_MENU_TILE, ILLUSIONCULUM_MENU_TILE_SIZE } from "@/lib/illusionculum-saga-artwork";
import { META_UNITAS_MENU_TILE } from "@/lib/meta-unitas-saga-artwork";

/* SPECIAL (owner, 2026-10-23): the special sites' grammar on /world, told by
   the layout rather than by labels (owner, 2026-10-23: 不要なセカンダリラベル
   や説明を避ける). After the title stage, the chapter map: each chapter's own
   heading (moved here, never reworded) beside its outlined numeral, in the
   chapter's colour. On the right edge, a dot rail that lights the chapter in
   view. At the end of the record, the three special sites' doors, each shown
   by its own form. Styles: styles-world-special.css. */

type Chapter = {
  href: string;
  no: string;
  phase: "story" | "riders" | "records" | "annex";
  title: string;
};

/* The page's chapter headings, in order (01-03 world-home.tsx, 04-06
   world-annex.tsx). */
const CHAPTERS: readonly Chapter[] = [
  { href: "#story", no: "01", phase: "story", title: "救うべき世界は、現実にある。" },
  { href: "#riders", no: "02", phase: "riders", title: "八人の戦いが交わる。" },
  { href: "#records", no: "03", phase: "records", title: "戦いの記録を辿る。" },
  { href: "#cast-roster", no: "04", phase: "annex", title: "人物一覧" },
  { href: "#world-brief", no: "05", phase: "annex", title: "世界と組織" },
  { href: "#episode-notes", no: "06", phase: "annex", title: "エピソードの記録" },
];

/** After the opening ticker: the chapter map. */
export const WorldContents = memo(function WorldContents() {
  return (
    <nav className="ws-contents" aria-labelledby="ws-contents-title">
      <h2 id="ws-contents-title" className="visually-hidden">
        目次
      </h2>
      <ol className="ws-map">
        {CHAPTERS.map(({ href, no, phase, title }) => (
          <li key={href} data-phase={phase}>
            <a href={href}>
              <b aria-hidden="true">{no}</b>
              <span>{title}</span>
              <i aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
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

/** The right-edge dot rail (wide screens; decorative, the header nav and
    the chapter map carry the navigation). */
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
      <ol>
        {CHAPTERS.map(({ no, phase }, index) => (
          <li key={no} data-phase={phase} data-on={index + 1 === current ? "" : undefined} />
        ))}
      </ol>
    </div>
  );
});

/* The side menu's own tiles of the three forms (styles-stage-shell.css), so
   a reader who has opened the menu already holds them. */
// The order (owner, 2026-10-23: 「ファーフロムは一番最後です。」), as the side
// menu's SPECIAL tiles: エクスプリーム, レクソナンス, イリュージョンクルム,
// メタ・ウニタス, then ファーフロム, a little larger.
const DOORS = [
  {
    to: "/extreme-saga",
    edition: "extreme",
    name: "エクスプリームサーガ",
    art: "/archive-media/thumbs/saga-extreme.webp",
    size: [240, 320],
    assets: EXTREME_SAGA_ENTER_ASSETS,
  },
  {
    to: "/rexonance-saga",
    edition: "rexonance",
    name: "レクソナンスサーガ",
    art: "/archive-media/thumbs/saga-rexonance.webp",
    size: [240, 320],
    assets: REXONANCE_SAGA_ENTER_ASSETS,
  },
  {
    to: "/illusionculum-saga",
    edition: "illusionculum",
    name: "イリュージョンクルムサーガ",
    art: ILLUSIONCULUM_MENU_TILE,
    size: ILLUSIONCULUM_MENU_TILE_SIZE,
    assets: ILLUSIONCULUM_SAGA_ENTER_ASSETS,
  },
  {
    to: "/meta-unitas-saga",
    edition: "meta-unitas",
    name: "メタ・ウニタスサーガ",
    art: META_UNITAS_MENU_TILE,
    size: [400, 533],
    assets: META_UNITAS_SAGA_ENTER_ASSETS,
  },
  {
    to: "/far-from-saga",
    edition: "far-from",
    name: "ファーフロムサーガ",
    art: FAR_FROM_SAGA_MENU_TILE,
    size: [400, 549],
    assets: FAR_FROM_SAGA_ENTER_ASSETS,
  },
] as const;

/** The end of the record: the doors to the three special sites. */
export function WorldSpecialDoors() {
  return (
    <nav className="ws-doors" aria-label="特設サイト">
      {DOORS.map(({ to, edition, name, art, size, assets }) => (
        <GuardedLink key={to} to={to} hash="top" assets={assets} className={`is-${edition}`}>
          <img
            src={art}
            alt=""
            width={size[0]}
            height={size[1]}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            draggable={false}
          />
          <span>
            <DisplayName value={name} />
          </span>
          <i aria-hidden="true" />
        </GuardedLink>
      ))}
    </nav>
  );
}
