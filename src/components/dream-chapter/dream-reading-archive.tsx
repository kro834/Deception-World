import { useEffect, useId, useState } from "react";
import { DREAM_CASES, DREAM_GLOSSARY } from "./dream-chapter-data";
import {
  DREAM_CHRONICLE,
  DREAM_GLOSSARY_INDEX,
  type DreamChronicleEvent,
} from "./dream-chapter-extra-data";
import {
  archivePassage,
  buildReadingArchive,
  DREAM_READING_ARCHIVE_KEY,
  parseArchiveProgress,
  searchReadingArchive,
} from "./dream-reading-archive-model";

// Only names form the candidate dictionary. No Chronicle text enters the reading archive.
const people = [...new Set(DREAM_CHRONICLE.flatMap((event) => [...event.cast]))];
const paragraphs = DREAM_CASES.flatMap((chapter) =>
  chapter.paragraphs.map((text, index) => ({ chapter: chapter.no, paragraph: index + 1, text })),
);
const records: DreamChronicleEvent[] = paragraphs.map((item, index) => ({
  no: index + 1,
  case: item.chapter,
  title: { text: `CASE ${item.chapter}・第${item.paragraph}段落`, lines: "" },
  place: "",
  cast: people.filter((name) => item.text.includes(name)),
  text: item.text,
  lines: "",
}));
const maximum = records.length;
const terms = [
  ...new Set([
    ...DREAM_GLOSSARY.map((entry) => entry.term),
    ...DREAM_GLOSSARY_INDEX.map((entry) => entry.term),
  ]),
];
const reference = (no: number) => paragraphs[no - 1];
export function DreamReadingArchive() {
  const id = useId();
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DREAM_READING_ARCHIVE_KEY);
      const restored = parseArchiveProgress(raw, maximum);
      setProgress(restored);
      if (raw && JSON.stringify(restored) !== raw)
        setStorageMessage("保存された範囲を読み取れなかったため、未指定に戻しました。");
    } catch {
      setStorageMessage("この環境では範囲を保存できません。この画面では指定できます。");
    }
  }, []);
  const choose = (value: number) => {
    setProgress(value);
    setQuery("");
    try {
      localStorage.setItem(DREAM_READING_ARCHIVE_KEY, JSON.stringify(value));
      setStorageMessage("この端末に読了範囲を保存しました。");
    } catch {
      setStorageMessage("保存できませんでした。この画面では指定した範囲を表示します。");
    }
  };
  const available = buildReadingArchive(records, terms, progress);
  const results = searchReadingArchive(available, query);
  return (
    <section
      id="dream-reading-archive"
      className="dream-reading-archive"
      aria-labelledby={`${id}-heading`}
    >
      <header>
        <h2 id={`${id}-heading`}>読んだところまでの資料室</h2>
        <p>読んだ段落までの人物と用語を探せます。サイト全体の検索は全編を対象にします。</p>
      </header>
      <div className="dream-reading-archive-controls">
        <label htmlFor={`${id}-progress`}>ここまで読んだ</label>
        <select
          id={`${id}-progress`}
          value={progress}
          onChange={(event) => choose(Number(event.target.value))}
        >
          <option value={0}>まだ指定しない</option>
          {paragraphs.map((item, index) => (
            <option key={index} value={index + 1}>
              CASE {item.chapter}・第{item.paragraph}段落まで
            </option>
          ))}
        </select>
        <p role="status">{storageMessage}</p>
        <form
          role="search"
          aria-label="読了範囲の資料室を検索"
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor={`${id}-search`}>読了範囲の人物・用語を検索</label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!progress}
            aria-describedby={`${id}-count`}
            autoComplete="off"
          />
        </form>
      </div>
      <p id={`${id}-count`} role="status" aria-live="polite">
        {progress
          ? `読了範囲内：${results.length} / ${available.length} 件`
          : "「ここまで読んだ」を指定すると資料が表示されます。"}
      </p>
      <p className="dream-reading-archive-note">初出は、その名前が本文に初めて登場した段落です。</p>
      <div className="dream-reading-archive-results">
        {results.map((entry) => (
          <details key={`${entry.kind}:${entry.name}`}>
            <summary>
              <span>{entry.kind}</span> <strong>{entry.name}</strong>
              <small>
                本文内の初出：CASE {reference(entry.first).chapter}・第
                {reference(entry.first).paragraph}段落
              </small>
            </summary>
            {entry.evidence.map((event) => (
              <article key={event.no}>
                <h3>{event.title.text}</h3>
                <blockquote>{archivePassage(event)}</blockquote>
                <p className="dream-reading-archive-source">
                  <a
                    href={`#dream-case-${reference(event.no).chapter}-paragraph-${reference(event.no).paragraph}`}
                  >
                    この段落へ移動
                  </a>
                </p>
              </article>
            ))}
          </details>
        ))}
        {progress > 0 && !results.length ? <p>指定した範囲に一致する資料はありません。</p> : null}
      </div>
    </section>
  );
}
