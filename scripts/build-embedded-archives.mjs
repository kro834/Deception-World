import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mediaDirectory = resolve(root, "public/archive-media");
const stabilityStylesheet =
  '<link rel="stylesheet" href="/archive-mobile-stability.css?v=20260823-r41">';
const stabilityScript = '<script src="/archive-scroll-stability.js?v=20260906-r45" defer></script>';
const archives = [
  {
    kind: "saga",
    source: resolve(root, "archives/saga-form-archive-standalone.html"),
    output: resolve(root, "public/saga-form-archive-embedded.html"),
  },
  {
    kind: "realm",
    source: resolve(root, "archives/realm-form-archive-standalone.html"),
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
if (existsSync(resolve(root, "archives/saga-form-archive-standalone.html"))) {
  buildRealmArchiveMotion();
} else {
  console.log("[embedded-archive] source archives missing; keeping committed embedded HTML");
}

for (const archive of archives) {
  if (!existsSync(archive.source)) {
    if (!existsSync(archive.output)) {
      throw new Error(`Missing archive source and output for ${archive.kind}`);
    }
    console.log(`[embedded-archive] ${archive.kind}: skipped (source not in deploy context)`);
    continue;
  }
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
  const withScrollStability = withMobileStyles.includes(stabilityScript)
    ? withMobileStyles
    : withMobileStyles.replace("</head>", `${stabilityScript}\n</head>`);
  const readySignal = `<script data-archive-ready-signal>
(() => {
  const announceReady = () => {
    document.documentElement.dataset.archiveReadySignal = "scheduled";
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.parent.postMessage({
        type: "saga-archive:ready",
        kind: document.documentElement.dataset.archiveKind
      }, "*");
      document.documentElement.dataset.archiveReadySignal = "sent";
    }));
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", announceReady, { once: true });
  } else {
    announceReady();
  }
})();
</script>`;
  const withReadySignal = withScrollStability.includes("data-archive-ready-signal")
    ? withScrollStability
    : withScrollStability.replace("</body>", `${readySignal}\n</body>`);

  writeFileSync(archive.output, withReadySignal);
  console.log(
    `[embedded-archive] ${archive.kind}: externalized ${imageCount} image references; ${Buffer.byteLength(withReadySignal)} byte HTML`,
  );
}
