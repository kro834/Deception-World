import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DREAM_CASES } from "./dream-chapter-data";
import { DREAM_RESEARCH_SOURCES } from "./dream-research-sources";
import {
  emptyResearch,
  readResearch,
  writeResearch,
  removeResearchQuote,
  createResearchAnchor,
  resolveResearchQuote,
  type ResearchData,
  type ResearchQuote,
} from "@/lib/dream-research-store.js";

type Passage = Omit<ResearchQuote, "id">;
const sourceLabel = (q: Passage) =>
  q.source
    ? `${q.source.title}・${q.paragraph}段落目`
    : `CASE ${q.caseNo}・${q.paragraph}段落目`;
const passageBadge = (q: Passage) => {
  const kind = q.source?.kind ?? "case";
  if (kind === "person") {
    return {
      kind: "person" as const,
      code: q.source?.title ? `人物調書・${q.source.title}` : "人物調書",
      para: `第${q.paragraph}段`,
    };
  }
  const no = q.source?.id ?? q.caseNo ?? "0";
  return {
    kind: "case" as const,
    code: `CASE ${String(no).padStart(2, "0")}`,
    para: `第${q.paragraph}段`,
  };
};
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function EmptyNotebookOrnament() {
  return (
    <svg
      className="dream-research-empty-ornament"
      viewBox="0 0 180 24"
      width="180"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 12h58M116 12h58"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.55"
      />
      <path
        d="M70 9.5h12M98 9.5h12M70 14.5h12M98 14.5h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.85"
        strokeOpacity="0.45"
      />
      <path
        d="M90 3.5l6.5 8.5L90 20.5 83.5 12 90 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle cx="90" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A quote is captured only when the selected text maps exactly to its source paragraph. */
function selectedDreamPassage(selection: Selection | null): Passage | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const element =
    range.startContainer.nodeType === 1
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const paragraph = element?.closest<HTMLElement>("p[data-dream-reading-paragraph]");
  if (!paragraph || !paragraph.contains(range.endContainer)) return null;
  const kind = paragraph.dataset.sourceKind ?? "case";
  const sourceId = paragraph.dataset.sourceId ?? paragraph.dataset.caseNo;
  const source = DREAM_RESEARCH_SOURCES.find((item) => item.kind === kind && item.id === sourceId);
  const paragraphId =
    paragraph.dataset.paragraphId ??
    `dream-case-${sourceId}-paragraph-${paragraph.dataset.paragraphNo}`;
  const original = source?.paragraphs.find((item) => item.id === paragraphId);
  if (!source || !original) return null;
  const raw = selection.toString();
  const text = raw.trim();
  if (!text || text.length > 4000) return null;
  const before = range.cloneRange();
  before.selectNodeContents(paragraph);
  before.setEnd(range.startContainer, range.startOffset);
  // Number badges are outside the source text. Subtract their text from the prefix.
  const badge = paragraph.querySelector(".dream-reading-paragraph-number");
  const start = before.toString().length - (badge?.textContent?.length ?? 0) + raw.indexOf(text);
  const anchor = createResearchAnchor(original.text, start, start + text.length);
  if (!anchor || anchor.exact !== text) return null;
  return {
    caseNo: source.kind === "case" ? source.id : undefined,
    paragraph: source.paragraphs.indexOf(original) + 1,
    text,
    source: { kind: source.kind, id: source.id, title: source.title, paragraphId: original.id },
    anchor,
  };
}

export function DreamResearchNotes() {
  const [data, setData] = useState<ResearchData>(emptyResearch);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [passage, setPassage] = useState<Passage | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [pair, setPair] = useState<string[]>(["", ""]);
  const [thought, setThought] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = readResearch(localStorage, DREAM_CASES);
      setData(saved.data);
      setStatus(saved.error);
    } catch {
      setStatus("このブラウザーでは保存記録を利用できません。");
    }
    setReady(true);
    const select = () => {
      const selection = window.getSelection();
      const selected = selectedDreamPassage(selection);
      setPassage(selected);
      const node = selection?.anchorNode;
      const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      setPortalTarget(element?.closest("dialog[open]") ?? null);
    };
    document.addEventListener("selectionchange", select);
    return () => document.removeEventListener("selectionchange", select);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const persist = (next: ResearchData, message: string, announce = false) => {
    let saved = false;
    try {
      saved = writeResearch(localStorage, next);
    } catch {
      /* Storage access itself can be blocked. */
    }
    if (!saved) {
      const error =
        "端末に保存できませんでした。入力内容を残しています。空き容量や保存設定をご確認ください。";
      setStatus(error);
      if (announce) setNotice(error);
      return false;
    }
    setData(next);
    setStatus(message);
    if (announce) setNotice(message);
    return true;
  };
  const saveQuote = () => {
    if (!passage) return;
    if (data.quotes.length >= 100) {
      setStatus("引用は100件まで保存できます。不要な引用を削除してください。");
      setNotice("引用は100件まで保存できます。不要な引用を削除してください。");
      return;
    }
    if (
      data.quotes.some(
        (q) =>
          (q.source?.kind ?? "case") === (passage.source?.kind ?? "case") &&
          (q.source?.id ?? q.caseNo) === (passage.source?.id ?? passage.caseNo) &&
          q.paragraph === passage.paragraph &&
          q.text === passage.text &&
          q.anchor?.prefix === passage.anchor?.prefix &&
          q.anchor?.suffix === passage.anchor?.suffix,
      )
    ) {
      setStatus("この一節は保存済みです。");
      setNotice("この一節は保存済みです。");
      return;
    }
    const quote = { ...passage, id: newId() };
    if (
      persist(
        { ...data, quotes: [...data.quotes, quote] },
        "出典とともに引用を端末へ保存しました。",
        true,
      )
    ) {
      setPair((previous) =>
        previous.includes("")
          ? previous.map((id, i) => (i === previous.indexOf("") ? quote.id : id))
          : previous,
      );
    }
  };
  const jump = (q: ResearchQuote) => {
    const resolved = resolveResearchQuote(q, DREAM_RESEARCH_SOURCES);
    if (resolved.status !== "resolved") {
      setStatus("現在の本文では引用位置を一意に確認できません。当時の引用と出典を表示しています。");
      return;
    }
    if (resolved.source.kind === "person") {
      window.dispatchEvent(
        new CustomEvent("dream-research-open-source", {
          detail: {
            kind: "person",
            id: resolved.source.id,
            paragraphId: resolved.paragraph.id,
            start: resolved.start,
            end: resolved.end,
          },
        }),
      );
      return;
    }
    const target = document.getElementById(resolved.paragraph.id);
    if (!target) {
      setStatus("元の段落が見つかりませんでした。");
      return;
    }
    for (let parent = target.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    target.focus({ preventScroll: true });
    const node = target.firstChild;
    if (node instanceof Text && node.data === resolved.paragraph.text) {
      const range = document.createRange();
      range.setStart(node, resolved.start);
      range.setEnd(node, resolved.end);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    history.replaceState(history.state, "", `#${target.id}`);
  };
  const renderQuote = (q: ResearchQuote, serialLabel?: string) => {
    const resolved = resolveResearchQuote(q, DREAM_RESEARCH_SOURCES);
    const badge = passageBadge(q);
    return (
      <>
        <div className="dream-research-quote-meta" aria-hidden="true">
          {serialLabel ? <span className="dream-research-serial">{serialLabel}</span> : null}
          <span className="dream-research-pill" data-kind={badge.kind}>
            {badge.code}
          </span>
          <span className="dream-research-para-pill">{badge.para}</span>
        </div>
        <blockquote>{q.text}</blockquote>
        <p className="dream-research-source">保存時の出典：{sourceLabel(q)}</p>
        {resolved.status === "resolved" ? (
          <button type="button" className="dream-research-jump" onClick={() => jump(q)}>
            出典の引用箇所へ戻る
          </button>
        ) : (
          <p className="dream-research-unresolved">
            {resolved.status === "ambiguous"
              ? "引用箇所の候補が複数あるため、現在の位置を確定できません。"
              : "本文が変更されたため、現在の引用箇所を確認できません。"}
            保存時の引用を残しています。
          </p>
        )}
      </>
    );
  };
  return (
    <>
      <section
        className="dream-research-notes"
        id="dream-research-notes"
        aria-labelledby="dream-research-title"
      >
        <div className="dream-research-clip" aria-hidden="true">
          <svg
            className="dream-research-clip-svg"
            viewBox="0 0 188 30"
            width="188"
            height="30"
            aria-hidden="true"
            focusable="false"
          >
            <rect
              x="16"
              y="7"
              width="156"
              height="18"
              rx="3"
              fill="url(#dream-clip-brass)"
              stroke="#6c5124"
              strokeWidth="1.2"
            />
            <rect
              x="56"
              y="2"
              width="76"
              height="10"
              rx="3"
              fill="#e4c686"
              stroke="#6c5124"
              strokeWidth="1.1"
            />
            <path
              d="M36 16h116"
              stroke="#5c421a"
              strokeWidth="0.9"
              strokeDasharray="2 3"
              strokeOpacity="0.65"
            />
            <circle cx="28" cy="16" r="2.6" fill="#59401a" />
            <circle cx="28" cy="16" r="1.2" fill="#f5e1af" />
            <circle cx="160" cy="16" r="2.6" fill="#59401a" />
            <circle cx="160" cy="16" r="1.2" fill="#f5e1af" />
            <defs>
              <linearGradient id="dream-clip-brass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f2daa0" />
                <stop offset="48%" stopColor="#cba45c" />
                <stop offset="100%" stopColor="#9d7735" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <header className="dream-research-header">
          <div className="dream-research-heading-row">
            <h2 id="dream-research-title">引用と思索</h2>
            <span className="dream-research-tally" aria-hidden="true">
              <span>抜粋 {String(data.quotes.length).padStart(2, "0")}</span>
              <span>手控え {String(data.notes.length).padStart(2, "0")}</span>
            </span>
          </div>
          <p className="dream-research-lead">
            本文や読書室の人物資料から一節を選択して引用を保存。二つの引用を並べて、考察を残せます。記録はこの端末のブラウザーに保存されます。
          </p>
        </header>
        {passage ? (
          <div className="dream-research-selection">
            <div className="dream-research-quote-meta" aria-hidden="true">
              <span className="dream-research-serial">選択中</span>
              <span className="dream-research-pill" data-kind={passageBadge(passage).kind}>
                {passageBadge(passage).code}
              </span>
              <span className="dream-research-para-pill">{passageBadge(passage).para}</span>
            </div>
            <blockquote>{passage.text}</blockquote>
            <p className="dream-research-source">{sourceLabel(passage)}</p>
          </div>
        ) : (
          <p className="dream-research-guide">
            本文の一つの段落内で、保存したい言葉を選択してください。
          </p>
        )}
        {!passage && (
          <button type="button" disabled>
            本文の一節を選択して保存
          </button>
        )}
        <p className="dream-research-status" role="status" aria-live="polite">
          {status}
        </p>
        <details className="dream-research-ledger" open>
          <summary>保存した引用（{data.quotes.length}）</summary>
          {data.quotes.length === 0 && (
            <div className="dream-research-empty">
              <EmptyNotebookOrnament />
              <p>まだ引用はありません。</p>
            </div>
          )}
          <ol className="dream-research-quotes">
            {data.quotes.map((q, index) => (
              <li key={q.id} className="dream-research-quote-card">
                {renderQuote(q, `№ ${String(index + 1).padStart(2, "0")}`)}
                <button
                  type="button"
                  className="dream-research-delete"
                  onClick={() => {
                    if (
                      persist(
                        removeResearchQuote(data, q.id),
                        "引用と、それを使った考察を削除しました。",
                      )
                    ) {
                      setPair(pair.map((id) => (id === q.id ? "" : id)));
                      if (data.notes.find((n) => n.id === editing)?.quoteIds.includes(q.id))
                        setEditing(null);
                    }
                  }}
                >
                  引用を削除（関連する考察も削除）
                </button>
              </li>
            ))}
          </ol>
        </details>
        <h3>{editing ? "考察を再訪" : "二つの引用を読み比べる"}</h3>
        <div className="dream-research-pair">
          {[0, 1].map((slot) => {
            const selectedIndex = data.quotes.findIndex((q) => q.id === pair[slot]);
            const selectedQuote = selectedIndex >= 0 ? data.quotes[selectedIndex] : undefined;
            return (
              <div key={slot} className="dream-research-slot">
                <div className="dream-research-slot-head">
                  <span className="dream-research-serial" aria-hidden="true">
                    対照 {slot === 0 ? "甲" : "乙"}
                  </span>
                  <label htmlFor={`dream-research-quote-${slot}`}>引用 {slot + 1}</label>
                </div>
                <select
                  id={`dream-research-quote-${slot}`}
                  value={pair[slot]}
                  onChange={(e) => setPair(pair.map((id, i) => (i === slot ? e.target.value : id)))}
                >
                  <option value="">引用を選ぶ</option>
                  {data.quotes.map((q, idx) => (
                    <option key={q.id} value={q.id}>
                      №{String(idx + 1).padStart(2, "0")} {sourceLabel(q)}：{q.text.slice(0, 35)}
                    </option>
                  ))}
                </select>
                {selectedQuote &&
                  renderQuote(selectedQuote, `№ ${String(selectedIndex + 1).padStart(2, "0")}`)}
              </div>
            );
          })}
        </div>
        <label className="dream-research-thought-label" htmlFor="dream-research-thought">
          自分の考察
        </label>
        <textarea
          id="dream-research-thought"
          rows={5}
          maxLength={8000}
          value={thought}
          onChange={(e) => setThought(e.target.value)}
        />
        <div className="dream-research-form-actions">
          <button
            type="button"
            className="dream-research-submit"
            disabled={!ready || !thought.trim() || !pair[0] || !pair[1] || pair[0] === pair[1]}
            onClick={() => {
              if (!editing && data.notes.length >= 100) {
                setStatus("考察は100件まで保存できます。");
                return;
              }
              const note = { id: editing ?? newId(), quoteIds: [...pair], thought: thought.trim() };
              if (
                persist(
                  {
                    ...data,
                    notes: editing
                      ? data.notes.map((n) => (n.id === editing ? note : n))
                      : [...data.notes, note],
                  },
                  "二つの引用と考察を端末へ保存しました。",
                )
              ) {
                setThought("");
                setEditing(null);
              }
            }}
          >
            {editing ? "考察を更新" : "引用と考察を保存"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setThought("");
                setPair(["", ""]);
              }}
            >
              新しい考察へ
            </button>
          )}
        </div>
        {pair[0] && pair[0] === pair[1] && (
          <p className="dream-research-pair-hint">読み比べるには別の引用を選んでください。</p>
        )}
        <h3>保存した考察（{data.notes.length}）</h3>
        {data.notes.length === 0 && (
          <div className="dream-research-empty">
            <EmptyNotebookOrnament />
            <p>まだ考察はありません。</p>
          </div>
        )}
        <ol className="dream-research-saved">
          {data.notes.map((n, noteIndex) => (
            <li key={n.id} className="dream-research-note-card">
              <div className="dream-research-note-head" aria-hidden="true">
                <span className="dream-research-serial">
                  手控え № {String(noteIndex + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="dream-research-pair">
                {n.quoteIds.map((id) => {
                  const qIndex = data.quotes.findIndex((item) => item.id === id);
                  const q = qIndex >= 0 ? data.quotes[qIndex] : undefined;
                  return q ? (
                    <div key={id} className="dream-research-paired-quote">
                      {renderQuote(q, `№ ${String(qIndex + 1).padStart(2, "0")}`)}
                    </div>
                  ) : null;
                })}
              </div>
              <p className="dream-research-thought">{n.thought}</p>
              <div className="dream-research-note-actions">
                <a
                  href="#dream-research-thought"
                  onClick={() => {
                    setPair([...n.quoteIds]);
                    setThought(n.thought);
                    setEditing(n.id);
                  }}
                >
                  この考察を再訪・編集
                </a>
                <button
                  type="button"
                  className="dream-research-delete"
                  onClick={() => {
                    if (
                      persist(
                        { ...data, notes: data.notes.filter((note) => note.id !== n.id) },
                        "考察を削除しました。",
                      ) &&
                      editing === n.id
                    ) {
                      setEditing(null);
                      setThought("");
                    }
                  }}
                >
                  考察を削除
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {ready &&
        (passage || notice) &&
        createPortal(
          <aside className="dream-research-floating" aria-label="引用の保存">
            {notice && (
              <p role="status" aria-live="polite">
                {notice}{" "}
                <a
                  href="#dream-research-notes"
                  onClick={() => {
                    setNotice("");
                    setPassage(null);
                  }}
                >
                  引用と思索を開く
                </a>
              </p>
            )}
            {passage && (
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={saveQuote}
              >
                選択した一節を保存
              </button>
            )}
          </aside>,
          portalTarget?.isConnected ? portalTarget : document.body,
        )}
    </>
  );
}
