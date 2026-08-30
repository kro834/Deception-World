import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import {
  chargeArchiveAiAccessInTransaction,
  checkArchiveAiAccessWithDependencies,
  resolveArchiveRateIdentity,
} from "../src/lib/archive-ai-rate-limit.server.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const characters = readSource("src/lib/archive-characters.ts");
const fallback = readSource("src/lib/archive-roleplay-fallback.ts");
const intelligenceServer = readSource("src/lib/archive-intelligence.server.ts");
const openAiTransport = readSource("src/lib/archive-openai-transport.server.ts");
const archiveApiClient = readSource("src/lib/archive-api-client.ts");
const modelConfig = readSource("src/lib/archive-model-config.ts");
const conversationBoundary = readSource("src/lib/archive-conversation.server.ts");
const rateLimitServer = readSource("src/lib/archive-ai-rate-limit.server.ts");
const intelligenceRoute = readSource("src/routes/api/archive-intelligence.ts");
const aiJob = readSource("src/lib/archive-ai-job.server.ts");
const aiLedger = readSource("src/lib/archive-ai-ledger.server.ts");
const aiHttp = readSource("src/lib/archive-ai-http.server.ts");
const requestBody = readSource("src/lib/archive-request-body.server.ts");
const roleplay = readSource("src/components/world/archive-roleplay.tsx");
const dossierNav = readSource("src/components/world/dossier-nav.tsx");
const riderPage = readSource("src/components/world/rider-page.tsx");
const worldHome = readSource("src/components/world/world-home.tsx");
const worldStyles = readSource("src/styles-world/27.css");
const rateLimitMigration = readSource("migrations/0002_archive_ai_rate_limits.sql");
const requestLedgerMigration = readSource("migrations/0003_archive_ai_requests.sql");

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
  assert.equal((characters.match(/^ {4}innerLife:\s*/gm) ?? []).length, 8);
  assert.equal((characters.match(/^ {4}relationships:\s*/gm) ?? []).length, 8);
  assert.equal((characters.match(/^ {4}local:\s*\{/gm) ?? []).length, 8);
  assert.match(characters, /export const ARCHIVE_CHARACTER_BY_ID = Object\.fromEntries/);
});

test("Bell's known lines are never attributed to Keiya", () => {
  const keiyaStart = characters.indexOf('id: "keiya"');
  const bellStart = characters.indexOf('id: "bell"');
  const keiyaEnd = characters.indexOf('id: "ayashisaku"', keiyaStart);
  const bellEnd = characters.indexOf('id: "lore"', bellStart);
  assert.ok(keiyaStart >= 0 && keiyaEnd > keiyaStart);
  assert.ok(bellStart >= 0 && bellEnd > bellStart);

  const keiyaProfile = characters.slice(keiyaStart, keiyaEnd);
  const bellProfile = characters.slice(bellStart, bellEnd);
  for (const line of ["ああ…処理しといて", "良い人だった事は間違い無い！", "いや、仕留める"]) {
    assert.doesNotMatch(keiyaProfile, new RegExp(line));
    assert.match(bellProfile, new RegExp(line));
    assert.match(riderPage, new RegExp(line));
  }
  assert.match(intelligenceServer, /KNOWN CANON LINES/);
});

test("normal and pro modes keep distinct response and human conversation contracts", () => {
  assert.match(characters, /export type ArchiveRoleplayMode = "normal" \| "pro"/);
  assert.match(intelligenceServer, /NORMAL MODE:/);
  assert.match(intelligenceServer, /one to three short spoken lines plus one light action/);
  assert.match(intelligenceServer, /Every tactical field must be an empty string/);
  assert.match(intelligenceServer, /PRO MODE:/);
  assert.match(intelligenceServer, /deep, natural character conversation, not a combat mode/);
  assert.match(intelligenceServer, /Preserve the character's human irregularities/);
  assert.match(
    intelligenceServer,
    /Only when the user explicitly presents an active fictional combat scene/,
  );
  assert.match(
    intelligenceServer,
    /mode === "pro" && combatRequested[\s\S]*?range: "", tempo: "", threat: "", objective: ""/,
  );

  assert.match(roleplay, /useState<ArchiveRoleplayMode>\("normal"\)/);
  assert.match(roleplay, /role="radiogroup"[\s\S]{0,120}?aria-label="なりきりモード"/);
  assert.match(roleplay, /<span>NORMAL<\/span>[\s\S]*?セリフ＋軽い描写/);
  assert.match(roleplay, /<span>PRO<\/span>[\s\S]*?自然な対話・深い理解/);
  assert.match(roleplay, /ARCHIVE_RUNTIME_MODEL_LABEL/);
  assert.match(roleplay, /会話の流れ・感情・人格記録を深く考えています/);
  assert.match(roleplay, /waitForArchiveThinkingFloor\(thinkingStartedAt, controller\.signal\)/);
  assert.match(roleplay, /<TacticalHud tactical=\{message\.tactical\} \/>/);
  assert.match(
    fallback,
    /const PRO_DIALOGUE: Record<ArchiveCharacterId, Record<LocalIntent, string>>/,
  );
  assert.match(fallback, /isExplicitFictionalCombatInput/);
  assert.doesNotMatch(fallback, /PRO_METHODS|PRO_REFLECTIONS/);
  assert.match(fallback, /mode === "pro" && combatDetected/);
});

test("the provider key and upstream endpoint stay in the server-only boundary", () => {
  assert.match(intelligenceRoute, /from "@\/lib\/archive-intelligence\.server"/);
  assert.match(intelligenceServer, /archiveAiApiKey\(/);
  assert.match(modelConfig, /"gpt-5\.6-sol"/);
  assert.match(modelConfig, /model: "gpt-5\.6-luna"/);
  assert.match(intelligenceServer, /requestOpenAiStructuredResponse\(\{/);
  assert.match(openAiTransport, /archiveAiBaseUrl\(\)/);
  assert.match(openAiTransport, /buildArchiveAiProviderBody\(/);
  assert.match(openAiTransport, /delete next\.reasoning/);
  assert.match(openAiTransport, /authorization: `Bearer \$\{apiKey\}`/);
  assert.doesNotMatch(`${intelligenceServer}\n${openAiTransport}`, /import\.meta\.env|VITE_OPENAI/);

  for (const [name, clientSource] of [
    ["character manifest", characters],
    ["local fallback", fallback],
    ["roleplay UI", roleplay],
  ]) {
    assert.doesNotMatch(clientSource, /OPENAI_API_KEY|api\.openai\.com|Bearer \$\{apiKey\}/, name);
  }
});

test("remote generation disables storage and validates a bounded structured response", () => {
  assert.match(intelligenceServer, /store:\s*false/);
  assert.match(intelligenceServer, /tools:\s*\[\]/);
  assert.match(intelligenceServer, /type:\s*"json_schema"/);
  assert.match(intelligenceServer, /name:\s*"deception_world_persona_reply"/);
  assert.match(intelligenceServer, /strict:\s*true/);
  assert.match(intelligenceServer, /generatedReplySchema\.parse\(JSON\.parse\(outputText\)\)/);
  assert.match(modelConfig, /profile === "instant"[\s\S]*?effort: "none"/);
  assert.match(modelConfig, /profile === "max"[\s\S]*?effort: "max"/);
  assert.match(modelConfig, /effort: "max", mode: "pro", context: "current_turn"/);
  assert.match(intelligenceServer, /resolveArchivePersonaRoute\(mode, proProfile\)/);
  assert.match(intelligenceServer, /reasoning: execution\.reasoning/);
  assert.match(intelligenceServer, /max_output_tokens: execution\.maxOutputTokens/);
  assert.match(intelligenceServer, /timeoutMs: execution\.timeoutMs/);
  assert.doesNotMatch(intelligenceServer, /ARCHIVE_NORMAL_MODEL/);
  assert.match(intelligenceServer, /prompt_cache_key: `deception-world-persona-v3-/);
  assert.match(modelConfig, /ARCHIVE_MIN_THINKING_MS = 180/);
  assert.match(openAiTransport, /const controller = new AbortController\(\)/);
  assert.match(openAiTransport, /controller\.abort\(/);
  assert.match(openAiTransport, /finally \{[\s\S]*?clearTimeout\(timeout\)/);
  assert.doesNotMatch(intelligenceServer, /previous_response_id|encrypted_content/);
});

test("persona model profiles resolve to fixed runtime routes", async () => {
  const { archivePersonaCostClass, resolveArchivePersonaProRoute, resolveArchivePersonaRoute } =
    await import(new URL("../src/lib/archive-model-config.ts", import.meta.url));
  const normal = resolveArchivePersonaRoute("normal", "pro");
  const instant = resolveArchivePersonaProRoute("instant");
  const max = resolveArchivePersonaProRoute("max");
  const pro = resolveArchivePersonaProRoute("pro");
  assert.equal(normal.model, "gpt-5.6-luna");
  assert.equal(normal.reasoning.effort, "low");
  assert.equal("mode" in normal.reasoning, false);
  assert.equal(instant.model, "gpt-5.6-sol");
  assert.equal(instant.reasoning.effort, "none");
  assert.equal("mode" in instant.reasoning, false);
  assert.equal(max.reasoning.effort, "max");
  assert.equal("mode" in max.reasoning, false);
  assert.equal(pro.reasoning.effort, "max");
  assert.equal(pro.reasoning.mode, "pro");
  assert.deepEqual(
    ["instant", "max", "pro"].map((profile) => archivePersonaCostClass("pro", profile)),
    ["standard", "advanced", "pro"],
  );
  assert.equal(archivePersonaCostClass("normal", "pro"), "standard");
});

test("archive rate identity trusts Vercel headers in verified priority order", () => {
  const request = new Request("https://archive.example/api/archive-intelligence", {
    headers: {
      "x-vercel-forwarded-for": "2001:db8::7",
      "x-forwarded-for": "203.0.113.8, 198.51.100.9",
      "x-real-ip": "192.0.2.10",
    },
  });
  assert.equal(resolveArchiveRateIdentity(request, { VERCEL: "1" }), "2001:db8::7");

  const invalidVercel = new Request(request.url, {
    headers: {
      "x-vercel-forwarded-for": "not-an-ip",
      "x-forwarded-for": "203.0.113.8, 198.51.100.9",
      "x-real-ip": "192.0.2.10",
    },
  });
  assert.equal(resolveArchiveRateIdentity(invalidVercel, { VERCEL: "1" }), "203.0.113.8");

  const onlyRealIp = new Request(request.url, {
    headers: {
      "x-vercel-forwarded-for": "unknown",
      "x-forwarded-for": "also-unknown",
      "x-real-ip": "192.0.2.10",
    },
  });
  assert.equal(resolveArchiveRateIdentity(onlyRealIp, { VERCEL: "1" }), "192.0.2.10");
  assert.equal(
    resolveArchiveRateIdentity(new Request(request.url), { VERCEL: "1" }),
    "anonymous-vercel",
  );
});

test("unknown production proxies share an anonymous bucket instead of disabling AI", () => {
  const spoofed = new Request("https://archive.example/api/archive-search", {
    headers: { "x-forwarded-for": "203.0.113.77", "x-real-ip": "192.0.2.4" },
  });
  assert.equal(
    resolveArchiveRateIdentity(spoofed, { NODE_ENV: "production" }),
    "anonymous-production",
  );
  assert.equal(resolveArchiveRateIdentity(spoofed, { NODE_ENV: "development" }), "203.0.113.77");
});

test("configured shared limits remain authoritative", async () => {
  const sharedCalls = [];
  const fallbackReasons = [];
  const result = await checkArchiveAiAccessWithDependencies(
    new Request("https://archive.example/api/archive-intelligence", {
      headers: { "x-vercel-forwarded-for": "203.0.113.31" },
    }),
    "pro",
    {
      apiKey: "shared-limit-test-key",
      databaseSource: "neon",
      environment: {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        ARCHIVE_RATE_LIMIT_SECRET: "shared-rate-limit-secret-at-least-32-bytes",
      },
      now: Date.UTC(2040, 0, 1),
      checkShared: async (...args) => {
        sharedCalls.push(args);
        return true;
      },
      reportFallback: (reason) => fallbackReasons.push(reason),
    },
  );

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "allowed");
  assert.equal(result.safetyIdentifier?.length, 40);
  assert.equal(sharedCalls.length, 1);
  assert.equal(sharedCalls[0][2], 3, "pro requests retain their weighted shared cost");
  assert.deepEqual(fallbackReasons, []);
});

test("a rejected logical request rolls all three SQL buckets back and never recharges", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(rateLimitMigration);
  await pg.exec(requestLedgerMigration);
  const sqlSurface = (run, transact) => {
    const sql = async () => {
      throw new Error("tagged SQL is not used by this test");
    };
    sql.query = run;
    sql.transaction = transact ?? ((callback) => callback(sql));
    return sql;
  };
  const sql = sqlSurface(
    async (text, params = []) => (await pg.query(text, params)).rows,
    (callback) =>
      pg.transaction((transaction) =>
        callback(
          sqlSurface(async (text, params = []) => (await transaction.query(text, params)).rows),
        ),
      ),
  );
  const now = Date.UTC(2042, 3, 5, 6, 7, 8);
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const sessionHash = "b".repeat(64);
  const firstRequestId = crypto.randomUUID();
  const deniedRequestId = crypto.randomUUID();
  const environment = {
    NODE_ENV: "development",
    OPENAI_API_KEY: "atomic-admission-test-key",
    ARCHIVE_RATE_LIMIT_SECRET: "atomic-rate-limit-secret-at-least-32-bytes",
    ARCHIVE_AI_CLIENT_MINUTE_LIMIT: "100",
    ARCHIVE_AI_CLIENT_DAILY_LIMIT: "100",
    ARCHIVE_AI_GLOBAL_DAILY_LIMIT: "1",
  };
  const request = new Request("http://localhost/api/archive-search");
  const charge = (requestId) =>
    sql.transaction((transaction) =>
      chargeArchiveAiAccessInTransaction(
        transaction,
        request,
        "standard",
        requestId,
        sessionHash,
        environment,
        now,
      ),
    );

  try {
    assert.equal((await charge(firstRequestId))?.allowed, true);
    assert.equal((await charge(deniedRequestId))?.allowed, false);
    assert.equal((await charge(deniedRequestId))?.allowed, false, "same ID stays denied");

    const keys = [`minute:${minute}:${sessionHash}`, `day:${day}:${sessionHash}`, `global:${day}`];
    const buckets = await sql.query(
      `SELECT bucket_key, request_count
     FROM archive_ai_rate_limits
     WHERE bucket_key = ANY($1::text[])
     ORDER BY bucket_key`,
      [keys],
    );
    assert.equal(buckets.length, 3);
    assert.deepEqual(
      buckets.map((bucket) => bucket.request_count),
      [1, 1, 1],
      "minute and daily increments before the global denial must be rolled back",
    );
    const charges = await sql.query(
      `SELECT request_id::text, allowed
     FROM archive_ai_rate_charges
     WHERE request_id = ANY($1::uuid[])
     ORDER BY request_id`,
      [[firstRequestId, deniedRequestId]],
    );
    assert.equal(charges.length, 2);
    assert.deepEqual(charges.map((chargeRow) => chargeRow.allowed).sort(), [false, true]);
  } finally {
    await pg.close();
  }
});

test("fallback identity ignores browser session headers without a trusted ledger hash", async () => {
  const clientKeys = [];
  const baseDependencies = {
    apiKey: "shared-limit-test-key",
    databaseSource: "neon",
    environment: {
      NODE_ENV: "production",
      VERCEL: "1",
      ARCHIVE_RATE_LIMIT_SECRET: "shared-rate-limit-secret-at-least-32-bytes",
    },
    now: Date.UTC(2040, 0, 1),
    checkShared: async (clientKey) => {
      clientKeys.push(clientKey);
      return true;
    },
    reportFallback: () => {},
  };
  for (const sessionId of [crypto.randomUUID(), crypto.randomUUID()]) {
    await checkArchiveAiAccessWithDependencies(
      new Request("https://archive.example/api/archive-search", {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.88",
          "x-archive-session-id": sessionId,
        },
      }),
      "standard",
      baseDependencies,
    );
  }
  assert.equal(clientKeys.length, 2);
  assert.equal(clientKeys[0], clientKeys[1]);
});

test("production fails closed when shared storage is missing or unavailable", async () => {
  const request = new Request("https://archive.example/api/archive-search", {
    headers: { "x-vercel-forwarded-for": "203.0.113.41" },
  });
  const fallbackReasons = [];
  const base = {
    apiKey: "memory-fallback-test-key",
    environment: {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      ARCHIVE_AI_CLIENT_MINUTE_LIMIT: "3",
      ARCHIVE_AI_CLIENT_DAILY_LIMIT: "3",
      ARCHIVE_AI_GLOBAL_DAILY_LIMIT: "3",
      ARCHIVE_RATE_LIMIT_SECRET: "shared-rate-limit-secret-at-least-32-bytes",
    },
    now: Date.UTC(2040, 0, 2),
    checkShared: async () => {
      throw new Error("simulated shared store outage");
    },
    reportFallback: (reason) => fallbackReasons.push(reason),
  };

  const databaseMissing = await checkArchiveAiAccessWithDependencies(request, "standard", {
    ...base,
    databaseSource: "pglite",
  });
  assert.equal(databaseMissing.allowed, false);
  assert.equal(databaseMissing.reason, "shared_state_unavailable");
  assert.deepEqual(fallbackReasons, ["database_unconfigured"]);

  const sharedFailure = await checkArchiveAiAccessWithDependencies(request, "pro", {
    ...base,
    databaseSource: "neon",
  });
  assert.equal(sharedFailure.allowed, false);
  assert.equal(sharedFailure.reason, "shared_state_unavailable");
  assert.deepEqual(fallbackReasons, ["database_unconfigured", "shared_store_error"]);
});

test("a missing API key remains the only configuration state that immediately disables AI", async () => {
  let sharedCalled = false;
  const result = await checkArchiveAiAccessWithDependencies(
    new Request("https://archive.example/api/archive-search"),
    "standard",
    {
      apiKey: "  ",
      databaseSource: "neon",
      environment: { NODE_ENV: "production" },
      now: Date.UTC(2040, 0, 3),
      checkShared: async () => {
        sharedCalled = true;
        return true;
      },
      reportFallback: () => assert.fail("fallback should not run without a provider key"),
    },
  );
  assert.deepEqual(result, { allowed: false, reason: "unconfigured" });
  assert.equal(sharedCalled, false);
});

test("the API enforces browser origin, bounded input, and shared production budgets", () => {
  assert.match(intelligenceRoute, /assertSameSiteRequest\(\)/);
  assert.match(intelligenceRoute, /isAllowedArchiveBrowserRequest\(request, "persona-v1"\)/);
  assert.match(intelligenceRoute, /const MAX_BODY_BYTES = 65_536/);
  assert.match(intelligenceRoute, /readArchiveRequestBody\(request, MAX_BODY_BYTES\)/);
  assert.match(intelligenceRoute, /request_too_large/);
  assert.match(aiJob, /await checkArchiveAiAccess\(/);
  assert.match(aiHttp, /cache-control": "no-store, max-age=0/);
  assert.match(aiHttp, /x-content-type-options": "nosniff/);

  assert.match(rateLimitServer, /const DEFAULT_CLIENT_MINUTE_UNITS = 12/);
  assert.match(rateLimitServer, /const DEFAULT_CLIENT_DAILY_UNITS = 120/);
  assert.match(rateLimitServer, /const DEFAULT_GLOBAL_DAILY_UNITS = 250/);
  assert.match(rateLimitServer, /"ARCHIVE_AI_CLIENT_MINUTE_LIMIT"/);
  assert.match(rateLimitServer, /"ARCHIVE_AI_CLIENT_DAILY_LIMIT"/);
  assert.match(rateLimitServer, /x-vercel-forwarded-for/);
  assert.match(rateLimitServer, /"x-forwarded-for"/);
  assert.match(rateLimitServer, /"x-real-ip"/);
  assert.match(rateLimitServer, /isIP\(address\)/);
  assert.match(rateLimitServer, /"anonymous-vercel"/);
  assert.match(rateLimitServer, /"anonymous-production"/);
  assert.match(rateLimitServer, /archiveRateLimitSecret\(environment\)/);
  assert.match(rateLimitServer, /createHmac\("sha256", identitySecret\)/);
  assert.match(rateLimitServer, /trustedSessionHash && \/\^\[0-9a-f\]\{64\}\$\//);
  assert.match(aiJob, /row\.request_id,\s*row\.session_hash,/);
  assert.match(rateLimitServer, /INSERT INTO archive_ai_rate_limits/);
  assert.match(rateLimitServer, /ON CONFLICT \(bucket_key\) DO UPDATE/);
  assert.match(rateLimitServer, /databaseSource === "neon"/);
  assert.match(rateLimitServer, /shared_state_unavailable/);
  assert.match(rateLimitServer, /environment\.ARCHIVE_AI_REQUIRED === "1"/);
  assert.doesNotMatch(rateLimitServer, /VERCEL_ENV !== "production"/);
  assert.match(rateLimitServer, /costClass === "pro" \? 3 : costClass === "advanced" \? 2 : 1/);
  assert.match(rateLimitServer, /safetyIdentifier: allowed \? clientKey : undefined/);
  assert.match(intelligenceServer, /safety_identifier: safetyIdentifier/);
  assert.match(intelligenceServer, /serializeUntrustedArchiveConversation\(messages\)/);
  assert.doesNotMatch(intelligenceServer, /input: messages\.map/);
  assert.match(conversationBoundary, /UNVERIFIED PRIOR REPLY/);
  assert.match(requestBody, /request\.body\.getReader\(\)/);
  assert.match(requestBody, /received > maxBytes/);
  assert.match(rateLimitServer, /reportFallback\("shared_store_error"\)/);
  assert.match(rateLimitServer, /reportFallback\("database_unconfigured"\)/);
  assert.match(rateLimitMigration, /bucket_key TEXT PRIMARY KEY/);
  assert.match(rateLimitMigration, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(requestLedgerMigration, /archive_ai_rate_charges/);
  assert.match(requestLedgerMigration, /archive_ai_requests/);
  assert.match(aiLedger, /return sql\.transaction\(async \(transaction\) =>/);
  assert.match(aiLedger, /chargeArchiveAiAccessInTransaction\(\s*transaction,/);
  assert.match(rateLimitServer, /const savepoint = "archive_ai_rate_buckets"/);
  assert.match(rateLimitServer, /SAVEPOINT \$\{savepoint\}/);
  assert.match(rateLimitServer, /ROLLBACK TO SAVEPOINT/);
  assert.match(rateLimitServer, /RELEASE SAVEPOINT/);
  assert.match(
    rateLimitServer,
    /INSERT INTO archive_ai_rate_charges[\s\S]*?ON CONFLICT \(request_id\) DO NOTHING/,
  );

  assert.match(
    intelligenceServer,
    /content: z[\s\S]*?\.string\(\)[\s\S]*?\.transform\(normalizeArchiveInput\)[\s\S]*?\.refine\(hasVisibleArchiveText\)[\s\S]*?value\.length <= 3000/,
  );
  assert.match(
    intelligenceServer,
    /messages: z\.array\(conversationTurnSchema\)\.min\(1\)\.max\(12\)/,
  );
  assert.match(intelligenceServer, /value\.messages\.at\(-1\)\?\.role !== "user"/);
  assert.match(intelligenceServer, /if \(total > 12_000\)/);
});

test("the persona byte envelope accepts its full Japanese character budget", () => {
  const payload = JSON.stringify({
    characterId: "ciel",
    mode: "pro",
    proProfile: "pro",
    messages: Array.from({ length: 4 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: "界".repeat(3000),
    })),
  });
  assert.ok(Buffer.byteLength(payload, "utf8") < 65_536);
});

test("server-confirmed local persona fallback covers every character without client-side fabrication", () => {
  for (const [tableName, nextMarker] of [
    ["PRO_DIALOGUE", "const TACTICS"],
    ["TACTICS", "const EMPTY_TACTICAL"],
    ["CRISIS_OPENERS", "function createCrisisReply"],
  ]) {
    const start = fallback.indexOf(`const ${tableName}`);
    const end = fallback.indexOf(nextMarker, start + 1);
    assert.ok(start >= 0 && end > start, `${tableName} should remain reviewable`);
    const tableIds = [...fallback.slice(start, end).matchAll(/^ {2}([a-z]+):/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      [...new Set(tableIds)].sort(),
      [...CHARACTER_IDS].sort(),
      `${tableName} should cover exactly the eight personas`,
    );
  }
  assert.match(fallback, /source:\s*"local"/);
  assert.match(fallback, /if \(CRISIS_PATTERN\.test\(classified\)\)/);
  assert.match(fallback, /return createCrisisReply\(characterId, deliveryReason\)/);
  assert.match(fallback, /生命に関わる相談では、なりきりより現実の安全を優先します/);
  assert.match(fallback, /NAVIGATION_PATTERN\.test\(trimmed\)/);
  assert.match(fallback, /navigationQuery:[\s\S]*?truncateArchiveInput\([\s\S]*?, 160\)/);
  assert.match(fallback, /const CONTINUITY_LINES: Record<ArchiveCharacterId/);
  assert.match(fallback, /previousUserTopic\(messages\)/);
  assert.match(fallback, /export function hasTacticalSnapshot/);

  assert.match(aiJob, /if \(!access\.allowed\)/);
  assert.match(aiJob, /return finishLocal\(row, decryptedPayload, reason\)/);
  assert.match(aiJob, /AI接続が未設定のため、\$\{noun\}/);
  assert.match(aiJob, /archiveProviderFailureReason\(error\)/);
  assert.doesNotMatch(roleplay, /catch \(error\)[\s\S]*?createLocalArchiveReply/);
  assert.match(roleplay, /ローカル回答へは置き換えていません/);
  assert.match(
    roleplay,
    /cancelArchiveApi\(\{ client: "persona-v1", requestId, sessionId \}\)/,
  );
  assert.match(roleplay, /<ArchiveConnectionHealth/);
  assert.match(roleplay, /recordArchiveAiHealth\(\{/);
});

test("the composer sends only by button, stays abortable and stale-response safe, and links only to allow-listed results", () => {
  assert.doesNotMatch(roleplay, /handleComposerKeyDown|onCompositionStart|onCompositionEnd/);
  assert.doesNotMatch(roleplay, /type="submit"/);
  assert.match(roleplay, /enterKeyHint="enter"/);
  assert.match(
    roleplay,
    /type="button"[\s\S]*?onClick=\{\(\) =>[\s\S]*?void sendMessage\(\s*draft/,
  );

  assert.match(roleplay, /const abortRef = useRef<AbortController \| null>\(null\)/);
  assert.match(roleplay, /abortRef\.current\?\.abort\(\)/);
  assert.match(
    roleplay,
    /if \(!hasVisibleArchiveText\(value\) \|\| value\.length > maxLength \|\| abortRef\.current\) return/,
  );
  assert.match(roleplay, /if \(abortRef\.current === controller\) abortRef\.current = null/);
  assert.match(roleplay, /signal: controller\.signal/);
  assert.match(roleplay, /requestSequenceRef\.current !== sequence/);
  assert.match(roleplay, /useEffect\(\(\) => \(\) => stopResponse\(false\)/);
  assert.match(roleplay, /postArchiveApi\(\{/);
  assert.match(roleplay, /url: "\/api\/archive-intelligence"/);
  assert.match(roleplay, /client: "persona-v1"/);
  assert.match(roleplay, /validate: isArchiveReply/);
  assert.match(archiveApiClient, /credentials:\s*"same-origin"/);
  assert.match(archiveApiClient, /"x-archive-client": client/);
  assert.match(archiveApiClient, /if \(!response\.ok\)/);

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

test("the Over Zeztz rider thumbnail stays distinct from James persona artwork", () => {
  assert.match(
    dossierNav,
    /id: "over-zeztz"[\s\S]{0,300}?assets: \["\/archive-ai-james-20260829\.jpg"\]/,
  );
  assert.match(
    worldHome,
    /id: "over-zeztz"[\s\S]{0,900}?img: "\/rider-over-zeztz-thumbnail-20260829\.jpg"/,
  );
  assert.match(
    riderPage,
    /id: "over-zeztz"[\s\S]{0,1600}?civilianImg: "\/archive-ai-james-20260829\.jpg"/,
  );

  assert.doesNotMatch(dossierNav, /rider-over-zeztz-home\.jpeg/);
  assert.doesNotMatch(worldHome, /rider-over-zeztz-home\.jpeg/);
  assert.doesNotMatch(riderPage, /civilian-over-zeztz\.jpeg/);

  const riderThumbnail = new URL(
    "../public/rider-over-zeztz-thumbnail-20260829.jpg",
    import.meta.url,
  );
  assert.ok(existsSync(riderThumbnail));
  assert.ok(statSync(riderThumbnail).size > 100_000);
  assert.deepEqual([...readFileSync(riderThumbnail).subarray(0, 2)], [0xff, 0xd8]);
});
