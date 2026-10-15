import { validateLibraryBrowseSearch } from "./library-browse-state.ts";

/** A small, tab-local reading journey. Never imports the full search index. */
export const RECORD_RETURN_KEY = "dw-record-return-v1";
export const RECORD_RETURN_LIFETIME = 30 * 60_000;
export const RECORD_RETURN_PENDING = 15_000;

type Query = Record<string, string>;
export type RecordReturnLocation = {
  pathname: string;
  search?: Record<string, unknown>;
  hash?: string;
};
export type RecordReturnSource = {
  pathname: "/search" | "/library";
  search: Query;
  cardId: string;
};
export type RecordReturnContext = {
  version: 1;
  createdAt: number;
  phase: "leaving" | "reading" | "returning" | "source";
  source: RecordReturnSource;
  target: { pathname: string; search: Query; hash: string };
};
export type RecordReturnInput = {
  source: { pathname: string; search?: Record<string, unknown>; cardId: string };
  target: RecordReturnLocation;
};

const categories = new Set(["people", "riders", "forms", "story", "world", "systems", "pages"]);
const phases = new Set(["leaving", "reading", "returning", "source"]);
const internalPath = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const cardPattern = /^record-return-(search|library)-[a-zA-Z0-9_-]{1,120}$/;

export function recordReturnCardId(kind: "search" | "library", id: string): string {
  const encoded = Array.from(id, (letter) => letter.codePointAt(0)!.toString(16)).join("-");
  if (encoded.length <= 110) return `record-return-${kind}-id-${encoded || "empty"}`;
  // Long source labels remain bounded. Two independent accumulators cover the
  // entire original ID, including punctuation and non-Latin characters.
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < id.length; index++) {
    first = Math.imul(first ^ id.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ id.charCodeAt(index);
  }
  return `record-return-${kind}-hash-${id.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Keep only this surface's public, bounded URL state, including an unflushed draft. */
export function recordReturnSourceSearch(pathname: string, value: unknown): Query | null {
  if (pathname !== "/search" && pathname !== "/library") return null;
  if (!object(value)) return null;
  const query: Query = {};
  if (pathname === "/library") {
    // Share the route's lightweight validator: handwritten ?q=2/true/null
    // and router-quoted string queries must identify the same saved shelf.
    for (const [key, item] of Object.entries(validateLibraryBrowseSearch(value))) {
      if (typeof item === "string") query[key] = item;
    }
    return query;
  }
  // /search also accepts primitive queries from hand-written URLs. Keep its
  // exact draft and existing bounds after the router's JSON query decoding.
  const queryValue =
    typeof value.q === "string"
      ? value.q
      : pathname === "/search" &&
          (value.q === null || typeof value.q === "number" || typeof value.q === "boolean")
        ? String(value.q)
        : undefined;
  if (queryValue !== undefined) {
    const q = pathname === "/search" ? queryValue.slice(0, 120) : queryValue.slice(0, 160).trim();
    if (q) query.q = q;
  }
  if (pathname === "/search") {
    if (typeof value.category === "string" && categories.has(value.category))
      query.category = value.category;
    const shown =
      typeof value.shown === "number" || typeof value.shown === "string"
        ? Number(value.shown)
        : NaN;
    if (Number.isFinite(shown) && shown > 24)
      query.shown = String(Math.min(144, Math.floor(shown)));
  }
  return query;
}

function targetQuery(value: unknown): Query | null {
  if (!object(value) || Object.keys(value).length > 8) return null;
  const query: Query = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key) || typeof item !== "string" || item.length > 160)
      return null;
    query[key] = item;
  }
  return query;
}

function cleanHash(value: unknown): string | null {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string") return null;
  try {
    const hash = decodeURIComponent(value.replace(/^#/, ""));
    return hash.length > 0 &&
      hash.length <= 180 &&
      !/[\s#]/u.test(hash) &&
      Array.from(hash).every((letter) => letter.charCodeAt(0) >= 32 && letter.charCodeAt(0) !== 127)
      ? hash
      : null;
  } catch {
    return null;
  }
}

function sameQuery(first: Query, second: Query) {
  const keys = Object.keys(first);
  return (
    keys.length === Object.keys(second).length && keys.every((key) => first[key] === second[key])
  );
}

export function makeRecordReturn(
  input: RecordReturnInput,
  now = Date.now(),
): RecordReturnContext | null {
  const source = input.source;
  const target = input.target;
  const search = recordReturnSourceSearch(source.pathname, source.search ?? {});
  const query = targetQuery(target.search ?? {});
  const hash = cleanHash(target.hash);
  if (
    !search ||
    !query ||
    hash === null ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !cardPattern.test(source.cardId) ||
    !source.cardId.startsWith(`record-return-${source.pathname.slice(1)}-`) ||
    !internalPath.test(target.pathname) ||
    target.pathname === "/search" ||
    target.pathname === "/library"
  )
    return null;
  return {
    version: 1,
    createdAt: now,
    phase: "leaving",
    source: {
      pathname: source.pathname as RecordReturnSource["pathname"],
      search,
      cardId: source.cardId,
    },
    target: { pathname: target.pathname, search: query, hash },
  };
}

export function parseRecordReturn(
  raw: string | null,
  now = Date.now(),
): RecordReturnContext | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !object(value) ||
      value.version !== 1 ||
      !object(value.source) ||
      !object(value.target) ||
      typeof value.createdAt !== "number" ||
      typeof value.phase !== "string" ||
      !phases.has(value.phase)
    )
      return null;
    const context = makeRecordReturn(value as unknown as RecordReturnInput, value.createdAt);
    if (!context || now < context.createdAt || now - context.createdAt >= RECORD_RETURN_LIFETIME)
      return null;
    if (value.phase === "leaving" && now - context.createdAt >= RECORD_RETURN_PENDING) return null;
    return { ...context, phase: value.phase as RecordReturnContext["phase"] };
  } catch {
    return null;
  }
}

export function matchesRecordReturnSource(
  source: RecordReturnSource,
  location: RecordReturnLocation,
) {
  const search = recordReturnSourceSearch(location.pathname, location.search ?? {});
  return (
    location.pathname === source.pathname && search !== null && sameQuery(source.search, search)
  );
}

export function matchesRecordReturnTarget(
  context: RecordReturnContext,
  location: RecordReturnLocation,
) {
  const search = targetQuery(location.search ?? {});
  return (
    location.pathname === context.target.pathname &&
    search !== null &&
    sameQuery(context.target.search, search) &&
    cleanHash(location.hash) === context.target.hash
  );
}

/** Pure transition logic also makes Back/Forward and cancelled navigations testable. */
export function advanceRecordReturn(
  context: RecordReturnContext | null,
  location: RecordReturnLocation,
  now = Date.now(),
  opening = false,
): {
  context: RecordReturnContext | null;
  restore?: { source: RecordReturnSource; scroll: boolean };
} {
  if (!context || now - context.createdAt >= RECORD_RETURN_LIFETIME || now < context.createdAt)
    return { context: null };
  if (!opening && context.phase === "leaving" && now - context.createdAt >= RECORD_RETURN_PENDING)
    return { context: null };
  if (matchesRecordReturnTarget(context, location))
    return {
      context:
        context.phase === "reading" || context.phase === "returning"
          ? context
          : { ...context, phase: "reading" },
    };
  if (context.phase === "leaving" && matchesRecordReturnSource(context.source, location))
    return { context };
  if (matchesRecordReturnSource(context.source, location)) {
    if (context.phase === "source") return { context };
    return {
      context: { ...context, phase: "source" },
      restore: { source: context.source, scroll: context.phase === "returning" },
    };
  }
  return { context: null };
}

let snapshot: RecordReturnContext | null = null;
let initialized = false;
const listeners = new Set<() => void>();
// Object identity, not an epoch timestamp, distinguishes even two captures in
// the same millisecond. This lease is deliberately never persisted on reload.
let opening: { context: RecordReturnContext; release: () => void } | undefined;

function releaseOpening() {
  const previous = opening;
  opening = undefined;
  previous?.release();
}

function publish(next: RecordReturnContext | null) {
  if (opening && opening.context !== next) releaseOpening();
  initialized = true;
  if (snapshot === next) return;
  snapshot = next;
  try {
    if (next) window.sessionStorage.setItem(RECORD_RETURN_KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(RECORD_RETURN_KEY);
  } catch {
    // Private/blocked storage still gets an in-memory journey in this tab.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeRecordReturn(listener: () => void) {
  listeners.add(listener);
  if (!initialized) {
    initialized = true;
    try {
      snapshot = parseRecordReturn(window.sessionStorage.getItem(RECORD_RETURN_KEY));
    } catch {
      snapshot = null;
    }
  }
  return () => {
    listeners.delete(listener);
  };
}
export const getRecordReturn = () => snapshot;
export const getServerRecordReturn = () => null;

export function captureRecordReturn(input: RecordReturnInput, inFlight = false) {
  const next = makeRecordReturn(input);
  releaseOpening();
  if (next && inFlight) {
    const cancel = () => {
      if (opening?.context === next) publish(null);
    };
    opening = {
      context: next,
      release: () => {
        window.removeEventListener("popstate", cancel);
        window.removeEventListener("pagehide", cancel);
        document.removeEventListener("deception-world:cancel-route-transition", cancel);
      },
    };
    window.addEventListener("popstate", cancel);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("deception-world:cancel-route-transition", cancel);
  }
  publish(next);
  return next;
}

/** Complete only this still-pending opening; never recreate a cancelled or
 * superseded journey, even when its route promise finishes much later. */
export function finishRecordReturnOpening(
  captured: RecordReturnContext,
  location: RecordReturnLocation,
) {
  if (opening?.context !== captured || snapshot !== captured) return;
  const result = matchesRecordReturnTarget(captured, location)
    ? advanceRecordReturn(captured, location, Date.now(), true).context
    : null;
  publish(result);
}

export function recordReturnExpiresAt(context: RecordReturnContext) {
  const lifetime =
    context.phase === "leaving" && opening?.context !== context
      ? RECORD_RETURN_PENDING
      : RECORD_RETURN_LIFETIME;
  return context.createdAt + lifetime;
}

/** A queued timer from an older capture must not dismiss a newer selection. */
export function expireRecordReturn(expected: RecordReturnContext) {
  if (snapshot !== expected) return;
  const now = Date.now();
  if (now < expected.createdAt || now >= recordReturnExpiresAt(expected)) publish(null);
}
export function clearRecordReturn() {
  publish(null);
}
export function beginRecordReturn() {
  if (snapshot?.phase === "reading") publish({ ...snapshot, phase: "returning" });
}
export function reconcileRecordReturn(location: RecordReturnLocation) {
  const result = advanceRecordReturn(snapshot, location, Date.now(), opening?.context === snapshot);
  publish(result.context);
  return result.restore;
}
