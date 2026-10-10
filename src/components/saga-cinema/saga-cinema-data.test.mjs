import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./saga-cinema-data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ decoded = true, width = 853, legacy = false } = {}) {
  const images = [];
  class Image {
    constructor() {
      this.naturalWidth = width;
      images.push(this);
      if (legacy) this.decode = undefined;
    }
    set src(value) {
      this.source = value;
      if (legacy) queueMicrotask(() => (decoded ? this.onload() : this.onerror()));
    }
    decode() {
      return decoded ? Promise.resolve() : Promise.reject(new Error("Offline"));
    }
  }
  const exports = {};
  runInNewContext(compiled, { exports, Image, Promise, queueMicrotask });
  return { ...exports, images };
}

test("chapter wrapping stays valid across either end and large repeated navigation", () => {
  const data = fixture();
  for (const [input, output] of [
    [-1, 3],
    [4, 0],
    [-9, 3],
    [13, 1],
    [0, 0],
  ]) {
    assert.equal(data.cinemaWrap(input), output);
  }
});

test("chapter labels, full poster alternatives and downloads share the supplied film identity", () => {
  const data = fixture();
  const expected = [
    ["邂逅", "KAIKŌ", "第一部", "kaiko"],
    ["覚醒", "KAKUSEI", "第二部", "kakusei"],
    ["激情", "GEKIJŌ", "第三部", "gekijo"],
    ["終末", "SHŪMATSU", "第四部", "shumatsu"],
  ];
  expected.forEach(([title, roman, part, slug], index) => {
    const film = data.SAGA_CINEMA_FILMS[index];
    assert.equal(film.title, title);
    assert.equal(film.roman, roman);
    assert.equal(film.part, part);
    assert.equal(film.image, `/saga-cinema-assets/chapter-${index + 1}.jpg`);
    assert.equal(data.cinemaNumber(index), `0${index + 1}`);
    assert.equal(data.cinemaPosterAlt(index), `${part}『${title}』のポスター`);
    assert.equal(data.cinemaDownload(index), `kamen-rider-saga-${slug}.jpg`);
  });
});

test("poster readiness requires decoded pixels and reports failed or empty images", async () => {
  const loaded = fixture();
  await loaded.loadCinemaPoster(2);
  assert.equal(loaded.images[0].source, "/saga-cinema-assets/chapter-3.jpg");
  await assert.rejects(fixture({ decoded: false }).loadCinemaPoster(0), /Offline/);
  await assert.rejects(fixture({ width: 0 }).loadCinemaPoster(0), /Poster unavailable/);
});

test("browsers without decode use native image load/error events", async () => {
  await fixture({ legacy: true }).loadCinemaPoster(1);
  await assert.rejects(
    fixture({ legacy: true, decoded: false }).loadCinemaPoster(1),
    /Poster unavailable/,
  );
});
