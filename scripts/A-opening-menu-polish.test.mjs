import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const title = read("src/components/cinematic/title-sequence.tsx");
const styles = read("src/styles.css");
const chrome = read("src/components/world/world-chrome.tsx");
const future = read("src/styles-future-interface.css");
const announcement = read("src/styles-world/23.css");
const dreamChapter = read("src/styles-dream-chapter.css");
const dreamTaisho = read("src/styles-dream-taisho.css");

test("the title leaves room for the ENTER THE WORLD row and stays concentric", () => {
  assert.match(
    styles,
    /@media \(min-width: 701px\) \{\s*\.cine-title-lockup \{\s*width: min\(1120px, 92vw, calc\(min\(78vh, 100dvh - 2 \* \(max\(9vh, 64px\) \+ 60px\)\) \* 1\.5\)\);/,
  );
  const landscape = styles.slice(
    styles.indexOf("@media (max-height: 560px) and (orientation: landscape)"),
  );
  assert.match(landscape, /--cine-lift: calc\(28px \+ env\(safe-area-inset-bottom, 0px\) \/ 2\)/);
  assert.match(landscape, /\.cine-stack \{\s*bottom: calc\(2 \* var\(--cine-lift\)\);/);
  assert.match(
    landscape,
    /\.cine-hud,\s*\.cine-line,\s*\.cine-aperture,\s*\.cine-orbit,\s*\.cine-impact-bloom,\s*\.cine-flare \{\s*translate: 0 calc\(-1 \* var\(--cine-lift\)\);/,
  );
  // The flare's keyframes animate only transform, so the lift composes with them.
  const flare = styles.slice(styles.indexOf("@keyframes cinematic-flare {"));
  assert.doesNotMatch(flare.slice(0, flare.indexOf("\n}\n")), /translate:/);
  // The title's own face survives the World's :root override after a Back.
  assert.match(styles, /\.cine-stage \{\s*--seq: 7\.2s;[\s\S]*?--font-display: "Cinzel", serif;/);
});

test("SKIP keeps its pill, ENTER THE WORLD leads and the intro type clears the logo", () => {
  assert.ok(styles.indexOf("\n.cine-ghost {") < styles.indexOf("\n.cine-skip {"));
  assert.match(title, /className="cine-btn cine-btn-primary"/);
  assert.match(title, /className="cine-btn cine-btn-secondary"/);
  assert.match(styles, /\.cine-btn \{[^}]*letter-spacing: 0\.24em;[^}]*font-size: 0\.75rem;/);
  assert.match(styles, /\.cine-btn-primary \{[^}]*border-color: rgb\(240 215 138 \/ 0\.62\);/);
  assert.match(
    styles,
    /\.is-complete :is\(\.cine-editorial-kicker, \.cine-editorial-caption\) \{\s*opacity: 0;/,
  );
  // The lines retire before the 7.2 s completion, so the finished title never jumps.
  for (const line of ["kicker", "caption"]) {
    assert.match(
      styles,
      new RegExp(
        `\\.is-playing \\.cine-editorial-${line} \\{\\s*animation:[^;]*editorial-meta-out 0\\.6s ease 6\\.3s forwards;`,
      ),
    );
  }
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.cine-replay-slot \.cine-btn-secondary,\s*\.cine-always \{\s*display: none;/,
  );
});

test("SOUND shows what is audible and SKIP never starts the score", () => {
  assert.match(title, /const audible = !muted && \(soundLive \|\| phase !== "playing"\);/);
  assert.match(title, /aria-label=\{audible \? "音声をオフ" : "音声をオン"\}/);
  assert.match(title, /closest\("\.cine-skip, \.cine-always"\)\) return;/);
  assert.match(title, /if \(!muted && !soundLive && playing\) \{/);
  assert.match(title, /phase !== "diving" && letter === "m"\) \{\s*toggleMute\(\);/);
});

test("a keyboard skip hands focus on, and a held key presses once", () => {
  assert.match(
    title,
    /if \(e\.repeat\) \{\s*if \(e\.key === "Enter" \|\| e\.key === " "\) e\.preventDefault\(\);\s*return;/,
  );
  assert.match(title, /keyboardFocusRef\.current = e\.detail === 0;\s*skip\(\);/);
  assert.match(title, /keyboardFocusRef\.current = e\.detail === 0;\s*replay\(\);/);
  assert.match(title, /next\.focus\(\{ preventScroll: true \}\)/);
  // Focus now rests on a button, so the letters must not be gated on buttons.
  assert.match(
    title,
    /const isTextEntry = Boolean\(\s*target\?\.closest\("input, textarea, select, \[contenteditable='true'\]"\),\s*\);/,
  );
  assert.match(
    title,
    /const letter = isTextEntry \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey \? "" : e\.key\.toLowerCase\(\);/,
  );
  assert.match(
    title,
    /\(\(isSkipKey && \(!isInteractive \|\| e\.key === "Escape"\)\) \|\| letter === "s"\)/,
  );
  assert.match(
    title,
    /phase === "complete" && letter === "r"\) \{\s*keyboardFocusRef\.current = true;/,
  );
});

test("a return to the title in the same tab skips the opening; asked-for replays do not", () => {
  assert.match(title, /window\.sessionStorage\.setItem\(OPENING_SEEN_KEY, "1"\)/);
  assert.match(title, /skipIntroRef\.current = seen && !replayRequested && !reloaded;/);
  assert.match(title, /if \(reduced \|\| \(replayKey === 0 && skipIntroRef\.current\)\) \{/);
  assert.match(title, /entry\?\.type === "reload" && new URL\(entry\.name\)\.pathname === "\/"/);
  assert.match(
    chrome,
    /<Link\s+to="\/"\s+onClick=\{\(e\) => \{[\s\S]*?if \(e\.button === 0 && !e\.metaKey && !e\.ctrlKey && !e\.shiftKey && !e\.altKey\) \{\s*try \{\s*window\.sessionStorage\.setItem\("dw-opening-replay", "1"\)/,
  );
  // The idle hint does not fade over the settled logo on a Back.
  assert.match(
    styles,
    /\.is-complete \.cine-enter-hint \{\s*opacity: 0;\s*\}[\s\S]*?\.is-complete \.cine-enter-hint \{\s*transition: none;/,
  );
});

test("the side menu marks the current dossier and survives forced colours", () => {
  assert.match(chrome, /useRouterState\(\{ select: \(state\) => state\.location\.pathname \}\)/);
  assert.match(chrome, /aria-current=\{pathname === r\.href \? "page" : undefined\}/);
  assert.match(chrome, /aria-current=\{pathname === "\/characters\/dante" \? "page" : undefined\}/);
  assert.match(
    future,
    /@media \(forced-colors: active\) \{[\s\S]*?border: 1px solid ButtonText !important;/,
  );
  assert.match(
    future,
    /\.side-panel-trigger-glyph i \{\s*forced-color-adjust: none;\s*background: ButtonText;/,
  );
  assert.match(
    future,
    /html body \.side-panel > \.side-panel-head \{\s*top: calc\(-1 \* var\(--sp-pad-top\)\);/,
  );
  assert.match(future, /scroll-padding-block: 140px 24px;/);
  // A Shift+Tab wrap to the last row scrolls it into view as well.
  assert.match(
    chrome,
    /last\.focus\(\{ preventScroll: true \}\);\s*last\.scrollIntoView\(\{ block: "nearest" \}\);/,
  );
  assert.match(future, /html body \.side-panel \.side-panel-group \{\s*border-top: 0;/);
  assert.match(
    future,
    /@media \(max-width: 840px\) \{[\s\S]*?\.side-panel-links :is\(a, button\.side-panel-link-button\) \{\s*display: flex;\s*flex-wrap: wrap;/,
  );
});

test("announcement text is at least 11px and the Dream back link keeps its name", () => {
  // The back button's 9px base is overridden to 13px in styles-future-interface.css.
  const text = announcement.replace(/\n\.site-announcement-back \{[^}]*\}/, "");
  for (const [, size] of text.matchAll(/font-size: (?:clamp\()?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 11, `announcement font-size ${size}px`);
  }
  assert.match(
    future,
    /html body \.site-announcement-back \{\s*min-height: 48px;\s*font-size: 13px;/,
  );
  assert.doesNotMatch(
    dreamChapter,
    /@media \(max-width: 520px\) \{[^@]*\.dream-back-link > span:last-child \{\s*display: none;/,
  );
  assert.match(
    dreamChapter,
    /\.dream-back-link > span:last-child \{\s*position: absolute;[\s\S]*?clip-path: inset\(50%\);/,
  );
  assert.match(
    dreamTaisho,
    /@media \(max-width: 520px\) \{\s*\.dream-page\.dream-page \.dream-back-link \{\s*min-width: 48px;\s*min-height: 48px;/,
  );
});
