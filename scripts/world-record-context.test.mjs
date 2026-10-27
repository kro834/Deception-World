import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_BRIEF,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
} from "../src/components/world/world-annex-data.ts";
import {
  WORLD_EPISODE_INDEX,
  WORLD_RECORD_CONTEXTS,
} from "../src/components/world/world-record-context.ts";

test("episode navigation uses the recorded numbers, titles and existing anchors", () => {
  assert.deepEqual(
    WORLD_EPISODE_INDEX,
    WORLD_EPISODE_NOTES.map(({ no, title }) => ({ no, title, href: `#wa-episode-${no}` })),
  );
  assert.equal(new Set(WORLD_EPISODE_INDEX.map(({ href }) => href)).size, WORLD_EPISODE_INDEX.length);
});

test("every related record resolves to an existing archive target and its unchanged label", () => {
  const targets = new Map([
    ...WORLD_BRIEF.map(({ id, name }) => [`#wa-brief-${id}`, name]),
    ...WORLD_LOCATIONS.map(({ name }) => [`#wa-location-${name}`, name]),
    ...WORLD_GLOSSARY.map(({ term }) => [`#wa-term-${term}`, term]),
  ]);
  const episodeNumbers = new Set(WORLD_EPISODE_NOTES.map(({ no }) => no));
  assert.deepEqual(WORLD_RECORD_CONTEXTS.map(({ no }) => no), ["01", "02", "03", "04"]);
  for (const context of WORLD_RECORD_CONTEXTS) {
    assert.ok(episodeNumbers.has(context.no), context.no);
    const hrefs = [];
    for (const group of context.groups) {
      assert.ok(["世界と組織", "舞台", "用語集"].includes(group.label), group.label);
      assert.ok(group.links.length > 0, `${context.no}: ${group.label}`);
      for (const link of group.links) {
        assert.ok(targets.has(link.href), link.href);
        assert.equal(link.label, targets.get(link.href));
        hrefs.push(link.href);
      }
    }
    assert.equal(new Set(hrefs).size, hrefs.length, `EP.${context.no} has duplicate links`);
  }
});

test("episode links retain their story context without creating new canon or destinations", () => {
  const notes = new Map(
    WORLD_EPISODE_NOTES.map((episode) => [episode.no, [episode.stage, ...episode.synopsis].join("")]),
  );
  for (const context of WORLD_RECORD_CONTEXTS) {
    for (const { links } of context.groups) {
      for (const { href, label } of links) {
        // The existing catalogue label names the episode's doorway passage;
        // no replacement prose is introduced by the link.
        const sourceMention = label === "夢への扉" ? "夢へ通じる扉" : label;
        assert.ok(notes.get(context.no).includes(sourceMention), `${context.no}: ${label}`);
        assert.match(href, /^#wa-(brief|location|term)-/);
      }
    }
  }
});

test("navigation stays within the existing episode renderer and uses native accessible links", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const annex = read("src/components/world/world-annex.tsx");
  const view = read("src/components/world/world-record-context.tsx");
  const css = read("src/styles-world-record-context.css");
  assert.match(annex, /<WorldEpisodeIndex \/>\s*<ol className="wa-episodes">/);
  assert.match(annex, /<Lines lines=\{episode.lines\} \/>\s*<\/div>\s*<WorldRecordContext episodeNo=\{episode.no\} \/>/);
  assert.match(view, /<nav className="wr-record-index" aria-label="エピソードの索引">/);
  assert.match(view, /aria-label=\{`EP\.\$\{episodeNo\}の関連資料`\}/);
  assert.doesNotMatch(view, /useEffect|useState|onClick|onKeyDown|dangerouslySetInnerHTML/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /grid-column: 1 \/ -1/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /forced-colors: active/);
  assert.doesNotMatch(css, /(?:^|\s)(?:animation|transition|position|backdrop-filter|touch-action)\s*:/m);
});
