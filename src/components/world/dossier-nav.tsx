import { Fragment } from "react";
import { useRouterState } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { UiVectorIcon } from "./ui-vector-icon";
import { dossierImage } from "@/lib/dossier-images";
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
 * inside one; the text stays as written. */
export function NameText({ value, seams = false }: { value: string; seams?: boolean }) {
  const chunks = value.split(/([・／/])/);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk === "・" || chunk === "／" || chunk === "/") {
          return (
            <Fragment key={`${chunk}-${i}`}>
              {chunk}
              <wbr />
            </Fragment>
          );
        }
        return (
          <span key={`${chunk}-${i}`} className="jp-atom">
            {seams ? <DisplayName value={chunk} /> : chunk}
          </span>
        );
      })}
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

export function DossierNav({
  items,
  currentHref,
  indexLabel,
  returnHash: listHash,
}: {
  items: DossierLink[];
  currentHref: string;
  indexLabel: string;
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
    <nav className="manager-pagination" aria-label="前後の資料">
      {prev?.href ? (
        <GuardedLink to={prev.href} search={originSearch} assets={prev.assets} aria-label={`${prev.name}の資料へ`}>
          <NavPortrait item={prev} />
          <small>PREV / {prev.kicker}</small>
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
          className="dossier-index-return"
          aria-label="人物一覧へ戻る"
        >
          <span>{fromCastRoster ? "CAST FILES" : indexLabel}</span>
          <b>一覧へ戻る</b>
          <i>
            {String(idx + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
          </i>
        </GuardedLink>
      </div>
      {next?.href ? (
        <GuardedLink to={next.href} search={originSearch} assets={next.assets} aria-label={`${next.name}の資料へ`}>
          <NavPortrait item={next} />
          <small>NEXT / {next.kicker}</small>
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
