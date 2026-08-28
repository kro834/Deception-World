import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const openingSource = readFileSync(
  new URL("../src/components/cinematic/opening-handoff.tsx", import.meta.url),
  "utf8",
);
const titleSource = readFileSync(
  new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url),
  "utf8",
);
const loadGateSource = readFileSync(
  new URL("../src/components/load-gate.tsx", import.meta.url),
  "utf8",
);
const transitionCss = readFileSync(
  new URL("../src/styles-route-transitions.css", import.meta.url),
  "utf8",
);

function matchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`No matching brace after offset ${openIndex}`);
}

function blockAfter(source, pattern, label) {
  const match = pattern.exec(source);
  assert.ok(match, `${label} is missing`);
  const openIndex = source.indexOf("{", match.index + match[0].length - 1);
  assert.notEqual(openIndex, -1, `${label} has no block`);
  return source.slice(openIndex + 1, matchingBrace(source, openIndex));
}

function cssRuleContaining(source, selector, label) {
  const selectorIndex = source.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `${label} selector is missing`);
  const openIndex = source.indexOf("{", selectorIndex + selector.length);
  assert.notEqual(openIndex, -1, `${label} has no declaration block`);
  return {
    selector: source.slice(selectorIndex, openIndex),
    declarations: source.slice(openIndex + 1, matchingBrace(source, openIndex)),
  };
}

function declaredFunctionBlocks(source) {
  const starts = [
    ...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g),
    ...source.matchAll(
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g,
    ),
  ];

  return starts.map((match) => {
    const openIndex = source.indexOf("{", match.index + match[0].length - 1);
    return {
      name: match[1],
      body: source.slice(openIndex + 1, matchingBrace(source, openIndex)),
    };
  });
}

test("visualViewport offset is applied exactly once to handoff geometry", () => {
  const rootRule = cssRuleContaining(
    transitionCss,
    "[data-opening-handoff-root]",
    "opening handoff root",
  );
  const rootUsesVisualViewportOffset =
    /left\s*:\s*var\(--opening-vv-left\)/.test(rootRule.declarations) ||
    /top\s*:\s*var\(--opening-vv-top\)/.test(rootRule.declarations);

  if (!rootUsesVisualViewportOffset) return;

  const coordinateNormalizer = declaredFunctionBlocks(openingSource).find(
    ({ body }) =>
      /offsetLeft/.test(body) &&
      /offsetTop/.test(body) &&
      /(?:\.left|\bleft\b)[\s\S]{0,180}?-[\s\S]{0,180}?(?:offsetLeft|viewportLeft)/.test(
        body,
      ) &&
      /(?:\.top|\btop\b)[\s\S]{0,180}?-[\s\S]{0,180}?(?:offsetTop|viewportTop)/.test(
        body,
      ),
  );

  assert.ok(
    coordinateNormalizer,
    "When the fixed root is shifted by visualViewport offsets, captured DOMRects must be normalized back into that local coordinate space; otherwise iOS pinch/keyboard offsets are counted twice.",
  );
  const callCount = openingSource.match(
    new RegExp(`\\b${coordinateNormalizer.name}\\b`, "g"),
  )?.length;
  assert.ok(
    (callCount ?? 0) >= 2,
    "The visualViewport normalizer must be used by handoff rectangle capture, not merely declared.",
  );
});

test("the handoff root owns touch input while it covers the page", () => {
  const rootRule = cssRuleContaining(
    transitionCss,
    "[data-opening-handoff-root]",
    "opening handoff root",
  );

  assert.match(
    rootRule.declarations,
    /pointer-events\s*:\s*(?:auto|all)\s*;/,
    "The covering portal must intercept taps instead of passing them to the old or new page.",
  );
  assert.doesNotMatch(
    rootRule.declarations,
    /pointer-events\s*:\s*none\s*;/,
    "The covering portal must not expose controls beneath it.",
  );
  assert.match(
    rootRule.declarations,
    /touch-action\s*:\s*none\s*;/,
    "The handoff must suppress browser gestures only for the lifetime of its covering root.",
  );
  assert.match(
    rootRule.declarations,
    /overscroll-behavior(?:-y)?\s*:\s*(?:none|contain)\s*;/,
    "The covering root must prevent scroll chaining to the page beneath it.",
  );
});

test("reduced motion uses an opacity-only early path", () => {
  const reducedBlock = blockAfter(
    openingSource,
    /if\s*\(\s*source\.reducedMotion\s*\)\s*\{/,
    "an explicit reduced-motion handoff branch",
  );

  assert.match(
    reducedBlock,
    /(?:animateNode|\.animate)\s*\(/,
    "Reduced motion should still provide a short continuity fade.",
  );
  assert.match(reducedBlock, /\bopacity\b/, "The reduced path must fade by opacity.");
  assert.doesNotMatch(
    reducedBlock,
    /\b(?:transform|translate|scale|rotate|filter|clipPath)\b/,
    "Reduced motion must not retain zoom, tunnel, blur, or clipping motion.",
  );
  assert.match(
    reducedBlock,
    /\breturn\b/,
    "The reduced-motion branch must exit before the normal movement keyframes run.",
  );
});

test("economy mode pauses video and all perpetual handoff decoration", () => {
  assert.match(
    openingSource,
    /source\.videoPlaying\s*&&\s*!source\.reducedMotion\s*&&\s*!source\.economy/,
    "Economy mode must not clone and play the opening video behind the transition.",
  );

  const economyRule = cssRuleContaining(
    transitionCss,
    '[data-opening-handoff-root][data-opening-handoff-mode="economy"]',
    "opening handoff economy override",
  );
  assert.match(
    economyRule.selector,
    /\*/,
    "The economy override must cover descendants that own ambient loops.",
  );
  assert.match(
    economyRule.selector,
    /::before/,
    "The economy override must cover the root ambient pseudo-element.",
  );
  assert.match(
    economyRule.selector,
    /::after/,
    "The economy override must cover generated ambient layers.",
  );
  assert.match(
    economyRule.declarations,
    /animation\s*:\s*none\s*!important\s*;/,
    "Economy mode must stop infinite ambient animation rather than only hiding filters.",
  );
});

test("backgrounding the document settles the handoff and removes its listener", () => {
  const visibilityHandler = declaredFunctionBlocks(openingSource).find(
    ({ name, body }) => /visibility/i.test(name) && /document\.hidden/.test(body),
  );
  assert.ok(
    visibilityHandler,
    "OpeningHandoff must have a visibilitychange handler that checks document.hidden.",
  );
  assert.match(
    visibilityHandler.body,
    /(?:settle|finish|complete|cancel|cleanup|dispose)[A-Za-z0-9_$]*\s*\(/i,
    "When the app is backgrounded, the handler must settle or cancel the transition immediately.",
  );
  assert.match(
    openingSource,
    new RegExp(
      `document\\.addEventListener\\(\\s*["']visibilitychange["']\\s*,\\s*${visibilityHandler.name}\\s*\\)`,
    ),
    "The visibility handler must be registered on document.",
  );
  assert.match(
    openingSource,
    new RegExp(
      `document\\.removeEventListener\\(\\s*["']visibilitychange["']\\s*,\\s*${visibilityHandler.name}\\s*\\)`,
    ),
    "The visibility handler must be removed during effect cleanup.",
  );
});

test("focus is restored without causing a scroll jump", () => {
  const focusOwners = [openingSource, loadGateSource];
  assert.ok(
    focusOwners.some((source) =>
      /\.focus\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)/.test(source),
    ),
    "Handoff completion must focus its destination with { preventScroll: true } on iOS and Android.",
  );
  assert.doesNotMatch(
    titleSource,
    /\.focus\(\s*\)/,
    "The outgoing title must not restore focus with a scrolling focus() call.",
  );
});

test("orientation changes use a paired, settling cleanup path", () => {
  const listenerMatch = /window\.addEventListener\(\s*["']orientationchange["']\s*,\s*([A-Za-z_$][\w$]*)(?:\s*,\s*\{[^}]*\})?\s*\)/.exec(
    openingSource,
  );
  assert.ok(listenerMatch, "OpeningHandoff must listen for device orientation changes.");
  const handlerName = listenerMatch[1];
  const orientationHandler = declaredFunctionBlocks(openingSource).find(
    ({ name }) => name === handlerName,
  );
  assert.ok(orientationHandler, "The orientation handler must be a stable named function.");
  assert.match(
    orientationHandler.body,
    /(?:settle|finish|complete|cancel|cleanup|dispose)[A-Za-z0-9_$]*\s*\(/i,
    "Rotation must settle/cancel the old geometry instead of leaving a partially retargeted overlay.",
  );
  assert.match(
    openingSource,
    new RegExp(
      `window\\.removeEventListener\\(\\s*["']orientationchange["']\\s*,\\s*${handlerName}\\s*\\)`,
    ),
    "The orientation listener must be removed during effect cleanup.",
  );
  assert.match(openingSource, /cancelAnimationFrame\s*\(/);
  assert.match(openingSource, /clearTimeout\s*\(/);
  assert.match(openingSource, /\.cancel\s*\(\s*\)/);
});
