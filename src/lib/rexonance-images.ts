// Shared by HTML preload, image elements and navigation warmup.
const widths: Record<string, number> = {
  "/rider-rexonance-saga-pickup.jpeg": 1050,
  "/rider-rexonance-max.webp": 1086,
  "/rider-rexonance-ultra.webp": 1200,
  "/rexonance-p14-core.jpg": 1000,
};

export function rexonanceImage(source: string) {
  const width = widths[source];
  if (!width) return {};
  const stem = source.replace(/\.[^.]+$/, "");
  return {
    srcSet: [640, 960, width].map((size) => `${stem}-delivery-${size}.webp ${size}w`).join(", "),
    sizes: source.includes("p14")
      ? "(max-width: 767px) 100vw, 40vw"
      : "(max-width: 767px) 100vw, 64vw",
  };
}
