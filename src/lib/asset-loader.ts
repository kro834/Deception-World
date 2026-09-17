import { rexonanceImage } from "./rexonance-images.ts";
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
  "/dream-chapter-logo.jpeg": 211523,
  "/rider-rexonance-saga-pickup.jpeg": 564268,
  "/saga-extreme-middle.webp": 238554,
};

export const WORLD_ENTER_ASSETS = ["/deception-world-poster-delivery.webp"] as const;

export const DREAM_CHAPTER_ENTER_ASSETS = [
  "/dream-chapter-logo.jpeg",
  "/dream-chapter-poster-05.jpeg",
] as const;

export const REXONANCE_SAGA_ENTER_ASSETS = ["/rider-rexonance-saga-pickup.jpeg"] as const;

export const EXTREME_SAGA_ENTER_ASSETS = ["/saga-extreme-middle.webp"] as const;

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
