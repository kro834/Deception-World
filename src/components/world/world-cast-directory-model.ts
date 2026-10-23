import type { WorldCastEntry } from "./world-annex-data";

export const CAST_DIRECTORY_FILTERS = [
  "all",
  "riders",
  "managers",
  "characters",
  "profile",
] as const;
export type CastDirectoryFilter = (typeof CAST_DIRECTORY_FILTERS)[number];

/** Classify the existing record destination, never a person's affiliation. */
export function matchesCastDirectoryFilter(entry: WorldCastEntry, filter: CastDirectoryFilter) {
  if (filter === "all") return true;
  if (filter === "profile") return !entry.to;
  return entry.to?.startsWith(`/${filter}/`) ?? false;
}

export function castDirectoryCounts(entries: readonly WorldCastEntry[]) {
  return Object.fromEntries(
    CAST_DIRECTORY_FILTERS.map((filter) => [
      filter,
      entries.filter((entry) => matchesCastDirectoryFilter(entry, filter)).length,
    ]),
  ) as Record<CastDirectoryFilter, number>;
}

/** Safari pointer clicks need explicit focus before the old cards disappear. */
export function activateCastDirectoryFilter(
  filter: CastDirectoryFilter,
  control: Pick<HTMLButtonElement, "focus">,
  update: (filter: CastDirectoryFilter) => void,
) {
  control.focus({ preventScroll: true });
  update(filter);
}

function personHashId(hash: string) {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

/** Both native fragments and the router's pushState enter through navigate. */
export function createCastDirectoryNavigation({
  entries,
  getFilter,
  revealAll,
  getHash,
  getTarget,
  requestFrame,
  cancelFrame,
}: {
  entries: readonly WorldCastEntry[];
  getFilter: () => CastDirectoryFilter;
  revealAll: () => void;
  getHash: () => string;
  getTarget: (id: string) => Pick<HTMLElement, "scrollIntoView"> | null;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
}) {
  let pending: string | null = null;
  let frame: number | null = null;
  const cancel = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    pending = null;
  };
  return {
    navigate(hash: string) {
      const id = personHashId(hash);
      // Native and router notifications can describe the same navigation.
      if (pending === id) return;
      cancel();
      const entry = entries.find((person) => `wa-person-${person.id}` === id);
      if (!entry || matchesCastDirectoryFilter(entry, getFilter())) return;
      pending = id;
      revealAll();
    },
    afterCommit() {
      if (!pending) return;
      if (frame !== null) cancelFrame(frame);
      const id = pending;
      frame = requestFrame(() => {
        frame = null;
        if (pending !== id) return;
        pending = null;
        if (personHashId(getHash()) === id) {
          getTarget(id)?.scrollIntoView({ block: "start", behavior: "instant" });
        }
      });
    },
    cancel,
  };
}

export function watchCastDirectoryHash(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  navigate: () => void,
) {
  target.addEventListener("hashchange", navigate);
  return () => target.removeEventListener("hashchange", navigate);
}

/** A same-href router load still emits onBeforeNavigate, without a hash change. */
export function watchCastDirectoryRouter(
  subscribe: (listener: (location: { pathname: string; hash: string }) => void) => () => void,
  navigation: Pick<ReturnType<typeof createCastDirectoryNavigation>, "navigate" | "cancel">,
) {
  return subscribe((location) => {
    if (location.pathname === "/world") navigation.navigate(location.hash);
    else navigation.cancel();
  });
}
