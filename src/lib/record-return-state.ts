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
const kinds = new Set(["page", "person", "chapter"]);
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
  // /search accepts primitive queries from hand-written URLs; /library only
  // accepts strings. Match the routes after the router's JSON query decoding.
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
  } else {
    if (typeof value.kind === "string" && kinds.has(value.kind)) query.kind = value.kind;
    if (value.guide === "keepers" || value.guide === "forms") query.guide = value.guide;
    if (value.scope === "saved") query.scope = "saved";
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
): {
  context: RecordReturnContext | null;
  restore?: { source: RecordReturnSource; scroll: boolean };
} {
  if (!context || now - context.createdAt >= RECORD_RETURN_LIFETIME || now < context.createdAt)
    return { context: null };
  if (context.phase === "leaving" && now - context.createdAt >= RECORD_RETURN_PENDING)
    return { context: null };
  if (matchesRecordReturnTarget(context, location))
    return {
      context:
        context.phase === "reading" || context.phase === "returning"
          ? context
          : { ...context, phase: "reading" },
    };
  if (context.phase === "leaving" && location.pathname === context.source.pathname)
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

function publish(next: RecordReturnContext | null) {
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

export function captureRecordReturn(input: RecordReturnInput) {
  const next = makeRecordReturn(input);
  publish(next);
  return next;
}
export function clearRecordReturn() {
  publish(null);
}
export function beginRecordReturn() {
  if (snapshot?.phase === "reading") publish({ ...snapshot, phase: "returning" });
}
export function reconcileRecordReturn(location: RecordReturnLocation) {
  const result = advanceRecordReturn(snapshot, location);
  publish(result.context);
  return result.restore;
}
