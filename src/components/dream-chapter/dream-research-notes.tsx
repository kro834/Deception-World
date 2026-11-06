import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DREAM_CASES } from "./dream-chapter-data";
import {
  emptyResearch,
  readResearch,
  writeResearch,
  removeResearchQuote,
  type ResearchData,
  type ResearchQuote,
} from "@/lib/dream-research-store.js";

type Passage = Omit<ResearchQuote, "id">;
const sourceLabel = (q: Passage) =>
  `CASE ${q.caseNo}「${DREAM_CASES.find((c) => c.no === q.caseNo)?.title ?? ""}」・${q.paragraph}段落目`;
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Captures only an actual selection wholly within a canonical story paragraph. */
function selectedDreamPassage(selection: Selection | null): Passage | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const element =
    range.startContainer.nodeType === 1
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const paragraph = element?.closest<HTMLElement>("p[data-dream-reading-paragraph]");
  if (!paragraph || !paragraph.contains(range.endContainer)) return null;
  const caseNo = paragraph.dataset.caseNo;
  const no = Number(paragraph.dataset.paragraphNo);
  const text = selection.toString().trim();
  const chapter = DREAM_CASES.find((c) => c.no === caseNo);
  if (
    !chapter ||
    !Number.isInteger(no) ||
    !text ||
    text.length > 4000 ||
    !chapter.paragraphs[no - 1]?.includes(text)
  )
    return null;
  return { caseNo: chapter.no, paragraph: no, text };
}

export function DreamResearchNotes() {
  const [data, setData] = useState<ResearchData>(emptyResearch);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [passage, setPassage] = useState<Passage | null>(null);
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
    const select = () => setPassage(selectedDreamPassage(window.getSelection()));
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
          q.caseNo === passage.caseNo &&
          q.paragraph === passage.paragraph &&
          q.text === passage.text,
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
    const target = document.getElementById(`dream-case-${q.caseNo}-paragraph-${q.paragraph}`);
    if (!target) {
      setStatus("元の段落が見つかりませんでした。");
      return;
    }
    for (let parent = target.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    target.focus({ preventScroll: true });
    history.replaceState(history.state, "", `#${target.id}`);
  };
  const renderQuote = (q: ResearchQuote) => (
    <>
      <blockquote>{q.text}</blockquote>
      <button type="button" onClick={() => jump(q)}>
        {sourceLabel(q)}へ戻る
      </button>
    </>
  );
  return (
    <>
      <section
        className="dream-research-notes"
        id="dream-research-notes"
        aria-labelledby="dream-research-title"
      >
        <h2 id="dream-research-title">引用と思索</h2>
        <p>
          本文の一節を選択して引用を保存。二つの引用を並べて、考察を残せます。記録はこの端末のブラウザーに保存されます。
        </p>
        {passage ? (
          <div className="dream-research-selection">
            <blockquote>{passage.text}</blockquote>
            <p>{sourceLabel(passage)}</p>
          </div>
        ) : (
          <p>本文の一つの段落内で、保存したい言葉を選択してください。</p>
        )}
        {!passage && (
          <button type="button" disabled>
            本文の一節を選択して保存
          </button>
        )}
        <p role="status" aria-live="polite">
          {status}
        </p>
        <details open>
          <summary>保存した引用（{data.quotes.length}）</summary>
          {data.quotes.length === 0 && <p>まだ引用はありません。</p>}
          <ol className="dream-research-quotes">
            {data.quotes.map((q) => (
              <li key={q.id}>
                {renderQuote(q)}
                <button
                  type="button"
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
          {[0, 1].map((slot) => (
            <div key={slot}>
              <label htmlFor={`dream-research-quote-${slot}`}>引用 {slot + 1}</label>
              <select
                id={`dream-research-quote-${slot}`}
                value={pair[slot]}
                onChange={(e) => setPair(pair.map((id, i) => (i === slot ? e.target.value : id)))}
              >
                <option value="">引用を選ぶ</option>
                {data.quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {sourceLabel(q)}：{q.text.slice(0, 35)}
                  </option>
                ))}
              </select>
              {data.quotes.find((q) => q.id === pair[slot]) &&
                renderQuote(data.quotes.find((q) => q.id === pair[slot])!)}
            </div>
          ))}
        </div>
        <label htmlFor="dream-research-thought">自分の考察</label>
        <textarea
          id="dream-research-thought"
          rows={5}
          maxLength={8000}
          value={thought}
          onChange={(e) => setThought(e.target.value)}
        />
        <button
          type="button"
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
        {pair[0] && pair[0] === pair[1] && <p>読み比べるには別の引用を選んでください。</p>}
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
        <h3>保存した考察（{data.notes.length}）</h3>
        {data.notes.length === 0 && <p>まだ考察はありません。</p>}
        <ol className="dream-research-saved">
          {data.notes.map((n) => (
            <li key={n.id}>
              <div className="dream-research-pair">
                {n.quoteIds.map((id) => {
                  const q = data.quotes.find((q) => q.id === id);
                  return q ? <div key={id}>{renderQuote(q)}</div> : null;
                })}
              </div>
              <p className="dream-research-thought">{n.thought}</p>
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
          document.body,
        )}
    </>
  );
}
