/** META UNITAS SAGA — the scroll suit-up runway's seam (2026-10-23).
 *
 * /meta-unitas-saga's #suitup (src/components/meta-unitas-saga/
 * meta-unitas-suitup.tsx) mounts this on its runway. The scene is the page's
 * Rexonance scroll engine with Meta Unitas' suit
 * (src/lib/meta-unitas-rx-engine.ts); this module stays light: the calls as the
 * HUD prints them and the mount, which imports the engine chunk only under
 * the motion gate, after the page is idle — never on the startup path, never
 * for the still tiers (prefers-reduced-motion, forced colours, economy,
 * Save-Data and 2G keep the finished figure and download nothing).
 */

import { META_UNITAS_SAGA } from "../components/meta-unitas-saga/meta-unitas-data.ts";

/** The calls' chips: the chant splits into its four SA-GA！DEUS！ (the last
 * keeps its own ！！！), every other call is one chip. The brackets stay
 * with the call (the record writes them). */
export function metaUnitasCallUnits(call: string): readonly string[] {
  const inner = call.replace(/^【/, "").replace(/】$/, "");
  const units = inner.match(/SA-GA！DEUS！(?:！+)?/g);
  return units && units.length > 1 && units.join("") === inner ? units : [inner];
}

export const META_UNITAS_CALL_LINES = META_UNITAS_SAGA.calls.map((call) =>
  metaUnitasCallUnits(call),
);

/** The forms the runway can end on, in the selector's order. */
export const META_UNITAS_FORMS = Object.freeze(["middle", "ultra"] as const);
export type MetaUnitasAssemblyForm = (typeof META_UNITAS_FORMS)[number];

export type MetaUnitasAssemblyOptions = {
  reducedMotion?: boolean;
  environment?: typeof globalThis;
  load?: () => Promise<{
    mountMetaUnitasAssemblyEngine: (
      host: HTMLElement,
      environment: typeof globalThis,
    ) => () => void;
  }>;
};

type Connection = { saveData?: boolean; effectiveType?: string };

/** Whether full motion is allowed here (the site's terms). */
export function metaUnitasMotionAllowed(
  environment: typeof globalThis = window,
  reducedMotion?: boolean,
) {
  const html = environment.document.documentElement;
  const connection = (environment.navigator as Navigator & { connection?: Connection })?.connection;
  return !(
    (reducedMotion ?? environment.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
    environment.matchMedia("(forced-colors: active)").matches ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType || "") ||
    html.dataset.worldEffects === "economy"
  );
}

/** Mounts the suit-up on `host` (the runway). Returns the disposer. */
export function mountMetaUnitasAssembly(
  host: HTMLElement | null | undefined,
  options: MetaUnitasAssemblyOptions = {},
): () => void {
  if (!host) return () => {};
  const environment = options.environment ?? window;
  const html = host.ownerDocument.documentElement;
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = environment.matchMedia("(forced-colors: active)");
  const load = options.load ?? (() => import("./meta-unitas-rx-engine"));
  let disposed = false;
  let loading = false;
  let dispose: (() => void) | null = null;
  let idleId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | 0 = 0;
  const allowed = () => metaUnitasMotionAllowed(environment, options.reducedMotion);
  // Page preparation waits behind the existing entry cover on every viewport.
  const canStart = () => allowed() && !html.dataset.routeCover;
  const stop = () => {
    if (dispose) dispose();
    dispose = null;
  };
  const start = () => {
    if (disposed || dispose || loading || !canStart()) return;
    loading = true;
    load().then(
      (module) => {
        loading = false;
        if (disposed || !canStart()) return;
        dispose = module.mountMetaUnitasAssemblyEngine(host, environment);
      },
      () => {
        loading = false;
        if (!disposed && canStart()) host.dataset.rznLoad = "error";
      },
    );
  };
  const cancelIdle = () => {
    if (idleId) environment.cancelIdleCallback?.(idleId);
    if (idleTimer) environment.clearTimeout(idleTimer);
    idleId = 0;
    idleTimer = 0;
  };
  const sync = () => {
    if (disposed) return;
    if (!allowed()) {
      cancelIdle();
      stop();
      host.dataset.rznLoad = "static";
      return;
    }
    if (!canStart()) {
      cancelIdle();
      return;
    }
    if (dispose || loading) return;
    host.dataset.rznLoad = "waiting";
    if (idleId || idleTimer) return;
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
  observer?.observe(html, { attributes: true, attributeFilter: ["data-world-effects", "data-route-cover"] });
  reduced.addEventListener?.("change", sync);
  forced.addEventListener?.("change", sync);
  sync();
  return () => {
    disposed = true;
    cancelIdle();
    observer?.disconnect();
    reduced.removeEventListener?.("change", sync);
    forced.removeEventListener?.("change", sync);
    stop();
    delete host.dataset.rznLoad;
  };
}
