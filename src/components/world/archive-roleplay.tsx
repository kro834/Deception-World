import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GuardedLink } from "@/components/load-gate";
import {
  recordArchiveAiHealth,
  resetArchiveAiHealth,
  summarizeArchiveAiHealth,
  type ArchiveHealthAction,
} from "@/lib/archive-ai-health";
import { ArchiveApiClientError, postArchiveApi } from "@/lib/archive-api-client";
import {
  ARCHIVE_CHARACTERS,
  ARCHIVE_CHARACTER_BY_ID,
  type ArchiveCharacterId,
  type ArchiveRoleplayMode,
} from "@/lib/archive-characters";
import { trimArchiveConversation } from "@/lib/archive-conversation-budget";
import { isArchiveDelivery } from "@/lib/archive-delivery";
import {
  hasVisibleArchiveText,
  normalizeArchiveInput,
  truncateArchiveInput,
} from "@/lib/archive-input";
import { branchArchiveMessages } from "@/lib/archive-message-branch";
import {
  createLocalArchiveReply,
  hasTacticalSnapshot,
  type ArchiveConversationTurn,
  type ArchiveIntelligenceReply,
  type ArchiveTacticalSnapshot,
} from "@/lib/archive-roleplay-fallback";
import {
  archivePersonaProfileLabel,
  waitForArchiveThinkingFloor,
  type ArchivePersonaProProfile,
} from "@/lib/archive-model-config";
import { ArchiveComposerModelMenu, ArchiveComposerTools } from "./archive-composer-controls";
import { ArchiveConnectionHealth } from "./archive-connection-health";
import { ArchiveComposerEditNotice, ArchiveMessageActions } from "./archive-message-actions";
import { useLiquidSegmentedDrag } from "./use-liquid-segmented-drag";

type RoleplaySearchEntry = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  to: string;
  hash?: string;
  assets: readonly string[];
};

type RoleplaySearchResult = {
  entry: RoleplaySearchEntry;
  score: number;
};

type RoleplayMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  narration?: string;
  tactical?: ArchiveTacticalSnapshot;
  suggestions?: string[];
  navigationQuery?: string;
  source?: "openai" | "local";
  model?: string;
  modelLabel?: string;
  notice?: string;
};

type RoleplayEditState = {
  messageId: string;
  draftBeforeEdit: string;
};

type ArchiveRoleplayProps = {
  active: boolean;
  onNavigate?: () => void;
  searchArchive: (query: string, limit?: number) => RoleplaySearchResult[];
  proProfile: ArchivePersonaProProfile;
  onProProfileChange: (profile: ArchivePersonaProProfile) => void;
  onOpenModelSelector: () => void;
};

const MAX_VISIBLE_MESSAGES = 36;

function sessionKey(characterId: ArchiveCharacterId): string {
  return characterId;
}

function messageId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isArchiveReply(value: unknown): value is ArchiveIntelligenceReply {
  if (!value || typeof value !== "object") return false;
  const reply = value as Partial<ArchiveIntelligenceReply>;
  return (
    typeof reply.reply === "string" &&
    typeof reply.narration === "string" &&
    (reply.source === "openai" || reply.source === "local") &&
    Array.isArray(reply.suggestions) &&
    typeof reply.navigationQuery === "string" &&
    Boolean(reply.tactical) &&
    typeof reply.tactical?.range === "string" &&
    typeof reply.tactical?.tempo === "string" &&
    typeof reply.tactical?.threat === "string" &&
    typeof reply.tactical?.objective === "string" &&
    (reply.delivery === undefined || isArchiveDelivery(reply.delivery))
  );
}

function historyFrom(messages: readonly RoleplayMessage[]): ArchiveConversationTurn[] {
  return trimArchiveConversation(
    messages.map((message) => ({
      role: message.role,
      content:
        message.role === "assistant" && message.narration
          ? `${message.text}\n[描写] ${message.narration}`
          : message.text,
    })),
    { maxTurns: 12, maxTotalChars: 12_000, maxCharsPerTurn: 3_000 },
  );
}

function ArchiveHints({
  query,
  searchArchive,
  onNavigate,
}: {
  query: string;
  searchArchive: ArchiveRoleplayProps["searchArchive"];
  onNavigate?: () => void;
}) {
  const results = useMemo(() => (query ? searchArchive(query, 2) : []), [query, searchArchive]);
  if (!results.length) return null;

  return (
    <aside className="archive-roleplay-hints" aria-label="関連するサイト内記録">
      <p>ARCHIVE TRACE / 関連記録</p>
      <div>
        {results.map(({ entry }) => (
          <GuardedLink
            key={entry.id}
            to={entry.to}
            hash={entry.hash}
            assets={entry.assets}
            beforeNavigate={onNavigate}
            aria-label={`${entry.label}の記録を開く`}
          >
            <span>
              <small>{entry.kicker}</small>
              <b>{entry.label}</b>
            </span>
            <i aria-hidden="true">↗</i>
          </GuardedLink>
        ))}
      </div>
    </aside>
  );
}

function TacticalHud({ tactical }: { tactical: ArchiveTacticalSnapshot }) {
  if (!hasTacticalSnapshot(tactical)) return null;
  const rows = [
    ["RANGE", "間合い", tactical.range],
    ["TEMPO", "速度", tactical.tempo],
    ["THREAT", "脅威", tactical.threat],
    ["OBJECTIVE", "目的", tactical.objective],
  ] as const;
  return (
    <dl className="archive-roleplay-tactical" aria-label="戦況分析">
      {rows.map(([label, japanese, value]) => (
        <div key={label}>
          <dt>
            {label} <span>{japanese}</span>
          </dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArchiveRoleplay({
  active,
  onNavigate,
  searchArchive,
  proProfile,
  onProProfileChange,
  onOpenModelSelector,
}: ArchiveRoleplayProps) {
  const [characterId, setCharacterId] = useState<ArchiveCharacterId>("ciel");
  const [mode, setMode] = useState<ArchiveRoleplayMode>("normal");
  const [draft, setDraft] = useState("");
  const [sessions, setSessions] = useState<Record<string, RoleplayMessage[]>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingProProfile, setPendingProProfile] = useState<ArchivePersonaProProfile | null>(null);
  const [selectedUserMessageId, setSelectedUserMessageId] = useState<string | null>(null);
  const [messageEdit, setMessageEdit] = useState<RoleplayEditState | null>(null);
  const [connectionHealth, setConnectionHealth] = useState(() =>
    summarizeArchiveAiHealth("persona", []),
  );
  const [liveMessage, setLiveMessage] = useState("人格回線を選択できます。");
  const abortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const followLatestRef = useRef(true);

  const profile = ARCHIVE_CHARACTER_BY_ID[characterId];
  const activeSessionKey = sessionKey(characterId);
  const messages = useMemo(() => sessions[activeSessionKey] ?? [], [activeSessionKey, sessions]);
  const pending = pendingKey === activeSessionKey;
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  const characterStyle = { "--oracle-character-accent": profile.accent } as CSSProperties;

  const stopResponse = useCallback((announce = true) => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPendingKey(null);
    setPendingProProfile(null);
    if (announce) setLiveMessage("応答生成を停止しました。");
  }, []);

  useEffect(() => () => stopResponse(false), [stopResponse]);

  useEffect(() => {
    setConnectionHealth(summarizeArchiveAiHealth("persona"));
  }, []);

  useEffect(() => {
    if (!active) return;
    const log = logRef.current;
    if (!log || !followLatestRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, messages, pending]);

  useEffect(() => {
    const log = logRef.current;
    if (!active || !log || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!followLatestRef.current) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        log.scrollTop = log.scrollHeight;
      });
    });
    observer.observe(log);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, activeSessionKey]);

  const updateSession = useCallback(
    (key: string, updater: (current: RoleplayMessage[]) => RoleplayMessage[]) => {
      setSessions((current) => ({
        ...current,
        [key]: updater(current[key] ?? []).slice(-MAX_VISIBLE_MESSAGES),
      }));
    },
    [],
  );

  const selectCharacter = (nextCharacter: ArchiveCharacterId) => {
    if (nextCharacter === characterId) return;
    stopResponse(false);
    setCharacterId(nextCharacter);
    setDraft("");
    setMessageEdit(null);
    setSelectedUserMessageId(null);
    followLatestRef.current = true;
    setLiveMessage(`${ARCHIVE_CHARACTER_BY_ID[nextCharacter].name}へ人格回線を切り替えました。`);
  };

  const selectMode = useCallback(
    (nextMode: ArchiveRoleplayMode) => {
      if (nextMode === mode) return;
      stopResponse(false);
      setMode(nextMode);
      setSelectedUserMessageId(null);
      followLatestRef.current = true;
      setLiveMessage(`${nextMode === "pro" ? "プロ" : "ノーマル"}モードへ切り替えました。`);
    },
    [mode, stopResponse],
  );

  const clearConversation = () => {
    stopResponse(false);
    setSessions((current) => ({ ...current, [activeSessionKey]: [] }));
    setDraft("");
    setMessageEdit(null);
    setSelectedUserMessageId(null);
    followLatestRef.current = true;
    setLiveMessage(`${profile.name}との現在の会話を初期化しました。`);
  };

  const sendMessage = async (
    input = draft,
    options: {
      replaceMessageId?: string;
      action?: ArchiveHealthAction;
      preserveDraft?: boolean;
    } = {},
  ) => {
    const maxLength = mode === "pro" ? 1600 : 900;
    const value = normalizeArchiveInput(input).trim();
    if (!hasVisibleArchiveText(value) || value.length > maxLength || abortRef.current) return;

    const keyAtRequest = activeSessionKey;
    const characterAtRequest = characterId;
    const modeAtRequest = mode;
    const proProfileAtRequest = proProfile;
    const existingMessage = options.replaceMessageId
      ? messages.find((message) => message.id === options.replaceMessageId)
      : undefined;
    const nextMessages = options.replaceMessageId
      ? branchArchiveMessages(messages, options.replaceMessageId, value)?.slice(
          -MAX_VISIBLE_MESSAGES,
        )
      : [...messages, { id: messageId("user"), role: "user" as const, text: value }].slice(
          -MAX_VISIBLE_MESSAGES,
        );
    if (!nextMessages) return;
    setSessions((current) => ({ ...current, [keyAtRequest]: nextMessages }));
    if (!options.preserveDraft) setDraft("");
    setMessageEdit(null);
    setSelectedUserMessageId(null);
    setPendingKey(keyAtRequest);
    setPendingProProfile(proProfileAtRequest);
    setLiveMessage(`${profile.name}が応答を生成しています。`);
    followLatestRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    const thinkingStartedAt = performance.now();
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    const conversationHistory = historyFrom(nextMessages);
    const sentCharacters = conversationHistory.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    const healthAction = options.action ?? (existingMessage ? "edit_resend" : "send");

    let reply: ArchiveIntelligenceReply;
    try {
      reply = await postArchiveApi({
        url: "/api/archive-intelligence",
        client: "persona-v1",
        body: {
          characterId: characterAtRequest,
          mode: modeAtRequest,
          proProfile: proProfileAtRequest,
          messages: conversationHistory,
        },
        signal: controller.signal,
        validate: isArchiveReply,
      });
    } catch (error) {
      if (controller.signal.aborted || requestSequenceRef.current !== sequence) return;
      const deliveryReason =
        error instanceof ArchiveApiClientError ? error.reason : "client_network";
      reply = createLocalArchiveReply({
        characterId: characterAtRequest,
        mode: modeAtRequest,
        message: value,
        messages: conversationHistory,
        notice:
          error instanceof Error
            ? "通信が安定しなかったため、ローカル人格コアで応答しました。"
            : "ローカル人格コアで応答しました。",
        deliveryReason,
      });
    }

    await waitForArchiveThinkingFloor(thinkingStartedAt, controller.signal);

    if (controller.signal.aborted || requestSequenceRef.current !== sequence) return;
    const delivery = reply.delivery ?? {
      channel: reply.source === "openai" ? ("online" as const) : ("local" as const),
      reason: reply.source === "openai" ? ("ok" as const) : ("client_network" as const),
    };
    setConnectionHealth(
      recordArchiveAiHealth({
        surface: "persona",
        action: healthAction,
        channel: delivery.channel,
        reason: delivery.reason,
        latencyMs: performance.now() - thinkingStartedAt,
        turnCount: nextMessages.length,
        context: sentCharacters >= 9_600 ? "high" : sentCharacters >= 6_000 ? "medium" : "low",
        trimmed: conversationHistory.length < nextMessages.length,
      }),
    );
    const assistantMessage: RoleplayMessage = {
      id: messageId("assistant"),
      role: "assistant",
      text: reply.reply,
      narration: reply.narration,
      tactical: reply.tactical,
      suggestions: reply.suggestions,
      navigationQuery: reply.navigationQuery,
      source: reply.source,
      model: reply.model,
      modelLabel:
        modeAtRequest === "pro" ? archivePersonaProfileLabel(proProfileAtRequest) : "GPT-5.6 LUNA",
      notice: reply.notice,
    };
    updateSession(keyAtRequest, (current) => [...current, assistantMessage]);
    setPendingKey((current) => (current === keyAtRequest ? null : current));
    setPendingProProfile(null);
    if (abortRef.current === controller) abortRef.current = null;
    setLiveMessage(`${ARCHIVE_CHARACTER_BY_ID[characterAtRequest].name}から応答が届きました。`);
  };

  const beginMessageEdit = (message: RoleplayMessage) => {
    if (message.role !== "user") return;
    if (pending) stopResponse(false);
    setMessageEdit({ messageId: message.id, draftBeforeEdit: draft });
    setSelectedUserMessageId(null);
    setDraft(message.text);
    window.requestAnimationFrame(() => {
      const editor = composerRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  };

  const cancelMessageEdit = () => {
    setDraft(messageEdit?.draftBeforeEdit ?? "");
    setMessageEdit(null);
    setSelectedUserMessageId(null);
  };

  const resendMessage = (message: RoleplayMessage) => {
    if (message.role !== "user") return;
    if (pending) stopResponse(false);
    setMessageEdit(null);
    setSelectedUserMessageId(null);
    void sendMessage(message.text, {
      replaceMessageId: message.id,
      action: "retry",
      preserveDraft: true,
    });
  };

  const attachPersonaArchive = () => {
    const maxLength = mode === "pro" ? 1600 : 900;
    setDraft((current) => {
      const marker = "[公開記録を参照] ";
      return current.startsWith(marker)
        ? current
        : truncateArchiveInput(`${marker}${current}`, maxLength);
    });
    window.requestAnimationFrame(() => {
      const editor = composerRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  };

  const quickReplies = latestAssistant?.suggestions?.length
    ? latestAssistant.suggestions
    : profile.starters[mode];
  const modeDrag = useLiquidSegmentedDrag({
    values: ["normal", "pro"] as const,
    value: mode,
    onCommit: selectMode,
  });
  const messageMaxLength = mode === "pro" ? 1600 : 900;
  const messageEditOverLimit = Boolean(messageEdit && draft.length > messageMaxLength);

  return (
    <section
      className="archive-roleplay"
      style={characterStyle}
      aria-label="キャラクターなりきり会話"
      data-mode={mode}
    >
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
      <p id="archive-roleplay-mode-drag-help" className="visually-hidden">
        タップで切り替え。長押しして左右へ動かせます。キーボードは左右矢印を使えます。
      </p>

      <aside className="archive-roleplay-identity" aria-label="なりきりキャラクター選択">
        <div className="archive-roleplay-portrait">
          <img
            key={profile.portrait}
            src={profile.portrait}
            alt={profile.portraitAlt}
            decoding="async"
            style={{ objectPosition: profile.portraitPosition }}
          />
          <span className="archive-roleplay-portrait-grid" aria-hidden="true" />
          <span className="archive-roleplay-portrait-index" aria-hidden="true">
            {profile.order}
          </span>
          <div>
            <small>{profile.roman}</small>
            <b>{profile.name}</b>
            <span>{profile.alias}</span>
          </div>
        </div>

        <div
          className="archive-roleplay-character-rail"
          role="radiogroup"
          aria-label="8つの人格回線"
          onKeyDown={(event) => {
            if (
              !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(
                event.key,
              )
            ) {
              return;
            }
            event.preventDefault();
            const currentIndex = ARCHIVE_CHARACTERS.findIndex(
              (character) => character.id === characterId,
            );
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? ARCHIVE_CHARACTERS.length - 1
                  : (currentIndex +
                      (event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1) +
                      ARCHIVE_CHARACTERS.length) %
                    ARCHIVE_CHARACTERS.length;
            const nextCharacter = ARCHIVE_CHARACTERS[nextIndex];
            selectCharacter(nextCharacter.id);
            window.requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>(`[data-archive-character="${nextCharacter.id}"]`)
                ?.focus({ preventScroll: true });
            });
          }}
        >
          {ARCHIVE_CHARACTERS.map((character) => {
            const key = sessionKey(character.id);
            const count = sessions[key]?.length ?? 0;
            return (
              <button
                key={character.id}
                type="button"
                role="radio"
                data-archive-character={character.id}
                className={character.id === characterId ? "is-active" : undefined}
                aria-checked={character.id === characterId}
                tabIndex={character.id === characterId ? 0 : -1}
                aria-label={`${character.name}、${character.title}を選択${count ? `、${count}件の会話記録` : ""}`}
                style={{ "--rail-accent": character.accent } as CSSProperties}
                onClick={() => selectCharacter(character.id)}
              >
                <span aria-hidden="true">{character.order}</span>
                <b>{character.name}</b>
                <small>{character.title}</small>
                {count ? <i aria-hidden="true">{String(count).padStart(2, "0")}</i> : null}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="archive-roleplay-console">
        <header className="archive-roleplay-console-header">
          <div>
            <small>PERSONA LINK / {profile.order}</small>
            <h3>{profile.name}</h3>
            <p>{profile.title}</p>
          </div>
          <ArchiveConnectionHealth
            summary={connectionHealth}
            pending={pending}
            turnCount={messages.length}
            turnLimit={12}
            onReset={() => setConnectionHealth(resetArchiveAiHealth("persona"))}
          />
          <button
            type="button"
            className="archive-roleplay-reset"
            disabled={!messages.length && !pending}
            onClick={clearConversation}
          >
            <RotateCcw size={14} strokeWidth={1.7} aria-hidden="true" />
            新しい会話
          </button>
        </header>

        <div className="archive-roleplay-mode-row">
          <div
            {...modeDrag.railProps}
            className="archive-roleplay-mode-switch"
            role="radiogroup"
            aria-label="なりきりモード"
            aria-describedby="archive-roleplay-mode-drag-help"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                  event.key,
                )
              ) {
                return;
              }
              event.preventDefault();
              const nextMode =
                event.key === "Home"
                  ? "normal"
                  : event.key === "End"
                    ? "pro"
                    : mode === "normal"
                      ? "pro"
                      : "normal";
              selectMode(nextMode);
              window.requestAnimationFrame(() => {
                document
                  .querySelector<HTMLElement>(`[data-archive-mode="${nextMode}"]`)
                  ?.focus({ preventScroll: true });
              });
            }}
          >
            <button
              type="button"
              role="radio"
              data-archive-mode="normal"
              aria-checked={mode === "normal"}
              tabIndex={mode === "normal" ? 0 : -1}
              className={mode === "normal" ? "is-active" : undefined}
              onClick={(event) => {
                if (modeDrag.shouldSuppressClick()) {
                  event.preventDefault();
                  return;
                }
                selectMode("normal");
              }}
            >
              <span>NORMAL</span>
              <small>セリフ＋軽い描写</small>
            </button>
            <button
              type="button"
              role="radio"
              data-archive-mode="pro"
              aria-checked={mode === "pro"}
              tabIndex={mode === "pro" ? 0 : -1}
              className={mode === "pro" ? "is-active" : undefined}
              onClick={(event) => {
                if (modeDrag.shouldSuppressClick()) {
                  event.preventDefault();
                  return;
                }
                selectMode("pro");
              }}
            >
              <span>PRO</span>
              <small>自然な対話・深い理解</small>
            </button>
          </div>
          <p>
            {mode === "pro"
              ? "言葉の含みと会話の流れを汲み、人物らしい間や感情まで含めて応答します。"
              : "短いセリフと、必要最小限の描写で応答します。"}
          </p>
        </div>

        <div
          ref={logRef}
          className="archive-roleplay-log"
          role="log"
          aria-label={`${profile.name}との会話`}
          aria-busy={pending}
          onScroll={(event) => {
            const element = event.currentTarget;
            followLatestRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 96;
          }}
        >
          {!messages.length ? (
            <div className="archive-roleplay-empty-state">
              <span aria-hidden="true">
                <Sparkles size={18} strokeWidth={1.4} />
              </span>
              <small>CHANNEL OPEN / {profile.roman}</small>
              <blockquote>{profile.quote}</blockquote>
              <p>{profile.summary}</p>
              <div aria-label="会話を始める例">
                {profile.starters[mode].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => {
                      setDraft(starter);
                      composerRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    {starter}
                    <i aria-hidden="true">＋</i>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const isLatest = index === messages.length - 1;
              return (
                <article
                  key={message.id}
                  className={`archive-roleplay-message is-${message.role}`}
                  data-source={message.source}
                  data-actions-open={selectedUserMessageId === message.id || undefined}
                >
                  <header>
                    <span aria-hidden="true">
                      {message.role === "assistant" ? profile.order : "U"}
                    </span>
                    <div>
                      <small>
                        {message.role === "assistant"
                          ? `TRANSMISSION / ${profile.name}`
                          : "YOU / INPUT"}
                      </small>
                      {message.role === "assistant" ? (
                        <i>
                          {message.source === "openai" ? (message.modelLabel ?? "NEURAL") : "LOCAL"}
                        </i>
                      ) : null}
                    </div>
                  </header>
                  <div className="archive-roleplay-message-body">
                    {message.role === "user" ? (
                      <>
                        <button
                          type="button"
                          className="archive-message-text-button"
                          aria-expanded={selectedUserMessageId === message.id}
                          onClick={() =>
                            setSelectedUserMessageId((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                        >
                          <span>{message.text}</span>
                          <small>タップして編集・再送信</small>
                        </button>
                        {selectedUserMessageId === message.id ? (
                          <ArchiveMessageActions
                            onEdit={() => beginMessageEdit(message)}
                            onResend={() => resendMessage(message)}
                            onClose={() => setSelectedUserMessageId(null)}
                          />
                        ) : null}
                      </>
                    ) : (
                      message.text
                        .split("\n")
                        .map((line, lineIndex) =>
                          line ? (
                            <p key={`${message.id}-${lineIndex}`}>{line}</p>
                          ) : (
                            <span key={`${message.id}-${lineIndex}`} aria-hidden="true" />
                          ),
                        )
                    )}
                    {message.narration ? (
                      <p className="archive-roleplay-narration">
                        <span className="visually-hidden">描写：</span>
                        {message.narration}
                      </p>
                    ) : null}
                  </div>
                  {message.role === "assistant" && message.tactical ? (
                    <TacticalHud tactical={message.tactical} />
                  ) : null}
                  {message.notice ? (
                    <p className="archive-roleplay-notice">{message.notice}</p>
                  ) : null}
                  {isLatest && message.navigationQuery ? (
                    <ArchiveHints
                      query={message.navigationQuery}
                      searchArchive={searchArchive}
                      onNavigate={onNavigate}
                    />
                  ) : null}
                </article>
              );
            })
          )}

          {pending ? (
            <div className="archive-roleplay-thinking" data-mode={mode} aria-hidden="true">
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div>
                <small>
                  {mode === "pro"
                    ? `${archivePersonaProfileLabel(pendingProProfile ?? proProfile)} / 思考中`
                    : "GPT-5.6 LUNA / 思考中"}
                </small>
                <p>
                  {mode === "pro"
                    ? "会話の流れ・感情・人格記録を深く考えています"
                    : "言葉と人格記録をつないでいます"}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {pending
            ? mode === "pro"
              ? "AIが会話の流れ、感情、人格記録を深く考えています"
              : "AIが言葉と人格記録をつないでいます"
            : ""}
        </p>

        {messages.length && !pending ? (
          <div className="archive-roleplay-quick-replies" aria-label="次の会話候補">
            {quickReplies.slice(0, 3).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setDraft(suggestion);
                  composerRef.current?.focus({ preventScroll: true });
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <form className="archive-roleplay-composer" onSubmit={(event) => event.preventDefault()}>
          <label className="visually-hidden" htmlFor="archive-roleplay-message">
            {profile.name}へ送るメッセージ
          </label>
          {messageEdit ? (
            <ArchiveComposerEditNotice
              overLimit={messageEditOverLimit}
              onCancel={cancelMessageEdit}
            />
          ) : null}
          <section className="archive-composer-model-row" aria-label="現在の人格会話モデル">
            <ArchiveComposerModelMenu
              label={mode === "normal" ? "5.6 LUNA" : archivePersonaProfileLabel(proProfile)}
              eyebrow="PERSONA MODEL"
              editorRef={composerRef}
              onOpenDetailed={onOpenModelSelector}
              options={[
                {
                  id: "luna-normal",
                  label: "5.6 LUNA",
                  detail: "自然で軽快なノーマル会話",
                  active: mode === "normal",
                  onSelect: () => selectMode("normal"),
                },
                ...(["instant", "max", "pro"] as const).map((profileId) => ({
                  id: `sol-${profileId}`,
                  label: archivePersonaProfileLabel(profileId),
                  detail:
                    profileId === "instant"
                      ? "テンポを保つプロ会話"
                      : profileId === "max"
                        ? "最大思考量で深く応答"
                        : "最高品質を優先する会話",
                  active: mode === "pro" && proProfile === profileId,
                  onSelect: () => {
                    onProProfileChange(profileId);
                    selectMode("pro");
                  },
                })),
              ]}
            />
          </section>
          <div>
            <ArchiveComposerTools
              editorRef={composerRef}
              onNewConversation={clearConversation}
              onAttachArchive={attachPersonaArchive}
              onOpenDetailed={onOpenModelSelector}
            />
            <textarea
              ref={composerRef}
              id="archive-roleplay-message"
              rows={1}
              value={draft}
              maxLength={messageEdit ? undefined : messageMaxLength}
              enterKeyHint="enter"
              placeholder={`${profile.name}へ話しかける…`}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <small aria-label={`${draft.length}文字`}>{draft.length}</small>
          </div>
          {pending ? (
            <button
              type="button"
              className="archive-composer-stop is-stop"
              onClick={() => stopResponse()}
              aria-label="応答生成を停止"
            >
              <Square size={15} fill="currentColor" strokeWidth={1.4} aria-hidden="true" />
              <span>停止</span>
            </button>
          ) : (
            <button
              type="button"
              className="archive-composer-send"
              disabled={
                !hasVisibleArchiveText(draft) ||
                draft.length > messageMaxLength ||
                messageEditOverLimit
              }
              aria-label={messageEdit ? `${profile.name}へ編集して再送信` : `${profile.name}へ送信`}
              onClick={() =>
                void sendMessage(
                  draft,
                  messageEdit
                    ? { replaceMessageId: messageEdit.messageId, action: "edit_resend" }
                    : undefined,
                )
              }
            >
              <ArrowUp
                className="archive-send-icon"
                size={20}
                strokeWidth={2.4}
                aria-hidden="true"
                focusable="false"
              />
              <span>送信</span>
            </button>
          )}
        </form>

        <footer className="archive-roleplay-privacy">
          <span aria-hidden="true" />
          <p>
            会話は応答生成のためサイトのサーバー経由でAIへ送信される場合があります。API保存は無効です。接続できない時はローカル人格へ自動で切り替わります。
          </p>
        </footer>
      </div>
    </section>
  );
}
