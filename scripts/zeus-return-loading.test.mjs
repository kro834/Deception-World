import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/zeus-button.tsx", import.meta.url), "utf8");
const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");

test("Zeus navigation closes transient UI and uses the shared route controller", () => {
  assert.match(source, /export function ZeusButtonProvider[\s\S]*?const navigatingRef = useRef/);
  assert.match(source, /const \{ go \} = useLoadGate\(\)/);
  assert.match(source, /await go\(\{ to: "\/world", hash: "top" \}\)/);
  assert.match(source, /dialog\.close\("zeus-navigation"\)/);
  assert.match(root, /<LoadGateProvider>[\s\S]*?<ZeusButtonProvider>/);
});

test("Zeus no longer preloads a second character or mounts its own loading dive", () => {
  assert.doesNotMatch(source, /zeus-button-return\.jpeg/);
  assert.doesNotMatch(source, /data-return-loading/);
  assert.doesNotMatch(source, /ZeusReturnDive/);
  assert.doesNotMatch(source, /DiveVelocityCanvas/);
});
