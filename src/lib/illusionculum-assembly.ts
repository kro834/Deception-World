/** ILLUSIONCULUM SAGA — the scroll suit-up runway's seam (2026-10-23).
 *
 * The /illusionculum-saga `#suitup` section mounts this on its runway
 * (src/components/illusionculum-saga/illusionculum-suitup.tsx). The scene is
 * the Rexonance scroll engine playing this suit (configured in
 * src/lib/illusionculum-assembly-engine.ts): the undersuit scanned, the
 * armour projected and resolved group by group on each call, the seal, the
 * light out of the reactor through every crystal, the eyes and the reactor
 * filling with pixel squares, then the form chosen after the runway.
 *
 * This module stays light: the calls on the runway and the mount, which
 * imports the engine chunk only under the motion gate, after the page is
 * idle — never for the still tiers (prefers-reduced-motion, forced colours,
 * economy, Save-Data and 2G keep the finished figure and fetch nothing).
 * Once mounted, the engine owns the lifecycle and tears everything down
 * through the disposer returned here. The same terms as FAR FROM's seam
 * (src/lib/far-from-assembly.ts).
 */

import { ILLUSIONCULUM_SAGA } from "../components/illusionculum-saga/illusionculum-data.ts";
import type { IllusionculumFormKey } from "./illusionculum-saga-artwork.ts";
import { preloadIllusionculumAssembly } from "./illusionculum-preload.ts";

/** The call on the runway, one line per call (the owner's four, verbatim),
 * on the engine's beats: 【ULTRA！VINCULUM！】 with the scan,【ROLLOUT！】 with
 * the first motes, the SA-GA！EX！ chant with the four armour groups, and
 * ILLUSIONCULUM！ ×3 with the cape, the halo and the helmet. */
export const ILLUSIONCULUM_SUIT_CALLS: readonly string[] = ILLUSIONCULUM_SAGA.calls;

/** A line's chips: a chant splits into its repeated units. */
export function illusionculumCallUnits(call: string): readonly string[] {
  const units = call.match(/SA-GA！EX！|ILLUSIONCULUM！/g);
  return units && units.length > 1 && units.join("") === call ? units : [call];
}

/** The forms the suit-up runs to after the seal (the engine's chain, the
 * runway's data-form) and each one's route through it: リアクター・モア and
 * ウルトラ each straight from the standard form, ウルトラ + リアクター・モア
 * through ウルトラ. The standard form is the engine's "standard". */
export const ILLUSIONCULUM_FORM_CHAIN = Object.freeze(["more", "ultra", "ultraMore"] as const);
export const ILLUSIONCULUM_FORM_PATHS = Object.freeze({
  more: ["more"],
  ultra: ["ultra"],
  ultraMore: ["ultra", "ultraMore"],
} as const);

/** The forms a chosen form's route lights, the standard form first. */
export function illusionculumRoute(form: IllusionculumFormKey): readonly IllusionculumFormKey[] {
  return form === "standard" ? ["standard"] : ["standard", ...ILLUSIONCULUM_FORM_PATHS[form]];
}

export type IllusionculumAssemblyOptions = {
  reducedMotion?: boolean;
  environment?: typeof globalThis;
  load?: () => Promise<{
    mountIllusionculumAssemblyEngine: (
      host: HTMLElement,
      environment: typeof globalThis,
    ) => () => void;
  }>;
};

type Connection = { saveData?: boolean; effectiveType?: string };

/** Mounts the suit-up on `host` (the runway). Returns the disposer. */
export function mountIllusionculumAssembly(
  host: HTMLElement | null | undefined,
  options: IllusionculumAssemblyOptions = {},
): () => void {
  if (!host) return () => {};
  const environment = options.environment ?? window;
  const html = host.ownerDocument.documentElement;
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = environment.matchMedia("(forced-colors: active)");
  const compact = environment.matchMedia("(any-pointer: coarse), (max-width: 767px)");
  const document = host.ownerDocument;
  let pageHidden = false;
  const connection = (environment.navigator as Navigator & { connection?: Connection })?.connection;
  const load = options.load ?? (() => import("./illusionculum-assembly-engine"));
  let disposed = false;
  let loading = false;
  let warmed = false;
  let dispose: (() => void) | null = null;
  let idleId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | 0 = 0;
  const motionAllowed = () =>
    !(options.reducedMotion ?? reduced.matches) &&
    !forced.matches &&
    !connection?.saveData &&
    !/^(slow-)?2g$/.test(connection?.effectiveType || "") &&
    html.dataset.worldEffects !== "economy";
  // A route cover already owns an assembly scene. Give it the phone's
  // memory budget first, then let the page's original early preloader run
  // immediately, well before the reader reaches the runway.
  const canStart = () =>
    motionAllowed() &&
    (!compact.matches || (!pageHidden && !document.hidden && !html.dataset.routeCover));
  const start = () => {
    if (disposed || dispose || loading || !canStart()) return;
    loading = true;
    void Promise.resolve()
      .then(load)
      .then((module) => {
        loading = false;
        if (disposed || !canStart()) return;
        dispose = module.mountIllusionculumAssemblyEngine(host, environment);
      })
      .catch(() => {
        loading = false;
        if (!disposed && canStart()) host.dataset.rznLoad = "error";
      });
  };
  const cancelIdle = () => {
    if (idleId) environment.cancelIdleCallback?.(idleId);
    if (idleTimer) environment.clearTimeout(idleTimer);
    idleId = 0;
    idleTimer = 0;
  };
  const sync = () => {
    if (disposed) return;
    if (!canStart()) {
      cancelIdle();
      if (compact.matches && dispose) {
        dispose();
        dispose = null;
      }
      host.dataset.rznLoad = motionAllowed() ? "waiting" : "static";
      return;
    }
    if (dispose) return;
    host.dataset.rznLoad = "waiting";
    if (idleId || idleTimer || loading) return;
    if (compact.matches) {
      if (!warmed) {
        warmed = true;
        void preloadIllusionculumAssembly();
      }
      start();
      return;
    }
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
  observer?.observe(html, {
    attributes: true,
    attributeFilter: ["data-world-effects", "data-route-cover"],
  });
  const onPageHide = () => {
    pageHidden = true;
    sync();
  };
  const onPageShow = () => {
    pageHidden = false;
    sync();
  };
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", sync);
  compact.addEventListener?.("change", sync);
  reduced.addEventListener?.("change", sync);
  forced.addEventListener?.("change", sync);
  sync();
  return () => {
    disposed = true;
    cancelIdle();
    observer?.disconnect();
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", sync);
    compact.removeEventListener?.("change", sync);
    reduced.removeEventListener?.("change", sync);
    forced.removeEventListener?.("change", sync);
    if (dispose) dispose();
    else delete host.dataset.rznLoad;
    dispose = null;
  };
}
