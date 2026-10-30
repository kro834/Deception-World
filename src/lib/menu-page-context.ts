import { SITE_PAGE_ENTRIES } from "./site-page-registry.ts";

/** Pages that used to borrow another page's menu chapters. Only real,
 * existing fragment targets belong here; callers omit currently absent
 * sections (for example the tour catalogue while a tour is playing). */
export type MenuPageContext = {
  title: string;
  image: string;
  sections: readonly (readonly [id: string, label: string, code: string])[];
};

const MENU_PAGE_SECTIONS: Record<string, MenuPageContext> = {
  "/search": {
    title: "資料検索",
    image: "/episode-03-deception-world-delivery-600.webp",
    sections: [
      ["search-title", "資料検索", "SEARCH"],
      ["record-results-heading", "検索結果", "RESULTS"],
    ],
  },
  "/library": {
    title: "資料室",
    image: "/episode-03-deception-world-delivery-600.webp",
    sections: [
      ["library-main", "資料室", "LIBRARY"],
      ["library-browser", "資料を探す", "SEARCH"],
      ["my-library", "しおり・履歴", "LIBRARY"],
      ["inquiry", "問いから辿る", "INQUIRY"],
    ],
  },
  "/gallery": {
    title: "GALLERY",
    image: "/gallery/g03-480.webp",
    sections: [
      ["gallery-top", "ギャラリートップ", "GALLERY"],
      ["gallery-collection", "作品一覧", "COLLECTION"],
    ],
  },
  "/gallery-tours": {
    title: "展示ツアー",
    image: "/gallery/g03-480.webp",
    sections: [
      ["main", "展示ツアー", "TOURS"],
      ["gallery-tour-catalogue", "コースを選ぶ", "COURSES"],
    ],
  },
  "/form-archive": {
    title: "FORM ARCHIVE",
    image: "/archive-media/thumbs/realm-royal.webp",
    sections: [["archive-switcher", "フォームアーカイブ", "SAGA / REALM"]],
  },
  "/dogs-archive": {
    title: "DOGS ARCHIVE",
    image: "/dogs-archive-20261028/guardian-480.webp",
    sections: [
      ["dogs-selector", "個体を選ぶ", "DOGS"],
      ["dogs-archive-panel", "個体記録", "ARCHIVE"],
    ],
  },
};

// Reuse the published names already used by search/library. The menu keeps
// its own light scene images and local chapters, not another page catalogue.
const MENU_PAGES: Readonly<Record<string, MenuPageContext>> = Object.fromEntries(
  Object.entries(MENU_PAGE_SECTIONS).map(([path, page]) => [
    path,
    {
      ...page,
      title: SITE_PAGE_ENTRIES.find((entry) => entry.path === path)?.title ?? page.title,
    },
  ]),
);

export function getMenuPageContext(pathname: string): MenuPageContext | undefined {
  return MENU_PAGES[pathname.replace(/\/$/, "") || "/"];
}

function localHash(href: string | null, pathname: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, `https://deception.invalid${pathname}`);
    return url.pathname === pathname && url.hash ? decodeURIComponent(url.hash.slice(1)) : null;
  } catch {
    return null;
  }
}

/** Copy the page's existing chapter mark when available. The geometric
 * fallback is read once on menu open, not a new scroll/animation engine. */
export function markCurrentMenuSection(panel: HTMLElement, pathname: string): void {
  const doc = panel.ownerDocument;
  const rows = Array.from(
    panel.querySelectorAll<HTMLAnchorElement>("[data-side-menu-sections] .side-panel-links > a"),
  );
  const targets = rows.flatMap((row) => {
    const id = localHash(row.getAttribute("href"), pathname);
    const section = id ? doc.getElementById(id) : null;
    return id && section ? [{ row, id, section }] : [];
  });
  let current: HTMLAnchorElement | undefined;
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('nav a[aria-current="location"]')) {
    if (panel.contains(link)) continue;
    const id = localHash(link.getAttribute("href"), pathname);
    current = targets.find((target) => target.id === id)?.row;
    if (current) break;
  }
  if (!current) {
    const line = (doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 1) * 0.5;
    let nearestTop = -Infinity;
    let firstVisible: HTMLAnchorElement | undefined;
    for (const { row, section } of targets) {
      const rect = section.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      firstVisible ??= row;
      if (rect.top > line || rect.top < nearestTop) continue;
      nearestTop = rect.top;
      current = row;
    }
    current ??= firstVisible;
  }
  for (const row of rows) {
    if (row === current) row.setAttribute("aria-current", "location");
    else row.removeAttribute("aria-current");
  }
}

export function preferredMenuRow(panel: HTMLElement, preferLocal = true): HTMLElement | null {
  return (
    (preferLocal
      ? panel.querySelector<HTMLElement>(
          '[data-side-menu-sections] .side-panel-links > [aria-current="location"]',
        )
      : null) ??
    panel.querySelector<HTMLElement>('.side-panel-links > [aria-current="page"]') ??
    panel.querySelector<HTMLElement>('.side-panel-links > [aria-current="location"]')
  );
}
