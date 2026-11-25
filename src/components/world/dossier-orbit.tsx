import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DOSSIER_ARCHIVE_SOURCE_SELECTOR } from "@/lib/dossier-origin";

/* The exploded-view dossier (分解図, owner 2026-11-23: 「m1 d1で。」).
   The file's parts (人物紹介, 関連記録, 人物資料, 変身記録) orbit the figure
   as a tablist. One part is in the layout at a time: styles-ring-dossier.css
   reads this nav's data-part (main:has(> .dossier-orbit[data-part=…])), so
   the first paint, before hydration, already shows 人物紹介 only, and a
   reader without scripts keeps a file whose every section is one click away
   through the same anchors. The sections themselves are the pages' own
   markup, untouched. */

export type DossierPart = { id: string; label: string };

// Where each section of a file belongs. A target inside one of these is
// read in that part; anything else in the hero is 人物紹介.
const PART_CONTAINERS: readonly (readonly [selector: string, part: string])[] = [
  ["#identity-records", "identity-records"],
  ["#dossier-index", "dossier-index"],
  ["#form-records", "form-records"],
  ["#special-site", "form-records"],
  [".rider-partner-forms", "form-records"],
];
const PROFILE_PART = "dossier-profile";
// The split stage (styles-stage-dossier.css, section 7): the figure is
// pinned beside the reading column, so a stage part starts at the top.
const SPLIT_STAGE =
  "(min-width: 1100px) and (min-height: 540px), (min-width: 900px) and (min-height: 600px) and (orientation: landscape)";

function partOf(target: Element, parts: readonly DossierPart[]) {
  for (const [selector, part] of PART_CONTAINERS) {
    if (target.closest(selector) && parts.some((item) => item.id === part)) return part;
  }
  return target.closest(`#${PROFILE_PART}`) ? PROFILE_PART : null;
}

function focusAnchor(target: HTMLElement) {
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.tabIndex = -1;
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.focus({ preventScroll: true });
}

const media = (query: string) =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(query).matches;

export function DossierOrbit({
  name,
  parts,
  part,
  onPart,
}: {
  name: string;
  parts: readonly DossierPart[];
  part: string;
  onPart: (part: string) => void;
}) {
  const count = parts.length;
  const index = Math.max(
    0,
    parts.findIndex((item) => item.id === part),
  );
  // Unbounded, so the orbit always turns the short way round.
  const [turn, setTurn] = useState(index);
  // The form art the figure changes to for 変身記録 (the first record's own
  // picture, read from the page once it is there).
  const [formArt, setFormArt] = useState<string | null>(null);
  const pendingTarget = useRef<{ id: string; focus: boolean } | null>(null);
  const pendingKeyboardTab = useRef<string | null>(null);

  useEffect(() => {
    setTurn((value) => {
      let delta = (((index - value) % count) + count) % count;
      if (delta > count / 2) delta -= count;
      return value + delta;
    });
  }, [index, count]);

  // The tabs pattern: each part's own section is the tab's panel (2026-11-23).
  // The sections are the pages' markup; only the role and its name are added.
  const partIds = parts.map((item) => item.id).join(" ");
  useEffect(() => {
    const marked: HTMLElement[] = [];
    for (const id of partIds.split(" ")) {
      const panel = document.getElementById(id);
      if (!panel || panel.hasAttribute("role")) continue;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `dossier-orbit-tab-${id}`);
      panel.setAttribute("tabindex", "-1");
      marked.push(panel);
    }
    return () => {
      for (const panel of marked) {
        panel.removeAttribute("role");
        panel.removeAttribute("aria-labelledby");
        panel.removeAttribute("tabindex");
      }
    };
  }, [partIds]);

  useEffect(() => {
    const art = document.querySelector<HTMLImageElement>(
      "#form-records .form-pickup-visual img, #form-records img",
    );
    setFormArt(art?.getAttribute("src") ?? null);
  }, []);

  // A part change puts its reading at the top: the stage parts begin at the
  // page's top; the form records (full width, under the stage) begin at
  // their own first row. An anchor inside the part is then met exactly.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const target = pendingTarget.current;
    pendingTarget.current = null;
    const returning = window.history.state?.dossierArchiveReturn;
    if (
      part === "form-records" &&
      document.documentElement.dataset.routeRestoring === "true" &&
      typeof returning === "boolean"
    ) {
      const state = { ...window.history.state };
      delete state.dossierArchiveReturn;
      History.prototype.replaceState.call(window.history, state, "");
      if (returning && document.activeElement === document.body) {
        document
          .querySelector<HTMLElement>(DOSSIER_ARCHIVE_SOURCE_SELECTOR)
          ?.focus({ preventScroll: true });
      }
      return;
    }
    const keyboardTab = pendingKeyboardTab.current;
    pendingKeyboardTab.current = null;
    if (keyboardTab) {
      // On compact layouts the orbit docks away as soon as a record opens.
      // Keep focus in the matching visible control instead of losing it to <body>.
      const tab = document.getElementById(`dossier-orbit-tab-${keyboardTab}`);
      if (tab?.getClientRects().length) {
        tab.focus({ preventScroll: true });
        return;
      }
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById(`dossier-reader-link-${keyboardTab}`)?.focus();
      return;
    }
    if (target) {
      const anchor = document.getElementById(target.id);
      if (anchor) {
        if (target.id === part && !media(SPLIT_STAGE)) {
          window.scrollTo({ top: 0, behavior: "instant" });
        } else {
          anchor.scrollIntoView({ block: "start", behavior: "instant" });
        }
        if (target.focus) focusAnchor(anchor);
      }
      return;
    }
    if (!didMount.current) return;
    if (part === "form-records" && media(SPLIT_STAGE)) {
      const calm =
        media("(prefers-reduced-motion: reduce)") ||
        document.documentElement.dataset.worldEffects === "economy";
      document
        .getElementById("form-records")
        ?.scrollIntoView({ block: "start", behavior: calm ? "instant" : "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [part]);
  const didMount = useRef(false);
  useEffect(() => {
    didMount.current = true;
  }, []);

  // Anchors keep working: a hash inside a part that is out of the layout
  // brings that part in first (deep links, the menu's page sections, the
  // chapter list, the form pills, the reading bar).
  const live = useRef({ part, parts, onPart });
  live.current = { part, parts, onPart };
  useEffect(() => {
    let clickFrame = 0;
    const follow = (hash: string, focus = false) => {
      const { part: now, parts: list, onPart: choose } = live.current;
      let id: string;
      try {
        id = decodeURIComponent(hash.slice(1)) || PROFILE_PART;
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (!target) return;
      const next = partOf(target, list);
      if (!next) return;
      const isPart = list.some((item) => item.id === id);
      if (next === now) {
        if (isPart && !media(SPLIT_STAGE)) window.scrollTo({ top: 0, behavior: "instant" });
        if (focus) focusAnchor(target);
        return;
      }
      pendingTarget.current = !isPart || focus ? { id, focus } : null;
      choose(next);
    };
    const onHash = () => follow(window.location.hash);
    // Router links change the hash via pushState, which emits no hashchange.
    // Native links and the side-menu links both keep their normal history.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const origin = event.target instanceof Element ? event.target : null;
      const link = origin?.closest<HTMLAnchorElement>("a[href*='#']");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download"))
        return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        !url.hash
      )
        return;
      window.cancelAnimationFrame(clickFrame);
      clickFrame = window.requestAnimationFrame(() => follow(url.hash, event.detail === 0));
    };
    if (
      document.documentElement.dataset.routeRestoring === "true" &&
      typeof window.history.state?.dossierArchiveReturn === "boolean"
    ) {
      follow("#form-records");
    } else if (window.location.hash) {
      follow(window.location.hash);
    }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.cancelAnimationFrame(clickFrame);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % count
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + count - 1) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    if (next === index) return;
    pendingKeyboardTab.current = parts[next].id;
    onPart(parts[next].id);
  };

  const openPart = (id: string, keyboard: boolean) => {
    if (id === part) {
      if (keyboard) {
        const panel = document.getElementById(id);
        panel?.scrollIntoView({ block: "start" });
        if (panel) focusAnchor(panel);
      }
      return;
    }
    if (keyboard) pendingKeyboardTab.current = id;
    if (window.location.hash !== `#${id}`) window.location.hash = id;
    onPart(id);
  };

  return (
    <nav
      className="dossier-orbit"
      data-part={part}
      data-count={count}
      aria-label={`${name}の資料`}
      style={{
        ["--d1-turn" as string]: turn,
        ["--d1-step" as string]: `${360 / count}deg`,
      }}
    >
      <div className="dossier-orbit-stage">
        <i className="dossier-orbit-track" aria-hidden="true" />
        {formArt ? (
          <img className="dossier-orbit-art" src={formArt} alt="" loading="lazy" decoding="async" />
        ) : null}
        <div
          className="dossier-orbit-ring"
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
        >
          {parts.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`dossier-orbit-tab-${item.id}`}
              aria-selected={item.id === part}
              aria-controls={item.id}
              tabIndex={item.id === part ? 0 : -1}
              style={{ ["--d1-i" as string]: itemIndex }}
              onClick={(event) => openPart(item.id, event.detail === 0)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
