import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/cinematic-audio.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function runtime({ suspended = false, rejectResume = false, available = true } = {}) {
  const contexts = [];
  const timers = new Map();
  let nextTimer = 1;
  class Param {
    value = 0;
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    cancelScheduledValues() {}
    setTargetAtTime(value) {
      this.value = value;
    }
  }
  class Node {
    gain = new Param();
    frequency = new Param();
    Q = new Param();
    started = false;
    stopped = false;
    disconnected = false;
    connect() {}
    disconnect() {
      this.disconnected = true;
    }
    start() {
      this.started = true;
    }
    stop(at) {
      if (at === undefined) this.stopped = true;
    }
  }
  class Context {
    state = suspended ? "suspended" : "running";
    currentTime = 1;
    sampleRate = 8;
    destination = {};
    nodes = [];
    resumes = [];
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return this.node();
    }
    createOscillator() {
      return this.node();
    }
    createBufferSource() {
      return this.node();
    }
    createBiquadFilter() {
      return this.node();
    }
    node() {
      const node = new Node();
      this.nodes.push(node);
      return node;
    }
    createBuffer(_channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    resume() {
      if (rejectResume) return Promise.reject(new Error("audio unavailable"));
      return new Promise((resolve) =>
        this.resumes.push(() => {
          this.state = "running";
          resolve();
        }),
      );
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  const exports = {};
  runInNewContext(code, {
    exports,
    AudioContext: available ? Context : undefined,
    window: {
      setTimeout: (callback) => {
        const id = nextTimer++;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  return {
    score: exports.createCinematicScore(),
    contexts,
    finishFades: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test("stopping while audio resumes cannot start a discarded opening score", async () => {
  const ui = runtime({ suspended: true });
  ui.score.start();
  ui.score.stop();
  ui.contexts[0].resumes.forEach((resolve) => resolve());
  await flush();
  assert.equal(ui.contexts[0].nodes.filter((node) => node.started).length, 0);
});

test("a fading old score cannot stop or mute a newer run", async () => {
  const ui = runtime();
  ui.score.start();
  await flush();
  const oldContext = ui.contexts[0];
  ui.score.stop();
  ui.score.start();
  await flush();
  const newContext = ui.contexts.at(-1);
  const newSources = newContext.nodes.filter((node) => node.started);
  ui.finishFades();
  assert.notEqual(newContext, oldContext);
  assert.ok(newSources.length > 0);
  assert.ok(newSources.every((node) => !node.stopped && !node.disconnected));
  ui.score.setMuted(true);
  assert.equal(newContext.nodes[0].gain.value, 0);
});

test("finishing a score disconnects its graph and releases the audio context", async () => {
  const ui = runtime();
  ui.score.start();
  await flush();
  const context = ui.contexts[0];
  ui.score.stop();
  ui.score.stop();
  ui.finishFades();
  assert.equal(context.state, "closed");
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.ok(context.nodes.filter((node) => node.started).every((node) => node.stopped));
});

test("unavailable or refused audio fails quietly instead of rejecting a gesture", async () => {
  const missing = runtime({ available: false });
  assert.equal(await missing.score.unlock(), false);
  const refused = runtime({ suspended: true, rejectResume: true });
  assert.equal(await refused.score.unlock(), false);
  refused.score.start();
  await flush();
  assert.equal(refused.contexts[0].nodes.length, 0);
});

test("muted preference survives a restart and repeated start is idempotent", async () => {
  const ui = runtime();
  ui.score.setMuted(true);
  ui.score.start();
  ui.score.start();
  await flush();
  assert.equal(ui.contexts.length, 1);
  assert.equal(ui.contexts[0].nodes[0].gain.value, 0);
  const count = ui.contexts[0].nodes.length;
  ui.score.start();
  await flush();
  assert.equal(ui.contexts[0].nodes.length, count);
  ui.score.stop();
  ui.finishFades();
  ui.score.start();
  await flush();
  assert.equal(ui.contexts.at(-1).nodes[0].gain.value, 0);
});

test("an interrupted audio context is resumed by the next user gesture", async () => {
  const ui = runtime();
  assert.equal(await ui.score.unlock(), true);
  const context = ui.contexts[0];
  context.state = "interrupted";
  const pending = ui.score.unlock();
  assert.equal(context.resumes.length, 1, "interrupted must not be mistaken for ready audio");
  context.resumes[0]();
  assert.equal(await pending, true);
  assert.equal(context.state, "running");
  assert.equal(ui.contexts.length, 1);
});
