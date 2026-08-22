import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mediaDirectory = resolve(root, "public/archive-media");
const stabilityStylesheet =
  '<link rel="stylesheet" href="/archive-mobile-stability.css?v=20260822-r34">';
const archives = [
  {
    kind: "saga",
    source: resolve(root, "public/saga-form-archive-standalone.html"),
    output: resolve(root, "public/saga-form-archive-embedded.html"),
  },
  {
    kind: "realm",
    source: resolve(root, "public/realm-form-archive-standalone.html"),
    output: resolve(root, "public/realm-form-archive-embedded.html"),
  },
];

const extensions = new Map([
  ["jpeg", "jpg"],
  ["jpg", "jpg"],
  ["png", "png"],
  ["webp", "webp"],
  ["gif", "gif"],
  ["avif", "avif"],
]);

mkdirSync(mediaDirectory, { recursive: true });
buildRealmArchiveMotion();

for (const archive of archives) {
  const source = readFileSync(archive.source, "utf8");
  let imageCount = 0;
  const output = source.replace(
    /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g,
    (dataUri, mime, encoded) => {
      const extension = extensions.get(mime.toLowerCase());
      if (!extension) return dataUri;
      const decoded = Buffer.from(encoded, "base64");
      const hash = createHash("sha256").update(decoded).digest("hex").slice(0, 16);
      const filename = `${archive.kind}-${hash}.${extension}`;
      writeFileSync(resolve(mediaDirectory, filename), decoded);
      imageCount += 1;
      return `/archive-media/${filename}`;
    },
  );

  const withEmbeddedMarker = output.replace(
    /<html\b([^>]*)>/,
    `<html$1 data-embedded-archive="true" data-archive-kind="${archive.kind}">`,
  );
  const withMobileStyles = withEmbeddedMarker.includes(stabilityStylesheet)
    ? withEmbeddedMarker
    : withEmbeddedMarker.replace("</head>", `${stabilityStylesheet}\n</head>`);

  writeFileSync(archive.output, withMobileStyles);
  console.log(
    `[embedded-archive] ${archive.kind}: externalized ${imageCount} image references; ${Buffer.byteLength(withMobileStyles)} byte HTML`,
  );
}
