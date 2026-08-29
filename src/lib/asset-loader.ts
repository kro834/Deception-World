const KNOWN_BYTES: Record<string, number> = {
  "/deception-world-poster.jpeg": 815933,
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

export const WORLD_ENTER_ASSETS = [
  "/deception-world-poster.jpeg",
] as const;

export const DREAM_CHAPTER_ENTER_ASSETS = [
  "/dream-chapter-logo.jpeg",
] as const;

export const REXONANCE_SAGA_ENTER_ASSETS = [
  "/rider-rexonance-saga-pickup.jpeg",
] as const;

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
  return warmed.has(url) || warmed.has(assetKey(url));
}

export function assetsWarmed(urls: readonly string[]) {
  return urls.length > 0 && urls.every(assetReady);
}

function assetKey(url: string) {
  return url.split("?")[0];
}

const IMAGE_ASSET_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;

async function decodeImageAsset(url: string) {
  if (!IMAGE_ASSET_PATTERN.test(url) || typeof Image === "undefined") return true;

  const image = new Image();
  image.decoding = "async";

  if (typeof image.decode === "function") {
    image.src = url;
    try {
      await image.decode();
      return image.naturalWidth > 0;
    } catch {
      return false;
    }
  }

  return new Promise<boolean>((resolve) => {
    image.onload = () => resolve(image.naturalWidth > 0);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

function emitProgress(
  received: number[],
  totals: number[],
  onProgress: (percent: number) => void,
) {
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
  const key = assetKey(url);
  let request = inFlight.get(key);
  if (!request) {
    request = (async () => {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) throw new Error(`Asset request failed: ${res.status}`);
        const headerLen = Number(res.headers.get("content-length"));
        if (Number.isFinite(headerLen) && headerLen > 0) totals[index] = headerLen;
        if (!res.body) {
          received[index] = totals[index];
          emitProgress(received, totals, onProgress);
        } else {
          const reader = res.body.getReader();
          let rec = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            rec += value.byteLength;
            received[index] = rec;
            if (rec > totals[index]) totals[index] = rec;
            emitProgress(received, totals, onProgress);
          }
          received[index] = Math.max(received[index], totals[index]);
          emitProgress(received, totals, onProgress);
        }
        const decoded = await decodeImageAsset(url);
        return decoded;
      } catch {
        return false;
      }
    })();
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
    warmed.add(key);
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
