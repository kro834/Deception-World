import worldCssUrl from "@/styles-world.css?url";
import worldAddonCssUrl from "@/styles-world-addon.css?url";

export type RouteStylesheetLink = {
  rel: "stylesheet";
  href: string;
};

export const WORLD_BASE_STYLESHEET_LINK: RouteStylesheetLink = {
  rel: "stylesheet",
  href: worldCssUrl,
};

export const WORLD_ADDON_STYLESHEET_LINK: RouteStylesheetLink = {
  rel: "stylesheet",
  href: worldAddonCssUrl,
};

export const WORLD_STYLESHEET_LINKS: RouteStylesheetLink[] = [
  WORLD_BASE_STYLESHEET_LINK,
  WORLD_ADDON_STYLESHEET_LINK,
];

type WorldHeadInput = {
  title: string;
  description: string;
  image?: string;
  stylesheetLinks?: RouteStylesheetLink[];
};

export function createWorldHead({
  title,
  description,
  image,
  stylesheetLinks = WORLD_STYLESHEET_LINKS,
}: WorldHeadInput) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      ...(image ? [{ property: "og:image", content: image }] : []),
    ],
    links: stylesheetLinks,
  };
}

export const RIDER_ROUTE_META = {
  saga: { name: "サーガ", image: "/rider-saga-rexonance-thumbnail-20260827.jpeg" },
  realm: { name: "レルム", image: "/rider-realm.jpeg" },
  lore: { name: "ローア", image: "/rider-loa.jpeg" },
  vandal: { name: "ヴァンダール", image: "/rider-vandal-thumbnail-20260827.jpeg" },
  leddic: { name: "レディック", image: "/rider-leddic-home.jpeg" },
  argenome: { name: "アルゲノム", image: "/rider-algenome.jpeg" },
  "over-zeztz": { name: "オーバーゼッツ", image: "/rider-over-zeztz-home.jpeg" },
  cipher: { name: "サイファー", image: "/rider-cipher-thumbnail-20260825.jpeg" },
} as const;

export type RiderRouteId = keyof typeof RIDER_ROUTE_META;

export function isRiderRouteId(id: string): id is RiderRouteId {
  return Object.hasOwn(RIDER_ROUTE_META, id);
}

export function createRiderHead(id: string) {
  const rider = isRiderRouteId(id) ? RIDER_ROUTE_META[id] : null;
  if (!rider) {
    return createWorldHead({
      title: "ライダー資料｜Deception World",
      description: "Deception Worldのライダー資料アーカイブ。",
    });
  }
  return createWorldHead({
    title: `仮面ライダー${rider.name}｜Deception World`,
    description: `仮面ライダー${rider.name}の人物記録、能力、フォーム、装備を収録した公式資料。`,
    image: rider.image,
  });
}
