import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);

test("poster autoplay and speculative loading pause while controls have focus", () => {
  assert.match(
    home,
    /const \[posterControlsFocused, setPosterControlsFocused\] = useState\(false\)/,
  );
  const autoplay = home.slice(
    home.indexOf("    if (locked || ambientPaused || motionReduced"),
    home.indexOf("  useEffect(() => {\n    if (!ambientPaused)"),
  );
  assert.match(
    autoplay,
    /if \(posterControlsFocused \|\| posterResetting \|\| posterFailure !== null\) return/,
  );
  assert.match(autoplay, /const canAdvance = \(\) =>[\s\S]*?!posterControlsFocusedRef\.current/);
  assert.match(autoplay, /if \(canAdvance\(\)\) warm = loadPoster/);
  assert.match(
    autoplay,
    /if \(ready && canAdvance\(\)\) await goPoster\(nextIndex, \{ canShow: canAdvance \}\)/,
  );
  assert.match(autoplay, /shuffling,\s*posterControlsFocused,/);
  assert.match(
    home,
    /onFocusCapture=\{\(\) => \{\s*posterControlsFocusedRef\.current = true;\s*setPosterControlsFocused\(true\)/,
  );
  assert.match(
    home,
    /if \(event\.currentTarget\.contains\(event\.relatedTarget\)\) return;\s*posterControlsFocusedRef\.current = false;\s*setPosterControlsFocused\(false\)/,
  );
});

test("poster controls are named and automatic rotations do not create live announcements", () => {
  assert.match(home, /aria-label="ポスターをシャッフル（SHUFFLE POSTER）"/);
  assert.match(home, /aria-label="先頭のポスターへ戻る（RESET）"/);
  assert.match(home, /aria-label="表示中のポスター"/);
  assert.match(home, /aria-live=\{locked \|\| posterControlsFocused \? "polite" : "off"\}/);
  assert.match(home, /aria-atomic="true"/);
});

test("shuffle keeps keyboard focus while suppressing intermediate announcements", () => {
  const button = home.slice(
    home.indexOf('className="poster-shuffle ios26-glass"'),
    home.indexOf("onClick={shufflePoster}"),
  );
  assert.match(button, /aria-disabled=\{shuffling\}/);
  assert.doesNotMatch(button, /\sdisabled=\{/);
  assert.match(home, /if \(ambientPaused \|\| shuffleActive\.current\) return/);
  assert.match(home, /<output[\s\S]*?aria-busy=\{shuffling \|\| posterResetting\}/);
});
