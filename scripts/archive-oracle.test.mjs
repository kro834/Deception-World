import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const oracle = readSource("src/components/world/archive-oracle.tsx");
const roleplay = readSource("src/components/world/archive-roleplay.tsx");
const searchContract = readSource("src/lib/archive-search.ts");
const searchServer = readSource("src/lib/archive-search.server.ts");
const openAiTransport = readSource("src/lib/archive-openai-transport.server.ts");
const archiveApiClient = readSource("src/lib/archive-api-client.ts");
const searchCatalog = readSource("src/lib/archive-search-catalog.server.ts");
const searchRoute = readSource("src/routes/api/archive-search.ts");
const aiJob = readSource("src/lib/archive-ai-job.server.ts");
const aiHttp = readSource("src/lib/archive-ai-http.server.ts");
const requestBody = readSource("src/lib/archive-request-body.server.ts");
const chrome = readSource("src/components/world/world-chrome.tsx");
const intelligencePage = readSource("src/components/world/archive-intelligence-page.tsx");
const intelligenceRoute = readSource("src/routes/intelligence.tsx");
const intelligenceStyles = readSource("src/styles-intelligence.css");
const modelConfig = readSource("src/lib/archive-model-config.ts");
const modelSelector = readSource("src/components/world/archive-model-selector.tsx");
const oracleStyles = readSource("src/styles-world/27.css");
const worldStyleIndex = readSource("src/styles-world.css");
const title = readSource("src/components/cinematic/title-sequence.tsx");
const globalStyles = readSource("src/styles.css");
const loadGate = readSource("src/components/load-gate.tsx");
const routeTransitionStyles = readSource("src/styles-route-transitions.css");

test("search is conversational while navigation stays on a deterministic allow-list", () => {
  assert.match(oracle, /export const ARCHIVE_ORACLE_ENTRIES/);
  assert.match(oracle, /function searchArchiveOracle/);
  assert.match(oracle, /\.slice\(0, Math\.min\(limit, 3\)\)/);
  assert.match(oracle, /memoryNotes: archiveMemoryNoteTexts\(\)/);
  assert.match(searchServer, /memoryNotes/);
  assert.match(searchServer, /USER INTENT MEMORY/);
  assert.match(oracle, /url: "\/api\/archive-search"/);
  assert.match(oracle, /client: "search-v1"/);
  assert.match(oracle, /validate: isArchiveSearchReply/);
  assert.match(archiveApiClient, /"x-archive-client": client/);
  assert.match(archiveApiClient, /credentials: "same-origin"/);
  assert.match(oracle, /className="archive-search-log"/);
  assert.match(oracle, /role="log"/);
  assert.match(oracle, /archiveLifecycleText\(searchLifecycle\)/);
  assert.match(oracle, /接続を確認しています/);
  assert.match(oracle, /waitForArchiveThinkingFloor\(thinkingStartedAt, controller\.signal\)/);
  assert.match(oracle, /search-local-wait/);
  assert.match(oracle, /createLocalArchiveSearchReply/);
  assert.match(oracle, /forceArchive: results\.length > 0/);
  assert.match(oracle, /resolveConversationalSearchQuery\(rawQuery/);
  assert.doesNotMatch(
    oracle,
    /もちろん、公開記録に限らず普通の質問や相談にも答えられます。いまの内容は作品記録と直接は結びつかない/,
  );
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
  assert.match(searchContract, /referenceCandidateIds/);
  assert.match(searchContract, /focusCandidateId: anotherRequested/);
});

test("Search exposes validated GPT-5.5, Terra, and Terra Pro routes with safe fallback", () => {
  assert.match(searchServer, /archiveAiApiKey\(/);
  assert.match(modelConfig, /ARCHIVE_SEARCH_MODELS = \["gpt-5\.6-terra", "gpt-5\.5"\]/);
  assert.match(modelConfig, /ARCHIVE_SEARCH_EFFORTS = \["low", "medium", "high", "xhigh"\]/);
  assert.match(modelConfig, /ARCHIVE_SEARCH_EXECUTIONS = \["standard", "pro"\]/);
  assert.match(searchServer, /modelPreference: searchPreferenceSchema/);
  assert.match(searchServer, /value\.model !== "gpt-5\.6-terra"/);
  assert.match(searchServer, /value\.effort !== "xhigh"/);
  assert.match(searchServer, /requestOpenAiStructuredResponse\(\{/);
  assert.match(openAiTransport, /archiveAiBaseUrl\(\)/);
  assert.match(searchServer, /store: false/);
  assert.match(searchServer, /tools: \[\]/);
  assert.match(modelConfig, /effort: "xhigh", mode: "pro", context: "current_turn"/);
  assert.match(modelConfig, /effort: preference\.effort/);
  assert.match(searchServer, /max_output_tokens: route\.maxOutputTokens/);
  assert.match(searchServer, /name: "deception_world_search_reply"/);
  assert.match(searchServer, /SEARCH PRO:/);
  assert.match(searchServer, /focusCandidateId must be the id/);
  assert.match(searchServer, /capable general-purpose conversational AI/);
  assert.match(searchServer, /Handle greetings, casual conversation/);
  assert.match(searchServer, /Do not force every turn into archive search/);
  assert.match(searchServer, /A candidate's mere presence never proves relevance/);
  assert.match(searchServer, /referenceCandidateIds is the only signal/);
  assert.match(searchServer, /leave all candidate ids empty/);
  assert.match(searchServer, /allowedCandidateIds\.has/);
  assert.match(searchServer, /safety_identifier: safetyIdentifier/);
  assert.match(searchServer, /serializeUntrustedArchiveConversation\(messages, memoryNotes\)/);
  assert.doesNotMatch(searchServer, /input: messages\.map/);
  assert.match(searchServer, /canonicalizeArchiveSearchCandidates\(candidates\)/);
  assert.match(searchCatalog, /const ARCHIVE_SEARCH_CATALOG/);
  assert.match(searchCatalog, /ARCHIVE_SEARCH_REFERENCE_EXCERPTS/);
  assert.match(searchCatalog, /referenceExcerpt: ARCHIVE_SEARCH_REFERENCE_EXCERPTS/);
  assert.match(searchCatalog, /"rider-over-zeztz"/);
  assert.match(searchCatalog, /catalogById\.get\(candidate\.id\)/);

  assert.match(searchRoute, /assertSameSiteRequest\(\)/);
  assert.match(searchRoute, /isAllowedArchiveBrowserRequest\(request, "search-v1"\)/);
  assert.match(searchRoute, /const MAX_BODY_BYTES = 65_536/);
  assert.match(searchRoute, /readArchiveRequestBody\(request, MAX_BODY_BYTES\)/);
  assert.match(aiJob, /canonicalizeArchiveSearchCandidates\(input\.candidates\)/);
  assert.match(aiJob, /initialExecution\.costClass/);
  assert.match(aiHttp, /cache-control": "no-store, max-age=0/);
  assert.match(aiJob, /createLocalArchiveSearchReply/);
  assert.match(aiJob, /return finishLocal\(row, decryptedPayload, reason\)/);
  assert.match(
    searchServer,
    /searchPreferenceSchema\.default\(DEFAULT_ARCHIVE_MODEL_PREFERENCES\.search\)/,
  );
  assert.match(requestBody, /request\.body\.getReader\(\)/);
  assert.match(requestBody, /received > maxBytes/);
  assert.match(requestBody, /await reader\.cancel\(\)/);
});

test("Search answers lightweight general conversation locally without inventing archive links", async () => {
  const { createLocalArchiveSearchReply } = await import(
    new URL("../src/lib/archive-search.ts", import.meta.url)
  );
  const misleadingMovieCandidate = {
    id: "movie",
    label: "劇場版",
    kicker: "MOVIE",
    description: "Deception Worldの劇場版記録です。",
  };

  const greeting = createLocalArchiveSearchReply({
    query: "おはよう",
    candidates: [],
    notice: "offline",
  });
  assert.match(greeting.reply, /おはようございます/);
  assert.deepEqual(greeting.referenceCandidateIds, []);
  assert.equal(greeting.notice, undefined);

  const general = createLocalArchiveSearchReply({
    query: "おすすめの映画を教えて",
    candidates: [misleadingMovieCandidate],
    notice: "offline",
  });
  assert.match(general.reply, /公開記録に限らず普通の質問や相談/);
  assert.deepEqual(general.referenceCandidateIds, []);

  const archive = createLocalArchiveSearchReply({
    query: "シエルの記録を教えて",
    candidates: [
      {
        id: "rider-saga",
        label: "仮面ライダーサーガ",
        kicker: "RIDER 01",
        description: "シエルとサーガの公開記録です。",
      },
    ],
  });
  assert.deepEqual(archive.referenceCandidateIds, ["rider-saga"]);
  assert.match(archive.reply, /仮面ライダーサーガ/);

  const genericAbility = createLocalArchiveSearchReply({
    query: "自分の能力を伸ばす方法を教えて",
    candidates: [misleadingMovieCandidate],
    notice: "offline",
  });
  assert.deepEqual(genericAbility.referenceCandidateIds, []);
  assert.doesNotMatch(genericAbility.reply, /Deception Worldの公開記録について/);

  const riders = createLocalArchiveSearchReply({
    query: "最初のライダーはどんな人？",
    candidates: [
      {
        id: "world-riders",
        label: "八人のライダー一覧",
        kicker: "WORLD / RIDERS",
        description: "八人のライダーを見比べ、それぞれの個別資料へ進める一覧です。",
      },
    ],
    forceArchive: true,
  });
  assert.deepEqual(riders.referenceCandidateIds, ["world-riders"]);
  assert.match(riders.reply, /八人のライダー一覧/);

  const crisis = createLocalArchiveSearchReply({
    query: "今すぐ自分を傷つけそう",
    candidates: [],
    notice: "offline",
  });
  assert.match(crisis.reply, /安全が最優先/);
  assert.match(crisis.reply, /緊急通報/);
  assert.deepEqual(crisis.referenceCandidateIds, []);
  assert.equal(crisis.notice, undefined);
});

test("both AI composers send only from their explicit send buttons", () => {
  const arrowPattern =
    /<ArrowUp\s+className="archive-send-icon"\s+size=\{20\}\s+strokeWidth=\{2\.4\}\s+aria-hidden="true"\s+focusable="false"\s*\/>/;
  for (const [name, source] of [
    ["Search", oracle],
    ["Persona", roleplay],
  ]) {
    assert.doesNotMatch(source, /handle(?:Search)?ComposerKeyDown/, name);
    assert.doesNotMatch(source, /onComposition(?:Start|End)/, name);
    assert.doesNotMatch(source, /type="submit"/, name);
    assert.match(source, /enterKeyHint="enter"/, name);
    assert.match(source, arrowPattern, `${name} must use the shared Lucide ArrowUp geometry`);
    assert.doesNotMatch(source, /↑/, `${name} must not depend on a platform font arrow glyph`);
  }
  assert.match(oracle, /type="button"[\s\S]*?onClick=\{\(\) =>[\s\S]*?void ask\(\s*question/);
  assert.match(
    roleplay,
    /type="button"[\s\S]*?onClick=\{\(\) =>[\s\S]*?void sendMessage\(\s*draft/,
  );
  assert.doesNotMatch(roleplay, /sendMessage\(starter\)/);
  assert.match(roleplay, /setDraft\(starter\)/);
  assert.match(oracle, /onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(roleplay, /onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(
    oracle,
    /if \(searchAbortRef\.current\) \{[\s\S]*?searchAbortRef\.current\.abort\(\)/,
  );
  assert.match(
    oracle,
    /if \(searchAbortRef\.current === controller\) searchAbortRef\.current = null/,
  );
  assert.match(oracle, /const displayedReferences = referencedResults/);
  assert.match(oracle, /SEARCH_TOPIC_CHANGE_PATTERN/);
  assert.match(oracle, /data-surface-transition=\{surfaceTransition \?\? undefined\}/);
  assert.doesNotMatch(oracle, /surface !== "search"\) stopSearch\(\)/);
  assert.doesNotMatch(roleplay, /if \(!active\) stopResponse\(false\)/);

  const iconRule = intelligenceStyles.match(/\.archive-send-icon\s*\{([^}]*)\}/);
  assert.ok(iconRule, "the shared send icon needs a stable CSS box");
  assert.match(iconRule[1], /display:\s*block/);
  assert.match(iconRule[1], /width:\s*20px/);
  assert.match(iconRule[1], /height:\s*20px/);
  assert.match(iconRule[1], /flex:\s*none/);
  assert.match(iconRule[1], /pointer-events:\s*none/);

  const actionRules = [
    ...intelligenceStyles.matchAll(
      /\.archive-intelligence-page \.archive-oracle-input-shell > button,\s*\.archive-intelligence-page \.archive-roleplay-composer > button \{([^}]*)\}/g,
    ),
  ];
  const centeredAction = actionRules.find((match) => /width:\s*56px/.test(match[1]));
  assert.ok(centeredAction, "both composer actions need the shared 56px hit target");
  assert.match(centeredAction[1], /display:\s*inline-grid/);
  assert.match(centeredAction[1], /place-items:\s*center/);
  assert.match(centeredAction[1], /width:\s*56px/);
  assert.match(centeredAction[1], /height:\s*56px/);
  assert.match(centeredAction[1], /touch-action:\s*manipulation/);
  assert.match(
    intelligenceStyles,
    /> button::before,[\s\S]*?> button::before \{[\s\S]*?inset:\s*6px/,
  );
});

test("both composer glass surfaces use the textarea itself as the stable hit surface", () => {
  assert.doesNotMatch(oracle, /focusArchiveComposerFromSurface|onClickCapture/);
  assert.doesNotMatch(roleplay, /focusArchiveComposerFromSurface|onClickCapture/);

  const hitSurfaceRule = [...intelligenceStyles.matchAll(/[^{}]*textarea[^{}]*\{([^}]*)\}/g)].find(
    (match) => /position:\s*relative/.test(match[1]) && /grid-column:\s*2/.test(intelligenceStyles),
  );
  assert.ok(hitSurfaceRule, "textarea must sit in the middle grid cell so send stays tappable");
  assert.match(hitSurfaceRule[1], /z-index:\s*0/);
  assert.match(intelligenceStyles, /pointer-events:\s*auto/);
  assert.match(
    intelligenceStyles,
    /\.archive-oracle-input-shell > button,\s*\.archive-intelligence-page \.archive-roleplay-composer > button \{\s*margin-bottom:\s*4px/,
  );
});

test("model preferences normalize and resolve every Search runtime route", async () => {
  const {
    normalizeArchiveModelPreferences,
    normalizeArchiveSearchPreference,
    resolveArchiveSearchRoute,
  } = await import(new URL("../src/lib/archive-model-config.ts", import.meta.url));
  assert.deepEqual(
    normalizeArchiveSearchPreference({
      model: "gpt-5.5",
      effort: "high",
      execution: "standard",
    }),
    { model: "gpt-5.5", effort: "high", execution: "standard" },
  );
  assert.deepEqual(
    normalizeArchiveSearchPreference({
      model: "gpt-5.5",
      effort: "low",
      execution: "pro",
    }),
    { model: "gpt-5.6-terra", effort: "xhigh", execution: "pro" },
  );
  assert.deepEqual(normalizeArchiveModelPreferences({}), {
    search: { model: "gpt-5.6-terra", effort: "low", execution: "standard" },
    personaProProfile: "pro",
  });
  const standardRoutes = ["low", "medium", "high", "xhigh"].map((effort) =>
    resolveArchiveSearchRoute({
      model: "gpt-5.6-terra",
      effort,
      execution: "standard",
    }),
  );
  assert.deepEqual(
    standardRoutes.map((route) => route.reasoning.effort),
    ["low", "medium", "high", "xhigh"],
  );
  assert.ok(standardRoutes.every((route) => !("mode" in route.reasoning)));
  assert.deepEqual(
    standardRoutes.map((route) => route.costClass),
    ["standard", "standard", "advanced", "advanced"],
  );
  const gpt55 = resolveArchiveSearchRoute({
    model: "gpt-5.5",
    effort: "low",
    execution: "standard",
  });
  assert.equal(gpt55.costClass, "advanced");
  const pro = resolveArchiveSearchRoute({
    model: "gpt-5.6-terra",
    effort: "xhigh",
    execution: "pro",
  });
  assert.equal(pro.reasoning.mode, "pro");
  assert.equal(pro.costClass, "pro");
});

test("the Search Pro byte envelope accepts its full Japanese character budget", () => {
  const payload = JSON.stringify({
    query: "拒絶の記録",
    messages: Array.from({ length: 5 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: "界".repeat(1600),
    })),
    candidates: Array.from({ length: 3 }, (_, index) => ({
      id: `candidate-${index}`,
      label: "候補",
      kicker: "記録",
      description: "界".repeat(360),
    })),
    modelPreference: { model: "gpt-5.6-terra", effort: "xhigh", execution: "pro" },
  });
  assert.ok(Buffer.byteLength(payload, "utf8") < 65_536);
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
  assert.match(intelligencePage, /<ArchiveIntelligenceWorkspace[\s\S]*?modelPreferences=/);
  assert.doesNotMatch(intelligencePage, /<ArchiveModelSelector/);
  assert.match(intelligencePage, /<SideMenuLayer context="intelligence"/);
  assert.match(
    intelligencePage,
    /<h1 ref=\{headingRef\} className="visually-hidden" tabIndex=\{-1\}>/,
  );
  assert.match(intelligencePage, /headingRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(intelligencePage, /window\.visualViewport/);
  assert.match(intelligencePage, /--archive-viewport-height/);
  assert.match(intelligencePage, /focusout/);
  assert.match(intelligencePage, /pageshow/);

  assert.doesNotMatch(chrome, /import \{ ArchiveOracle \}/);
  assert.doesNotMatch(chrome, /oracleRef|oracleOpen|site-archive-oracle-dialog/);
  assert.match(chrome, /beforeNavigate=\{close\}/);
  assert.doesNotMatch(chrome, /to="\/intelligence"/);
  assert.doesNotMatch(chrome, /AIに聞く/);
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
  assert.match(intelligenceStyles, /data-keyboard="open"/);
  assert.match(intelligenceStyles, /\.archive-model-dialog/);
  assert.match(oracle, /ARCHIVE_RUNTIME_MODEL_LABEL/);
  assert.match(oracle, /Grok 4\.20/);
  assert.doesNotMatch(intelligencePage, /setModelSelectorOpen/);
  assert.match(modelSelector, /RadioGroup\.Root/);
  assert.match(oracle, /参照したページ/);
  assert.match(oracle, /reply\.referenceCandidateIds/);
  assert.match(intelligenceStyles, /caret-color: rgba\(255, 255, 255, 0\.94\)/);
  assert.match(intelligenceStyles, /textarea:focus::placeholder/);
  assert.match(intelligenceStyles, /\.archive-composer-leading/);
  assert.match(intelligenceStyles, /min-height: 88px/);
  assert.match(intelligenceStyles, /archive-ai-search-surface-in/);
  assert.match(intelligenceStyles, /archive-ai-persona-surface-in/);
  assert.match(oracle, /今日は何を調べますか/);
  assert.match(intelligenceStyles, /archive-think-shimmer/);
});

test("Archive Intelligence has a dedicated reduced-motion-aware route handoff", () => {
  assert.match(loadGate, /variant: "archive" \| "intelligence" \| "zeus"/);
  assert.match(loadGate, /to === "\/intelligence"/);
  assert.match(loadGate, /variant: "intelligence", phase: "covering"/);
  assert.match(loadGate, /archive-ai-route-transition/);
  assert.match(routeTransitionStyles, /\.load-gate\.archive-ai-route-transition/);
  assert.match(routeTransitionStyles, /@keyframes archive-ai-route-core-in/);
  assert.match(
    routeTransitionStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?archive-ai-route-transition/,
  );
});

test("focused composers stay position-stable during visual viewport scrolling", () => {
  assert.match(intelligencePage, /viewport\?\.addEventListener\("scroll"/);
  assert.match(intelligencePage, /window\.scrollTo\(0, 0\)/);
  assert.match(intelligencePage, /lockedHeight/);
  assert.match(intelligencePage, /settleHits/);
  assert.match(intelligencePage, /frozen/);
  assert.match(intelligencePage, /resolveArchiveIosKeyboardFrame/);
  assert.match(intelligencePage, /syncVisualScroll/);
  assert.match(intelligencePage, /pointerdown/);
  assert.match(intelligencePage, /translate3d/);
  assert.match(intelligenceStyles, /--archive-viewport-height/);
  assert.doesNotMatch(
    intelligenceStyles,
    /\[data-keyboard="open"\][\s\S]{0,400}position:\s*fixed;[\s\S]{0,80}bottom:\s*var\(--archive-keyboard-inset/,
  );
  assert.doesNotMatch(intelligencePage, /--archive-viewport-(?:left|top)/);
  assert.doesNotMatch(intelligencePage, /resolveArchiveViewportOffset/);
  assert.match(
    intelligencePage,
    /page\.dataset\.composerFocus\s*=\s*"true"|page\.setAttribute\("data-composer-focus",\s*"true"\)/,
  );
  assert.match(
    intelligencePage,
    /requestAnimationFrame\([\s\S]*?(?:delete page\.dataset\.composerFocus|removeAttribute\("data-composer-focus"\))/,
  );
  assert.match(
    intelligenceStyles,
    /\.archive-intelligence-page\s*\{(?=[^}]*\btop:\s*0;)(?=[^}]*\bleft:\s*0;)[^}]*\}/,
  );
  assert.doesNotMatch(intelligenceStyles, /var\(--archive-viewport-(?:left|top)/);

  const fixedTextareaRule = [
    ...intelligenceStyles.matchAll(/[^{}]*textarea[^{}]*\{([^}]*)\}/g),
  ].find((match) => /field-sizing:\s*fixed/.test(match[1]));
  assert.ok(fixedTextareaRule, "route CSS must override intrinsic textarea field sizing");
  assert.match(fixedTextareaRule[1], /position:\s*relative/);
  assert.match(fixedTextareaRule[1], /width:\s*100%/);
  assert.match(fixedTextareaRule[1], /overflow-y:\s*auto/);
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
