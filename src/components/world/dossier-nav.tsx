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

export const RIKUEI_NAV: DossierLink[] = [
  { id: "I", name: "ゼウス", href: "/managers/zeus", assets: ["/manager-zeus-detail.jpeg?v=20260823-2"], kicker: "RIKUEI I" },
  { id: "II", name: "レックス・ロワ", href: "/managers/rex-loi", assets: ["/manager-rex-loi.jpeg"], kicker: "RIKUEI II" },
  { id: "III", name: "シュザ", href: "/managers/shuza", assets: ["/manager-shuza.jpeg"], kicker: "RIKUEI III" },
  { id: "IV", name: "レジャス", href: "/managers/lejas", assets: ["/manager-lejas.jpeg"], kicker: "RIKUEI IV" },
  { id: "V", name: "オパス", href: "/managers/opus", assets: ["/manager-opus.jpeg"], kicker: "RIKUEI V" },
  { id: "VI", name: "リームー", href: "/managers/reemu", assets: ["/manager-reemu.jpeg"], kicker: "RIKUEI VI" },
];

export const RIDER_NAV: DossierLink[] = [
  { id: "saga", name: "サーガ", href: "/riders/saga", assets: ["/civilian-yuma-20260826.jpeg"], kicker: "RIDER 01" },
  { id: "realm", name: "レルム", href: "/riders/realm", assets: ["/civilian-bell-20260826.jpeg"], kicker: "RIDER 02" },
  { id: "lore", name: "ローア", href: "/riders/lore", assets: ["/civilian-lore.jpeg"], kicker: "RIDER 03" },
  { id: "vandal", name: "ヴァンダール", href: "/riders/vandal", assets: ["/civilian-vandal.jpeg"], kicker: "RIDER 04" },
  { id: "leddic", name: "レディック", href: "/riders/leddic", assets: ["/civilian-leddic.jpeg", "/civilian-naikami-chigiri.jpeg", "/rider-leddic-ishihen.jpeg", "/rider-leddic-hoko.jpeg", "/rider-leddic-rekka-20260829.jpeg"], kicker: "RIDER 05" },
  { id: "argenome", name: "アルゲノム", href: "/riders/argenome", assets: ["/civilian-argenome.jpeg"], kicker: "RIDER 06" },
  { id: "over-zeztz", name: "オーバーゼッツ", href: "/riders/over-zeztz", assets: ["/character-james-20260829.webp"], kicker: "RIDER 07" },
  { id: "cipher", name: "サイファー", href: "/riders/cipher", assets: ["/civilian-cipher.jpeg", "/rider-cipher.jpeg", "/rider-cipher-blacksite.jpeg"], kicker: "RIDER 08" },
];

export const RELATED_NAV: DossierLink[] = [
  { id: "01", name: "テラ・アレイン", href: "/characters/terra", assets: ["/character-terra.jpeg"], kicker: "RELATED 01" },
  { id: "02", name: "ルナ・アレイン", href: "/characters/luna", assets: ["/character-luna.jpeg"], kicker: "RELATED 02" },
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
