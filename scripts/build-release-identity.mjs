import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sha =
  process.env.PUBLIC_RELEASE_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("Release identity requires an exact commit SHA");
const paths = [
  "/gallery/asset-manifest.json",
  "/gallery/g66-1145.webp",
  "/gallery/g67-1672.webp",
  "/gallery/g68-1792.webp",
  "/gallery/g69-1536.webp",
  "/gallery/g70-1672.webp",
  "/gallery/g71-1672.webp",
  "/gallery/g72-1536.webp",
  "/gallery/g73-1448.webp",
  "/gallery/g74-1086.webp",
  "/gallery/g75-1774.webp",
  "/gallery/g76-1774.webp",
  "/gallery/g77-1774.webp",
  "/gallery/g78-1536.webp",
  "/gallery/g79-1672.webp",
  "/saga-extreme-middle-20261006.webp",
  "/saga-extreme-ultra-20261006.jpeg",
];
const assets = paths.map((path) => ({
  path,
  sha256: createHash("sha256")
    .update(readFileSync(`public${path}`))
    .digest("hex"),
}));
const gallery = JSON.parse(readFileSync("public/gallery/asset-manifest.json", "utf8"));
writeFileSync(
  "public/release-identity.json",
  JSON.stringify({ sha, artworks: gallery.items.length, sharedGallery: true, assets }) + "\n",
);
console.log(`Release identity: ${sha}, ${gallery.items.length} artworks`);
