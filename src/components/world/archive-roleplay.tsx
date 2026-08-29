import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { GuardedLink } from "@/components/load-gate";
import {
  ARCHIVE_CHARACTERS,
  ARCHIVE_CHARACTER_BY_ID,
  type ArchiveCharacterId,
  type ArchiveRoleplayMode,
} from "@/lib/archive-characters";
import {
  createLocalArchiveReply,
  hasTacticalSnapshot,
  type ArchiveConversationTurn,
  type ArchiveIntelligenceReply,
  type ArchiveTacticalSnapshot,
} from "@/lib/archive-roleplay-fallback";

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
  notice?: string;
};

type ArchiveRoleplayProps = {
  active: boolean;
  onNavigate?: () => void;
  searchArchive: (query: string, limit?: number) => RoleplaySearchResult[];
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
    typeof reply.tactical?.objective === "string"
  );
}

function historyFrom(messages: readonly RoleplayMessage[]): ArchiveConversationTurn[] {
  return messages
    .map((message) => ({
      role: message.role,
      content:
        message.role === "assistant" && message.narration
          ? `${message.text}\n[描写] ${message.narration}`
          : message.text,
    }))
    .filter((message) => message.content.trim())
    .slice(-12);
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

export function ArchiveRoleplay({ active, onNavigate, searchArchive }: ArchiveRoleplayProps) {
  const [characterId, setCharacterId] = useState<ArchiveCharacterId>("ciel");
  const [mode, setMode] = useState<ArchiveRoleplayMode>("normal");
  const [draft, setDraft] = useState("");
  const [sessions, setSessions] = useState<Record<string, RoleplayMessage[]>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("人格回線を選択できます。");
  const abortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const followLatestRef = useRef(true);

  const profile = ARCHIVE_CHARACTER_BY_ID[characterId];
  const activeSessionKey = sessionKey(characterId);
  const messages = useMemo(() => sessions[activeSessionKey] ?? [], [activeSessionKey, sessions]);
  const pending = pendingKey === activeSessionKey;
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const connectionLabel = pending
    ? "SYNCHRONIZING"
    : latestAssistant?.source === "openai"
      ? "NEURAL ONLINE"
      : latestAssistant?.source === "local"
        ? "LOCAL CORE"
        : "HYBRID READY";

  const characterStyle = { "--oracle-character-accent": profile.accent } as CSSProperties;

  const stopResponse = useCallback((announce = true) => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPendingKey(null);
    if (announce) setLiveMessage("応答生成を停止しました。");
  }, []);

  useEffect(() => () => stopResponse(false), [stopResponse]);

  useEffect(() => {
    if (!active) stopResponse(false);
  }, [active, stopResponse]);

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
    if (!active || typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const frame = window.requestAnimationFrame(() =>
      composerRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
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
    followLatestRef.current = true;
    setLiveMessage(`${ARCHIVE_CHARACTER_BY_ID[nextCharacter].name}へ人格回線を切り替えました。`);
  };

  const selectMode = (nextMode: ArchiveRoleplayMode) => {
    if (nextMode === mode) return;
    stopResponse(false);
    setMode(nextMode);
    followLatestRef.current = true;
    setLiveMessage(`${nextMode === "pro" ? "プロ" : "ノーマル"}モードへ切り替えました。`);
  };

  const clearConversation = () => {
    stopResponse(false);
    setSessions((current) => ({ ...current, [activeSessionKey]: [] }));
    setDraft("");
    followLatestRef.current = true;
    setLiveMessage(`${profile.name}との現在の会話を初期化しました。`);
  };

  const sendMessage = async (input = draft) => {
    const maxLength = mode === "pro" ? 1600 : 900;
    const value = input.trim().slice(0, maxLength);
    if (!value || pending) return;

    const keyAtRequest = activeSessionKey;
    const characterAtRequest = characterId;
    const modeAtRequest = mode;
    const userMessage: RoleplayMessage = {
      id: messageId("user"),
      role: "user",
      text: value,
    };
    const nextMessages = [...messages, userMessage].slice(-MAX_VISIBLE_MESSAGES);
    setSessions((current) => ({ ...current, [keyAtRequest]: nextMessages }));
    setDraft("");
    setPendingKey(keyAtRequest);
    setLiveMessage(`${profile.name}が応答を生成しています。`);
    followLatestRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    const conversationHistory = historyFrom(nextMessages);

    let reply: ArchiveIntelligenceReply;
    try {
      const response = await fetch("/api/archive-intelligence", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-archive-client": "persona-v1",
        },
        body: JSON.stringify({
          characterId: characterAtRequest,
          mode: modeAtRequest,
          messages: conversationHistory,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("archive intelligence request failed");
      const payload: unknown = await response.json();
      if (!isArchiveReply(payload)) throw new Error("archive intelligence response was invalid");
      reply = payload;
    } catch (error) {
      if (controller.signal.aborted || requestSequenceRef.current !== sequence) return;
      reply = createLocalArchiveReply({
        characterId: characterAtRequest,
        mode: modeAtRequest,
        message: value,
        messages: conversationHistory,
        notice:
          error instanceof Error
            ? "通信が安定しなかったため、ローカル人格コアで応答しました。"
            : "ローカル人格コアで応答しました。",
      });
    }

    if (controller.signal.aborted || requestSequenceRef.current !== sequence) return;
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
      notice: reply.notice,
    };
    updateSession(keyAtRequest, (current) => [...current, assistantMessage]);
    setPendingKey((current) => (current === keyAtRequest ? null : current));
    abortRef.current = null;
    setLiveMessage(`${ARCHIVE_CHARACTER_BY_ID[characterAtRequest].name}から応答が届きました。`);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      !composingRef.current
    ) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const quickReplies = latestAssistant?.suggestions?.length
    ? latestAssistant.suggestions
    : profile.starters[mode];

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
          <div
            className="archive-roleplay-connection"
            data-state={connectionLabel.toLowerCase().replaceAll(" ", "-")}
          >
            <i aria-hidden="true" />
            <span>{connectionLabel}</span>
          </div>
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
            className="archive-roleplay-mode-switch"
            role="radiogroup"
            aria-label="なりきりモード"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                return;
              }
              event.preventDefault();
              const nextMode = mode === "normal" ? "pro" : "normal";
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
              onClick={() => selectMode("normal")}
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
              onClick={() => selectMode("pro")}
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
                  <button key={starter} type="button" onClick={() => void sendMessage(starter)}>
                    {starter}
                    <i aria-hidden="true">↗</i>
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
                        <i>{message.source === "openai" ? "NEURAL" : "LOCAL"}</i>
                      ) : null}
                    </div>
                  </header>
                  <div className="archive-roleplay-message-body">
                    {message.text
                      .split("\n")
                      .map((line, lineIndex) =>
                        line ? (
                          <p key={`${message.id}-${lineIndex}`}>{line}</p>
                        ) : (
                          <span key={`${message.id}-${lineIndex}`} aria-hidden="true" />
                        ),
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
                  {mode === "pro" ? "GPT-5.6 SOL / PRO MAX" : "GPT-5.6 LUNA / RESPONDING"}
                </small>
                <p>
                  {mode === "pro"
                    ? "AIが会話の流れ・感情・人格記録を深く考えています"
                    : "AIが言葉と人格記録をつないでいます"}
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

        <form className="archive-roleplay-composer" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="archive-roleplay-message">
            {profile.name}へ送るメッセージ
          </label>
          <div>
            <span aria-hidden="true">{mode === "pro" ? "PRO" : "ASK"}</span>
            <textarea
              ref={composerRef}
              id="archive-roleplay-message"
              rows={1}
              value={draft}
              maxLength={mode === "pro" ? 1600 : 900}
              enterKeyHint="send"
              placeholder={`${profile.name}へ話しかける…`}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <small aria-label={`${draft.length}文字`}>{draft.length}</small>
          </div>
          {pending ? (
            <button
              type="button"
              className="is-stop"
              onClick={() => stopResponse()}
              aria-label="応答生成を停止"
            >
              <Square size={15} fill="currentColor" strokeWidth={1.4} aria-hidden="true" />
              <span>停止</span>
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label={`${profile.name}へ送信`}>
              <ArrowUp size={17} strokeWidth={2} aria-hidden="true" />
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
