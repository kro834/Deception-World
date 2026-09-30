import assert from "node:assert/strict";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const browser = await chromium.launch({ channel: "chrome" });
const modifier = process.platform === "darwin" ? "Meta" : "Control";

try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/characters/terra", base).href);
    await page.waitForFunction(() => document.documentElement.dataset.scrollMotionReady === "true");
    // The parent app currently has few text controls. Exercise its real global
    // capture listener with temporary editable DOM fixtures, not app content.
    await page.evaluate(() => {
      const fixture = document.createElement("section");
      fixture.id = "clipboard-editing-fixture";
      for (const type of [
        "text",
        "search",
        "email",
        "url",
        "tel",
        "password",
        "number",
        "range",
        "radio",
      ]) {
        const input = document.createElement("input");
        input.type = type;
        input.id = `fixture-${type}`;
        fixture.append(input);
      }
      for (const [id, attribute] of [
        ["readonly", "readonly"],
        ["disabled", "disabled"],
      ]) {
        const input = document.createElement("input");
        input.id = `fixture-${id}`;
        input.setAttribute(attribute, "");
        fixture.append(input);
      }
      const textarea = document.createElement("textarea");
      textarea.id = "fixture-textarea";
      fixture.append(textarea);
      const editable = document.createElement("div");
      editable.contentEditable = "true";
      editable.id = "fixture-editable";
      const nested = document.createElement("span");
      nested.id = "fixture-nested-editable";
      nested.textContent = "user input";
      editable.append(nested);
      const protectedChild = document.createElement("span");
      protectedChild.contentEditable = "false";
      protectedChild.id = "fixture-noneditable";
      protectedChild.textContent = "protected text";
      editable.append(protectedChild);
      fixture.append(editable);
      for (const [id, value] of [
        ["empty-editable", ""],
        ["plaintext-editable", "plaintext-only"],
      ]) {
        const field = document.createElement("div");
        field.setAttribute("contenteditable", value);
        field.id = `fixture-${id}`;
        fixture.append(field);
      }
      const fieldset = document.createElement("fieldset");
      fieldset.disabled = true;
      const fieldsetInput = document.createElement("input");
      fieldsetInput.id = "fixture-fieldset-disabled";
      fieldset.append(fieldsetInput);
      fixture.append(fieldset);
      document.body.append(fixture);
    });
    const results = await page.evaluate(() => {
      const editable = [
        "text",
        "search",
        "email",
        "url",
        "tel",
        "password",
        "number",
        "textarea",
        "editable",
        "nested-editable",
        "empty-editable",
        "plaintext-editable",
      ];
      const protectedIds = [
        "readonly",
        "disabled",
        "fieldset-disabled",
        "range",
        "radio",
        "noneditable",
      ];
      const failures = [];
      for (const [ids, permitted] of [
        [editable, true],
        [protectedIds, false],
      ]) {
        for (const id of ids) {
          const target = document.getElementById(`fixture-${id}`);
          if (permitted && getComputedStyle(target).userSelect !== "text") {
            failures.push({ id, userSelect: getComputedStyle(target).userSelect });
          }
          if (
            ["readonly", "disabled", "fieldset-disabled", "noneditable"].includes(id) &&
            getComputedStyle(target).userSelect !== "none"
          ) {
            failures.push({ id, userSelect: getComputedStyle(target).userSelect });
          }
          for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
            const event = new Event(type, { bubbles: true, cancelable: true });
            const allowed = target.dispatchEvent(event);
            if (allowed !== (permitted && type !== "dragstart")) {
              failures.push({ id, type, allowed });
            }
          }
          for (const key of ["c", "x", "v", "Insert"]) {
            const event = new KeyboardEvent("keydown", {
              key,
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            });
            if (target.dispatchEvent(event) !== permitted) failures.push({ id, key });
          }
        }
      }
      for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
        if (document.body.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))) {
          failures.push({ id: "body", type });
        }
      }
      return failures;
    });
    assert.deepEqual(
      results,
      [],
      "editable fixtures must retain clipboard access and protected text must not",
    );
    const input = page.locator("#fixture-text");
    await input.fill("user-authored input");
    await input.evaluate((node) => node.select());
    await page.keyboard.press(`${modifier}+C`);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "user-authored input");
    await page.evaluate(() => navigator.clipboard.writeText("pasted input"));
    await input.focus();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+V`);
    await page.waitForFunction(
      () => document.getElementById("fixture-text").value === "pasted input",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: editable fixtures, native clipboard shortcuts, protected body/readonly/disabled and drag`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
