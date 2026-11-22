import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

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
  const ringRef = useRef<HTMLDivElement>(null);
  // The form art the figure changes to for 変身記録 (the first record's own
  // picture, read from the page once it is there).
  const [formArt, setFormArt] = useState<string | null>(null);
  const pendingTarget = useRef<string | null>(null);

  useEffect(() => {
    setTurn((value) => {
      let delta = (((index - value) % count) + count) % count;
      if (delta > count / 2) delta -= count;
      return value + delta;
    });
  }, [index, count]);

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
    if (target === "") return;
    const calm = media("(prefers-reduced-motion: reduce)");
    if (target) {
      document.getElementById(target)?.scrollIntoView({ block: "start", behavior: "auto" });
      return;
    }
    if (!didMount.current) return;
    if (part === "form-records" && media(SPLIT_STAGE)) {
      document
        .getElementById("form-records")
        ?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
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
    const follow = (hash: string) => {
      const { part: now, parts: list, onPart: choose } = live.current;
      let id = hash.replace(/^#/, "");
      try {
        id = decodeURIComponent(id);
      } catch {
        return;
      }
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      const next = partOf(target, list);
      if (!next) return;
      const isPart = list.some((item) => item.id === id);
      if (next === now) {
        // Same part: the browser has already scrolled to a visible target.
        if (isPart && id !== PROFILE_PART && !media(SPLIT_STAGE)) window.scrollTo({ top: 0 });
        return;
      }
      pendingTarget.current = isPart ? null : id;
      choose(next);
    };
    const onHash = () => follow(window.location.hash);
    // The router moves between hashes with pushState (no hashchange): the
    // click that asked for it names the target.
    const onClick = (event: MouseEvent) => {
      const origin = event.target instanceof Element ? event.target : null;
      const link = origin?.closest<HTMLAnchorElement>("a[href*='#']");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.pathname !== window.location.pathname || !url.hash) return;
      window.requestAnimationFrame(() => follow(url.hash));
    };
    follow(window.location.hash);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    document.addEventListener("click", onClick);
    return () => {
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
    // Arrows move the selection, not the page: the reader stays on the orbit.
    pendingTarget.current = "";
    onPart(parts[next].id);
    ringRef.current
      ?.querySelector<HTMLElement>(`#dossier-orbit-tab-${parts[next].id}`)
      ?.focus({ preventScroll: true });
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
          ref={ringRef}
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
              onClick={() => onPart(item.id)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
