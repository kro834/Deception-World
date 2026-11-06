import type { DreamChronicleEvent } from "./dream-chapter-extra-data";

export const DREAM_READING_ARCHIVE_KEY = "dream-reading-archive-paragraph-v1";
export type ReadingArchiveEntry = {
  kind: "人物" | "用語";
  name: string;
  first: number;
  evidence: DreamChronicleEvent[];
};
export function archivePassage(event: DreamChronicleEvent) {
  return (
    event.text ??
    event.segments
      .map((segment) => `${segment.by ? `${segment.by}：` : ""}${segment.text}`)
      .join("\n")
  );
}
export function parseArchiveProgress(raw: string | null, maximum: number) {
  if (!raw) return 0;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum
      ? value
      : 0;
  } catch {
    return 0;
  }
}
export function buildReadingArchive(
  events: readonly DreamChronicleEvent[],
  terms: readonly string[],
  progress: number,
): ReadingArchiveEntry[] {
  const entries = new Map<string, ReadingArchiveEntry>();
  for (const event of events) {
    if (event.no > progress) continue;
    const text = archivePassage(event);
    const mentions: [ReadingArchiveEntry["kind"], string][] = [
      ...event.cast.map((name): ["人物", string] => ["人物", name]),
      ...terms
        .filter((name) => text.includes(name))
        .map((name): ["用語", string] => ["用語", name]),
    ];
    for (const [kind, name] of mentions) {
      const key = `${kind}:${name}`;
      const previous = entries.get(key);
      if (previous) {
        if (!previous.evidence.includes(event)) previous.evidence.push(event);
      } else entries.set(key, { kind, name, first: event.no, evidence: [event] });
    }
  }
  return [...entries.values()];
}
export function searchReadingArchive(entries: readonly ReadingArchiveEntry[], query: string) {
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ja");
  const words = normalize(query).trim().split(/\s+/u).filter(Boolean);
  return entries.filter((entry) => {
    const text = normalize(
      [entry.name, entry.kind, ...entry.evidence.map(archivePassage)].join(" "),
    );
    return words.every((word) => text.includes(word));
  });
}
