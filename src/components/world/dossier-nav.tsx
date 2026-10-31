import { Fragment } from "react";
import { useRouterState } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { nameWords } from "@/lib/name-breaks";
import { UiVectorIcon } from "./ui-vector-icon";
import { dossierImage } from "@/lib/dossier-images";
import { LAUNCHER_TILE_IMAGES } from "@/lib/thumbnail-images";
import { CAST_ROSTER_SEARCH, isCastRosterOrigin } from "@/lib/dossier-origin";

export type DossierLink = {
  id: string;
  name: string;
  href: string | null;
  assets: readonly string[];
  kicker?: string;
};

export const RIKUEI_NAV: DossierLink[] = [
  {
    id: "I",
    name: "ゼウス",
    href: "/managers/zeus",
    assets: ["/manager-zeus-detail.jpeg?v=20260823-2"],
    kicker: "RIKUEI I",
  },
  {
    id: "II",
    name: "レックス・ロワ",
    href: "/managers/rex-loi",
    assets: ["/manager-rex-loi.jpeg"],
    kicker: "RIKUEI II",
  },
  {
    id: "III",
    name: "シュザ",
    href: "/managers/shuza",
    assets: ["/manager-shuza.jpeg"],
    kicker: "RIKUEI III",
  },
  {
    id: "IV",
    name: "レジャス",
    href: "/managers/lejas",
    assets: ["/manager-lejas.jpeg"],
    kicker: "RIKUEI IV",
  },
  {
    id: "V",
    name: "オパス",
    href: "/managers/opus",
    assets: ["/manager-opus.jpeg"],
    kicker: "RIKUEI V",
  },
  {
    id: "VI",
    name: "リームー",
    href: "/managers/reemu",
    assets: ["/manager-reemu.jpeg"],
    kicker: "RIKUEI VI",
  },
];

// RE DIVE's 六詠 (re-dive-section.tsx): シエル first, then the archive's II, IV
// and V; III and VI are 欠番 (no page).
export const RE_DIVE_RIKUEI_NAV: DossierLink[] = [
  {
    id: "I",
    name: "シエル",
    href: "/characters/ciel",
    // His illustration as supplied: the warm-up resolves it to the hero's own
    // candidates (dossierImage), so a desktop no longer warms the 960 px file
    // and then shows the 640.
    assets: ["/ciel-illustration-20260924.webp"],
    kicker: "RIKUEI I",
  },
  RIKUEI_NAV[1],
  { id: "III", name: "欠番", href: null, assets: [], kicker: "RIKUEI III" },
  RIKUEI_NAV[3],
  RIKUEI_NAV[4],
  { id: "VI", name: "欠番", href: null, assets: [], kicker: "RIKUEI VI" },
];

export const RIDER_NAV: DossierLink[] = [
  {
    id: "saga",
    name: "サーガ",
    href: "/riders/saga",
    assets: ["/civilian-yuma-20260826.jpeg"],
    kicker: "RIDER 01",
  },
  {
    id: "realm",
    name: "レルム",
    href: "/riders/realm",
    assets: ["/civilian-bell-20260826.jpeg"],
    kicker: "RIDER 02",
  },
  {
    id: "lore",
    name: "ローア",
    href: "/riders/lore",
    assets: ["/civilian-lore.jpeg"],
    kicker: "RIDER 03",
  },
  {
    id: "vandal",
    name: "ヴァンダール",
    href: "/riders/vandal",
    assets: ["/civilian-vandal.jpeg"],
    kicker: "RIDER 04",
  },
  {
    id: "leddic",
    name: "レディック",
    href: "/riders/leddic",
    assets: [
      "/civilian-leddic.jpeg",
      "/civilian-naikami-chigiri.jpeg",
      "/rider-leddic-ishihen.jpeg",
      "/rider-leddic-hoko.jpeg",
      "/rider-leddic-rekka-20260829.jpeg",
      "/rider-leddic-kemonohen-9237.jpeg",
    ],
    kicker: "RIDER 05",
  },
  {
    id: "argenome",
    name: "アルゲノム",
    href: "/riders/argenome",
    assets: ["/civilian-argenome.jpeg"],
    kicker: "RIDER 06",
  },
  {
    id: "over-zeztz",
    name: "オーバーゼッツ",
    href: "/riders/over-zeztz",
    assets: ["/character-james-20260829.webp"],
    kicker: "RIDER 07",
  },
  {
    id: "cipher",
    name: "サイファー",
    href: "/riders/cipher",
    assets: ["/civilian-cipher.jpeg", "/rider-cipher.jpeg", "/rider-cipher-blacksite.jpeg"],
    kicker: "RIDER 08",
  },
];

export const RELATED_NAV: DossierLink[] = [
  {
    id: "01",
    name: "テラ・アレイン",
    href: "/characters/terra",
    assets: ["/character-terra.jpeg"],
    kicker: "RELATED 01",
  },
  {
    id: "02",
    name: "ルナ・アレイン",
    href: "/characters/luna",
    assets: ["/character-luna.jpeg"],
    kicker: "RELATED 02",
  },
];

/** `seams`: a value too wide for its column (the spec sheet's 仮面ライダー
 * ヴァンダール at 375px) also breaks at name-breaks.ts's seams, drawn as
 * <wbr>, so it breaks between its words (仮面ライダー／ヴァンダール), never
 * inside one; the text stays as written. A separator (・, ／) closes the
 * word before it, so no line starts on one (2026-10-22: 秩序／破壊 /
 * ・固定管轄なし at 360px). */
export function NameText({ value, seams = false }: { value: string; seams?: boolean }) {
  const parts = value.split(/([・／/])/);
  // Each chunk carries its closing separator (破壊・), inside a protected
  // word's box too, so the break comes after it — unless the name rules
  // would set the separator apart as a word of its own (仮面ライダー／).
  const chunks: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const mark = parts[i + 1] ?? "";
    if (mark && seams && nameWords(parts[i] + mark).at(-1)?.text === mark) {
      chunks.push(parts[i], mark);
    } else chunks.push(parts[i] + mark);
  }
  return (
    <>
      {chunks.map((chunk, i) => (
        <Fragment key={`${chunk}-${i}`}>
          <span className="jp-atom">{seams ? <DisplayName value={chunk} /> : chunk}</span>
          {i < chunks.length - 1 && /[・／/]$/.test(chunk) ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}

/* The end card's art box (styles-stage-dossier.css): the card's width on
   phones, its right part on tablets, the stage's width on wide screens. */
const NAV_PORTRAIT_SIZES = "(max-width: 560px) 100vw, (max-width: 1099px) 58vw, min(46vw, 820px)";

/** The neighbour's portrait for the file's end card: its first warm-up
 * asset, with the same delivery candidates the next page asks for, so the
 * card's picture is the one the page then shows (sized for the card's own
 * box). Decorative (the link is named by its label). */
function NavPortrait({ item }: { item: DossierLink }) {
  const src = item.assets[0];
  if (!src) return null;
  const image = dossierImage(src);
  if (image.sizes) image.sizes = NAV_PORTRAIT_SIZES;
  return (
    <span className="dossier-nav-portrait" aria-hidden="true">
      <img src={src} {...image} alt="" loading="lazy" decoding="async" />
    </span>
  );
}

/* A roster tile's face box (styles-dossier-zenith.css): across a card's
   top on phones (two a row, about two fifths of the width) and for the
   eight riders from 700px (four a row) and on a split stage from 1600px
   (about 200px); 64px beside the words on the split stage below that and
   from 561px to 699px. */
const ROSTER_PORTRAIT_SIZES = [
  "(max-width: 560px) 40vw",
  "(max-width: 699px) 64px",
  "(min-width: 900px) and (max-width: 1099px) and (orientation: landscape) 64px",
  "(max-width: 1099px) 22vw",
  "(max-width: 1599px) 64px",
  "200px",
].join(", ");

/** A roster tile's face (2026-10-22): the file's own portrait, so a press
 * lifts a picture into the file flip as the PREV/NEXT cards do — an
 * art-less flip drops the whole page to ink at once (2 flashes/s on phones,
 * verify-route-transitions page-saga-realm). The launcher's tile (the
 * menu's own picture) with every width it is cut at, so a phone's wider
 * face takes the 400w cut where there is one; else the file's warm-up asset
 * at its smallest delivery. */
function RosterPortrait({ item }: { item: DossierLink }) {
  const tile = item.href ? LAUNCHER_TILE_IMAGES[item.href] : undefined;
  const src = tile?.variants[0].path ?? item.assets[0];
  if (!src) return <span className="dossier-roster-portrait" aria-hidden="true" />;
  const image = tile
    ? tile.variants.length > 1
      ? { srcSet: tile.variants.map((cut) => `${cut.path} ${cut.width}w`).join(", ") }
      : {}
    : dossierImage(src);
  return (
    <span className="dossier-roster-portrait" aria-hidden="true">
      <img
        src={src}
        {...image}
        {...("srcSet" in image && image.srcSet ? { sizes: ROSTER_PORTRAIT_SIZES } : {})}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/** Where the file stands in its list: one segment a file, this one lit,
 * 欠番 hollow (decorative; the roster under it names the files). */
function IndexMeter({ items, idx }: { items: DossierLink[]; idx: number }) {
  return (
    <em className="dossier-index-meter" aria-hidden="true">
      {items.map((item, index) => (
        <span
          key={item.id}
          className={index === idx ? "is-current" : item.href ? undefined : "is-void"}
        />
      ))}
    </em>
  );
}

function neighbors(items: DossierLink[], currentHref: string) {
  const idx = items.findIndex((item) => item.href === currentHref);
  if (idx < 0) return { idx, prev: undefined, next: undefined };
  const prev = items
    .slice(0, Math.max(0, idx))
    .reverse()
    .find((item) => item.href);
  const next = items.slice(idx + 1).find((item) => item.href);
  return { idx, prev, next };
}

/** A file's numeral: its kicker's last word (01, II), else its place. */
function fileNumeral(item: DossierLink, index: number) {
  return item.kicker?.split(" ").at(-1) ?? String(index + 1).padStart(2, "0");
}

/** 六詠 counts in Roman numerals (I-VI): the sheet sets them in the site's
 * Roman face (Cinzel), where Michroma's I is a bare bar (II read as two). */
function romanList(items: DossierLink[]) {
  return items.every((item, index) => /^[IVX]+$/.test(fileNumeral(item, index)));
}

/** The roster rail (2026-10-21): every file of the list at the end of
 * each file, the current one marked, 欠番 inert. Inside .manager-pagination,
 * so a press keeps the file flip (load-gate.tsx). */
function DossierRoster({
  items,
  idx,
  originSearch,
}: {
  items: DossierLink[];
  idx: number;
  originSearch?: Record<string, string>;
}) {
  return (
    <ol className="dossier-roster" aria-label="この一覧の資料">
      {items.map((item, index) => {
        const numeral = fileNumeral(item, index);
        const body = (
          <>
            <RosterPortrait item={item} />
            <i aria-hidden="true">{numeral}</i>
            <b>
              <NameText value={item.name} />
            </b>
          </>
        );
        if (index === idx) {
          return (
            <li key={item.id} className="is-current">
              <span aria-current="page">{body}</span>
            </li>
          );
        }
        if (!item.href) {
          return (
            <li key={item.id} className="is-void">
              <span>{body}</span>
            </li>
          );
        }
        return (
          <li key={item.id}>
            <GuardedLink
              to={item.href}
              search={originSearch}
              assets={item.assets}
              aria-label={`${item.name}の資料へ`}
            >
              {body}
            </GuardedLink>
          </li>
        );
      })}
    </ol>
  );
}

/** The end of a file (2026-10-23: no PREV / NEXT / list-name / count
 * captions): the previous file's row with its arrow, the way back with the
 * file's place lit in the list and the roster under it, then the next
 * file's card (its numeral, name and arrow). Each link is named by its
 * aria-label. */
export function DossierNav({
  items,
  currentHref,
  returnHash: listHash,
}: {
  items: DossierLink[];
  currentHref: string;
  /** The list on the World page to return to, when the path does not say. */
  returnHash?: string;
}) {
  const fromCastRoster = useRouterState({
    select: (state) => isCastRosterOrigin(state.location.search),
  });
  const { idx, prev, next } = neighbors(items, currentHref);
  if (idx < 0) return null;
  const pathHash = currentHref.startsWith("/riders/")
    ? "riders-return"
    : currentHref === "/characters/dante"
      ? "manager-archive-unmanaged"
      : currentHref.startsWith("/characters/")
        ? "manager-archive-other"
        : "manager-archive";
  const returnHash = fromCastRoster ? "cast-roster" : (listHash ?? pathHash);
  const originSearch = fromCastRoster ? CAST_ROSTER_SEARCH : undefined;

  return (
    <nav
      className="manager-pagination dg-focus-scope"
      aria-label="前後の資料"
      data-numerals={romanList(items) ? "roman" : undefined}
    >
      {prev?.href ? (
        <GuardedLink
          to={prev.href}
          className="dg-control dg-control-sweep"
          search={originSearch}
          assets={prev.assets}
          aria-label={`${prev.name}の資料へ`}
        >
          <NavPortrait item={prev} />
          <b>
            <NameText value={prev.name} />
          </b>
          <span aria-hidden="true">
            <UiVectorIcon kind="arrow-left" size={18} />
          </span>
        </GuardedLink>
      ) : (
        <span className="manager-pagination-spacer" aria-hidden="true" />
      )}
      <div className="manager-pagination-index">
        <GuardedLink
          to="/world"
          hash={returnHash}
          assets={[]}
          className="dossier-index-return dg-control"
          aria-label="人物一覧へ戻る"
        >
          {/* The way back, in a ring like PREV's arrow (decorative). */}
          <em className="dossier-index-arrow" aria-hidden="true">
            <UiVectorIcon kind="arrow-left" size={18} />
          </em>
          <b>一覧へ戻る</b>
          {items.length > 1 ? <IndexMeter items={items} idx={idx} /> : null}
        </GuardedLink>
        <GuardedLink
          to="/world-map"
          search={{ source: currentHref }}
          assets={[]}
          className="dossier-index-return dg-control"
          aria-label="この人物を世界関係図で見る"
        >
          <b>世界関係図へ</b>
          <span aria-hidden="true">↗</span>
        </GuardedLink>
        {items.length > 1 ? (
          <DossierRoster items={items} idx={idx} originSearch={originSearch} />
        ) : null}
      </div>
      {next?.href ? (
        <GuardedLink
          to={next.href}
          className="dg-control dg-control-sweep"
          search={originSearch}
          assets={next.assets}
          aria-label={`${next.name}の資料へ`}
        >
          <NavPortrait item={next} />
          {/* The next file's numeral, large and drawn in outline on the
              card's open side (decorative; the link is named by its label). */}
          <i className="dossier-nav-numeral" aria-hidden="true">
            {fileNumeral(next, items.indexOf(next))}
          </i>
          <b>
            <NameText value={next.name} />
          </b>
          <span aria-hidden="true">
            <UiVectorIcon kind="arrow-right" size={18} />
          </span>
        </GuardedLink>
      ) : (
        <span className="manager-pagination-spacer" aria-hidden="true" />
      )}
    </nav>
  );
}
