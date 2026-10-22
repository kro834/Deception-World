// Reading cards use published form art, never the archive's 240px chips.
// Keep low-resolution originals at their real pixel width; enlarging a file
// during generation does not add detail. A newer published pickup is used
// only for the same form, without changing the owner's archive records:
// Diluculum, Vinculum and Legends are the very pictures the Dream chapter and
// the rider profiles publish at 846-1221px (pixel-matched to the archive's).
type FormArt = { source: string; variants: { path: string; width: number; build?: boolean }[] };
const formArt = (key: string, source: string, width: number): FormArt => ({
  source,
  variants:
    width <= 480
      ? [{ path: source, width }]
      : [480, Math.min(960, width)].map((size) => ({
          path: `/record-art/${key}-${size}.webp`,
          width: size,
          build: true,
        })),
});
export const FORM_RECORD_IMAGES: Record<string, FormArt> = Object.fromEntries(
  [
    ["saga-multi", "/archive-media/saga-107aecdea40f0d2e.webp", 400],
    ["saga-last-multi", "/archive-media/saga-80686f71da0111af.webp", 400],
    ["saga-flam", "/archive-media/saga-608c27ba18d2d280.webp", 400],
    ["saga-aero", "/archive-media/saga-8f1ecf4844e81ffe.webp", 400],
    ["saga-rock", "/archive-media/saga-abb2b9869f8f1ece.webp", 400],
    ["saga-hybrid", "/archive-media/saga-d7760113a71f6121.webp", 400],
    ["saga-full-custom", "/archive-media/saga-f056ec8a57658e30.webp", 400],
    ["saga-integral", "/archive-media/saga-ffaa98a432127194.webp", 400],
    ["saga-vertex", "/archive-media/saga-255b467c93c0a5cc.webp", 400],
    ["saga-diluculum", "/dream-chapter-diluculum.jpeg", 846],
    ["saga-vinculum", "/rider-profile-saga-delivery.webp", 1200],
    ["saga-last-vinculum", "/archive-media/saga-7dc03b21e02c518f.webp", 373],
    ["saga-extreme", "/saga-extreme-middle-20261006.webp", 1023],
    ["saga-extreme-ultra", "/saga-extreme-ultra.jpeg", 796],
    ["saga-rexonance", "/archive-media/saga-e29a7f0b6346f19e.jpg", 1500],
    ["saga-rexonance-max", "/archive-media/saga-a7fa1e093126a96d.jpg", 1125],
    ["saga-rexonance-ultra", "/archive-media/saga-e3245d3ae1a225da.jpg", 1500],
    ["realm-stella", "/archive-media/realm-579c9cf53932a0f9.jpg", 432],
    ["realm-burst", "/archive-media/realm-dd68217a1bb57818.jpg", 427],
    ["realm-blast", "/archive-media/realm-985d7a2c7ea4a4ef.jpg", 427],
    ["realm-legends", "/rider-profile-realm.jpeg", 1221],
    ["realm-royal", "/realm-royal-selected-20261007.webp", 1200],
    ["realm-royal-wrath", "/realm-wrath-selected-20261007.webp", 1200],
    ["realm-royal-abyss", "/realm-abyss-selected-20261007.webp", 1200],
    ["realm-royal-birth", "/realm-birth-selected-20261007.webp", 1200],
    ["realm-royal-nehan", "/realm-ultra-selected-20261007.webp", 1200],
  ].map(([key, source, width]) => [key, formArt(key as string, source as string, width as number)]),
);
