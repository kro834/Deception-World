import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const title = read("../src/components/cinematic/title-sequence.tsx");
const titlePart = read("../source-parts/src/components/cinematic/title-sequence.tsx/01.part");
const styles = read("../src/styles.css");
const audio = read("../src/lib/cinematic-audio.ts");
const audioPart = read("../source-parts/src/lib/cinematic-audio.ts/01.part");

test("the opening composes a deterministic multi-plane cinematic reveal", () => {
  assert.match(title, /function CinematicDepthField\(\)/);
  assert.match(title, /className="cine-camera"/);
  assert.match(title, /className="cine-aperture"/);
  assert.match(title, /className="cine-impact-bloom"/);
  assert.match(title, /Array\.from\(\{ length: 12 \}/);
  assert.match(title, /cine-logo-echo cine-logo-echo-ice/);
  assert.match(title, /cine-logo-echo cine-logo-echo-gold/);
  assert.match(title, /className="cine-hud-orbits"/);
  assert.equal(titlePart, title);
});

test("the richer opening keeps its original runtime and adaptive render budget", () => {
  assert.match(title, /const SEQUENCE_MS = 5800/);
  assert.match(title, /preload="none"/);
  assert.match(title, /deviceMemory\?: number/);
  assert.match(title, /economyOpening \? " is-economy-opening"/);
  assert.match(styles, /animation: cinematic-camera-path var\(--seq\)/);
  assert.match(styles, /\.cine-stage\.is-economy-opening \.cine-depth-grid/);
  assert.match(styles, /\.cine-prism-field > i:nth-child\(n \+ 7\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.cine-impact-bloom,[\s\S]*?\.cine-logo-echo,[\s\S]*?\.cine-hud-orbits/);
});

test("the synthesized score follows the visual reveal without new media assets", () => {
  assert.match(audio, /compact logo-impact transient/);
  assert.match(audio, /impact\.frequency\.setValueAtTime\(86, t0 \+ 1\.5\)/);
  assert.match(audio, /sparkFilter\.frequency\.value = 1280/);
  assert.match(audio, /shimmerGain\.gain\.setValueAtTime\(0, t0 \+ 3\.15\)/);
  assert.equal(audioPart, audio);
});
