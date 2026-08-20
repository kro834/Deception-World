const KNOWN_BYTES: Record<string, number> = {
  "/deception-world-poster.jpeg": 953800,
  "/poster-card-03.jpeg": 293500,
  "/poster-card-04.jpeg": 369600,
  "/poster-card-05.jpeg": 537900,
  "/poster-card-06.jpeg": 535600,
  "/poster-card-07.jpeg": 343800,
  "/poster-card-08.jpeg": 453700,
  "/poster-card-09.jpeg": 549000,
  "/poster-card-10.jpeg": 382400,
  "/manager-lejas.jpeg": 283500,
  "/manager-lejas-face.jpeg": 280014,
  "/manager-lejas-portrait.jpeg": 280014,
  "/manager-lejas-rider.jpeg": 570400,
  "/manager-rex-loi.jpeg": 516600,
  "/manager-shuza.jpeg": 572000,
  "/manager-reemu.jpeg": 801600,
  "/manager-zeus.jpeg": 478105,
  "/manager-opus.jpeg": 342588,
  "/manager-opus-rider.jpeg": 451880,
  "/rider-saga.jpeg": 298800,
};

export const WORLD_ENTER_ASSETS = [
  "/deception-world-poster.jpeg",
  "/poster-card-03.jpeg",
  "/poster-card-04.jpeg",
] as const;

export const MANAGER_ASSETS = {
  zeus: ["/manager-zeus.jpeg"],
  lejas: ["/manager-lejas.jpeg", "/manager-lejas-portrait.jpeg", "/manager-lejas-rider.jpeg"],
  opus: ["/manager-opus.jpeg", "/manager-opus-rider.jpeg"],
  "rex-loi": ["/manager-rex-loi.jpeg", "/manager-rex-loi-rider.jpeg"],
  shuza: ["/manager-shuza.jpeg", "/manager-shuza-rider.jpeg"],
  reemu: ["/manager-reemu.jpeg", "/manager-reemu-rider.jpeg"],
} as const;

const warmed = new Set<string>();

export function assetsWarmed(urls: readonly string[]) {
  return urls.length > 0 && urls.every((u) => warmed.has(u) || warmed.has(assetKey(u)));
}

function assetKey(url: string) {
  return url.split("?")[0];
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
  try {
    const res = await fetch(url, { cache: "force-cache" });
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
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "high";
      img.onload = () => {
        void img.decode?.().catch(() => undefined).finally(resolve);
      };
      img.onerror = () => resolve();
      img.src = url;
    });
    warmed.add(url);
    warmed.add(assetKey(url));
  } catch {
    received[index] = totals[index];
    emitProgress(received, totals, onProgress);
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
  unique.forEach((u) => {
    warmed.add(u);
    warmed.add(assetKey(u));
  });
  onProgress(100);
}

export function warmLater(urls: readonly string[]) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    for (const url of urls) {
      if (warmed.has(url) || warmed.has(assetKey(url))) continue;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        warmed.add(url);
        warmed.add(assetKey(url));
      };
      img.src = url;
    }
  }, 400);
}
