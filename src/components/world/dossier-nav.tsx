import { Fragment } from "react";
import { GuardedLink } from "@/components/load-gate";
import { UiVectorIcon } from "./ui-vector-icon";

export type DossierLink = {
  id: string;
  name: string;
  href: string | null;
  assets: readonly string[];
  kicker?: string;
};

export const ROKUEI_NAV: DossierLink[] = [
  { id: "I", name: "未解禁", href: null, assets: [], kicker: "RESTRICTED" },
  { id: "II", name: "レックス・ロワ", href: "/managers/rex-loi", assets: ["/manager-rex-loi.jpeg", "/manager-rex-loi-rider.jpeg"], kicker: "ROKUEI II" },
  { id: "III", name: "シュザ", href: "/managers/shuza", assets: ["/manager-shuza.jpeg", "/manager-shuza-rider.jpeg"], kicker: "ROKUEI III" },
  { id: "IV", name: "レジャス", href: "/managers/lejas", assets: ["/manager-lejas.jpeg", "/manager-lejas-portrait.jpeg", "/manager-lejas-rider.jpeg"], kicker: "ROKUEI IV" },
  { id: "V", name: "未解禁", href: null, assets: [], kicker: "RESTRICTED" },
  { id: "VI", name: "リームー", href: "/managers/reemu", assets: ["/manager-reemu.jpeg", "/manager-reemu-rider.jpeg"], kicker: "ROKUEI VI" },
];

export const RIDER_NAV: DossierLink[] = [
  { id: "saga", name: "サーガ", href: "/riders/saga", assets: ["/civilian-saga.jpeg", "/nightmare-machiavel-gore.jpeg", "/saga-extreme-middle.jpeg", "/saga-extreme-ultra.jpeg"], kicker: "RIDER 01" },
  { id: "realm", name: "レルム", href: "/riders/realm", assets: ["/civilian-realm.jpeg", "/rider-profile-realm.jpeg"], kicker: "RIDER 02" },
  { id: "lore", name: "ローア", href: "/riders/lore", assets: ["/civilian-lore.jpeg", "/rider-profile-lore.jpeg"], kicker: "RIDER 03" },
  { id: "vandal", name: "ヴァンダール", href: "/riders/vandal", assets: ["/civilian-vandal.jpeg", "/rider-profile-vandal.jpeg"], kicker: "RIDER 04" },
  { id: "leddic", name: "レディック", href: "/riders/leddic", assets: ["/civilian-leddic.jpeg", "/rider-profile-leddic.jpeg"], kicker: "RIDER 05" },
  { id: "argenome", name: "アルゲノム", href: "/riders/argenome", assets: ["/civilian-argenome.jpeg", "/rider-profile-argenome.jpeg"], kicker: "RIDER 06" },
  { id: "over-zeztz", name: "オーバーゼッツ", href: "/riders/over-zeztz", assets: ["/civilian-over-zeztz.jpeg", "/rider-profile-over-zeztz.jpeg"], kicker: "RIDER 07" },
];

export const RELATED_NAV: DossierLink[] = [
  { id: "01", name: "テラ・アレイン", href: "/characters/terra", assets: ["/character-terra.jpeg", "/character-terra-thumb.jpeg", "/rider-realm-earth.jpeg"], kicker: "RELATED 01" },
  { id: "02", name: "ルナ・アレイン", href: "/characters/luna", assets: ["/character-luna.jpeg", "/character-luna-thumb.jpeg", "/rider-realm-moon.jpeg"], kicker: "RELATED 02" },
];

export function NameText({ value }: { value: string }) {
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
            {chunk}
          </span>
        );
      })}
    </>
  );
}

function neighbors(items: DossierLink[], currentHref: string) {
  const idx = items.findIndex((item) => item.href === currentHref);
  const prev = items.slice(0, Math.max(0, idx)).reverse().find((item) => item.href);
  const next = items.slice(idx + 1).find((item) => item.href);
  return { idx, prev, next };
}

export function DossierNav({
  items,
  currentHref,
  indexLabel,
}: {
  items: DossierLink[];
  currentHref: string;
  indexLabel: string;
}) {
  const { idx, prev, next } = neighbors(items, currentHref);

  return (
    <nav className="manager-pagination" aria-label="前後の資料">
        {prev?.href ? (
          <GuardedLink to={prev.href} assets={prev.assets} aria-label={`${prev.name}の資料へ`}>
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
          <span>{indexLabel}</span>
          <i>
            {String(idx + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
          </i>
        </div>
        {next?.href ? (
          <GuardedLink to={next.href} assets={next.assets} aria-label={`${next.name}の資料へ`}>
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
