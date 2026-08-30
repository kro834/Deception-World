import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { GuardedLink } from "@/components/load-gate";
import {
  recordArchiveAiHealth,
  resetArchiveAiHealth,
  summarizeArchiveAiHealth,
  type ArchiveHealthAction,
} from "@/lib/archive-ai-health";
import {
  ArchiveApiClientError,
  cancelArchiveApi,
  createArchiveAiRequestId,
  forgetArchiveAiPending,
  listArchiveAiPending,
  postArchiveApi,
  resumeArchiveApi,
  subscribeArchiveAiRecoveryWake,
} from "@/lib/archive-api-client";
import {
  ARCHIVE_CHARACTERS,
  ARCHIVE_CHARACTER_BY_ID,
  type ArchiveCharacterId,
  type ArchiveRoleplayMode,
} from "@/lib/archive-characters";
import { absorbArchiveUserIntent, archiveMemoryNoteTexts } from "@/lib/archive-user-memory";
import { isArchiveDelivery } from "@/lib/archive-delivery";
import {
  hasVisibleArchiveText,
  normalizeArchiveInput,
  truncateArchiveInput,
} from "@/lib/archive-input";
import { branchArchiveMessages } from "@/lib/archive-message-branch";
import {
  hasTacticalSnapshot,
  type ArchiveConversationTurn,
  type ArchiveIntelligenceReply,
  type ArchiveTacticalSnapshot,
} from "@/lib/archive-roleplay-fallback";
import {
  ARCHIVE_RUNTIME_MODEL_LABEL,
  waitForArchiveThinkingFloor,
  type ArchivePersonaProProfile,
} from "@/lib/archive-model-config";
import { ArchiveComposerModelBadge, ArchiveComposerTools } from "./archive-composer-controls";
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
  source?: "openai" | "local" | "error";
  model?: string;
  modelLabel?: string;
  notice?: string;
  requestId?: string;
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
};

const MAX_VISIBLE_MESSAGES = 36;

function sessionKey(characterId: ArchiveCharacterId, mode: ArchiveRoleplayMode): string {
  return `${characterId}:${mode}`;
}

function pendingSessionKey(contextId: string | undefined, fallback: string): string {
  if (!contextId) return fallback;
  const [characterId, mode, extra] = contextId.split(":");
  if (
    !extra &&
    characterId in ARCHIVE_CHARACTER_BY_ID &&
    (mode === "normal" || mode === "pro")
  ) {
    return sessionKey(characterId as ArchiveCharacterId, mode);
  }
  // v1 records only stored the character. They were shared across modes, so
  // recover them into Normal without contaminating the new Pro transcript.
  return contextId in ARCHIVE_CHARACTER_BY_ID
    ? sessionKey(contextId as ArchiveCharacterId, "normal")
    : fallback;
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
  const common =
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
    Boolean(reply.delivery) &&
    isArchiveDelivery(reply.delivery);
  if (!common) return false;
  if (reply.source === "openai") {
    return (
      reply.delivery?.channel === "online" &&
      reply.delivery.reason === "ok" &&
      typeof reply.requestId === "string" &&
      typeof reply.requestedModel === "string"
    );
  }
  return reply.delivery?.channel === "local" && reply.modelVerified === false;
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
  onProProfileChange: _onProProfileChange,
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
  const recoveryAbortRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeRequestSessionIdRef = useRef<string | undefined>(undefined);
  const recoveryRequestIdRef = useRef<string | null>(null);
  const recoveryRequestSessionIdRef = useRef<string | undefined>(undefined);
  const recoveryPendingKeyRef = useRef<string | null>(null);
  const foregroundPendingKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const followLatestRef = useRef(true);
  const viewportBySessionRef = useRef<
    Record<string, { scrollTop: number; followLatest: boolean }>
  >({});
  const [recoveryWake, setRecoveryWake] = useState(0);

  const profile = ARCHIVE_CHARACTER_BY_ID[characterId];
  const activeSessionKey = sessionKey(characterId, mode);
  const activeSessionKeyRef = useRef(activeSessionKey);
  activeSessionKeyRef.current = activeSessionKey;
  const messages = useMemo(() => sessions[activeSessionKey] ?? [], [activeSessionKey, sessions]);
  const pending = pendingKey === activeSessionKey;
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  const characterStyle = { "--oracle-character-accent": profile.accent } as CSSProperties;

  const stopResponse = useCallback((announce = true, cancelServer = false) => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const stopRecovery =
      !cancelServer || recoveryPendingKeyRef.current === activeSessionKeyRef.current;
    if (stopRecovery) {
      recoveryAbortRef.current?.abort();
      recoveryAbortRef.current = null;
    }
    const requestId = activeRequestIdRef.current;
    const sessionId = activeRequestSessionIdRef.current;
    const recoveryRequestId = stopRecovery ? recoveryRequestIdRef.current : null;
    const recoverySessionId = stopRecovery ? recoveryRequestSessionIdRef.current : undefined;
    if (requestId) void forgetArchiveAiPending(requestId);
    if (recoveryRequestId && recoveryRequestId !== requestId) {
      void forgetArchiveAiPending(recoveryRequestId);
    }
    activeRequestIdRef.current = null;
    activeRequestSessionIdRef.current = undefined;
    foregroundPendingKeyRef.current = null;
    if (stopRecovery) {
      recoveryRequestIdRef.current = null;
      recoveryRequestSessionIdRef.current = undefined;
      recoveryPendingKeyRef.current = null;
    }
    if (cancelServer && requestId) {
      void cancelArchiveApi({ client: "persona-v1", requestId, sessionId });
    }
    if (cancelServer && recoveryRequestId && recoveryRequestId !== requestId) {
      void cancelArchiveApi({
        client: "persona-v1",
        requestId: recoveryRequestId,
        sessionId: recoverySessionId,
      });
    }
    setPendingKey(stopRecovery ? null : recoveryPendingKeyRef.current);
    setPendingProProfile(null);
    if (announce) setLiveMessage("応答生成を停止しました。");
  }, []);

  const stopForegroundResponse = useCallback((cancelServer = false) => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const requestId = activeRequestIdRef.current;
    const sessionId = activeRequestSessionIdRef.current;
    activeRequestIdRef.current = null;
    activeRequestSessionIdRef.current = undefined;
    foregroundPendingKeyRef.current = null;
    if (cancelServer && requestId) {
      void cancelArchiveApi({ client: "persona-v1", requestId, sessionId });
    }
    setPendingKey(recoveryPendingKeyRef.current);
    setPendingProProfile(null);
  }, []);

  useEffect(() => () => stopResponse(false), [stopResponse]);

  useEffect(() => {
    setConnectionHealth(summarizeArchiveAiHealth("persona"));
  }, []);

  useEffect(
    () => subscribeArchiveAiRecoveryWake(() => setRecoveryWake((value) => value + 1)),
    [],
  );

  const rememberActiveViewport = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    viewportBySessionRef.current[activeSessionKey] = {
      scrollTop: log.scrollTop,
      followLatest: followLatestRef.current,
    };
  }, [activeSessionKey]);

  useLayoutEffect(() => {
    if (!active) return;
    const log = logRef.current;
    if (!log) return;
    const viewport = viewportBySessionRef.current[activeSessionKey];
    followLatestRef.current = viewport?.followLatest ?? true;
    log.scrollTop = viewport?.followLatest === false ? viewport.scrollTop : log.scrollHeight;
  }, [active, activeSessionKey]);

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

  useEffect(() => {
    if (abortRef.current) return;
    const controller = new AbortController();
    let disposed = false;
    void (async () => {
      const pendingRecords = (await listArchiveAiPending()).filter(
        (record) =>
          record.client === "persona-v1" &&
          record.url === "/api/archive-intelligence" &&
          Date.now() - record.startedAt < 45_000,
      );
      if (disposed || abortRef.current || !pendingRecords.length) return;
      recoveryRequestIdRef.current = pendingRecords[0]?.requestId ?? null;
      recoveryRequestSessionIdRef.current = pendingRecords[0]?.sessionId;
      recoveryAbortRef.current = controller;
      const firstContext = pendingRecords[0]?.contextId;
      const firstPendingKey = pendingSessionKey(firstContext, activeSessionKeyRef.current);
      recoveryPendingKeyRef.current = firstPendingKey;
      const settled = await Promise.allSettled(
        pendingRecords.map(async (pendingRecord) => {
          const reply = await resumeArchiveApi({
            pending: pendingRecord,
            signal: controller.signal,
            validate: isArchiveReply,
            onState: (state) => {
              setLiveMessage(
                state === "reconnecting"
                  ? "再接続中。同じ回答を回収しています。"
                  : "回答を確認中です。",
              );
            },
          });
          if (disposed || controller.signal.aborted) return;
          const targetKey = pendingSessionKey(
            pendingRecord.contextId,
            activeSessionKeyRef.current,
          );
          updateSession(targetKey, (current) =>
            reply.requestId && current.some((message) => message.requestId === reply.requestId)
              ? current
              : [
                  ...current,
                  {
                    id: messageId("assistant-recovered"),
                    role: "assistant",
                    text: reply.reply,
                    narration: reply.narration,
                    tactical: reply.tactical,
                    suggestions: reply.suggestions,
                    navigationQuery: reply.navigationQuery,
                    source: reply.source,
                    model: reply.providerModel ?? reply.model,
                    modelLabel: reply.providerModel
                      ? `${reply.providerModel.toUpperCase()} · VERIFIED`
                      : "LOCAL",
                    notice: reply.notice ?? "再接続前に生成された回答を復元しました。",
                    requestId: reply.requestId,
                  },
                ],
          );
        }),
      );
      if (!disposed) {
        const firstFailedIndex = settled.findIndex((result) => result.status === "rejected");
        if (firstFailedIndex >= 0) {
          const failedRecord = pendingRecords[firstFailedIndex];
          if (failedRecord) void forgetArchiveAiPending(failedRecord.requestId);
          if (recoveryAbortRef.current === controller) recoveryAbortRef.current = null;
          recoveryRequestIdRef.current = null;
          recoveryRequestSessionIdRef.current = undefined;
          recoveryPendingKeyRef.current = null;
          setPendingKey(foregroundPendingKeyRef.current);
          setLiveMessage("オンライン回答を回収できませんでした。同じメッセージを再送してください。");
        } else {
          if (recoveryAbortRef.current === controller) recoveryAbortRef.current = null;
          recoveryRequestIdRef.current = null;
          recoveryRequestSessionIdRef.current = undefined;
          recoveryPendingKeyRef.current = null;
          setPendingKey(foregroundPendingKeyRef.current);
          setLiveMessage("再接続前の回答を復元しました。");
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (recoveryAbortRef.current === controller) {
        recoveryAbortRef.current = null;
        recoveryRequestIdRef.current = null;
        recoveryRequestSessionIdRef.current = undefined;
        recoveryPendingKeyRef.current = null;
        if (!foregroundPendingKeyRef.current) setPendingKey(null);
      }
    };
  }, [recoveryWake, updateSession]);

  const selectCharacter = (nextCharacter: ArchiveCharacterId) => {
    if (nextCharacter === characterId) return;
    rememberActiveViewport();
    stopForegroundResponse(true);
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
      rememberActiveViewport();
      stopForegroundResponse(true);
      setMode(nextMode);
      setSelectedUserMessageId(null);
      followLatestRef.current = true;
      setLiveMessage(`${nextMode === "pro" ? "プロ" : "ノーマル"}モードへ切り替えました。`);
    },
    [mode, rememberActiveViewport, stopForegroundResponse],
  );

  const clearConversation = () => {
    if (recoveryPendingKeyRef.current === activeSessionKey) stopResponse(false, true);
    else stopForegroundResponse(true);
    setSessions((current) => ({ ...current, [activeSessionKey]: [] }));
    setDraft("");
    setMessageEdit(null);
    setSelectedUserMessageId(null);
    followLatestRef.current = true;
    viewportBySessionRef.current[activeSessionKey] = { scrollTop: 0, followLatest: true };
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
    absorbArchiveUserIntent({
      userText: value,
      surface: "persona",
      characterName: profile.name,
    });
    if (!options.preserveDraft) setDraft("");
    setMessageEdit(null);
    setSelectedUserMessageId(null);
    foregroundPendingKeyRef.current = keyAtRequest;
    setPendingKey(keyAtRequest);
    setPendingProProfile(proProfileAtRequest);
    setLiveMessage(`${profile.name}が応答を生成しています。`);
    followLatestRef.current = true;
    viewportBySessionRef.current[keyAtRequest] = { scrollTop: 0, followLatest: true };

    const controller = new AbortController();
    const requestId = createArchiveAiRequestId();
    abortRef.current = controller;
    activeRequestIdRef.current = requestId;
    activeRequestSessionIdRef.current = undefined;
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
          memoryNotes: archiveMemoryNoteTexts(),
        },
        signal: controller.signal,
        validate: isArchiveReply,
        pendingContext: {
          contextId: keyAtRequest,
          userMessageId: nextMessages.at(-1)?.id,
        },
        requestId,
        onState: (state) => {
          const label =
            state === "submitting"
              ? "思考中"
              : state === "queued"
                ? "接続待機中"
                : state === "reconnecting"
                  ? "再接続中。同じ回答を回収しています"
                  : state === "unknown"
                    ? "回答を確認中"
                    : "思考中";
          setLiveMessage(`${ARCHIVE_CHARACTER_BY_ID[characterAtRequest].name} / ${label}`);
        },
      });
    } catch (error) {
      if (abortRef.current !== controller) return;
      const deliveryReason =
        error instanceof ArchiveApiClientError ? error.reason : "client_network";
      updateSession(keyAtRequest, (current) => [
        ...current,
        {
          id: messageId("assistant-error"),
          role: "assistant",
          text: "オンライン回答を回収できませんでした。ローカル回答へは置き換えていません。接続を確認し、同じメッセージを再送してください。",
          source: "error",
          modelLabel: "RECONNECT",
          notice: `通信状態: ${deliveryReason}`,
          requestId,
        },
      ]);
      setConnectionHealth(
        recordArchiveAiHealth({
          surface: "persona",
          action: healthAction,
          channel: "failed",
          reason: deliveryReason,
          latencyMs: performance.now() - thinkingStartedAt,
          turnCount: nextMessages.length,
          context: sentCharacters >= 9_600 ? "high" : sentCharacters >= 6_000 ? "medium" : "low",
          trimmed: conversationHistory.length < nextMessages.length,
        }),
      );
      setLiveMessage("オンライン回答を回収できませんでした。再送信できます。");
      return;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        foregroundPendingKeyRef.current = null;
        setPendingKey(recoveryPendingKeyRef.current);
        setPendingProProfile(null);
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null;
          activeRequestSessionIdRef.current = undefined;
        }
      }
    }

    await waitForArchiveThinkingFloor(thinkingStartedAt, controller.signal);

    if (requestSequenceRef.current !== sequence) return;
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
      model: reply.providerModel ?? reply.model,
      modelLabel: ARCHIVE_RUNTIME_MODEL_LABEL,
      notice: reply.notice,
      requestId: reply.requestId,
    };
    updateSession(keyAtRequest, (current) =>
      reply.requestId && current.some((message) => message.requestId === reply.requestId)
        ? current
        : [...current, assistantMessage],
    );
    foregroundPendingKeyRef.current = null;
    setPendingKey(recoveryPendingKeyRef.current);
    setPendingProProfile(null);
    if (abortRef.current === controller) abortRef.current = null;
    if (activeRequestIdRef.current === requestId) {
      activeRequestIdRef.current = null;
      activeRequestSessionIdRef.current = undefined;
    }
    setLiveMessage(`${ARCHIVE_CHARACTER_BY_ID[characterAtRequest].name}から応答が届きました。`);
  };

  const beginMessageEdit = (message: RoleplayMessage) => {
    if (message.role !== "user") return;
    if (pending) stopResponse(false, true);
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
    if (pending) stopResponse(false, true);
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
            const key = sessionKey(character.id, mode);
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
            viewportBySessionRef.current[activeSessionKey] = {
              scrollTop: element.scrollTop,
              followLatest: followLatestRef.current,
            };
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
                          {message.source === "openai"
                            ? (message.modelLabel ?? "NEURAL")
                            : message.source === "local"
                              ? "LOCAL"
                              : (message.modelLabel ?? "RECONNECT")}
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
                <small>{ARCHIVE_RUNTIME_MODEL_LABEL}</small>
                <p>
                  {liveMessage.includes("再接続")
                    ? "接続を確認しています"
                    : "考えています"}
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
            <ArchiveComposerModelBadge label={ARCHIVE_RUNTIME_MODEL_LABEL} />
          </section>
          <div>
            <ArchiveComposerTools
              editorRef={composerRef}
              onNewConversation={clearConversation}
              onAttachArchive={attachPersonaArchive}
            />
            <textarea
              ref={composerRef}
              id="archive-roleplay-message"
              rows={1}
              value={draft}
              maxLength={messageEdit ? undefined : messageMaxLength}
              autoComplete="off"
              enterKeyHint="enter"
              inputMode="text"
              disabled={!active}
              placeholder={`${profile.name}へ話しかける…`}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <small aria-label={`${draft.length}文字`}>{draft.length}</small>
            {pending ? (
              <button
                type="button"
                className="archive-composer-stop is-stop"
                tabIndex={-1}
                onClick={() => stopResponse(true, true)}
                aria-label="応答生成を停止"
              >
                <Square size={15} fill="currentColor" strokeWidth={1.4} aria-hidden="true" />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="button"
                className="archive-composer-send"
                tabIndex={-1}
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
          </div>
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
