import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  EPISODE_THUMBNAILS,
  MANAGER_THUMBNAILS,
  ZEUS_BUTTON_IMAGES,
  ZEUS_BUTTON_SIZES,
  episodeThumbnail,
  managerThumbnail,
} from "../src/lib/thumbnail-images.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const file = (path) => new URL(`../public${path}`, import.meta.url);

// Width of a WebP (lossy VP8, lossless VP8L or extended VP8X).
function webpWidth(bytes) {
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") return bytes.readUInt16LE(26) & 0x3fff;
  if (chunk === "VP8L") return 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
  if (chunk === "VP8X") return 1 + bytes.readUIntLE(24, 3);
  throw new Error(`unknown WebP chunk ${chunk}`);
}

test("every candidate is a WebP of the width its descriptor states, smaller than the next", () => {
  const sets = [
    ...Object.values(EPISODE_THUMBNAILS),
    ...Object.values(MANAGER_THUMBNAILS),
    ...Object.values(ZEUS_BUTTON_IMAGES),
  ];
  for (const set of sets) {
    let previous = 0;
    for (const variant of set.variants) {
      const bytes = readFileSync(file(variant.path));
      assert.equal(webpWidth(bytes), variant.width, variant.path);
      assert.ok(variant.width > previous, `${variant.path} ascending`);
      previous = variant.width;
    }
    const sizes = set.variants.map((variant) => statSync(file(variant.path)).size);
    for (let i = 1; i < sizes.length; i += 1) assert.ok(sizes[i - 1] < sizes[i], set.variants[i - 1].path);
    // The largest candidate keeps the resolution the slot loaded before.
    const zeus = Object.values(ZEUS_BUTTON_IMAGES).includes(set);
    assert.ok(set.variants.at(-1).width >= (zeus ? 360 : 540), set.variants.at(-1).path);
  }
});

test("episode and manager cards and the Zeus button use the right-sized sets", () => {
  const worldHome = read("src/components/world/world-home.tsx");
  assert.match(worldHome, /src=\{ep\.src\}\s*\{\.\.\.episodeThumbnail\(ep\.src\)\}/);
  for (const name of Object.keys(MANAGER_THUMBNAILS)) {
    assert.match(
      worldHome,
      new RegExp(`src="/manager-${name}-thumb\\.jpeg"\\s*\\{\\.\\.\\.managerThumbnail\\("${name}"\\)\\}`),
    );
  }
  assert.deepEqual(Object.keys(EPISODE_THUMBNAILS).sort(), [
    "/episode-01-hide-and-seek.jpeg",
    "/episode-02-legends.jpeg",
    "/episode-03-deception-world.jpeg",
    "/episode-04-kill.jpeg",
    "/episode-05-farce.jpeg",
    "/episode-06-deus.webp",
  ]);
  const episode = episodeThumbnail("/episode-01-hide-and-seek.jpeg");
  assert.equal(
    episode.srcSet,
    "/episode-01-hide-and-seek-delivery-600.webp 600w, /episode-01-hide-and-seek-delivery-900.webp 900w, /episode-01-hide-and-seek-delivery.webp 1086w",
  );
  assert.match(episode.sizes, /^\(max-width: 560px\) calc\(100vw - 84px\),/);
  assert.deepEqual(episodeThumbnail("/unknown.jpeg"), {});
  // Height-bound artwork asks for the slot height times its aspect ratio.
  assert.match(managerThumbnail("zeus").sizes, /\(max-width: 560px\) max\(40vw, 273px\)/);
  assert.match(managerThumbnail("reemu").sizes, /\(max-width: 560px\) max\(40vw, 120px\)/);

  const zeus = read("src/components/zeus-button.tsx");
  assert.match(zeus, /src="\/zeus-button-360\.webp"\s*srcSet=\{ZEUS_BUTTON_SRCSET\}\s*sizes=\{ZEUS_BUTTON_SIZES\}/);
  assert.match(
    zeus,
    /src="\/zeus-button-return-360\.webp"\s*srcSet=\{ZEUS_BUTTON_RETURN_SRCSET\}\s*sizes=\{ZEUS_BUTTON_SIZES\}/,
  );
  // The preload names the same candidates, so one file is fetched once.
  assert.match(
    read("src/routes/__root.tsx"),
    /href: "\/zeus-button-360\.webp",\s*imageSrcSet: ZEUS_BUTTON_SRCSET,\s*imageSizes: ZEUS_BUTTON_SIZES,/,
  );
  assert.equal(ZEUS_BUTTON_SIZES, "(max-width: 560px) 48px, 80px");
});
