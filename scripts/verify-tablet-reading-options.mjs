// Read-only reader settings / rotation / chapter regression. No gallery writes.
// BASE_URL=http://127.0.0.1:8273 PW_ENGINE=chrome|webkit AUDIT_OUT=output/playwright/tablet-reading-options
import { webkit, chromium } from "playwright";
import * as fs from "node:fs/promises";
import assert from "node:assert/strict";
import { checkedUrl } from "./browser-guard.mjs";
const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8273");
const out = process.env.AUDIT_OUT || "output/playwright/tablet-reading-options";
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await (process.env.PW_ENGINE === "chrome" ? chromium : webkit).launch(
    process.env.PW_ENGINE === "chrome" ? { channel: "chrome" } : {},
  );
  const report = [];
  try {
    for (const mode of ["reduce", "no-preference"]) {
      const context = await browser.newContext({
        viewport: { width: 639, height: 540 },
        hasTouch: true,
        reducedMotion: mode,
      });
      await context.addInitScript(() =>
        localStorage.setItem(
          "deception-world:dream-reader:v1",
          JSON.stringify({
            version: 1,
            size: "standard",
            spacing: "standard",
            bookmark: { caseNo: "5", paragraph: 7 },
          }),
        ),
      );
      await context.route("**/*", (r) =>
        ["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort(),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const settle = async () => {
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
      };
      await page.goto(new URL("/dream-chapter", base).href);
      await page.waitForFunction(() => {
        let b = document.querySelector(".dream-reading-entry button");
        return (
          b &&
          Object.keys(b).some((k) => k.startsWith("__reactProps")) &&
          !document.documentElement.hasAttribute("data-loading")
        );
      });
      const launcher = page.locator(".dream-reading-entry button");
      await launcher.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () => {
          const key = [scrollY, document.documentElement.scrollHeight].join(":");
          const p = window.__r2g;
          window.__r2g = { key, count: p?.key === key ? p.count + 1 : 0 };
          return window.__r2g.count >= 3;
        },
        undefined,
        { polling: 100 },
      );
      await launcher.click();
      const room = page.locator(".dream-reading-room[open]");
      await room.waitFor();
      await settle();
      await room.locator(".dream-reading-options summary").click();
      await settle();
      await page.evaluate(() => {
        const s = document.querySelector(".dream-reading-scroll"),
          p = s.querySelector('[data-room-paragraph="7"]'),
          t = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()),
          r = document.createRange();
        r.setStart(t, 80);
        r.setEnd(t, 81);
        s.scrollTop +=
          r.getBoundingClientRect().top -
          s.getBoundingClientRect().top -
          Math.min(80, s.clientHeight * 0.2);
        window.__r2range = r;
      });
      await settle();
      const metric = () =>
        page.evaluate(() => {
          const s = document.querySelector(".dream-reading-scroll"),
            r = window.__r2range,
            b = s.getBoundingClientRect(),
            p = s.querySelector('[data-room-paragraph="7"]');
          return {
            width: innerWidth,
            height: innerHeight,
            top: r?.startContainer.isConnected ? r.getBoundingClientRect().top - b.top : null,
            lineHeight: parseFloat(getComputedStyle(p || s.querySelector("p")).lineHeight),
            readingHeight: s.clientHeight,
            scrollTop: s.scrollTop,
            progress: document.querySelector(".dream-reading-bottom progress").value,
            chapter: document.querySelector(".dream-reading-chapter-select select").value,
            size: document.querySelector(".dream-reading-room").dataset.size,
            spacing: document.querySelector(".dream-reading-room").dataset.spacing,
            options: document.querySelector(".dream-reading-options").open,
            overflow: s.scrollWidth - s.clientWidth,
          };
        });
      let start = await metric();
      const loop1 = { loop: 1, mode, observation: start, changes: [] };
      for (const name of ["文字を大きく", "行間を広く"]) {
        await room.getByRole("button", { name, exact: true }).click();
        await settle();
        const m = await metric();
        m.drift = m.top - start.top;
        assert.ok(Math.abs(m.drift) <= m.lineHeight + 2, JSON.stringify(m));
        loop1.changes.push({ name, ...m });
        start = m;
      }
      loop1.judgment = "No application change required; same-character drift within one line.";
      report.push(loop1);
      await page.screenshot({ path: `${out}/${mode}-01-options.png` });
      const loop2 = { loop: 2, mode, observation: start, rotations: [] };
      for (const [width, height] of [
        [700, 540],
        [1024, 1366],
        [639, 540],
      ]) {
        await page.evaluate(() => {
          const s = document.querySelector(".dream-reading-scroll"),
            line = s.getBoundingClientRect().top + Math.min(80, s.clientHeight * 0.2),
            p = [...s.querySelectorAll("[data-room-paragraph]")].find(
              (n) => n.getBoundingClientRect().bottom > line,
            ),
            t = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()),
            r = document.createRange();
          let low = 0,
            high = t.length - 1;
          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            r.setStart(t, mid);
            r.setEnd(t, mid + 1);
            if (r.getBoundingClientRect().bottom <= line) low = mid + 1;
            else high = mid;
          }
          r.setStart(t, low);
          r.setEnd(t, low + 1);
          window.__r2range = r;
        });
        start = await metric();
        await page.setViewportSize({ width, height });
        await settle();
        const m = await metric();
        m.drift = m.top - start.top;
        assert.ok(Math.abs(m.drift) <= m.lineHeight + 2, JSON.stringify(m));
        assert.ok(m.readingHeight >= 120);
        assert.equal(m.overflow, 0);
        loop2.rotations.push(m);
        start = m;
        await page.screenshot({ path: `${out}/${mode}-02-${width}x${height}.png` });
      }
      loop2.pass = loop2.rotations.every((m) => Math.abs(m.drift) <= m.lineHeight + 2);
      loop2.judgment = loop2.pass
        ? "No further change required; same reading-line character remains within one line."
        : "Anchor correction required: the old reading-line character leaves the viewport after return rotation.";
      report.push(loop2);
      const loop3 = { loop: 3, mode, chapters: [] };
      const check = async (expected) => {
        await settle();
        const m = await metric();
        assert.equal(m.chapter, expected);
        assert.equal(m.progress, 1);
        assert.equal(m.scrollTop, 0);
        assert.equal(m.size, "large");
        assert.equal(m.spacing, "comfortable");
        assert.equal(m.options, true);
        loop3.chapters.push(m);
      };
      await room.locator(".dream-reading-chapter-select select").selectOption("4");
      await check("4");
      await room.getByRole("button", { name: "次の章 →", exact: true }).click();
      await check("5");
      await room.locator(".dream-reading-chapter-select select").selectOption("4");
      await check("4");
      await room.getByRole("button", { name: "← 前の章", exact: true }).click();
      await check("3");
      loop3.judgment =
        "No application change required; next/select/previous reset chapter position and preserve settings.";
      report.push(loop3);
      await page.screenshot({ path: `${out}/${mode}-03-chapter.png` });
      assert.deepEqual(errors, []);
      await room.getByRole("button", { name: "読書室を閉じる", exact: true }).click();
      await context.close();
      console.log("PASS", mode);
    }
  } catch (e) {
    report.push({ error: e.stack });
    throw e;
  } finally {
    await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
