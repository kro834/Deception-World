import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const oracle = readFileSync(
  new URL("../src/components/world/archive-oracle.tsx", import.meta.url),
  "utf8",
);
const chrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const oracleStyles = readFileSync(new URL("../src/styles-world/27.css", import.meta.url), "utf8");
const worldStyleIndex = readFileSync(new URL("../src/styles-world.css", import.meta.url), "utf8");
const title = readFileSync(
  new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url),
  "utf8",
);
const globalStyles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("archive oracle is a local, allow-listed page finder", () => {
  assert.match(oracle, /export const ARCHIVE_ORACLE_ENTRIES/);
  assert.match(oracle, /function searchArchiveOracle/);
  assert.match(oracle, /\.slice\(0, Math\.min\(limit, 3\)\)/);
  assert.match(oracle, /質問が外部へ送信されることはありません/);
  assert.doesNotMatch(oracle, /\bfetch\s*\(/);
  assert.doesNotMatch(oracle, /XAI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
});

test("archive oracle covers the hidden and deep-linked archive destinations", () => {
  assert.match(oracle, /to: `\/riders\/\$\{guide\.id\}`/);
  assert.match(oracle, /to: `\/managers\/\$\{guide\.id\}`/);
  assert.match(oracle, /to: "\/characters\/terra"/);
  assert.match(oracle, /to: "\/characters\/luna"/);
  assert.match(oracle, /to: "\/dream-chapter"[\s\S]*?hash: "characters"/);
  assert.match(oracle, /to: "\/rexonance-saga"[\s\S]*?hash: "p14"/);
  assert.match(oracle, /to: "\/extreme-saga"[\s\S]*?hash: "p14"/);
  assert.match(oracle, /to: "\/form-archive"[\s\S]*?hash: "archive-switcher"/);
});

test("archive oracle dialog supports keyboard, focus return, and live answers", () => {
  assert.match(oracle, /forwardRef<HTMLDialogElement, ArchiveOracleProps>/);
  assert.match(oracle, /dialog\.showModal\(\)/);
  assert.match(oracle, /inputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(oracle, /onCancel=\{\(event\) => \{/);
  assert.match(oracle, /event\.preventDefault\(\)/);
  assert.match(oracle, /returnFocusRef\?\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(oracle, /role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/);
  assert.match(oracle, /role="search"/);
  assert.match(oracle, /aria-label="見つかったページ"/);
});

test("archive oracle provides natural Japanese queries for key intents", () => {
  assert.match(oracle, /レクソナンスの性能を見たい/);
  assert.match(oracle, /8人目のライダーは？/);
  assert.match(oracle, /六詠第一位について知りたい/);
  assert.match(oracle, /映画の登場人物を見たい/);
  assert.match(oracle, /フォームを比較したい/);
  assert.match(oracle, /まずは『\$\{top\.label\}』がよさそうです/);
});

test("the shared side menu exposes the guide without breaking its nested scroll lock", () => {
  assert.match(chrome, /import \{ ArchiveOracle \} from "\.\/archive-oracle"/);
  assert.match(chrome, /className="side-panel-oracle-trigger"/);
  assert.match(chrome, /<b>AIに聞く<\/b>/);
  assert.match(chrome, /aria-controls="site-archive-oracle-dialog"/);
  assert.match(
    chrome,
    /const oracleDialog = oracleRef\.current;[\s\S]*?oracleDialog\?\.open && oracleDialog\.contains\(event\.target\)[\s\S]*?return/,
  );
  assert.match(chrome, /onNavigate=\{closeForOracleNavigation\}/);
  assert.match(
    chrome,
    /returnFocusRef=\{oracleOpenedByKeyboardRef\.current \? oracleTriggerRef : undefined\}/,
  );
});

test("archive oracle is safe-area aware, internally scrollable, and mobile-first", () => {
  assert.match(worldStyleIndex, /@import "\.\/styles-world\/27\.css"/);
  assert.match(
    oracleStyles,
    /\.archive-oracle-dialog \{[\s\S]*?height: 100dvh;[\s\S]*?safe-area-inset-top[\s\S]*?overflow: hidden/,
  );
  assert.match(
    oracleStyles,
    /\.archive-oracle-stage \{[\s\S]*?overflow-y: auto;[\s\S]*?touch-action: pan-y;[\s\S]*?-webkit-overflow-scrolling: touch/,
  );
  assert.match(oracleStyles, /@media \(max-width: 760px\)/);
  assert.match(oracleStyles, /\.archive-oracle-shell \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/);
  assert.match(oracleStyles, /font-size: 16px/);
  assert.match(oracleStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(oracleStyles, /html\[data-world-effects="economy"\]/);
});

test("the opening adds an editorial scene without changing its interaction contract", () => {
  assert.match(title, /function CinematicEditorialFrame\(\)/);
  assert.match(title, /<b>DECEPTION<\/b>/);
  assert.match(title, /<b>WORLD<\/b>/);
  assert.match(title, /<CinematicEditorialFrame \/>/);
  assert.match(globalStyles, /\.cine-editorial-frame/);
  assert.match(globalStyles, /@keyframes editorial-word-rise/);
  assert.match(
    globalStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.cine-editorial-word b/,
  );
  assert.match(globalStyles, /\.cine-stage\.is-economy-opening \.cine-editorial-coordinate/);
});
