import { DREAM_CASES, DREAM_CHARACTERS } from "./dream-chapter-data";
import type { ResearchSource } from "@/lib/dream-research-store.js";
export const DREAM_RESEARCH_SOURCES: ResearchSource[] = [
  ...DREAM_CASES.map((chapter) => ({
    kind: "case" as const,
    id: chapter.no,
    title: `CASE ${chapter.no}「${chapter.title}」`,
    paragraphs: chapter.paragraphs.map((text, index) => ({
      id: `dream-case-${chapter.no}-paragraph-${index + 1}`,
      text,
    })),
  })),
  ...DREAM_CHARACTERS.filter((person) => person.id === "ciel").map((person) => ({
    kind: "person" as const,
    id: person.id,
    title: `${person.name}・人物資料`,
    paragraphs: (person.sections.find((section) => section.title === "概要")?.paragraphs ?? [])
      .slice(0, 1)
      .map((text) => ({
        id: `dream-person-${person.id}-section-${person.sections.findIndex((section) => section.title === "概要") + 1}-paragraph-1`,
        text,
      })),
  })),
];
