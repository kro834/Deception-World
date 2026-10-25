import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sha =
  process.env.PUBLIC_RELEASE_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("Release identity requires an exact commit SHA");
const gallery = JSON.parse(readFileSync("public/gallery/asset-manifest.json", "utf8"));
const paths = [
  "/ciel-inferno-20261019/ciel-216.webp",
  "/ciel-inferno-20261019/ciel-720.webp",
  "/ciel-inferno-20261019/ciel-1080.webp",
  "/ciel-inferno-20261019/artwork-manifest.json",
  "/ciel-inferno-20261019/jet.webp",
  "/ciel-inferno-20261019/jet-manifest.json",
  "/rexonance-flame-20261019/flame.webp",
  "/rexonance-flame-20261019/manifest.json",
  "/rexonance-flame-natural-20261019/flame.webp",
  "/rexonance-flame-natural-20261019/manifest.json",
  "/ciel-button-20261018-144.webp",
  "/ciel-button-20261018-216.webp",
  "/ciel-button-20261018-360.webp",
  "/gallery/asset-manifest.json",
  ...gallery.items.map((item) => [...item.variants].sort((a, b) => b.width - a.width)[0].path),
  "/saga-extreme-middle-20261006.webp",
  "/saga-extreme-ultra-20261006.jpeg",
  "/rexonance-forms-20261011/excelsior-cutout-20261012.webp",
  "/rider-rexonance-excelsior-cutout-20261012.webp",
  "/rider-rexonance-excelsior-cutout-20261012-delivery-640.webp",
  "/rider-rexonance-excelsior-cutout-20261012-delivery-960.webp",
  "/rider-rexonance-excelsior-cutout-20261012-delivery-1022.webp",
  "/saga-cinema-assets/chapter-1.jpg",
  "/saga-cinema-assets/chapter-2.jpg",
  "/saga-cinema-assets/chapter-3.jpg",
  "/saga-cinema-assets/chapter-4.jpg",
  "/saga-cinema-assets/saga-logo-original.webp",
  "/saga-cinema-assets/saga-logo-640.webp",
  "/saga-cinema-assets/menu-thumbnail.webp",
  "/saga-cinema-assets/menu-thumbnail-20261012.webp",
  "/saga-cinema-assets/michroma-latin.woff2",
  "/exhibition-metal/manifest.json",
  "/exhibition-metal/brushed-alloy-normal.png",
  "/exhibition-metal/brushed-alloy-roughness.png",
  "/exhibition-studio/manifest.json",
  "/exhibition-studio/studio-light.hdr",
  "/exhibition-studio/plaster-normal.png",
  "/exhibition-studio/plaster-roughness.png",
  "/rain-city-materials/concrete-albedo.webp",
  "/rain-city-materials/concrete-normal.png",
  "/rain-city-materials/concrete-roughness.png",
  "/rain-city-materials/asphalt-albedo.webp",
  "/rain-city-materials/asphalt-normal.png",
  "/rain-city-materials/asphalt-roughness.png",
  "/rain-city-materials/manifest.json",
];
const assets = paths.map((path) => ({
  path,
  sha256: createHash("sha256")
    .update(readFileSync(`public${path}`))
    .digest("hex"),
}));
writeFileSync(
  "public/release-identity.json",
  JSON.stringify({ sha, artworks: gallery.items.length, sharedGallery: true, assets }) + "\n",
);
console.log(`Release identity: ${sha}, ${gallery.items.length} artworks`);
