// Warm compressed resources on navigation intent. Keep this module independent
// of suit data: importing it must allocate no images, scenes or drawing surfaces.
export const ILLUSIONCULUM_PRELOAD_URLS = [
  "/illusionculum-suit-20261023/standard.webp",
  "/illusionculum-suit-20261023/plates.webp",
  "/illusionculum-suit-20261023/gold.webp",
  "/illusionculum-suit-20261023/guide.webp",
  "/rexonance-nanites-20261023/cells.webp",
  "/rexonance-nanites-20261023/fx.webp",
] as const;

export function createIllusionculumPreloader(
  environment: Pick<Window, "matchMedia" | "document" | "navigator" | "fetch">,
  loadCode: () => Promise<unknown> = () => import("./illusionculum-assembly-engine"),
  timeoutMs = 8000,
) {
  let inFlight: Promise<void> | null = null;
  return (): Promise<void> => {
    const connection = (
      environment.navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      environment.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      environment.matchMedia("(forced-colors: active)").matches ||
      environment.document.documentElement.dataset.worldEffects === "economy" ||
      connection?.saveData ||
      /^(slow-)?2g$/.test(connection?.effectiveType || "")
    )
      return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = new Promise<void>((resolve) => {
      const controller = new AbortController();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.abort();
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      const pull = async (url: string) => {
        const response = await environment.fetch(url, {
          cache: "force-cache",
          priority: "low",
          credentials: "same-origin",
          mode: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("preload failed");
        // Drain the stream into the HTTP cache without holding a full body or
        // asking the image decoder to allocate an uncompressed raster.
        const reader = response.body?.getReader();
        if (!reader) return;
        if (controller.signal.aborted) {
          await reader.cancel();
          reader.releaseLock();
          return;
        }
        const cancel = () => {
          void reader.cancel().catch(() => undefined);
        };
        controller.signal.addEventListener("abort", cancel, { once: true });
        try {
          while (!controller.signal.aborted) {
            if ((await reader.read()).done) break;
          }
        } finally {
          controller.signal.removeEventListener("abort", cancel);
          reader.releaseLock();
        }
      };
      void Promise.allSettled([
        Promise.resolve().then(loadCode),
        ...ILLUSIONCULUM_PRELOAD_URLS.map(pull),
      ]).then(finish);
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

let warm: (() => Promise<void>) | undefined;
export function preloadIllusionculumAssembly(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  warm ??= createIllusionculumPreloader(window);
  return warm();
}
