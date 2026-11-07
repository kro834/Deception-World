import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const source = read("src/lib/cinematic-audio.ts");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

// A mute-only regression would still open a graph, start timers, or request
// media. Throw even on reading these APIs, not just on playing a source.
function runtime({ ssr = false } = {}) {
  const attempted = [];
  const exports = {};
  const context = { exports };
  if (!ssr) {
    for (const name of [
      "window",
      "document",
      "navigator",
      "AudioContext",
      "webkitAudioContext",
      "OfflineAudioContext",
      "Audio",
      "fetch",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "localStorage",
      "sessionStorage",
      "speechSynthesis",
    ]) {
      Object.defineProperty(context, name, {
        get() {
          attempted.push(name);
          throw new Error(`removed sound accessed ${name}`);
        },
      });
    }
  }
  runInNewContext(code, context);
  return { create: exports.createCinematicScore, attempted };
}

test("the retired adapter is safe before hydration without browser APIs", async () => {
  const ui = runtime({ ssr: true });
  const score = ui.create();
  assert.equal(await score.unlock(), false);
  score.start();
  score.stop();
  assert.equal(score.muted(), true);
});

test("legacy start and unlock cannot construct any audio, request media, or schedule work", async () => {
  const ui = runtime();
  const score = ui.create();
  score.start();
  assert.equal(await score.unlock(), false);
  score.stop();
  assert.deepEqual(ui.attempted, []);
});

test("a legacy unmute call cannot re-enable sound or store a preference", async () => {
  const ui = runtime();
  const score = ui.create();
  for (const muted of [false, true, false]) {
    score.setMuted(muted);
    assert.equal(score.muted(), true);
    score.start();
    assert.equal(await score.unlock(), false);
  }
  assert.deepEqual(ui.attempted, []);
});

test("repeated legacy replays and stops stay inert without leaving timers or resources", async () => {
  const ui = runtime();
  const score = ui.create();
  for (let run = 0; run < 50; run++) {
    score.start();
    score.start();
    score.stop();
    score.stop();
    assert.equal(await score.unlock(), false);
  }
  assert.deepEqual(ui.attempted, []);
});

test("stopping before a pending legacy unlock resolves cannot revive a sound", async () => {
  const ui = runtime();
  const score = ui.create();
  const pending = score.unlock();
  score.stop();
  score.setMuted(false);
  score.start();
  assert.equal(await pending, false);
  assert.deepEqual(ui.attempted, []);
});

test("separate stale consumers cannot share or retain an audio context", async () => {
  const ui = runtime();
  const scores = Array.from({ length: 20 }, () => ui.create());
  for (const score of scores) {
    score.setMuted(false);
    score.start();
    assert.equal(await score.unlock(), false);
    score.stop();
  }
  assert.deepEqual(ui.attempted, []);
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?[jt]sx?)$/.test(path) ? [path] : [];
  });
}

test("all active source has no audio engine imports, constructors, elements, speech, or media requests", () => {
  const optionalQuoteAmbience = fileURLToPath(
    new URL("src/components/gallery-tours/quote-ambience.tsx", root),
  );
  for (const path of sourceFiles(fileURLToPath(new URL("src/", root)))) {
    const text = readFileSync(path, "utf8");
    if (path === optionalQuoteAmbience) {
      assert.match(text, /function QuoteAmbience\s*\(/);
      assert.match(text, /onClick=\{toggle\}/);
      assert.match(text, /new Audio\(AMBIENCE_URL\)/);
      assert.match(text, /audio\.preload = "none"/);
      assert.match(text, /audio\.volume = 0\.12/);
      assert.match(text, /audio\.play\(\)/);
      assert.match(text, /audio\.pause\(\)/);
      assert.match(text, /audio\.removeAttribute\("src"\)/);
      assert.match(text, /audio\.load\(\)/);
      assert.match(text, /window\.addEventListener\("pagehide"/);
      assert.match(text, /document\.addEventListener\("visibilitychange"/);
      assert.match(text, /return \(\) => \{[\s\S]*?clearPlayback\(false\);[\s\S]*?\};/);
      assert.match(text, /環境音を聴く/);
      assert.match(text, /環境音を止める/);
      assert.match(text, /この端末では環境音を再生できません/);
      assert.doesNotMatch(
        text,
        /<audio\b|\bautoplay\b|\.loop\s*=\s*true|setInterval\s*\(|setTimeout\s*\(|localStorage|sessionStorage|speechSynthesis|AudioContext|fetch\s*\(/i,
      );
      continue;
    }
    assert.doesNotMatch(
      text,
      /(?:from\s*|import\s*\(|require\s*\()["'][^"']*cinematic-audio|\b(?:webkitAudioContext|AudioContext|OfflineAudioContext|speechSynthesis|mediaSession)\b|new\s+(?:window\.)?Audio\s*\(|<audio\b|["'][^"'\n]*\.(?:mp3|wav|ogg|m4a|aac)(?:[?#][^"'\n]*)?["']/i,
      path,
    );
  }
  assert.doesNotMatch(
    read("src/components/cinematic/title-sequence.tsx"),
    /cine-always|Volume[2X]|toggleMute|soundLive|unlockAudio|音声を(?:オン|オフ)|SOUND|aria-keyshortcuts="M"|letter === "m"/,
  );
});

test("the quote ambience asset stays a short, compact mono WAV", () => {
  const wav = readFileSync(new URL("public/gallery-tours/quote-ambience-quiet.wav", root));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 5500);
  assert.equal(wav.readUInt16LE(34), 8);
  assert.ok(wav.length < 25_000);
  assert.ok(wav.readUInt32LE(40) / wav.readUInt32LE(24) < 5);
});

function quoteAmbienceRuntime() {
  const source = read("src/components/gallery-tours/quote-ambience.tsx");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  let hookIndex = 0;
  const states = [];
  const refs = [];
  let cleanup;
  let hasMounted = false;
  const instances = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    removeEventListener: (name) => documentListeners.delete(name),
  };
  const window = {
    addEventListener: (name, handler) => windowListeners.set(name, handler),
    removeEventListener: (name) => windowListeners.delete(name),
  };
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.removed = false;
      this.paused = false;
      this.loads = 0;
      this.preload = "auto";
      this.volume = 1;
      this.onended = null;
      this.onerror = null;
      this.playCalls = 0;
      this.playPromise = new Promise((resolve, reject) => {
        this.resolvePlay = resolve;
        this.rejectPlay = reject;
      });
      instances.push(this);
    }
    play() {
      this.playCalls += 1;
      return this.playPromise;
    }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.removed = true; }
    load() { this.loads += 1; }
  }
  const hooks = {
    useState(initial) {
      const index = hookIndex++;
      states[index] ??= initial;
      return [states[index], (value) => (states[index] = value)];
    },
    useRef(initial) {
      const index = hookIndex++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useEffect(effect) {
      if (!hasMounted) cleanup = effect();
    },
  };
  const jsxRuntime = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  };
  const exports = {};
  runInNewContext(code, {
    exports,
    require: (name) => (name === "react" ? hooks : name === "react/jsx-runtime" ? jsxRuntime : {}),
    Audio: FakeAudio,
    window,
    document,
    Promise,
  });
  function render() {
    hookIndex = 0;
    const tree = exports.QuoteAmbience();
    hasMounted = true;
    return tree;
  }
  return {
    render,
    instances,
    unmount: () => cleanup(),
    windowListeners,
    documentListeners,
    document,
  };
}

function ambienceButton(tree) {
  return tree.props.children[0];
}

test("quote ambience starts only on tap, tolerates repeated taps, and clears on end", async () => {
  const ui = quoteAmbienceRuntime();
  ambienceButton(ui.render()).props.onClick();
  const audio = ui.instances[0];
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.preload, "none");
  assert.equal(audio.volume, 0.12);
  assert.equal(ui.instances.length, 1);

  ambienceButton(ui.render()).props.onClick();
  assert.equal(audio.paused, true);
  assert.equal(audio.removed, true);
  assert.equal(audio.loads, 1);
  audio.resolvePlay();
  await audio.playPromise;
  assert.equal(ambienceButton(ui.render()).props.children, "環境音を聴く");
  assert.equal(ui.instances.length, 1);

  ambienceButton(ui.render()).props.onClick();
  const next = ui.instances[1];
  next.resolvePlay();
  await next.playPromise;
  assert.equal(ambienceButton(ui.render()).props.children, "環境音を止める");
  next.onended();
  assert.equal(next.paused, true);
  assert.equal(ambienceButton(ui.render()).props.children, "環境音を聴く");
});

test("failed quote ambience playback reports unavailability and allows retry", async () => {
  const ui = quoteAmbienceRuntime();
  ambienceButton(ui.render()).props.onClick();
  const audio = ui.instances[0];
  audio.rejectPlay(new Error("unsupported"));
  await audio.playPromise.catch(() => {});
  const failed = ui.render();
  assert.equal(failed.props.children[1].props.children, "この端末では環境音を再生できません。");
  assert.equal(audio.paused, true);
  ambienceButton(failed).props.onClick();
  assert.equal(ui.instances.length, 2);
});

test("quote ambience stops on pagehide, visibility loss, and unmount", async () => {
  for (const exit of ["pagehide", "visibilitychange", "unmount"]) {
    const ui = quoteAmbienceRuntime();
    ambienceButton(ui.render()).props.onClick();
    const audio = ui.instances[0];
    audio.resolvePlay();
    await audio.playPromise;
    if (exit === "pagehide") ui.windowListeners.get("pagehide")();
    else if (exit === "visibilitychange") {
      ui.document.visibilityState = "hidden";
      ui.documentListeners.get("visibilitychange")();
    } else ui.unmount();
    assert.equal(audio.paused, true, exit);
    assert.equal(audio.removed, true, exit);
    assert.equal(audio.loads, 1, exit);
  }
});

test("remaining cinematic video elements explicitly stay muted", () => {
  for (const path of [
    "src/components/cinematic/title-sequence.tsx",
    "src/components/cinematic/opening-handoff.tsx",
  ]) {
    const text = read(path);
    const videos = [...text.matchAll(/<video\b[\s\S]*?\/>/g)];
    assert.ok(videos.length > 0, path);
    for (const [video] of videos) assert.match(video, /\bmuted(?:\s|=)/, path);
  }
});

test("the existing atmosphere video contains only a visual track, never an audio track", () => {
  const mp4 = readFileSync(new URL("public/atmosphere.mp4", root));
  const handlers = [];
  function boxes(start, end) {
    for (let offset = start; offset + 8 <= end;) {
      let size = mp4.readUInt32BE(offset);
      const type = mp4.toString("ascii", offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        assert.ok(offset + 16 <= end);
        size = Number(mp4.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) size = end - offset;
      assert.ok(size >= header && offset + size <= end, `valid ${type} MP4 atom`);
      const payload = offset + header;
      if (["moov", "trak", "mdia"].includes(type)) boxes(payload, offset + size);
      if (type === "hdlr") {
        assert.ok(size >= header + 12);
        handlers.push(mp4.toString("ascii", payload + 8, payload + 12));
      }
      offset += size;
    }
  }
  boxes(0, mp4.length);
  assert.deepEqual(handlers, ["vide"]);
});
