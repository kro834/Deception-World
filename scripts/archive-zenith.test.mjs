import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/* The archive's line breaks (public/archive-zenith.js): figures break after
   their separators, form names between their words, and short Japanese
   lines by phrase in every engine. Only <span> and <wbr> are added; the
   owner's text never changes. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("public/archive-zenith.js");
const sheet = read("public/archive-zenith.css");

function breaks() {
  const window = { CSS: { supports: () => false }, requestAnimationFrame: () => 0 };
  const document = { readyState: "loading", addEventListener: () => {} };
  vm.runInContext(source, vm.createContext({ window, document }), {
    filename: "archive-zenith.js",
  });
  // The pieces come from another realm: read them as plain data.
  const plain = (fn) => (value) => JSON.parse(JSON.stringify(fn(value)));
  const { glueParts, phraseParts, nameParts } = window.ArchiveZenithBreaks;
  return {
    glueParts: plain(glueParts),
    phraseParts: plain(phraseParts),
    nameParts: plain(nameParts),
  };
}

const text = (parts) =>
  parts.map((part) => (typeof part === "string" ? part : (part.glue ?? part.join ?? ""))).join("");

// Every figure value and label of both archives, as the documents print them.
function figures() {
  const values = new Set();
  for (const kind of ["saga", "realm"]) {
    const html = read(`archives/${kind}-form-archive-standalone.html`);
    for (const [, label, value] of html.matchAll(
      /<span class="text-small text-muted">([^<]*)<\/span><span class="spec-value">([^<]*)<\/span>/g,
    )) {
      values.add(label);
      values.add(value);
    }
  }
  return [...values].filter((value) => / [/+⇄] /u.test(value));
}

test("figures break after their separators and never change", () => {
  const { glueParts } = breaks();
  const all = figures();
  assert.ok(all.length > 40, `figures with separators: ${all.length}`);
  for (const value of all) {
    const parts = glueParts(value);
    assert.ok(parts, value);
    assert.equal(text(parts), value, "the text is the owner's");
    // A line may start only after a space outside a glued run: no piece of
    // plain text left between runs begins with a separator.
    for (const part of parts) {
      if (typeof part === "string") assert.doesNotMatch(part, /^\s*[/+⇄]/u, value);
    }
  }
  assert.deepEqual(glueParts("1.00× / 1.00× / 1.00× / 1.00×"), [
    { glue: "1.00× /" },
    " ",
    { glue: "1.00× /" },
    " ",
    { glue: "1.00× /" },
    " 1.00×",
  ]);
  // A one-letter last term keeps its slash; a short last plus-term its plus.
  assert.deepEqual(glueParts("マルチ比 P / K / 速 / 演").at(-1), { glue: "速 / 演" });
  assert.deepEqual(glueParts("測定不能 / 33.3× + YOPS").at(-1), { glue: "33.3× + YOPS" });
  // A short bracketed note with a space stays whole; one without needs nothing.
  assert.deepEqual(glueParts("150TOPS / 50Core（Spark G2）"), [
    { glue: "150TOPS /" },
    " 50Core",
    { glue: "（Spark G2）" },
  ]);
  // Two short last Latin words keep together (no lone Max on its line).
  assert.deepEqual(glueParts("Neural Resonancer Pro Max"), [
    "Neural Resonancer ",
    { glue: "Pro Max" },
  ]);
  assert.equal(glueParts("300E"), null);
  assert.equal(glueParts("207.8cm（est.）"), null);
});

test("form names break between their words only", () => {
  const { nameParts } = breaks();
  assert.deepEqual(nameParts("ラストヴィンクルム"), ["ラスト", { wbr: true }, "ヴィンクルム"]);
  assert.deepEqual(nameParts("エクスプリーム・ウルトラ"), [
    "エクスプリーム・",
    { wbr: true },
    "ウルトラ",
  ]);
  assert.equal(nameParts("マルチ"), null);
  assert.equal(nameParts("ヴィンクルム"), null);
});

test("phrase seams fall after particles and inflections, never inside a word", () => {
  const { phraseParts } = breaks();
  const seams = (value) => {
    const parts = phraseParts(value);
    assert.equal(text(parts), value, "the text is the owner's");
    return parts
      .map((part) => (typeof part === "string" ? part : part.wbr ? "|" : part.join))
      .join("");
  };
  assert.equal(
    seams("全22形態の系譜、外観、スペック、演算系統、特殊能力を収録した統合アーカイブ。"),
    "全22形態の|系譜、|外観、|スペック、|演算系統、|特殊能力を|収録した|統合アーカイブ。",
  );
  assert.equal(
    seams("格闘と武装運用の両方に対応する万能基盤"),
    "格闘と|武装運用の|両方に|対応する|万能基盤",
  );
  // One-letter okurigana is not a seam; a sign keeps its particle.
  assert.equal(
    seams("MULTI：全身の潜在能力を200%へ引き上げる（約1分）"),
    "MULTI：|全身の|潜在能力を|200%へ|引き上げる|（約1分）",
  );
  const join = phraseParts("200%へ引き上げる").find((part) => part.join);
  assert.deepEqual(join, { join: "%へ" });
  assert.equal(phraseParts("レクソナンス"), null);
});

test("both archives load the script once, last, as a classic deferred script", () => {
  assert.doesNotMatch(source, /^\s*(import|export)\s/m);
  for (const kind of ["saga", "realm"]) {
    for (const html of [
      read(`archives/${kind}-form-archive-standalone.html`),
      read(`public/${kind}-form-archive-embedded.html`),
    ]) {
      const tags = html.match(/<script src="\/archive-zenith\.js\?v=[\w-]+" defer><\/script>/g);
      assert.equal(tags?.length, 1, kind);
      const at = html.indexOf(tags[0]);
      assert.ok(at > html.indexOf('<script src="/archive-profile.js?v='), kind);
      assert.match(html, /archive-zenith\.css\?v=[\w-]+/, kind);
    }
  }
  // It writes only its own classes and never sets the owner's elements' text.
  for (const [, name] of source.matchAll(/className = (?:part\.glue \? )?"([\w-]+)"/g)) {
    assert.match(name, /^zn-/);
  }
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|\.innerText\s*=/);
});

test("the sheet honours the script's marks with the same phrase list", () => {
  const list = (block) =>
    block
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
      .sort();
  const scriptList = list(
    source
      .slice(
        source.indexOf("const PHRASE_TEXT = ["),
        source.indexOf('].join(", ");', source.indexOf("const PHRASE_TEXT")),
      )
      .replace("const PHRASE_TEXT = [", "")
      .replace(/"/g, ""),
  );
  const gated = sheet.match(/\[data-zn-phrases\][^\n]*\n\s*:is\(([^{]+)\) \{/);
  assert.ok(gated, "a keep-all rule waits for the script's phrase seams");
  assert.deepEqual(list(gated[1]), scriptList);
  assert.match(sheet, /\.zn-glue \{\s*display: inline-block;\s*max-width: 100%;/);
  assert.match(sheet, /\.zn-join \{\s*white-space: nowrap;/);
});
