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
  for (const path of sourceFiles(fileURLToPath(new URL("src/", root)))) {
    const text = readFileSync(path, "utf8");
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
