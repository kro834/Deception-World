import { rexonanceImage } from "./rexonance-images.ts";
import { REXONANCE_SITE_ARTWORK } from "./rexonance-site-artwork.ts";
import { dossierImage } from "./dossier-images.ts";

const KNOWN_BYTES: Record<string, number> = {
  "/deception-world-poster-delivery.webp": 468454,
  "/poster-card-03.jpeg": 293500,
  "/poster-card-04.jpeg": 369600,
  "/poster-card-05.jpeg": 537900,
  "/poster-card-06.jpeg": 535600,
  "/poster-card-07.jpeg": 343800,
  "/poster-card-08.jpeg": 453700,
  "/poster-card-10.jpeg": 382400,
  "/episode-05-farce.jpeg": 320800,
  "/manager-lejas.jpeg": 283500,
  "/manager-lejas-face.jpeg": 280014,
  "/manager-lejas-portrait.jpeg": 280014,
  "/manager-lejas-rider.jpeg": 570400,
  "/manager-rex-loi.jpeg": 516600,
  "/manager-shuza.jpeg": 572000,
  "/manager-reemu.jpeg": 801600,
  "/manager-zeus.jpeg": 478105,
  "/manager-zeus-detail.jpeg": 508258,
  "/manager-opus.jpeg": 342588,
  "/manager-opus-rider.jpeg": 451880,
  "/rider-saga.jpeg": 298800,
  "/dream-chapter-logo-delivery.webp": 69332,
  "/dream-chapter-poster-05-delivery.webp": 138154,
  "/rider-rexonance-saga-pickup-20260922.webp": 391098,
  [REXONANCE_SITE_ARTWORK.standard]: 440678,
  "/saga-extreme-middle-20261006.webp": 332708,
  "/final-stage-logo.webp": 106600,
};

export const WORLD_ENTER_ASSETS = ["/deception-world-poster-delivery.webp"] as const;

// The Dream Chapter's hero art (poster 05) and title logo as delivered
// (WebP copies of the supplied JPEGs, scripts/build-card-variants.mjs). The
// dive warms these exact files, and the hero, its preload and the poster
// console then ask for the same ones.
export const DREAM_CHAPTER_HERO_ART = "/dream-chapter-poster-05-delivery.webp";
export const DREAM_CHAPTER_LOGO = "/dream-chapter-logo-delivery.webp";

export const DREAM_CHAPTER_ENTER_ASSETS = [DREAM_CHAPTER_LOGO, DREAM_CHAPTER_HERO_ART] as const;

export const REXONANCE_SAGA_ENTER_ASSETS = [REXONANCE_SITE_ARTWORK.standard] as const;

export const EXTREME_SAGA_ENTER_ASSETS = ["/saga-extreme-middle-20261006.webp"] as const;

export const FINAL_STAGE_ENTER_ASSETS = ["/final-stage-logo.webp"] as const;

export const MANAGER_ASSETS = {
  zeus: ["/manager-zeus-detail.jpeg?v=20260823-2"],
  lejas: ["/manager-lejas.jpeg"],
  opus: ["/manager-opus.jpeg"],
  "rex-loi": ["/manager-rex-loi.jpeg"],
  shuza: ["/manager-shuza.jpeg"],
  reemu: ["/manager-reemu.jpeg"],
} as const;

const warmed = new Set<string>();
const inFlight = new Map<string, Promise<boolean>>();
// The file each image warm-up picked (its Image's currentSrc), and the
// warm-ups still choosing. A covered entry paints the destination as a CSS
// background, which cannot follow a srcset: it asks here for the same file.
const picked = new Map<string, string>();
const choosing = new Map<string, HTMLImageElement>();

// The file a warm-up of `url` fetches: the one it picked, else (a single
// candidate with no descriptor, as every rider's delivery WebP) the file
// every device picks. A width set still choosing falls back to the URL.
export function warmedSource(url: string) {
  const known = picked.get(url) || choosing.get(url)?.currentSrc;
  if (known) return known;
  const { srcSet, sizes } = { ...dossierImage(url), ...rexonanceImage(url) };
  const only = srcSet?.trim();
  if (only && !sizes && !/[\s,]/.test(only)) return only;
  return url;
}

function assetReady(url: string) {
  return warmed.has(url);
}

export function assetsWarmed(urls: readonly string[]) {
  return urls.length > 0 && urls.every(assetReady);
}

function assetKey(url: string) {
  return url.split("?")[0];
}

const IMAGE_ASSET_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;
export const ASSET_REQUEST_TIMEOUT_MS = 12000;

async function decodeImageAsset(url: string, signal: AbortSignal) {
  if (!IMAGE_ASSET_PATTERN.test(url) || typeof Image === "undefined") return true;

  const image = new Image();
  image.decoding = "async";

  return new Promise<boolean>((resolve) => {
    const finish = (loaded: boolean) => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
      if (choosing.get(url) === image) choosing.delete(url);
      if (loaded && !signal.aborted && image.currentSrc) picked.set(url, image.currentSrc);
      resolve(loaded && !signal.aborted);
    };
    const abort = () => {
      finish(false);
      image.removeAttribute?.("srcset");
      image.removeAttribute?.("src");
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    image.onerror = () => finish(false);
    if (typeof image.decode !== "function") image.onload = () => finish(image.naturalWidth > 0);
    const responsive = { ...dossierImage(url), ...rexonanceImage(url) };
    if (responsive.srcSet) {
      if (responsive.sizes) image.sizes = responsive.sizes;
      image.srcset = responsive.srcSet;
    }
    image.src = url;
    choosing.set(url, image);
    if (typeof image.decode === "function") {
      void image.decode().then(
        () => finish(image.naturalWidth > 0),
        () => finish(false),
      );
    }
  });
}

// The shared promise must settle even when a browser decoder or stream ignores
// cancellation. Failed attempts are then released from inFlight and retryable.
function withAssetDeadline(task: (signal: AbortSignal) => Promise<boolean>) {
  return new Promise<boolean>((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(loaded);
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(false);
    }, ASSET_REQUEST_TIMEOUT_MS);
    void Promise.resolve()
      .then(() => task(controller.signal))
      .then(finish, () => finish(false));
  });
}

function emitProgress(received: number[], totals: number[], onProgress: (percent: number) => void) {
  const rec = received.reduce((a, b) => a + b, 0);
  const tot = totals.reduce((a, b) => a + b, 0) || 1;
  onProgress(Math.min(99, Math.round((rec / tot) * 100)));
}

async function pullOne(
  url: string,
  index: number,
  received: number[],
  totals: number[],
  onProgress: (percent: number) => void,
) {
  if (assetReady(url)) {
    received[index] = totals[index];
    emitProgress(received, totals, onProgress);
    return;
  }
  const key = url;
  let request = inFlight.get(key);
  if (!request) {
    request = withAssetDeadline(async (signal) => {
      try {
        // Use the browser's image request/cache once. Fetching the same URL
        // first can cause a second request before the decoded image is used.
        if (IMAGE_ASSET_PATTERN.test(url) && typeof Image !== "undefined") {
          return await decodeImageAsset(url, signal);
        }
        const res = await fetch(url, { cache: "force-cache", signal });
        if (signal.aborted) return false;
        if (!res.ok) throw new Error(`Asset request failed: ${res.status}`);
        const headerLen = Number(res.headers.get("content-length"));
        if (Number.isFinite(headerLen) && headerLen > 0) totals[index] = headerLen;
        if (!res.body) {
          received[index] = totals[index];
          emitProgress(received, totals, onProgress);
        } else {
          const reader = res.body.getReader();
          const cancelRead = () => {
            void reader.cancel().catch(() => undefined);
          };
          signal.addEventListener("abort", cancelRead, { once: true });
          let rec = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (signal.aborted) return false;
              if (done) break;
              rec += value.byteLength;
              received[index] = rec;
              if (rec > totals[index]) totals[index] = rec;
              emitProgress(received, totals, onProgress);
            }
          } finally {
            signal.removeEventListener("abort", cancelRead);
            reader.releaseLock();
          }
          received[index] = Math.max(received[index], totals[index]);
          emitProgress(received, totals, onProgress);
        }
        const decoded = await decodeImageAsset(url, signal);
        return decoded;
      } catch {
        return false;
      }
    });
    inFlight.set(key, request);
    void request.finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  }

  const loaded = await request;
  received[index] = totals[index];
  emitProgress(received, totals, onProgress);
  if (loaded) {
    warmed.add(url);
  }
}

export async function preloadAssets(
  urls: readonly string[],
  onProgress: (percent: number) => void,
): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) {
    onProgress(100);
    return;
  }
  const received = unique.map(() => 0);
  const totals = unique.map((u) => KNOWN_BYTES[assetKey(u)] ?? 400000);
  onProgress(0);
  await Promise.all(unique.map((url, i) => pullOne(url, i, received, totals, onProgress)));
  onProgress(100);
}
