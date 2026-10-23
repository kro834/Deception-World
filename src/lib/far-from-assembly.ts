/** FAR FROM SAGA — the scroll suit-up runway's seam (2026-10-22).
 *
 * The /far-from-saga `#suitup` section mounts this on its runway
 * (src/components/far-from-saga/far-from-suitup.tsx). The scene itself is
 * the Rexonance scroll engine (src/lib/rexonance-resonance.js,
 * mountRexonanceAssembly) playing FAR FROM's suit, configured in
 * src/lib/far-from-assembly-engine.ts: the undersuit scanned, the fire
 * engulfing it and bursting into the nanites, the armour landing group by
 * group on each call, the seal, the ignition, the reactor and the eyes
 * filling with pixels that scatter, then the chain of forms up to the one
 * chosen after the runway (ミドル stops there; ハイ … ウルトラ overwrite in turn).
 *
 * This module stays light: it holds the beats, the HUD's words and the
 * mount, and imports the engine chunk only under the motion gate, after the
 * page is idle — never on the startup path, never for the still tiers
 * (prefers-reduced-motion, forced colours, economy, Save-Data and 2G keep
 * the finished figure and download nothing). Once mounted, the engine owns
 * the lifecycle: it prepares when the runway is near, scrubs with the
 * scroll (reversible, closed-form frames), budgets its draws by pointer and
 * tears everything down through the disposer returned here.
 *
 * The engine chunk always arrives (owner, 2026-10-23: 「自動変身再生が必ず読み
 * 込まれ、正常に動作する様にして。」): its import is retried with a backoff
 * under a fresh URL (src/lib/chunk-retry.js); when the retries run out the
 * runway reads data-rzn-load="error" and the guide's 素材を再読み込み (or the
 * movie's 再生, through the same "rexonance:assembly-retry" event the
 * mounted engine answers) starts the import over, as does the network
 * coming back. The movie's 再生 before the chunk is here
 * ("rexonance:assembly-wake") starts the import at once, without waiting
 * for idle time.
 */

import { FAR_FROM_SAGA } from "../components/final-stage/final-stage-data.ts";
import { importWithRetry } from "./chunk-retry.js";

export type FarFromAssemblyBeat = {
  /** 0–1 along the runway's scroll: when the beat begins. */
  at: number;
  /** When it is done. */
  until: number;
  /** What happens (the engine's name for it). */
  part: string;
  /** Its read-out, plain Japanese. */
  label: string;
};

/** The suit-up's beats on the runway's progress: the engine's
 * ASSEMBLY_BEATS (rexonance-resonance.js), the four DEUS！ groups in the
 * call's order, as FAR FROM's call names them. Pinned to the engine's
 * constants by scripts/far-from-suitup.test.mjs. */
export const FAR_FROM_ASSEMBLY_BEATS: readonly FarFromAssemblyBeat[] = Object.freeze([
  { at: 0, until: 0.07, part: "scan", label: "アンダースーツを走査" },
  { at: 0.02, until: 0.16, part: "fire", label: "炎が全身を覆い、爆散" },
  { at: 0.16, until: 0.275, part: "legs", label: "脚部装甲" },
  { at: 0.275, until: 0.39, part: "arms", label: "腕部装甲" },
  { at: 0.39, until: 0.505, part: "chest", label: "胸部・肩部装甲" },
  { at: 0.505, until: 0.62, part: "waist", label: "腰部装甲" },
  { at: 0.62, until: 0.82, part: "bits", label: "結晶・翼・ファーフロムビット" },
  { at: 0.68, until: 0.848, part: "head", label: "頭部" },
  { at: 0.86, until: 0.9, part: "seal", label: "構造を固定" },
  { at: 0.855, until: 0.95, part: "pixels", label: "複眼とリアクターの完成" },
  { at: 0.9, until: 0.915, part: "light", label: "出力を起動" },
  { at: 0.915, until: 0.975, part: "forms", label: "選んだ形態へ移行" },
]);

/** The HUD's parts, one per beat, in the order they land. */
export const FAR_FROM_ASSEMBLY_PARTS = Object.freeze([
  "LEGS",
  "ARMS",
  "CHEST",
  "WAIST",
  "BITS",
  "HEAD",
] as const);

/** The suit-up's phases as the HUD prints them (the runway's
 * data-rzn-phase names the one on screen). */
export const FAR_FROM_ASSEMBLY_PHASES = Object.freeze([
  { phase: "prepare", step: "01", label: "構成情報を読み込み" },
  { phase: "assemble", step: "02", label: "装甲を装着" },
  { phase: "seal", step: "03", label: "構造を固定" },
  { phase: "ignite", step: "04", label: "出力を起動" },
  // The chosen form's name replaces this on the runway (farFromEvolveLabel).
  { phase: "evolve", step: "05", label: "形態を移行" },
  { phase: "complete", step: "06", label: "装着完了" },
] as const);

/** The call on the runway: five lines on the engine's five beats — the
 * opening calls together, RIDER！FAR FROM！, the chant, FAR FROM！ ×4, and
 * FAR FROM DEUS！ (final-stage-data.ts, verbatim). */
export const FAR_FROM_SUIT_CALLS: readonly string[] = Object.freeze([
  FAR_FROM_SAGA.calls.slice(0, 3).join("\n"),
  ...FAR_FROM_SAGA.calls.slice(3),
]);

/** A line's chips: a chant splits into its repeated units (the last keeps
 * its own ！！), every other line is one chip. */
export function farFromCallUnits(call: string): readonly string[] {
  const units = call.match(/SA-GA！DEUS！(?:！+)?|FAR FROM！(?=FAR FROM！|$)/g);
  return units && units.length > 1 && units.join("") === call ? units : [call];
}

/** The forms the runway can end on, in the selector's order (ミドル first):
 * the page's stage keys (far-from-saga-artwork.ts FAR_FROM_SAGA_STAGE_ORDER). */
export const FAR_FROM_ASSEMBLY_FORMS = Object.freeze([
  "middle",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const);
export type FarFromAssemblyForm = (typeof FAR_FROM_ASSEMBLY_FORMS)[number];

/** The runway's form when nothing is chosen yet: ミドル, the base figure the
 * scroll builds (owner, 2026-10-23: never straight to マックス). */
export const FAR_FROM_ASSEMBLY_FORM: FarFromAssemblyForm = "middle";

/** The engine's data-form for a chosen form (as on the Rexonance page,
 * runway.dataset.form): ミドル is the engine's "standard" (the base figure,
 * complete at the published .93), every other form a key of the chain. */
export function farFromRunwayForm(form: FarFromAssemblyForm): string {
  return form === "middle" ? "standard" : form;
}

/** The HUD's step for the chain, naming the chosen form. */
export function farFromEvolveLabel(label: string): string {
  return `${label}へ移行`;
}

export type FarFromAssemblyOptions = {
  /** Force the viewer's prefers-reduced-motion (tests). */
  reducedMotion?: boolean;
  /** The window (tests). */
  environment?: typeof globalThis;
  /** The engine chunk import's backoff (ms before each retry; tests). */
  retryDelays?: readonly number[];
  /** The engine chunk's loader (tests). */
  load?: () => Promise<{
    mountFarFromAssemblyEngine: (host: HTMLElement, environment: typeof globalThis) => () => void;
  }>;
};

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * Mounts the suit-up on `host` (the runway element). Under the motion gate
 * the engine chunk is imported once the page is idle and mounted on the
 * runway; otherwise the runway keeps its still (data-rzn-load="static")
 * and nothing is fetched, until the preference changes. Returns the
 * disposer. Safe to call with a null host.
 */
export function mountFarFromAssembly(
  host: HTMLElement | null | undefined,
  options: FarFromAssemblyOptions = {},
): () => void {
  if (!host) return () => {};
  // (function declarations below do not keep the guard's narrowing)
  const runway: HTMLElement = host;
  const environment = options.environment ?? window;
  const html = host.ownerDocument.documentElement;
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = environment.matchMedia("(forced-colors: active)");
  const connection = (environment.navigator as Navigator & { connection?: Connection })
    ?.connection;
  const load = options.load ?? (() => import("./far-from-assembly-engine"));
  let disposed = false;
  let loading = false;
  let dispose: (() => void) | null = null;
  let idleId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | 0 = 0;
  const motionAllowed = () =>
    !(options.reducedMotion ?? reduced.matches) &&
    !forced.matches &&
    !connection?.saveData &&
    !/^(slow-)?2g$/.test(connection?.effectiveType || "") &&
    html.dataset.worldEffects !== "economy";
  const start = () => {
    if (disposed || dispose || loading || !motionAllowed()) return;
    cancelIdle();
    loading = true;
    if (host.dataset.rznLoad === "error") host.dataset.rznLoad = "waiting";
    importWithRetry(load, {
      delays: options.retryDelays,
      isCancelled: () => disposed,
      onError: (error, attempt) =>
        console.warn(`[far-from suit-up] the engine chunk failed to load (try ${attempt})`, error),
    }).then(
      (module) => {
        loading = false;
        if (disposed || dispose) return;
        // The engine answers the retry and wake events from here on.
        stopListening();
        try {
          dispose = module.mountFarFromAssemblyEngine(host, environment);
        } catch (error) {
          // Never a silent dead end: reported, and retried as a failed import.
          console.error("[far-from suit-up] the engine could not be mounted", error);
          listen();
          host.dataset.rznLoad = "error";
          return;
        }
        // A 再生 already waiting: the engine prepares at once.
        if (woken) host.dispatchEvent?.(new Event("rexonance:assembly-wake"));
      },
      (error) => {
        loading = false;
        if (disposed) return;
        console.error("[far-from suit-up] the engine chunk could not be loaded", error);
        host.dataset.rznLoad = "error";
      },
    );
  };
  // Before the engine is mounted these are this module's: the movie's 再生
  // (wake: import now) and the guide's 素材を再読み込み or the network coming
  // back (retry the import).
  let woken = false;
  const onWake = () => {
    woken = true;
    start();
  };
  const onRetry = () => {
    if (host.dataset.rznLoad === "error") start();
  };
  let listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    runway.addEventListener?.("rexonance:assembly-wake", onWake);
    runway.addEventListener?.("rexonance:assembly-retry", onRetry);
    environment.addEventListener?.("online", onRetry);
  }
  listen();
  function stopListening() {
    if (!listening) return;
    listening = false;
    runway.removeEventListener?.("rexonance:assembly-wake", onWake);
    runway.removeEventListener?.("rexonance:assembly-retry", onRetry);
    environment.removeEventListener?.("online", onRetry);
  }
  function cancelIdle() {
    if (idleId) environment.cancelIdleCallback?.(idleId);
    if (idleTimer) environment.clearTimeout(idleTimer);
    idleId = 0;
    idleTimer = 0;
  }
  // After the page's first frames, never in them: the engine chunk's import
  // waits for idle time (or a short timer where there is none).
  const sync = () => {
    if (disposed || dispose) return;
    if (!motionAllowed()) {
      cancelIdle();
      host.dataset.rznLoad = "static";
      return;
    }
    // (A failed import keeps its error until it is retried.)
    if (host.dataset.rznLoad === "error" && !loading) return;
    host.dataset.rznLoad = "waiting";
    if (idleId || idleTimer || loading) return;
    if (typeof environment.requestIdleCallback === "function")
      idleId = environment.requestIdleCallback(
        () => {
          idleId = 0;
          start();
        },
        { timeout: 2500 },
      );
    else
      idleTimer = environment.setTimeout(() => {
        idleTimer = 0;
        start();
      }, 400);
  };
  const observer =
    typeof environment.MutationObserver === "function"
      ? new environment.MutationObserver(sync)
      : null;
  observer?.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
  reduced.addEventListener?.("change", sync);
  forced.addEventListener?.("change", sync);
  sync();
  return () => {
    disposed = true;
    cancelIdle();
    stopListening();
    observer?.disconnect();
    reduced.removeEventListener?.("change", sync);
    forced.removeEventListener?.("change", sync);
    if (dispose) dispose();
    else delete host.dataset.rznLoad;
    dispose = null;
  };
}
