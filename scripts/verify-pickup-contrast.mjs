import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const baseUrl = checkedUrl(process.env.BASE_URL || process.argv[2] || "http://localhost:8082");
const outputDir = resolve(
  process.env.PICKUP_SCREENSHOT_DIR || resolve(process.cwd(), "screenshots", "pickup-contrast"),
);
mkdirSync(outputDir, { recursive: true });

// Keep the source inventory next to the browser assertions so a stale route or
// fixture cannot make this pass while the actual plus controls disappear.
const sourceFiles = [
  "src/components/world/slide-open-control.tsx",
  "src/components/world/manager-stub.tsx",
  "src/components/world/world-home.tsx",
];
for (const file of sourceFiles) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  assert.ok(source.length > 0, `${file}: source file is empty`);
}
assert.match(
  readFileSync(resolve(process.cwd(), "src/components/world/slide-open-control.tsx"), "utf8"),
  /className="ios-slide-open-thumb"[\s\S]*?kind="plus"/,
  "slide-open-control.tsx: expected the shared thumb and plus glyph",
);
assert.match(
  readFileSync(resolve(process.cwd(), "src/components/world/manager-stub.tsx"), "utf8"),
  /className="form-pickup-plus"/,
  "manager-stub.tsx: expected the Saga/FormPickup plus control",
);
assert.match(
  readFileSync(resolve(process.cwd(), "src/components/world/world-home.tsx"), "utf8"),
  /className="episode-pickup-plus ios26-glass"/,
  "world-home.tsx: expected the episode pickup plus selector",
);

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "1024x768", width: 1024, height: 768 },
];

function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const channels = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (channels.length < 3 || channels.slice(0, 3).some((channel) => !Number.isFinite(channel))) {
    return null;
  }
  return {
    r: channels[0],
    g: channels[1],
    b: channels[2],
    alpha: channels.length >= 4 && Number.isFinite(channels[3]) ? channels[3] : 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const brighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (brighter + 0.05) / (darker + 0.05);
}

async function inspectControls(
  page,
  viewportName,
  state,
  selectors = [".ios-slide-open-thumb", ".episode-pickup-plus"],
) {
  const controls = [];
  const contactState = state === "holding" || state === "dragging";
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = contactState ? 1 : await locator.count();
    assert.ok(count > 0, `${viewportName}/${state}: missing ${selector}`);
    for (let index = 0; index < count; index++) {
      const target = locator.nth(index);
      // content-visibility:auto can leave offscreen controls with a zero or
      // placeholder rect. Materialize each target before reading styles.
      if (!contactState) {
        await target.scrollIntoViewIfNeeded();
        await page.waitForTimeout(24);
      }
      const control = await target.evaluate((node) => {
        const style = getComputedStyle(node);
        const glyph = node.querySelector("svg");
        const glyphStyle = glyph ? getComputedStyle(glyph) : null;
        const rect = node.getBoundingClientRect();
        const host = node.matches(".ios-slide-open-thumb")
          ? node.closest(".ios-slide-open")?.getBoundingClientRect()
          : node.closest(".episode-card")?.getBoundingClientRect();
        return {
          selector: node.matches(".ios-slide-open-thumb") ? "thumb" : "episode-plus",
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          border: style.borderTopColor,
          glyph: glyphStyle?.color || "",
          alpha: style.opacity,
          width: rect.width,
          height: rect.height,
          inside: Boolean(
            host &&
            rect.left >= host.left - 1 &&
            rect.right <= host.right + 1 &&
            rect.top >= host.top - 1 &&
            rect.bottom <= host.bottom + 1,
          ),
        };
      });
      controls.push(control);
    }
  }
  assert.ok(controls.length > 0, `${viewportName}/${state}: no pickup plus controls found`);
  for (const control of controls) {
    const background = parseColor(control.background);
    const glyph = parseColor(control.glyph);
    assert.ok(background, `${viewportName}/${state}: invalid background ${control.background}`);
    assert.ok(glyph, `${viewportName}/${state}: invalid glyph ${control.glyph}`);
    assert.ok(
      background.alpha >= 0.99,
      `${viewportName}/${state}: background is translucent (${control.selector}: ${control.background})`,
    );
    assert.ok(
      glyph.r >= 245 && glyph.g >= 245 && glyph.b >= 245,
      `${viewportName}/${state}: glyph is not white`,
    );
    assert.ok(
      contrastRatio(background, glyph) >= 3,
      `${viewportName}/${state}: contrast ${contrastRatio(background, glyph).toFixed(2)} < 3`,
    );
    assert.equal(
      control.backgroundImage,
      "none",
      `${viewportName}/${state}: decorative image remains`,
    );
    assert.equal(control.inside, true, `${viewportName}/${state}: control escaped its host`);
    assert.ok(
      control.width >= 40 && control.height >= 40,
      `${viewportName}/${state}: control too small`,
    );
  }
  return controls;
}

async function touchDragState(page, viewportName) {
  const rail = page.locator(".ios-slide-open").first();
  // Reposition after offscreen content-visibility sections materialize. A single
  // scrollIntoView can otherwise leave the thumb underneath the sticky header.
  for (let attempt = 0; attempt < 2; attempt++) {
    await rail.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(200);
  }
  const thumb = rail.locator(".ios-slide-open-thumb");
  const box = await thumb.boundingBox();
  assert.ok(box, `${viewportName}: shared thumb is not visible`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  assert.equal(
    await rail.evaluate(
      (node, position) => node.contains(document.elementFromPoint(position.x, position.y)),
      point,
    ),
    true,
    `${viewportName}: touch start must hit the visible rail`,
  );
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    assert.equal(
      await rail.evaluate(
        (node) => node.dataset.holding === "true" || node.dataset.dragging === "true",
      ),
      true,
      `${viewportName}: contact state missing`,
    );
    // The 60 ms hold automatically advances to dragging. Use the stable first
    // thumb locator; a [data-holding=true] locator can disappear mid-measurement.
    await inspectControls(page, viewportName, "holding", [".ios-slide-open-thumb"]);
    await page.screenshot({
      path: checkedOutputPath(resolve(outputDir, `${viewportName}-holding.png`), [outputDir]),
    });
    await page.waitForTimeout(90);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x + 16, y: point.y }],
    });
    await page.waitForTimeout(20);
    assert.equal(
      await rail.getAttribute("data-dragging"),
      "true",
      `${viewportName}: drag state missing`,
    );
    await inspectControls(page, viewportName, "dragging", [".ios-slide-open-thumb"]);
    await page.screenshot({
      path: checkedOutputPath(resolve(outputDir, `${viewportName}-dragging.png`), [outputDir]),
    });
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  }
  await page.waitForTimeout(320);
  assert.equal(
    await rail.getAttribute("data-dragging"),
    "false",
    `${viewportName}: drag did not reset`,
  );
  assert.equal(
    await rail.getAttribute("data-completing"),
    "false",
    `${viewportName}: drag completed unexpectedly`,
  );
}

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: viewport.width < 600,
    });
    try {
      await page.goto(new URL("/world", baseUrl).href, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await page.locator(".ios-slide-open").first().waitFor({ state: "attached", timeout: 15_000 });
      await page.waitForTimeout(900);
      await inspectControls(page, viewport.name, "normal");
      await page.screenshot({
        path: checkedOutputPath(resolve(outputDir, `${viewport.name}-normal.png`), [outputDir]),
      });
      await touchDragState(page, viewport.name);

      // FormPickup is rendered on the actual Saga rider route; source-level
      // class inventory alone cannot prove that this control is present and
      // painted in the running application.
      await page.goto(new URL("/riders/saga", baseUrl).href, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await page
        .locator(".form-pickup-plus")
        .first()
        .waitFor({ state: "attached", timeout: 15_000 });
      await page.waitForTimeout(500);
      await inspectControls(page, viewport.name, "saga-form-pickup", [
        ".form-pickup-plus .ios-slide-open-thumb",
      ]);
      await page.screenshot({
        path: checkedOutputPath(resolve(outputDir, `${viewport.name}-saga-form-pickup.png`), [
          outputDir,
        ]),
      });
      console.log(
        `PASS ${viewport.name}: pickup contrast, bounds, holding, dragging, Saga FormPickup, screenshots`,
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
