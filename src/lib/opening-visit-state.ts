export const OPENING_SEEN_KEY = "dw-opening-seen";
export const OPENING_REPLAY_KEY = "dw-opening-replay";
// Only completed/skipped installed openings persist across app sessions.
export const INSTALLED_OPENING_SEEN_KEY = "dw-installed-opening-seen-v1";

type VisitStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
interface OpeningVisitOptions {
  installed: boolean;
  session: () => VisitStorage;
  persistent: () => VisitStorage;
}

export function isColdOpeningLaunch(entry?: { type: string; name: string }): boolean {
  try {
    if (entry?.type !== "navigate") return false;
    const initial = new URL(entry.name);
    return initial.pathname === "/" && initial.search === "";
  } catch {
    return false;
  }
}

export function isStandaloneOpening(host: {
  navigator: Navigator & { standalone?: boolean };
  matchMedia: (query: string) => { matches: boolean };
}) {
  try {
    return (
      host.navigator.standalone === true || host.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}

export function shouldResumeOpening(
  options: OpeningVisitOptions & { documentEntryReplay: boolean; coldLaunch: boolean },
): boolean {
  let sessionSeen = false;
  let replayRequested = false;
  try {
    const session = options.session();
    sessionSeen = session.getItem(OPENING_SEEN_KEY) === "1";
    replayRequested = session.getItem(OPENING_REPLAY_KEY) === "1";
    session.removeItem(OPENING_REPLAY_KEY);
  } catch {
    // Keep the ordinary opening when session storage is unavailable.
    return false;
  }
  if (replayRequested) return false;
  if (sessionSeen && !options.documentEntryReplay) return true;
  if (!options.installed || !options.coldLaunch) return false;
  try {
    return options.persistent().getItem(INSTALLED_OPENING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberOpeningCompletion(options: OpeningVisitOptions): void {
  try {
    options.session().setItem(OPENING_SEEN_KEY, "1");
  } catch {
    // Each storage area can fail independently (private mode or quota).
  }
  if (!options.installed) return;
  try {
    options.persistent().setItem(INSTALLED_OPENING_SEEN_KEY, "1");
  } catch {
    // Session-only behaviour remains available.
  }
}
