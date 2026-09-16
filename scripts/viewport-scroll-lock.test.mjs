import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/viewport-scroll-lock.js", import.meta.url), "utf8");
function mount() {
  const style = () => ({ overflow: "", overscrollBehavior: "", position: "", top: "", width: "", scrollBehavior: "smooth" });
  const root = { style: style(), dataset: {} };
  const body = { style: style() };
  const win = new EventTarget();
  const positions = [];
  Object.assign(win, { scrollY: 480, scrollX: 0, scrollTo: (position) => positions.push(position) });
  const context = { document: { documentElement: root, body }, window: win };
  runInNewContext(source.replace("export function", "function"), context);
  const blocked = (type = "touchmove") => {
    const event = new Event(type, { cancelable: true });
    win.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { root, body, positions, blocked, lock: context.acquireViewportScrollLock };
}

for (const reverse of [false, true]) {
  test(`nested menu/announcement restores once in ${reverse ? "reverse" : "opening"} close order`, () => {
    const ui = mount();
    ui.root.style.overflow = "clip";
    const releases = [ui.lock(), ui.lock()];
    if (reverse) releases.reverse();
    releases[0]();
    releases[0]();
    assert.equal(ui.root.style.overflow, "hidden");
    assert.equal(ui.body.style.overflow, "hidden");
    releases[1]();
    assert.equal(ui.root.style.overflow, "clip");
    assert.equal(ui.body.style.overflow, "");
    assert.equal(ui.positions.length, 0);
  });
}

test("two rail owners retain gesture blocking until the final release", () => {
  const ui = mount();
  const first = ui.lock({ rail: true });
  const second = ui.lock({ rail: true });
  first();
  assert.equal(ui.root.dataset.railLock, "true");
  assert.equal(ui.blocked(), true);
  assert.equal(ui.blocked("wheel"), true);
  second();
  assert.equal(ui.root.dataset.railLock, undefined);
  assert.equal(ui.blocked(), false);
  assert.equal(ui.blocked("wheel"), false);
  assert.equal(ui.root.style.overflow, "");
});

test("releasing a slider inside a modal unlocks inner scrolling, not the background", () => {
  const ui = mount();
  const modal = ui.lock();
  const rail = ui.lock({ rail: true });
  rail();
  assert.equal(ui.blocked(), false);
  assert.equal(ui.root.style.overflow, "hidden");
  modal();
  assert.equal(ui.root.style.overflow, "");
});

test("Dream fixed viewport survives nested owners without intermediate jumps", () => {
  const ui = mount();
  const first = ui.lock();
  const dream = ui.lock({ freezeBody: true });
  const rail = ui.lock({ rail: true });
  dream();
  rail();
  assert.equal(ui.positions.length, 0);
  assert.equal(ui.body.style.position, "fixed");
  first();
  assert.equal(ui.body.style.position, "");
  assert.equal(ui.body.style.top, "");
  assert.equal(ui.positions.length, 1);
  assert.equal(ui.positions[0].top, 480);
  assert.equal(ui.positions[0].behavior, "instant");
  assert.equal(ui.root.style.scrollBehavior, "smooth");
  dream();
  assert.equal(ui.positions.length, 1);
});

test("rotation and width changes cancel capture; toolbar height changes do not", () => {
  const boot = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");
  assert.match(boot, /addEventListener\('orientationchange', cancel\)/);
  assert.match(boot, /removeEventListener\('orientationchange', cancel\)/);
  assert.match(boot, /if \(window.innerWidth === viewportWidth\) return/);
  assert.match(boot, /removeEventListener\('resize', handleViewportResize\)/);
});
