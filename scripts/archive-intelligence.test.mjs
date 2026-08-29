import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const characters = readSource("src/lib/archive-characters.ts");
const fallback = readSource("src/lib/archive-roleplay-fallback.ts");
const intelligenceServer = readSource("src/lib/archive-intelligence.server.ts");
const rateLimitServer = readSource("src/lib/archive-ai-rate-limit.server.ts");
const intelligenceRoute = readSource("src/routes/api/archive-intelligence.ts");
const roleplay = readSource("src/components/world/archive-roleplay.tsx");
const dossierNav = readSource("src/components/world/dossier-nav.tsx");
const riderPage = readSource("src/components/world/rider-page.tsx");
const worldHome = readSource("src/components/world/world-home.tsx");
const worldStyles = readSource("src/styles-world/27.css");
const rateLimitMigration = readSource("migrations/0002_archive_ai_rate_limits.sql");

const CHARACTER_IDS = [
  "ciel",
  "keiya",
  "ayashisaku",
  "bell",
  "lore",
  "chigiri",
  "james",
  "machiavel",
];

const CHARACTER_NAMES = [
  "シエル",
  "東風谷 慶弥",
  "怪作",
  "ベル・アレイン",
  "ローア",
  "無神 千桐",
  "ジェームズ・スミス",
  "マキャベル",
];

const PORTRAITS = [
  "/archive-ai-ciel-20260829.jpg",
  "/archive-ai-keiya-20260829.jpg",
  "/archive-ai-kaisaku-20260829.jpg",
  "/archive-ai-bell-20260829.jpg",
  "/archive-ai-lore-20260829.jpg",
  "/archive-ai-chigiri-20260829.jpg",
  "/archive-ai-james-20260829.jpg",
  "/archive-ai-machiavel-20260829.jpg",
];

test("archive intelligence exposes exactly the requested eight character personas", () => {
  const roster = characters.match(
    /export const ARCHIVE_CHARACTER_IDS = \[([\s\S]*?)\] as const satisfies/,
  );
  assert.ok(roster, "ARCHIVE_CHARACTER_IDS should remain a literal, reviewable allow-list");

  const rosterIds = [...roster[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(rosterIds, CHARACTER_IDS);

  for (const name of CHARACTER_NAMES) assert.match(characters, new RegExp(name));
  for (const alias of ["月城 悠真", "暁 慶弥", "拒絶の悪夢", "CODE NUMBER: SEVEN"]) {
    assert.match(characters, new RegExp(alias));
  }

  assert.equal((characters.match(/^ {4}starters:\s*\{/gm) ?? []).length, 8);
  assert.equal((characters.match(/^ {6}normal:\s*\[/gm) ?? []).length, 8);
  assert.equal((characters.match(/^ {6}pro:\s*\[/gm) ?? []).length, 8);
  assert.equal((characters.match(/^ {4}constraints:\s*\[/gm) ?? []).length, 8);
  assert.equal((characters.match(/^ {4}local:\s*\{/gm) ?? []).length, 8);
  assert.match(characters, /export const ARCHIVE_CHARACTER_BY_ID = Object\.fromEntries/);
});

test("normal and pro modes keep distinct response and combat contracts", () => {
  assert.match(characters, /export type ArchiveRoleplayMode = "normal" \| "pro"/);
  assert.match(intelligenceServer, /NORMAL MODE:/);
  assert.match(intelligenceServer, /one to three short spoken lines plus one light action/);
  assert.match(intelligenceServer, /Every tactical field must be an empty string/);
  assert.match(intelligenceServer, /PRO MODE:/);
  assert.match(intelligenceServer, /distance, timing, counterplay, powers, costs, and terrain/);
  assert.match(intelligenceServer, /reasoning:\s*\{ effort: mode === "pro" \? "high" : "low" \}/);
  assert.match(
    intelligenceServer,
    /tactical:\s*normal\s*\?[\s\S]*?range: "", tempo: "", threat: "", objective: ""/,
  );

  assert.match(roleplay, /useState<ArchiveRoleplayMode>\("normal"\)/);
  assert.match(roleplay, /role="radiogroup"[\s\S]{0,120}?aria-label="なりきりモード"/);
  assert.match(roleplay, /<span>NORMAL<\/span>[\s\S]*?セリフ＋軽い描写/);
  assert.match(roleplay, /<span>PRO<\/span>[\s\S]*?戦闘・拡張思考/);
  assert.match(roleplay, /<TacticalHud tactical=\{message\.tactical\} \/>/);
  assert.match(fallback, /const PRO_REFLECTIONS: Record<ArchiveCharacterId, string>/);
  assert.match(
    fallback,
    /mode === "pro"[\s\S]*?combatDetected \? PRO_METHODS\[characterId\] : PRO_REFLECTIONS\[characterId\]/,
  );
  assert.match(fallback, /mode === "pro" && combatDetected/);
});

test("the provider key and upstream endpoint stay in the server-only boundary", () => {
  assert.match(intelligenceRoute, /from "@\/lib\/archive-intelligence\.server"/);
  assert.match(intelligenceServer, /process\.env\.XAI_API_KEY\?\.trim\(\)/);
  assert.match(intelligenceServer, /process\.env\.XAI_CHAT_MODEL\?\.trim\(\)/);
  assert.match(intelligenceServer, /fetch\("https:\/\/api\.x\.ai\/v1\/responses"/);
  assert.match(intelligenceServer, /authorization: `Bearer \$\{apiKey\}`/);
  assert.doesNotMatch(intelligenceServer, /import\.meta\.env|VITE_XAI/);

  for (const [name, clientSource] of [
    ["character manifest", characters],
    ["local fallback", fallback],
    ["roleplay UI", roleplay],
  ]) {
    assert.doesNotMatch(clientSource, /XAI_API_KEY|api\.x\.ai|Bearer \$\{apiKey\}/, name);
  }
});

test("remote generation disables storage and validates a bounded structured response", () => {
  assert.match(intelligenceServer, /store:\s*false/);
  assert.match(intelligenceServer, /tools:\s*\[\]/);
  assert.match(intelligenceServer, /type:\s*"json_schema"/);
  assert.match(intelligenceServer, /name:\s*"deception_world_persona_reply"/);
  assert.match(intelligenceServer, /strict:\s*true/);
  assert.match(intelligenceServer, /generatedReplySchema\.parse\(JSON\.parse\(outputText\)\)/);
  assert.match(intelligenceServer, /max_output_tokens: mode === "pro" \? 3200 : 1400/);
  assert.match(intelligenceServer, /prompt_cache_key: `deception-world-persona-v1-/);
  assert.match(intelligenceServer, /controller\.abort\(\)/);
  assert.match(intelligenceServer, /finally \{[\s\S]*?clearTimeout\(timeout\)/);
  assert.doesNotMatch(intelligenceServer, /previous_response_id|encrypted_content/);
});

test("the API enforces browser origin, bounded input, and shared production budgets", () => {
  assert.match(intelligenceRoute, /assertSameSiteRequest\(\)/);
  assert.match(
    intelligenceRoute,
    /!origin \|\| request\.headers\.get\("x-archive-client"\) !== "persona-v1"/,
  );
  assert.match(intelligenceRoute, /new URL\(origin\)\.origin !== new URL\(request\.url\)\.origin/);
  assert.match(intelligenceRoute, /fetchSite === "same-origin"/);
  assert.match(intelligenceRoute, /const MAX_BODY_BYTES = 32_000/);
  assert.match(intelligenceRoute, /declaredLength > MAX_BODY_BYTES/);
  assert.match(intelligenceRoute, /request_too_large/);
  assert.match(intelligenceRoute, /await checkArchiveAiAccess\(request, mode\)/);
  assert.match(intelligenceRoute, /cache-control": "no-store, max-age=0/);
  assert.match(intelligenceRoute, /x-content-type-options": "nosniff/);

  assert.match(rateLimitServer, /const CLIENT_MINUTE_UNITS = 6/);
  assert.match(rateLimitServer, /const CLIENT_DAILY_UNITS = 40/);
  assert.match(rateLimitServer, /const DEFAULT_GLOBAL_DAILY_UNITS = 250/);
  assert.match(rateLimitServer, /x-vercel-forwarded-for/);
  assert.match(rateLimitServer, /isIP\(vercelAddress\)/);
  assert.match(rateLimitServer, /createHmac\("sha256", apiKey\)/);
  assert.match(rateLimitServer, /INSERT INTO archive_ai_rate_limits/);
  assert.match(rateLimitServer, /ON CONFLICT \(bucket_key\) DO UPDATE/);
  assert.match(rateLimitServer, /if \(dbSource !== "neon"\)/);
  assert.match(rateLimitServer, /process\.env\.NODE_ENV === "production"/);
  assert.match(rateLimitServer, /process\.env\.VERCEL_ENV !== "production"/);
  assert.match(rateLimitServer, /mode === "pro" \? 3 : 1/);
  assert.match(rateLimitServer, /reason: "shared_limit_unavailable"/);
  assert.match(rateLimitServer, /catch \{[\s\S]*?shared_limit_unavailable/);
  assert.match(rateLimitMigration, /bucket_key TEXT PRIMARY KEY/);
  assert.match(rateLimitMigration, /expires_at TIMESTAMPTZ NOT NULL/);

  assert.match(intelligenceServer, /content: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(3000\)/);
  assert.match(
    intelligenceServer,
    /messages: z\.array\(conversationTurnSchema\)\.min\(1\)\.max\(12\)/,
  );
  assert.match(intelligenceServer, /value\.messages\.at\(-1\)\?\.role !== "user"/);
  assert.match(intelligenceServer, /if \(total > 12_000\)/);
});

test("local persona fallback covers every character and all remote failure paths", () => {
  for (const tableName of ["PRO_METHODS", "PRO_REFLECTIONS", "TACTICS", "CRISIS_OPENERS"]) {
    const table = fallback.match(
      new RegExp(`const ${tableName}: Record<ArchiveCharacterId, [^>]+> = \\{([\\s\\S]*?)\\n\\};`),
    );
    assert.ok(table, `${tableName} should remain an explicit persona allow-list`);
    const tableIds = [...table[1].matchAll(/^ {2}([a-z]+):/gm)].map((match) => match[1]);
    assert.deepEqual(
      [...new Set(tableIds)].sort(),
      [...CHARACTER_IDS].sort(),
      `${tableName} should cover exactly the eight personas`,
    );
  }
  assert.match(fallback, /source:\s*"local"/);
  assert.match(fallback, /if \(CRISIS_PATTERN\.test\(trimmed\)\)/);
  assert.match(fallback, /return createCrisisReply\(characterId\)/);
  assert.match(fallback, /生命に関わる相談では、なりきりより現実の安全を優先します/);
  assert.match(fallback, /NAVIGATION_PATTERN\.test\(trimmed\)/);
  assert.match(fallback, /navigationQuery:[\s\S]*?\.slice\(0, 160\)/);
  assert.match(fallback, /const CONTINUITY_LINES: Record<ArchiveCharacterId/);
  assert.match(fallback, /previousUserTopic\(messages\)/);
  assert.match(fallback, /export function hasTacticalSnapshot/);

  assert.match(intelligenceRoute, /if \(!remoteAccess\.allowed\)[\s\S]*?createLocalArchiveReply/);
  assert.match(intelligenceRoute, /if \(remoteReply\) return noStoreJson\(remoteReply\)/);
  assert.match(intelligenceRoute, /AI接続が未設定のため、ローカル人格コア/);
  assert.match(intelligenceRoute, /catch \{[\s\S]*?ローカル人格コアへ切り替え/);
  assert.match(roleplay, /catch \(error\)[\s\S]*?createLocalArchiveReply/);
  assert.match(roleplay, /latestAssistant\?\.source === "local"[\s\S]*?"LOCAL CORE"/);
});

test("the composer is IME-safe, abortable, stale-response safe, and links only to allow-listed results", () => {
  assert.match(roleplay, /const composingRef = useRef\(false\)/);
  assert.match(roleplay, /!event\.nativeEvent\.isComposing/);
  assert.match(roleplay, /!composingRef\.current/);
  assert.match(roleplay, /onCompositionStart=\{\(\) => \{[\s\S]*?composingRef\.current = true/);
  assert.match(roleplay, /onCompositionEnd=\{\(\) => \{[\s\S]*?composingRef\.current = false/);

  assert.match(roleplay, /const abortRef = useRef<AbortController \| null>\(null\)/);
  assert.match(roleplay, /abortRef\.current\?\.abort\(\)/);
  assert.match(roleplay, /signal: controller\.signal/);
  assert.match(roleplay, /requestSequenceRef\.current !== sequence/);
  assert.match(roleplay, /useEffect\(\(\) => \(\) => stopResponse\(false\)/);
  assert.match(roleplay, /credentials:\s*"same-origin"/);
  assert.match(roleplay, /"x-archive-client": "persona-v1"/);
  assert.match(roleplay, /if \(!response\.ok\)/);
  assert.match(roleplay, /if \(!isArchiveReply\(payload\)\)/);

  assert.match(
    roleplay,
    /const results = useMemo\(\(\) => \(query \? searchArchive\(query, 2\) : \[\]\)/,
  );
  assert.match(
    roleplay,
    /<GuardedLink[\s\S]*?to=\{entry\.to\}[\s\S]*?hash=\{entry\.hash\}[\s\S]*?assets=\{entry\.assets\}/,
  );
  assert.match(roleplay, /message\.text\s*\.split\("\\n"\)/);
  assert.doesNotMatch(
    roleplay,
    /dangerouslySetInnerHTML|window\.location|location\.assign|href=\{message\.|to=\{message\./,
  );
});

test("the mobile persona conversation and privacy disclosure stay readable", () => {
  assert.match(
    worldStyles,
    /\.archive-roleplay-privacy > p \{[\s\S]*?color: rgba\(207, 225, 237, 0\.72\);[\s\S]*?font-size: 12px/,
  );
  assert.match(
    worldStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.archive-roleplay-message-body > p \{[\s\S]*?font-size: 14px/,
  );
  assert.match(
    worldStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.archive-roleplay-privacy > p \{[\s\S]*?font-size: 11\.5px/,
  );
});

test("all persona portraits are real local JPEGs with useful accessible text", () => {
  const portraitMatches = [...characters.matchAll(/portrait:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(portraitMatches, PORTRAITS);
  assert.equal((characters.match(/portraitAlt:\s*"[^"]+"/g) ?? []).length, 8);
  assert.match(roleplay, /src=\{profile\.portrait\}/);
  assert.match(roleplay, /alt=\{profile\.portraitAlt\}/);
  assert.match(roleplay, /decoding="async"/);

  for (const portrait of PORTRAITS) {
    const asset = new URL(`../public/${portrait.slice(1)}`, import.meta.url);
    assert.ok(existsSync(asset), `${portrait} should exist in public/`);
    assert.ok(statSync(asset).size > 50_000, `${portrait} should not be an empty placeholder`);
    const signature = readFileSync(asset).subarray(0, 2);
    assert.deepEqual([...signature], [0xff, 0xd8], `${portrait} should be a JPEG`);
  }
});

test("the new James portrait replaces the old civilian artwork at every character-facing entry", () => {
  assert.match(
    dossierNav,
    /id: "over-zeztz"[\s\S]{0,300}?assets: \["\/archive-ai-james-20260829\.jpg"\]/,
  );
  assert.match(worldHome, /id: "over-zeztz"[\s\S]{0,900}?img: "\/archive-ai-james-20260829\.jpg"/);
  assert.match(
    riderPage,
    /id: "over-zeztz"[\s\S]{0,1600}?civilianImg: "\/archive-ai-james-20260829\.jpg"/,
  );

  assert.doesNotMatch(dossierNav, /rider-over-zeztz-home\.jpeg/);
  assert.doesNotMatch(worldHome, /rider-over-zeztz-home\.jpeg/);
  assert.doesNotMatch(riderPage, /civilian-over-zeztz\.jpeg/);
});
