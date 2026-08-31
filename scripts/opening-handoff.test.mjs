import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const gate = readSource("../src/components/load-gate.tsx");
const title = readSource("../src/components/cinematic/title-sequence.tsx");
const world = readSource("../src/components/world/world-home.tsx");
const transitionCss = readSource("../src/styles-route-transitions.css");

function sliceBetween(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${label}: missing start marker ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${label}: missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAttachedReadyRef(source, effect, call, stem) {
  const candidates = new Set(
    [...source.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*${stem}[\\w$]*Ref)\\b`, "gi"))].map(
      (match) => match[1],
    ),
  );
  const refName = [...candidates].find((candidate) => {
    const escaped = escapeRegExp(candidate);
    return (
      effect.includes(candidate) &&
      call.includes(candidate) &&
      new RegExp(`ref\\s*=\\s*\\{\\s*${escaped}\\s*\\}`).test(source)
    );
  });
  assert.ok(refName, `world arrival must pass an attached ${stem} ref`);
  return refName;
}

test("LoadGate exposes the two-phase opening handoff API", () => {
  const apiType = sliceBetween(gate, "type LoadGateApi = {", "};", "LoadGateApi");
  assert.match(apiType, /\bbeginOpeningHandoff\s*:/);
  assert.match(apiType, /\bnotifyOpeningDestination\s*:/);
  assert.match(apiType, /\bgo\s*:/);

  const providerApi = sliceBetween(gate, "const api = useMemo", "\n\n  return (", "provider API");
  assert.match(providerApi, /\bbeginOpeningHandoff\b/);
  assert.match(providerApi, /\bnotifyOpeningDestination\b/);
  assert.match(providerApi, /\bgo\b/);
  assert.match(gate, /transitionCovered\?: boolean/);
});

test("the title starts the opening handoff synchronously before any route work", () => {
  assert.match(
    title,
    /const\s*\{[^}]*\bbeginOpeningHandoff\b[^}]*\bgo\b[^}]*\}\s*=\s*useLoadGate\(\)|const\s*\{[^}]*\bgo\b[^}]*\bbeginOpeningHandoff\b[^}]*\}\s*=\s*useLoadGate\(\)/,
  );
  const enterWorld = sliceBetween(
    title,
    "const enterWorld = useCallback",
    "\n\n  useEffect(",
    "enterWorld",
  );
  const beginIndex = enterWorld.indexOf("beginOpeningHandoff(");
  const firstAwaitIndex = enterWorld.indexOf("await ");
  const goIndex = enterWorld.search(/await\s+go\s*\(/);
  assert.notEqual(beginIndex, -1, "enterWorld must begin the handoff");
  assert.notEqual(firstAwaitIndex, -1, "enterWorld must still await its visual/route work");
  assert.notEqual(goIndex, -1, "enterWorld must await LoadGate.go");
  assert.ok(beginIndex < firstAwaitIndex, "handoff start must happen before the first await");
  assert.ok(beginIndex < goIndex, "handoff start must happen before go");
  assert.doesNotMatch(enterWorld, /await\s+beginOpeningHandoff\s*\(/);

  const goCall = enterWorld.match(/await\s+go\s*\(\s*\{[\s\S]{0,480}?\}\s*\)/)?.[0];
  assert.ok(goCall, "enterWorld must make one object-form go call");
  assert.match(goCall, /\bto\s*:\s*"\/world"/);
  assert.match(goCall, /\bassets\s*:\s*WORLD_ENTER_ASSETS/);
  assert.match(goCall, /\btransitionCovered\s*:\s*true/);
});

test("the title recovers cancellation, BFCache, and background video state", () => {
  assert.match(
    title,
    /await go\([\s\S]*?window\.location\.pathname === "\/"[\s\S]*?setPhase\("complete"\)/,
    "a non-throwing covered-navigation cancellation must restore the opening controls",
  );
  assert.match(title, /window\.addEventListener\("pageshow", handlePageShow\)/);
  assert.match(title, /window\.removeEventListener\("pageshow", handlePageShow\)/);
  assert.match(title, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(
    title,
    /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/,
  );
  assert.match(title, /if \(!economyOpening\) \{[\s\S]*?videoStartTimerRef\.current/);
  assert.match(title, /document\.visibilityState === "visible"[\s\S]*?video\.play\(\)\.catch/);
});

test("covered navigation waits for destination readiness and is cancellation-safe", () => {
  const goBlock = sliceBetween(gate, "const go = useCallback", "\n\n  const api = useMemo", "go");
  const coveredIndex = goBlock.search(/if\s*\([^)]*\btransitionCovered\b[^)]*\)\s*\{/);
  const directIndex = goBlock.search(
    /if\s*\(\s*!isArchiveTransition\s*&&\s*!isZeusTransition\s*&&\s*!riderTransitionVariant\s*\)\s*\{/,
  );
  assert.notEqual(coveredIndex, -1, "go must have a transitionCovered branch");
  assert.notEqual(directIndex, -1, "go must retain the ordinary direct-navigation branch");
  assert.ok(
    coveredIndex < directIndex,
    "covered navigation must be selected before direct navigation",
  );

  const coveredBranch = goBlock.slice(coveredIndex, directIndex);
  const guardedTryIndex = coveredBranch.indexOf("try {");
  const routeWarmupIndex = coveredBranch.indexOf("router.preloadRoute");
  const assetWarmupIndex = coveredBranch.indexOf("preloadAssets");
  assert.notEqual(guardedTryIndex, -1, "covered navigation must guard all setup work");
  assert.notEqual(routeWarmupIndex, -1, "covered navigation must warm the destination route");
  assert.notEqual(assetWarmupIndex, -1, "covered navigation must warm destination assets");
  assert.ok(
    guardedTryIndex < routeWarmupIndex,
    "route warmup construction must occur inside the cleanup guard",
  );
  assert.ok(
    guardedTryIndex < assetWarmupIndex,
    "asset warmup construction must occur inside the cleanup guard",
  );
  assert.match(
    coveredBranch,
    /Promise\.resolve\(\)\s*\.then\(\(\)\s*=>\s*router\.preloadRoute/,
    "a synchronous route-preload throw must be converted into a guarded rejection",
  );
  assert.match(
    coveredBranch,
    /Promise\.resolve\(\)\s*\.then\(\(\)\s*=>\s*preloadAssets/,
    "a synchronous asset-preload throw must be converted into a guarded rejection",
  );
  const navigateIndex = coveredBranch.search(/await\s+navigate\s*\(/);
  assert.notEqual(navigateIndex, -1, "covered navigation must commit the /world route");
  const afterNavigate = coveredBranch.slice(navigateIndex);
  const readyWaitIndex = afterNavigate.search(
    /await[\s\S]{0,280}?(?:openingHandoff|handoff|destination|arrival|target)/i,
  );
  assert.notEqual(
    readyWaitIndex,
    -1,
    "covered navigation must await the destination handoff notification after navigate",
  );
  const afterReadyWait = afterNavigate.slice(readyWaitIndex);
  assert.match(
    afterReadyWait,
    /if\s*\([^)]*(?:isCurrent|token|requestId|openingHandoff|handoff)[^)]*\)[\s\S]{0,100}?(?:return|throw)/i,
    "destination readiness must be followed by a stale-token guard",
  );
  assert.match(coveredBranch, /try\s*\{[\s\S]*?finally\s*\{/);
  assert.match(
    coveredBranch,
    /runtime\.destination\.promise,\s*wait\(2200\)/,
    "covered navigation must reserve the full 2.2s arrival-notification contract",
  );
  assert.match(
    coveredBranch,
    /finally\s*\{[\s\S]{0,500}?(?:cancel|abort|resolve|clear|finish|complete)[A-Za-z]*(?:Opening)?Handoff|finally\s*\{[\s\S]{0,500}?openingHandoff/i,
    "covered navigation must clean up its handoff in finally",
  );

  const cancellationEffect = sliceBetween(
    gate,
    "useEffect(() => {\n    const cancelTransition",
    "\n  }, []);",
    "route-transition cancellation effect",
  );
  assert.match(cancellationEffect, /deception-world:cancel-route-transition/);
  assert.match(cancellationEffect, /(?:openingHandoff|handoff)/i);
  assert.match(cancellationEffect, /(?:cancel|abort|resolve|clear|finish|complete)/i);
  assert.match(cancellationEffect, /return\s*\(\)\s*=>/);
});

test("WorldHome notifies arrival after a layout effect and two painted frames", () => {
  assert.match(world, /\buseLayoutEffect\b/);
  assert.match(world, /const\s*\{[^}]*\bnotifyOpeningDestination\b[^}]*\}\s*=\s*useLoadGate\(\)/);
  const notifyIndex = world.search(/\bnotifyOpeningDestination\s*\(/);
  assert.notEqual(notifyIndex, -1, "WorldHome must notify LoadGate when its hero is ready");
  const effectIndex = world.lastIndexOf("useLayoutEffect(", notifyIndex);
  assert.notEqual(effectIndex, -1, "arrival notification must be owned by useLayoutEffect");
  const effectEnd = world.indexOf("\n  },", notifyIndex);
  assert.notEqual(effectEnd, -1, "arrival layout effect must have a dependency boundary");
  const effect = world.slice(effectIndex, effectEnd);
  const announceStart = effect.indexOf("const announceDestination");
  const scheduleStart = effect.indexOf("firstFrame = window.requestAnimationFrame", announceStart);
  assert.notEqual(announceStart, -1, "arrival must define a guarded destination announcer");
  assert.notEqual(scheduleStart, -1, "arrival must schedule its painted-frame handshake");
  const announce = effect.slice(announceStart, scheduleStart);
  const schedule = effect.slice(scheduleStart);
  const firstFrameIndex = effect.indexOf("requestAnimationFrame");
  const secondFrameIndex = effect.indexOf("requestAnimationFrame", firstFrameIndex + 1);
  assert.notEqual(firstFrameIndex, -1, "arrival must wait for its first animation frame");
  assert.notEqual(secondFrameIndex, -1, "arrival must wait for its second animation frame");
  assert.ok(firstFrameIndex < secondFrameIndex, "arrival frames must be requested in order");
  assert.match(
    schedule,
    /requestAnimationFrame\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?requestAnimationFrame\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?announceDestination\s*\(\s*\)/,
    "the destination announcer must be invoked only from the second painted frame",
  );
  assert.match(announce, /notifyOpeningDestination\s*\(\s*destination\s*\)/);
  assert.match(announce, /targets\.every\s*\(\s*\(target\)\s*=>\s*target\?\.isConnected\s*\)/);
  assert.match(
    effect,
    /const destinationReadyDeadline = window\.performance\.now\(\) \+ 2_000;/,
    "WorldHome must retry connected targets for nearly the whole LoadGate arrival window",
  );
  assert.match(
    announce,
    /window\.performance\.now\(\) < destinationReadyDeadline/,
    "arrival retries must stop at the explicit deadline",
  );
  assert.doesNotMatch(
    effect,
    /\battempts\s*</,
    "arrival readiness must not be limited to a handful of animation frames",
  );

  assert.match(announce, /["']\/world["']/);
  for (const stem of ["brand", "sigil", "hero", "backdrop", "focus"]) {
    findAttachedReadyRef(world, effect, announce, stem);
  }
  assert.match(effect, /return\s*\(\)\s*=>[\s\S]*cancelAnimationFrame/);
});

test("opening handoff motion is namespaced and has a reduced-motion contract", () => {
  const rootMatches = transitionCss.match(/\[data-opening-handoff-root\]/g) ?? [];
  assert.ok(rootMatches.length >= 2, "opening handoff styles must share a namespaced root");
  assert.match(
    transitionCss,
    /\[data-opening-handoff-root\][^{]*\{[\s\S]{0,800}?(?:animation|transition|transform|opacity)\s*:/,
  );

  const reducedMotionIndex = transitionCss.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.notEqual(reducedMotionIndex, -1, "route transitions must declare reduced motion");
  const reducedMotion = transitionCss.slice(reducedMotionIndex);
  assert.match(reducedMotion, /\[data-opening-handoff-root\]/);
  assert.match(
    reducedMotion,
    /(?:animation(?:-duration)?|transition(?:-duration)?)\s*:\s*(?:none|0(?:\.0+)?(?:ms|s)?|0\.01ms)/,
    "opening handoff animation must be suppressed or collapsed under reduced motion",
  );
});
