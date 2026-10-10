import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sha =
  process.env.PUBLIC_RELEASE_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("Release identity requires an exact commit SHA");
const gallery = JSON.parse(readFileSync("public/gallery/asset-manifest.json", "utf8"));
const paths = [
  "/gallery/asset-manifest.json",
  ...gallery.items.map((item) => [...item.variants].sort((a, b) => b.width - a.width)[0].path),
  "/saga-extreme-middle-20261006.webp",
  "/saga-extreme-ultra-20261006.jpeg",
  "/saga-cinema-assets/chapter-1.jpg",
  "/saga-cinema-assets/chapter-2.jpg",
  "/saga-cinema-assets/chapter-3.jpg",
  "/saga-cinema-assets/chapter-4.jpg",
  "/saga-cinema-assets/saga-logo-original.webp",
  "/saga-cinema-assets/menu-thumbnail.webp",
  "/saga-cinema-assets/michroma-latin.woff2",
  "/ultra-materials/manifest.json",
  "/ultra-materials/brushed-alloy-normal.png",
  "/ultra-materials/brushed-alloy-roughness.png",
  "/ultra-materials/frame-rim.png",
  "/exhibition-studio/manifest.json",
  "/exhibition-studio/studio-light.hdr",
  "/exhibition-studio/plaster-normal.png",
  "/exhibition-studio/plaster-roughness.png",
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
