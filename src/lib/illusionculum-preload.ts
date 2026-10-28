// Warm compressed resources on navigation intent. Keep this module independent
// of suit data: importing it must allocate no images, scenes or drawing surfaces.
export const ILLUSIONCULUM_PRELOAD_URLS = [
  "/illusionculum-suit-20261023/standard.webp",
  "/illusionculum-suit-20261023/plates.webp",
  "/illusionculum-suit-20261023/gold.webp",
  "/illusionculum-suit-20261023/guide.webp",
  "/illusionculum-nanites-20261027/cells.webp",
  "/rexonance-nanites-20261023/fx.webp",
] as const;

// Compact entry disables separate gold/conduit surfaces. The scroll scene
// still prepares the full set, even on the same compact device.
export const ILLUSIONCULUM_COMPACT_ENTRY_URLS = [
  ILLUSIONCULUM_PRELOAD_URLS[0],
  ILLUSIONCULUM_PRELOAD_URLS[1],
  ILLUSIONCULUM_PRELOAD_URLS[4],
  ILLUSIONCULUM_PRELOAD_URLS[5],
] as const;
type PreloadPurpose = { entry?: boolean };

export function createIllusionculumPreloader(
  environment: Pick<Window, "matchMedia" | "document" | "navigator" | "fetch">,
  loadCode: () => Promise<unknown> = () => import("./illusionculum-assembly-engine"),
  timeoutMs = 8000,
) {
  let inFlight: Promise<void> | null = null;
  let activeUrls: readonly string[] = [];
  const completed = new Set<string>();
  let codeReady = false;
  const warm = ({ entry = false }: PreloadPurpose = {}): Promise<void> => {
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
    const compactEntry = entry && environment.matchMedia("(any-pointer: coarse), (max-width: 767px)").matches;
    const wanted = compactEntry ? ILLUSIONCULUM_COMPACT_ENTRY_URLS : ILLUSIONCULUM_PRELOAD_URLS;
    const urls = wanted.filter((url) => !completed.has(url));
    if (!urls.length && codeReady) return Promise.resolve();
    if (inFlight) {
      // An entry may finish warming while the page asks for its full scroll
      // scene. Share current streams, then request only the two missing sheets.
      return urls.every((url) => activeUrls.includes(url)) ? inFlight : inFlight.then(() => warm({ entry }));
    }
    activeUrls = urls;
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
        if (!reader) {
          if (!controller.signal.aborted) completed.add(url);
          return;
        }
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
            if ((await reader.read()).done) {
              if (!controller.signal.aborted) completed.add(url);
              break;
            }
          }
        } finally {
          controller.signal.removeEventListener("abort", cancel);
          reader.releaseLock();
        }
      };
      void Promise.allSettled([
        codeReady ? Promise.resolve() : Promise.resolve().then(loadCode).then(() => {
          if (!controller.signal.aborted) codeReady = true;
        }),
        ...urls.map(pull),
      ]).then(finish);
    }).finally(() => {
      inFlight = null;
      activeUrls = [];
    });
    return inFlight;
  };
  return warm;
}

let warm: ((purpose?: PreloadPurpose) => Promise<void>) | undefined;
export function preloadIllusionculumAssembly(purpose?: PreloadPurpose): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  warm ??= createIllusionculumPreloader(window);
  return warm(purpose);
}
