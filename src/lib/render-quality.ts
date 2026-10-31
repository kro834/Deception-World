export const RENDER_QUALITY_KEY = "deception-world:render-quality:v1";
export const RENDER_QUALITY_HISTORY_KEY = "deceptionWorldRenderQualityV1";
export type RenderQuality = "high" | "lightweight";
type QualityHistory = Pick<History, "state" | "replaceState">;
type Choice = { quality: RenderQuality; revision: number };
const valid = (value: unknown): value is RenderQuality =>
  value === "high" || value === "lightweight";
const historySource = (history?: QualityHistory) =>
  history ?? (typeof window === "undefined" ? undefined : window.history);
function choice(value: unknown): Choice | undefined {
  if (valid(value)) return { quality: value, revision: 0 };
  if (typeof value === "string") {
    try {
      return choice(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (
    value &&
    typeof value === "object" &&
    "quality" in value &&
    "revision" in value &&
    valid(value.quality) &&
    typeof value.revision === "number" &&
    Number.isFinite(value.revision)
  )
    return value as Choice;
  return undefined;
}
function savedChoices(storage?: Pick<Storage, "getItem">, history?: QualityHistory) {
  let entry: Choice | undefined;
  let saved: Choice | undefined;
  try {
    entry = choice(historySource(history)?.state?.[RENDER_QUALITY_HISTORY_KEY]);
  } catch {
    /* independent fallback */
  }
  try {
    saved = choice(
      (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.getItem(
        RENDER_QUALITY_KEY,
      ),
    );
  } catch {
    /* entry can survive reload */
  }
  return { entry, saved };
}
export function readRenderQuality(
  storage?: Pick<Storage, "getItem">,
  history?: QualityHistory,
): RenderQuality {
  const { entry, saved } = savedChoices(storage, history);
  return (entry && (!saved || entry.revision > saved.revision) ? entry : saved)?.quality ?? "high";
}
let lastRevision = 0;
/** Global successful choices supersede older entry fallbacks, including Back.
 * Only failed storage writes create entry fallbacks; router fields are retained. */
export function saveRenderQuality(
  quality: RenderQuality,
  storage?: Pick<Storage, "setItem">,
  root?: HTMLElement,
  history?: QualityHistory,
): boolean {
  const prior = savedChoices(storage as Pick<Storage, "getItem"> | undefined, history);
  const next: Choice = {
    quality,
    revision: Math.max(
      Date.now(),
      lastRevision + 1,
      (prior.saved?.revision ?? 0) + 1,
      (prior.entry?.revision ?? 0) + 1,
    ),
  };
  lastRevision = next.revision;
  let storageSaved = false;
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    target?.setItem(RENDER_QUALITY_KEY, JSON.stringify(next));
    storageSaved = Boolean(target);
  } catch {
    /* use current history entry */
  }
  let entrySaved = false;
  try {
    const target = historySource(history);
    if (target) {
      const state = { ...(target.state && typeof target.state === "object" ? target.state : {}) };
      if (storageSaved) delete state[RENDER_QUALITY_HISTORY_KEY];
      else state[RENDER_QUALITY_HISTORY_KEY] = next;
      target.replaceState(state, "");
      entrySaved = true;
    }
  } catch {
    /* a newer global revision supersedes any older entry */
  }
  if (!storageSaved && !entrySaved) return false;
  const html = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (quality === "lightweight") html?.setAttribute("data-world-effects", "economy");
  else html?.removeAttribute("data-world-effects");
  return true;
}
