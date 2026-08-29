import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const oracle = readSource("src/components/world/archive-oracle.tsx");
const searchContract = readSource("src/lib/archive-search.ts");
const searchServer = readSource("src/lib/archive-search.server.ts");
const searchCatalog = readSource("src/lib/archive-search-catalog.server.ts");
const searchRoute = readSource("src/routes/api/archive-search.ts");
const requestBody = readSource("src/lib/archive-request-body.server.ts");
const chrome = readSource("src/components/world/world-chrome.tsx");
const intelligencePage = readSource("src/components/world/archive-intelligence-page.tsx");
const intelligenceRoute = readSource("src/routes/intelligence.tsx");
const intelligenceStyles = readSource("src/styles-intelligence.css");
const oracleStyles = readSource("src/styles-world/27.css");
const worldStyleIndex = readSource("src/styles-world.css");
const title = readSource("src/components/cinematic/title-sequence.tsx");
const globalStyles = readSource("src/styles.css");

test("search is conversational while navigation stays on a deterministic allow-list", () => {
  assert.match(oracle, /export const ARCHIVE_ORACLE_ENTRIES/);
  assert.match(oracle, /function searchArchiveOracle/);
  assert.match(oracle, /\.slice\(0, Math\.min\(limit, 3\)\)/);
  assert.match(oracle, /fetch\("\/api\/archive-search"/);
  assert.match(oracle, /"x-archive-client": "search-v1"/);
  assert.match(oracle, /credentials: "same-origin"/);
  assert.match(oracle, /className="archive-search-log"/);
  assert.match(oracle, /role="log"/);
  assert.match(oracle, /AIが記録と会話の流れを照合しています/);
  assert.match(
    oracle,
    /<GuardedLink[\s\S]*?to=\{entry\.to\}[\s\S]*?hash=\{entry\.hash\}[\s\S]*?assets=\{entry\.assets\}/,
  );
  assert.doesNotMatch(oracle, /window\.location|location\.assign|dangerouslySetInnerHTML/);
  assert.doesNotMatch(oracle, /OPENAI_API_KEY|Bearer \$\{apiKey\}/);
});

test("follow-up search retains visible candidate order and named references", () => {
  for (const reference of ["2番", "二番", "後者", "3番", "最後", "ほか"]) {
    assert.match(oracle, new RegExp(reference));
  }
  assert.match(
    oracle,
    /normalizedQuestion\.includes\(normalizeArchiveOracleText\(entry\.label\)\)/,
  );
  assert.match(oracle, /表示候補: \$\{message\.results/);
  assert.match(oracle, /focusCandidateId/);
  assert.match(oracle, /searchFollowLatestRef/);
  assert.match(oracle, /log\.scrollHeight - log\.scrollTop - log\.clientHeight < 140/);
  assert.match(searchContract, /compareRequested/);
  assert.match(searchContract, /anotherRequested/);
  assert.match(searchContract, /reasonRequested/);
  assert.match(searchContract, /focusCandidateId: top\?\.id/);
});

test("Search uses Luna with structured no-store responses and safe fallback", () => {
  assert.match(searchServer, /process\.env\.OPENAI_API_KEY\?\.trim\(\)/);
  assert.match(searchServer, /"gpt-5\.6-luna"/);
  assert.match(searchServer, /fetch\("https:\/\/api\.openai\.com\/v1\/responses"/);
  assert.match(searchServer, /store: false/);
  assert.match(searchServer, /tools: \[\]/);
  assert.match(searchServer, /reasoning: \{ effort: "low", context: "current_turn" \}/);
  assert.match(searchServer, /max_output_tokens: 2400/);
  assert.match(searchServer, /name: "deception_world_search_reply"/);
  assert.match(searchServer, /focusCandidateId must be the id/);
  assert.match(searchServer, /trustedCandidates\.some/);
  assert.match(searchServer, /safety_identifier: safetyIdentifier/);
  assert.match(searchServer, /serializeUntrustedArchiveConversation\(messages\)/);
  assert.doesNotMatch(searchServer, /input: messages\.map/);
  assert.match(searchServer, /canonicalizeArchiveSearchCandidates\(candidates\)/);
  assert.match(searchCatalog, /const ARCHIVE_SEARCH_CATALOG/);
  assert.match(searchCatalog, /"rider-over-zeztz"/);
  assert.match(searchCatalog, /catalogById\.get\(candidate\.id\)/);

  assert.match(searchRoute, /assertSameSiteRequest\(\)/);
  assert.match(searchRoute, /x-archive-client"\) !== "search-v1"/);
  assert.match(searchRoute, /new URL\(origin\)\.origin !== new URL\(request\.url\)\.origin/);
  assert.match(searchRoute, /const MAX_BODY_BYTES = 18_000/);
  assert.match(searchRoute, /readArchiveRequestBody\(request, MAX_BODY_BYTES\)/);
  assert.match(searchRoute, /canonicalizeArchiveSearchCandidates\(parsed\.data\.candidates\)/);
  assert.match(searchRoute, /checkArchiveAiAccess\(request, "normal"\)/);
  assert.match(searchRoute, /cache-control": "no-store, max-age=0/);
  assert.match(searchRoute, /createLocalArchiveSearchReply/);
  assert.match(searchRoute, /ローカルサーチへ切り替えました/);
  assert.match(requestBody, /request\.body\.getReader\(\)/);
  assert.match(requestBody, /received > maxBytes/);
  assert.match(requestBody, /await reader\.cancel\(\)/);
});

test("search covers hidden and deep-linked archive destinations", () => {
  assert.match(oracle, /to: `\/riders\/\$\{guide\.id\}`/);
  assert.match(oracle, /to: `\/managers\/\$\{guide\.id\}`/);
  assert.match(oracle, /to: "\/characters\/terra"/);
  assert.match(oracle, /to: "\/characters\/luna"/);
  assert.match(oracle, /to: "\/dream-chapter"[\s\S]*?hash: "characters"/);
  assert.match(oracle, /to: "\/rexonance-saga"[\s\S]*?hash: "p14"/);
  assert.match(oracle, /to: "\/extreme-saga"[\s\S]*?hash: "p14"/);
  assert.match(oracle, /to: "\/form-archive"[\s\S]*?hash: "archive-switcher"/);
});

test("Archive Intelligence is an independent route reached from the shared side menu", () => {
  assert.match(intelligenceRoute, /createFileRoute\("\/intelligence"\)/);
  assert.match(intelligenceRoute, /styles-intelligence\.css\?url/);
  assert.match(intelligenceRoute, /\.\.\.WORLD_STYLESHEET_LINKS/);
  assert.match(intelligencePage, /<ArchiveIntelligenceWorkspace active \/>/);
  assert.match(intelligencePage, /<SideMenuLayer context="intelligence"/);
  assert.match(intelligencePage, /<h1 className="visually-hidden">Archive Intelligence/);
  assert.match(intelligencePage, /window\.visualViewport/);
  assert.match(intelligencePage, /--archive-viewport-height/);

  assert.doesNotMatch(chrome, /import \{ ArchiveOracle \}/);
  assert.doesNotMatch(chrome, /oracleRef|oracleOpen|site-archive-oracle-dialog/);
  assert.match(chrome, /to="\/intelligence"/);
  assert.match(chrome, /beforeNavigate=\{close\}/);
  assert.match(chrome, /aria-current=\{context === "intelligence" \? "page" : undefined\}/);
  assert.match(chrome, /<b>AIに聞く<\/b>/);
  assert.match(chrome, /会話型サーチと、8つの人格回線/);
});

test("the AI app is internally scrollable, mobile-first, and motion-aware", () => {
  assert.match(worldStyleIndex, /@import "\.\/styles-world\/27\.css"/);
  assert.match(oracleStyles, /\.archive-search-conversation \{[\s\S]*?overflow: hidden/);
  assert.match(oracleStyles, /\.archive-search-log \{[\s\S]*?overflow-y: auto/);
  assert.match(
    oracleStyles,
    /\.archive-search-message \.archive-oracle-result \{[\s\S]*?min-height: 80px/,
  );
  assert.match(oracleStyles, /\.archive-search-thinking \{/);
  assert.match(oracleStyles, /@media \(max-width: 760px\)[\s\S]*?font-size: 16px/);
  assert.match(oracleStyles, /env\(safe-area-inset-bottom/);
  assert.match(oracleStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(oracleStyles, /html\[data-world-effects="economy"\]/);
  assert.match(intelligenceStyles, /height: 100dvh/);
  assert.match(intelligenceStyles, /overflow: clip/);
  assert.match(intelligenceStyles, /height: var\(--archive-viewport-height, 100dvh\)/);
  assert.match(intelligenceStyles, /\.archive-intelligence-page \.archive-search-conversation/);
  assert.match(
    oracle,
    /className="visually-hidden" role="status" aria-live="polite" aria-atomic="true"/,
  );
  assert.match(intelligenceStyles, /@media \(max-height: 560px\)/);
});

test("the opening keeps its editorial motion contract", () => {
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
