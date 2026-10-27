import assert from "node:assert/strict";
import test from "node:test";
import { mountFarFromAssembly } from "../src/lib/far-from-assembly.ts";
import { mountMetaUnitasAssembly } from "../src/lib/meta-unitas-assembly.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const factories = [
  ["Far From", mountFarFromAssembly, "mountFarFromAssemblyEngine"],
  ["Meta Unitas", mountMetaUnitasAssembly, "mountMetaUnitasAssemblyEngine"],
];
function fixture(mount, exportName, { covered = true, deferred = false } = {}) {
  const idle = new Map(), observers = [], pending = [];
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: { dataset: covered ? { routeCover: "covering" } : {} } });
  const host = Object.assign(new EventTarget(), { ownerDocument: document, dataset: {} });
  let serial = 0, imports = 0, mounts = 0, releases = 0;
  const module = { [exportName]: () => { mounts++; host.dataset.rznLoad = "ready"; return () => { releases++; }; } };
  const environment = Object.assign(new EventTarget(), {
    document, navigator: {},
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    requestIdleCallback: (callback) => { idle.set(++serial, callback); return serial; },
    cancelIdleCallback: (id) => idle.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(_target, options) { this.attributes = options.attributeFilter; }
      disconnect() { this.disconnected = true; }
    },
  });
  const dispose = mount(host, { environment, load: () => {
    imports++; return deferred ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve(module);
  } });
  return {
    host, document, observers, dispose,
    get imports() { return imports; }, get mounts() { return mounts; }, get releases() { return releases; },
    get queued() { return idle.size; },
    cover(value) {
      if (value) document.documentElement.dataset.routeCover = "covering";
      else delete document.documentElement.dataset.routeCover;
      observers.forEach((observer) => observer.callback());
    },
    finish(index = 0) { pending[index](module); },
    async flush() { const callbacks = [...idle.values()]; idle.clear(); callbacks.forEach((callback) => callback()); await tick(); },
  };
}

for (const [name, mount, exportName] of factories) {
  test(`${name}: page import and engine mount wait for the entry cover to release`, async () => {
    const ui = fixture(mount, exportName); await ui.flush();
    assert.equal(ui.imports, 0); assert.equal(ui.mounts, 0); assert.equal(ui.queued, 0);
    assert.ok(ui.observers[0].attributes.includes("data-route-cover"));
    ui.cover(false); await ui.flush();
    assert.equal(ui.imports, 1); assert.equal(ui.mounts, 1);
    ui.cover(true); ui.cover(false); await ui.flush();
    assert.equal(ui.mounts, 1, "retained page engines must not mount twice");
    assert.equal(ui.host.dataset.rznLoad, "ready");
    ui.dispose(); assert.equal(ui.releases, 1); assert.ok(ui.observers.every((observer) => observer.disconnected));
  });

  test(`${name}: a cover arriving during import prevents a late mount and resumes on release`, async () => {
    const ui = fixture(mount, exportName, { covered: false, deferred: true }); await ui.flush();
    assert.equal(ui.imports, 1); ui.cover(true); ui.finish(); await tick();
    assert.equal(ui.mounts, 0);
    ui.cover(false); await ui.flush(); ui.finish(1); await tick();
    assert.equal(ui.mounts, 1); ui.dispose(); assert.equal(ui.releases, 1);
  });

  test(`${name}: leaving during the cover cancels pending idle work and never mounts afterwards`, async () => {
    const ui = fixture(mount, exportName); ui.cover(false); assert.equal(ui.queued, 1);
    ui.cover(true); assert.equal(ui.queued, 0);
    ui.dispose(); await ui.flush(); assert.equal(ui.mounts, 0);
  });

  test(`${name}: unmounting during import ignores the eventual module`, async () => {
    const ui = fixture(mount, exportName, { covered: false, deferred: true }); await ui.flush();
    ui.dispose(); ui.finish(); await tick(); assert.equal(ui.mounts, 0); assert.equal(ui.releases, 0);
  });
}

test("Far From retains an explicit play intent during the cover and starts it on release", async () => {
  const ui = fixture(mountFarFromAssembly, "mountFarFromAssemblyEngine");
  ui.host.dispatchEvent(new Event("rexonance:assembly-wake")); await tick();
  assert.equal(ui.imports, 0);
  ui.cover(false); await tick(); assert.equal(ui.mounts, 1); ui.dispose();
});
