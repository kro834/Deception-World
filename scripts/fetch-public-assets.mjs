#!/usr/bin/env node
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.DW_ASSET_BASE || "https://sand-zenith-meadow-dune.grok.me";
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const files = [
  "__grok/icon-180.png",
  "__grok/icon-192.png",
  "__grok/icon-512.png",
  "__grok/install/assets/homescreen/glass-puzzle.svg",
  "__grok/install/assets/homescreen/glass-share.svg",
  "__grok/install/assets/homescreen/logo-grok.svg",
  "__grok/install/assets/homescreen/ob-ipad.png",
  "__grok/install/assets/homescreen/ob-phone.png",
  "__grok/install/assets/homescreen/plus.svg",
  "__grok/install/styles.css",
  "app-icon.png",
  "atmosphere-poster.jpg",
  "atmosphere.mp4",
  "character-luna-thumb.jpeg",
  "character-luna.jpeg",
  "character-terra-thumb.jpeg",
  "character-terra.jpeg",
  "civilian-argenome.jpeg",
  "civilian-leddic.jpeg",
  "civilian-naikami-chigiri.jpeg",
  "civilian-lore.jpeg",
  "civilian-over-zeztz.jpeg",
  "civilian-realm.jpeg",
  "civilian-saga.jpeg",
  "civilian-vandal.jpeg",
  "deception-world-poster.jpeg",
  "dream-chapter-ciel.jpeg",
  "dream-chapter-diluculum.jpeg",
  "dream-chapter-kaisaku.jpeg",
  "dream-chapter-keiya-awakened.jpeg",
  "dream-chapter-keiya.jpeg",
  "dream-chapter-logo.jpeg",
  "dream-chapter-lord-chaos-spec.jpeg",
  "dream-chapter-lord-chaos.jpeg",
  "dream-chapter-lord-knight.jpeg",
  "dream-chapter-dread.jpeg",
  "dream-chapter-lupin.jpeg",
  "dream-chapter-poster-01.jpeg",
  "dream-chapter-poster-02.jpeg",
  "dream-chapter-poster-03.jpeg",
  "dream-chapter-poster-04.jpeg",
  "dream-chapter-poster-05.jpeg",
  "dream-chapter-poster-06.jpeg",
  "dream-chapter-poster-07.jpeg",
  "dream-chapter-poster-08.jpeg",
  "episode-01-hide-and-seek.jpeg",
  "episode-02-legends.jpeg",
  "episode-03-deception-world.jpeg",
  "episode-04-kill.jpeg",
  "episode-05-farce.jpeg",
  "episode-05-farce.png",
  "favicon-32.png",
  "favicon.png",
  "favicon.svg",
  "logo-title.jpg",
  "manager-killer-dante.jpeg",
  "manager-lejas-close.jpeg",
  "manager-lejas-face.jpeg",
  "manager-lejas-head.jpeg",
  "manager-lejas-portrait.jpeg",
  "manager-lejas-rider.jpeg",
  "manager-lejas.jpeg",
  "manager-opus-rider.jpeg",
  "manager-opus.jpeg",
  "manager-reemu-rider.jpeg",
  "manager-reemu.jpeg",
  "manager-rex-loi-rider.jpeg",
  "manager-rex-loi.jpeg",
  "manager-shuza-rider.jpeg",
  "manager-shuza.jpeg",
  "manager-zeus-detail.jpeg",
  "manager-zeus.jpeg",
  "nightmare-machiavel-gore.jpeg",
  "noise.png",
  "og.jpg",
  "poster-card-03.jpeg",
  "poster-card-04.jpeg",
  "poster-card-05.jpeg",
  "poster-card-06.jpeg",
  "poster-card-07.jpeg",
  "poster-card-08.jpeg",
  "poster-card-10.jpeg",
  "poster-card-11.jpeg",
  "poster-card-12.jpeg",
  "poster-card-13.jpeg",
  "poster-card-14.jpeg",
  "poster-card-15.jpeg",
  "poster-card-16.jpeg",
  "poster-card-17.jpeg",
  "poster-card-18.jpeg",
  "poster-card-19.jpeg",
  "poster-card-20.jpeg",
  "poster-card-21.jpeg",
  "poster-card-22.jpeg",
  "poster-card-23.jpeg",
  "poster-card-24.jpeg",
  "poster-card-25.jpeg",
  "poster-card-26.jpeg",
  "poster-card-27.jpeg",
  "poster-card-28.jpeg",
  "poster-card-29.jpeg",
  "poster-card-30.jpeg",
  "poster-card-31.jpeg",
  "poster-card-32-20260825.jpeg",
  "poster-card-33.jpeg",
  "rider-saga-rexonance-thumbnail-20260827.jpeg",
  "rider-vandal-thumbnail-20260827.jpeg",
  "rider-algenome.jpeg",
  "rider-leddic-home.jpeg",
  "rider-leddic-hoko.jpeg",
  "rider-leddic-ishihen.jpeg",
  "rider-leddic-rekka-20260829.jpeg",
  "rider-loa.jpeg",
  "rider-luna.jpeg",
  "rider-macabergoanightmare.jpeg",
  "rider-over-zeztz-home.jpeg",
  "rider-profile-argenome.jpeg",
  "rider-profile-leddic.jpeg",
  "rider-profile-lore.jpeg",
  "rider-profile-over-zeztz.jpeg",
  "rider-profile-realm.jpeg",
  "rider-profile-saga.jpeg",
  "rider-profile-vandal.jpeg",
  "rider-realm-earth.jpeg",
  "rider-realm-moon.jpeg",
  "rider-realm.jpeg",
  "rider-saga.jpeg",
  "rider-terra.jpeg",
  "rider-vandaal.jpeg",
  "saga-extreme-middle.jpeg",
  "saga-extreme-middle.webp",
  "saga-extreme-ultra.jpeg",
];

async function main() {
  if (process.env.DW_SKIP_ASSET_FETCH === "1") {
    console.log("skip asset fetch");
    return;
  }
  const timeoutMs = Number(process.env.DW_ASSET_FETCH_TIMEOUT_MS || 8000);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const file of files) {
    const dest = join(root, file);
    try {
      const s = await stat(dest);
      if (s.size > 32) {
        skip += 1;
        continue;
      }
    } catch {
      /* missing */
    }
    const url = `${BASE.replace(/\/$/, "")}/${file}`;
    process.stdout.write(`fetch ${file} ... `);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        console.log(`fail ${res.status}`);
        fail += 1;
        if (fail >= 3) {
          console.log("stop asset fetch after repeated failures");
          break;
        }
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      console.log(`${buf.length} bytes`);
      ok += 1;
    } catch (err) {
      const reason = err && typeof err === "object" && "name" in err ? err.name : "error";
      console.log(`fail ${reason}`);
      fail += 1;
      if (fail >= 3) {
        console.log("stop asset fetch after repeated failures");
        break;
      }
    }
  }
  console.log(`done fetched=${ok} kept=${skip} failed=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(0);
});
