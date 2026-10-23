// Read-only geometry probe for incremental tablet/fold refinements.
// INJECT_TABLET_CSS=1 measures the edited sources against the baseline build;
// the final pass must omit it and use a rebuilt production preview.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8273");
const scene = process.env.AUDIT_SCENE || "dossier";
const output = process.env.AUDIT_OUT || `output/playwright/refine-${scene}`;
const sizes = (process.env.PW_SIZES || "900x600,1024x600,1100x688")
  .split(",")
  .map((size) => size.split("x").map(Number));
const routes = {
  dossier: "/characters/ciel",
  world: "/world",
  reading: "/dream-chapter",
  search: "/search",
  gallery: "/gallery",
};
assert.ok(routes[scene], "known audit scene");
const engine = process.env.PW_ENGINE || "webkit";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const sheet =
  scene === "dossier" ? "dossier" : scene === "reading" || scene === "search" ? "reading" : scene;
const css =
  process.env.INJECT_TABLET_CSS === "1"
    ? await readFile(new URL(`../src/styles-tablet-${sheet}.css`, import.meta.url), "utf8")
    : null;
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await context.route("**/*", (route) =>
      ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL(routes[scene], base).href, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const html = document.documentElement;
      return (
        !html.hasAttribute("data-loading") &&
        !html.hasAttribute("data-route-scroll-settling") &&
        html.dataset.scrollMotionReady === "true" &&
        document.fonts.status === "loaded"
      );
    });
    const triggerSelector =
      scene === "reading"
        ? ".dream-reading-entry button"
        : scene === "gallery"
          ? ".gallery-work-open"
          : ".side-panel-trigger";
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      return node && Object.keys(node).some((key) => key.startsWith("__reactProps"));
    }, triggerSelector);
    await page.waitForTimeout(200);
    if (scene === "gallery") {
      await page.waitForFunction(() => !document.querySelector(".gallery-arrival"));
      await page.locator(".gallery-work-open").first().click();
      await page.locator(".gallery-viewer[open]").waitFor();
    }
    if (scene === "reading") {
      const trigger = page.getByRole("button", { name: "読書室を開く" });
      await trigger.scrollIntoViewIfNeeded();
      // Opening a skipped chapter above this entry changes document geometry.
      // Match the navigation harness: settle after scrolling, before clicking.
      await page.waitForFunction(
        () => {
          const rect = document
            .querySelector(".dream-reading-entry button")
            .getBoundingClientRect();
          const key = [
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            scrollY,
            document.documentElement.scrollHeight,
          ].join(":");
          const previous = window.__tabletProbeEntry;
          window.__tabletProbeEntry = {
            key,
            count: previous?.key === key ? previous.count + 1 : 0,
          };
          return window.__tabletProbeEntry.count >= 3;
        },
        undefined,
        { polling: 100 },
      );
      await trigger.click();
      await page.locator(".dream-reading-room[open]").waitFor();
      if (process.env.INJECT_READING_ROOM_CSS === "1") {
        await page.addStyleTag({
          content: await readFile(
            new URL("../src/components/dream-chapter/dream-reading-room.css", import.meta.url),
            "utf8",
          ),
        });
      }
    }
    if (css) await page.addStyleTag({ content: css });
    if (scene === "gallery" && process.env.AUDIT_LONG_TITLE === "1") {
      // DOM-only fixture: no save, gallery write or network mutation.
      await page.locator("#gallery-viewer-title").evaluate((node) => {
        const title = document.createElement("span");
        title.className = "gallery-personal-title";
        title.textContent = "長い共有タイトルの折り返しを確認するための表示".repeat(4).slice(0, 80);
        node.append(title);
      });
    }
    await page.waitForTimeout(350);
    const metrics = await page.evaluate(() => {
      const selectors = [
        ".hero",
        ".poster-stage",
        ".hero-copy",
        ".manager-slot-grid",
        ".wa-roster",
        ".dossier-identity",
        ".manager-page",
        ".search-categories",
        ".search-categories button",
        ".dream-reading-workspace",
        ".dream-reading-sidebar",
        ".dream-reading-scroll",
        ".dream-reading-paper",
        ".dream-reading-paper > [data-room-paragraph]",
        ".dream-reading-position-select > span",
        ".gallery-viewer-header",
        ".gallery-close-primary",
        ".gallery-image-viewport",
        ".gallery-viewer-footer button",
      ];
      selectors.push(
        ".search-result-card",
        ".search-result-title",
        ".dxl-art",
        ".dream-reading-room button",
        ".dream-reading-room select",
        ".dream-reading-room summary",
      );
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        elements: Object.fromEntries(
          selectors.map((selector) => [
            selector,
            [...document.querySelectorAll(selector)].slice(0, 8).map((node) => {
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                clientWidth: node.clientWidth,
                scrollWidth: node.scrollWidth,
                fontSize: style.fontSize,
                minHeight: style.minHeight,
                boxSizing: style.boxSizing,
                padding: style.padding,
                columns: style.gridTemplateColumns,
                stageWidth: style.getPropertyValue("--sd-stage-w"),
                display: style.display,
              };
            }),
          ]),
        ),
      };
    });
    await page.screenshot({ path: `${output}/${width}x${height}.png` });
    if (scene === "gallery") {
      await page.locator(".gallery-viewer-tools summary").click();
      if (process.env.AUDIT_LONG_TITLE === "1") {
        await page.keyboard.press("Tab");
        await page.locator(".gallery-close-primary").focus();
        for (let tab = 0; tab < 35; tab++) {
          await page.keyboard.press("Tab");
          if (
            await page.evaluate(() =>
              Boolean(document.activeElement?.closest(".gallery-viewer-footer")),
            )
          )
            break;
        }
      }
      metrics.expanded = await page.locator(".gallery-close-primary").evaluate((node) => {
        const r = node.getBoundingClientRect();
        const header = node.closest(".gallery-viewer-header").getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          headerTop: header.top,
          headerBottom: header.bottom,
        };
      });
      await page.screenshot({ path: `${output}/${width}x${height}-tools.png` });
      if (process.env.AUDIT_FOCUS === "1") {
        await page.keyboard.press("Tab");
        await page.locator(".gallery-close-primary").focus();
        metrics.focus = await page.locator(".gallery-close-primary").evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            visible: node.matches(":focus-visible"),
            offset: style.outlineOffset,
            width: style.outlineWidth,
          };
        });
        await page.screenshot({ path: `${output}/${width}x${height}-focus.png` });
      }
    }
    assert.ok(metrics.overflow <= 2, `overflow at ${width}x${height}`);
    assert.deepEqual(errors, []);
    if (process.env.VERIFY_REFINEMENTS === "1") {
      const first = (selector) => metrics.elements[selector]?.[0];
      if (scene === "dossier" && width === 1024 && height === 600) {
        assert.ok(first(".dossier-identity").width >= 480, "wide-fold text measure");
      }
      if (scene === "world" && width === 900 && height === 651) {
        assert.ok(first(".hero").height < 900, "compact hero must not stack into 1200px");
      }
      if (scene === "reading" && width === 700 && height === 540) {
        assert.ok(
          first(".dream-reading-paper > [data-room-paragraph]").width >= 435,
          "compact paper measure",
        );
      }
      if (scene === "reading") {
        const label = first(".dream-reading-position-select > span");
        if (label?.width) assert.ok(parseFloat(label.fontSize) >= 12, "readable position label");
      }
      if (width >= 560 && width <= 1366 && height >= 501) {
        const controls =
          scene === "reading"
            ? [
                ".dream-reading-room button",
                ".dream-reading-room select",
                ".dream-reading-room summary",
              ]
            : scene === "gallery"
              ? [".gallery-close-primary", ".gallery-viewer-footer button"]
              : scene === "search"
                ? [".search-categories button"]
                : [];
        for (const selector of controls) {
          for (const node of metrics.elements[selector] || []) {
            if (node.width > 0 && node.height > 0)
              assert.ok(node.height >= 48, `${selector}: 48px touch target`);
          }
        }
      }
      if (
        scene === "gallery" &&
        width >= 560 &&
        width <= 1100 &&
        height >= 501 &&
        height <= 650 &&
        width > height &&
        width / height <= 2
      ) {
        if (process.env.AUDIT_LONG_TITLE !== "1") {
          assert.ok(first(".gallery-viewer-header").height <= 62, "compact closed header");
        }
        assert.ok(
          metrics.expanded.y >= metrics.expanded.headerTop - 1 &&
            metrics.expanded.bottom <= metrics.expanded.headerBottom + 1,
          "expanded close control stays in header",
        );
        if (metrics.focus) {
          assert.equal(metrics.focus.visible, true);
          assert.equal(metrics.focus.offset, "-3px");
        }
      }
    }
    report.push({ width, height, ...metrics });
    console.log(`PASS ${scene} ${width}x${height}`);
    await context.close();
  }
} finally {
  await writeFile(
    `${output}/geometry.json`,
    JSON.stringify({ scene, engine, injected: Boolean(css), report }, null, 2),
  );
  await browser.close();
}
