import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import * as notice from "../src/lib/opening-notice.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the notice is taken once per opening pass, and only on /world", () => {
  notice.disarmOpeningNotice();
  assert.equal(notice.takeOpeningNotice("/world"), false, "a plain /world visit shows nothing");
  notice.armOpeningNotice();
  assert.equal(notice.takeOpeningNotice("/"), false);
  assert.equal(notice.takeOpeningNotice("/riders"), false);
  assert.equal(notice.isOpeningNoticeArmed(), true);
  assert.equal(notice.takeOpeningNotice("/world"), true);
  assert.equal(notice.takeOpeningNotice("/world"), false, "returning to /world does not re-show it");
  notice.armOpeningNotice();
  notice.disarmOpeningNotice();
  assert.equal(notice.takeOpeningNotice("/world"), false, "a cancelled handoff disarms it");
});

test("copy, duration and image are pinned", () => {
  assert.equal(notice.OPENING_NOTICE_TEXT, "お知らせが1件届いています");
  assert.equal(notice.OPENING_NOTICE_IMAGE_MS, 3000);
  for (const path of [notice.OPENING_NOTICE_IMAGE.webp, notice.OPENING_NOTICE_IMAGE.jpeg]) {
    const file = new URL(`../public${path}`, import.meta.url);
    assert.ok(existsSync(file), path);
    assert.ok(statSync(file).size < 120_000, `${path} stays modest`);
  }
});

test("ENTER THE WORLD arms the notice; the root mounts it; Zeus avoids it", () => {
  const title = read("src/components/cinematic/title-sequence.tsx");
  const enter = title.slice(title.indexOf("const enterWorld = useCallback"));
  assert.match(enter, /armOpeningNotice\(\);\s*\n\s*await go\(\{ to: "\/world"/);
  assert.equal((enter.match(/disarmOpeningNotice\(\)/g) ?? []).length >= 2, true);
  assert.match(read("src/routes/__root.tsx"), /<OpeningNotice \/>/);
  assert.match(read("src/components/zeus-button.tsx"), /\.opening-notice :is\(/);
  const component = read("src/components/opening-notice.tsx");
  assert.match(component, /setTimeout\(dismiss, OPENING_NOTICE_IMAGE_MS\)/);
  assert.match(component, /event\.key !== "Escape"/);
  assert.match(component, /aria-label="お知らせを閉じる"/);
  assert.match(component, /className="opening-notice-cut" aria-hidden="true"/);
  // An instant cut: no transition or animation on the overlay.
  const css = component.slice(component.indexOf(".opening-notice-cut {"));
  assert.doesNotMatch(css.slice(0, css.indexOf("`;")), /transition|animation/);
});
