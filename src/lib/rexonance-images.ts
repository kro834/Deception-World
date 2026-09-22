// Shared by HTML preload, image elements and navigation warmup.
const widths: Record<string, number> = {
  "/rider-rexonance-saga-pickup-20260922.webp": 1086,
  "/rider-rexonance-max-20260922.webp": 1086,
  "/rider-rexonance-ultra-20260922.webp": 1086,
  "/rexonance-p14-core.jpg": 1000,
  "/final-stage-logo.webp": 1536,
  "/rider-far-from-saga-middle.webp": 1070,
  "/rider-far-from-saga-high.webp": 1083,
  "/rider-far-from-saga-xhigh.webp": 1083,
  "/rider-far-from-saga-max.webp": 1086,
  "/rider-far-from-saga-ultra.webp": 1083,
  "/rider-realm-royal.webp": 1008,
  "/rider-realm-royal-02.webp": 1122,
  "/rider-realm-royal-03.webp": 1182,
  "/rider-realm-royal-04.webp": 1344,
  "/character-archive.webp": 1086,
  "/character-nagi-20260922.webp": 1086,
};

export function rexonanceImage(source: string, lazyLayout = false) {
  const width = widths[source];
  if (!width) return {};
  const stem = source.replace(/\.[^.]+$/, "");
  return {
    srcSet: [640, 960, width].map((size) => `${stem}-delivery-${size}.webp ${size}w`).join(", "),
    // Only an in-document lazy image has a layout width for `auto`. Keep
    // preload and stage warmup candidates identical to their eager images.
    sizes:
      (lazyLayout ? "auto, " : "") +
      (source.includes("p14")
        ? "(max-width: 767px) 100vw, 40vw"
        : "(max-width: 767px) 100vw, 64vw"),
  };
}
