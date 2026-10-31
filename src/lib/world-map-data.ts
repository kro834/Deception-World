import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
} from "../components/world/world-annex-data.ts";
import { FORM_ARCHIVE_FORMS } from "../components/search/form-archive-index.ts";

import { LIBRARY_ENTRIES } from "./library-data.ts";
import { DREAM_CHAPTERS } from "./dream-chapter-index.ts";
import {
  DREAM_CAST_ROSTER,
  DREAM_CHARACTERS,
  DREAM_CASES,
  DREAM_FACTIONS,
} from "../components/dream-chapter/dream-chapter-data.ts";

// rider-page.tsx publishes Vandal's person as レックス・ロワ. These two
// dossiers represent one canonical person, not an additional character.
const DOSSIER_PERSON_ALIASES: Readonly<Record<string, string>> = {
  "/riders/vandal": "/managers/rex-loi",
};
const extraDossiers = LIBRARY_ENTRIES.filter(
  (p) =>
    p.kind === "person" &&
    !Object.hasOwn(DOSSIER_PERSON_ALIASES, p.path) &&
    !WORLD_CAST_ROSTER.some((w) => w.to === p.path) &&
    !DREAM_CHARACTERS.some((d) => p.path === `/characters/${d.id}`),
);
const dreamPeople = [
  ...DREAM_CHARACTERS.map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: p.role,
    href: `/dream-chapter#dream-character-${p.id}`,
  })),
  ...DREAM_CAST_ROSTER.map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: p.affiliation,
    href: `/dream-chapter#dream-roster-${p.id}`,
  })),
];
export const MAP_KINDS = {
  person: "人物",
  organization: "組織",
  form: "形態",
  event: "出来事",
  chapter: "章",
} as const;
export type MapKind = keyof typeof MAP_KINDS;
export type MapNode = { id: string; title: string; kind: MapKind; href: string; subtitle: string };
export type MapEdge = { from: string; to: string; label: string; evidence: string };
const publicName = (name: string) => !/[?？]{2}|未公開|非公開/.test(name);
// Identity and captions come from public navigation/content tables. Paragraphs stay in
// their source pages; the graph stores only references and verifiable edge predicates.
export const WORLD_MAP_NODES: readonly MapNode[] = [
  ...extraDossiers
    .filter((p) => publicName(p.title))
    .map((p) => ({
      id: `dossier:${p.id}`,
      title: p.title,
      kind: "person" as const,
      subtitle: "公開人物資料",
      href: p.path,
    })),
  ...dreamPeople
    .filter((p) => publicName(p.name))
    .map((p) => ({
      id: `dream-person:${p.id}`,
      title: p.name,
      kind: "person" as const,
      subtitle: p.subtitle,
      href: p.href,
    })),
  ...DREAM_FACTIONS.map((f) => ({
    id: `dream-organization:${f.id}`,
    title: f.name,
    kind: "organization" as const,
    subtitle: "夢の章 / 組織",
    href: `/dream-chapter#dream-faction-${f.id}`,
  })),
  ...DREAM_CHAPTERS.map((c) => ({
    id: `dream-chapter:${c.no}`,
    title: `CASE ${c.no} / ${c.title}`,
    kind: "chapter" as const,
    subtitle: "夢の章",
    href: `/dream-chapter#dream-case-${c.no}`,
  })),
  ...WORLD_CAST_ROSTER.filter((p) => publicName(p.name)).map((p) => ({
    id: `person:${p.id}`,
    title: p.name,
    kind: "person" as const,
    subtitle: p.role,
    href: `/world#wa-person-${p.id}`,
  })),
  ...WORLD_BRIEF.map((p) => ({
    id: `organization:${p.id}`,
    title: p.name,
    kind: "organization" as const,
    subtitle: "世界と組織",
    href: `/world#wa-brief-${p.id}`,
  })),
  ...FORM_ARCHIVE_FORMS.filter((f) => publicName(f.name)).map((f) => ({
    id: `form:${f.archive}:${f.id}`,
    title: f.name,
    kind: "form" as const,
    subtitle: f.tier,
    href: `/form-archive?archive=${f.archive}&form=${encodeURIComponent(f.id)}#archive-switcher`,
  })),
  ...WORLD_EPISODE_NOTES.flatMap((c) => [
    {
      id: `chapter:${c.no}`,
      title: c.title,
      kind: "chapter" as const,
      subtitle: `EPISODE ${c.no} / ${c.stage}`,
      href: `/world#wa-episode-${c.no}`,
    },
    ...c.synopsis.map((_, i) => ({
      id: `event:${c.no}:${i}`,
      title: `${c.title} · ${String(i + 1).padStart(2, "0")}`,
      kind: "event" as const,
      subtitle: `${c.stage} / 記録 ${i + 1}`,
      href: `/world#wa-episode-${c.no}`,
    })),
  ]),
];
// Reviewed against DREAM_CASES: shortened spoken names are not matched across
// arbitrary prose. This small explicit table records only witnessed appearances.
export const DREAM_MAP_APPEARANCES = [
  { no: "0", people: ["ciel", "keiya", "kaisaku"] },
  { no: "1", people: ["ciel", "keiya", "kaisaku", "dynamite", "nagamori"] },
  { no: "2", people: ["ciel", "keiya", "kaisaku", "aya"] },
  { no: "3", people: ["ciel", "keiya", "kaisaku"] },
  { no: "4", people: ["ciel", "kaisaku"] },
  { no: "5", people: ["ciel", "keiya", "kaisaku"] },
] as const;
// Keep the chapter list tied to the existing published cases.
export const dreamMapCaseIds = DREAM_CASES.map((c) => c.no);
export const WORLD_MAP_EDGES: readonly MapEdge[] = [
  ...DREAM_MAP_APPEARANCES.flatMap((c) =>
    c.people.map((id) => ({
      from: `dream-person:${id}`,
      to: `dream-chapter:${c.no}`,
      label: "章に登場",
      evidence: `/dream-chapter#dream-case-${c.no}`,
    })),
  ),
  // Exact equality with the structured affiliation field, never prose inference.
  ...DREAM_CAST_ROSTER.flatMap((p) =>
    DREAM_FACTIONS.filter((f) => f.name === p.affiliation).map((f) => ({
      from: `dream-person:${p.id}`,
      to: `dream-organization:${f.id}`,
      label: "所属",
      evidence: `/dream-chapter#dream-roster-${p.id}`,
    })),
  ),
  ...WORLD_CAST_ROSTER.filter((p) => p.role.startsWith("六詠")).map((p) => ({
    from: `person:${p.id}`,
    to: "organization:rikuei",
    label: "六詠",
    evidence: `/world#wa-person-${p.id}`,
  })),
  ...FORM_ARCHIVE_FORMS.filter((f) => publicName(f.name)).map((f) => ({
    from: `person:${f.archive === "saga" ? "yuma" : "bell"}`,
    to: `form:${f.archive}:${f.id}`,
    label: "変身者",
    evidence: `/form-archive?archive=${f.archive}&form=${encodeURIComponent(f.id)}`,
  })),
  ...WORLD_EPISODE_NOTES.flatMap((c) =>
    c.synopsis.flatMap((text, i) => [
      {
        from: `chapter:${c.no}`,
        to: `event:${c.no}:${i}`,
        label: "記録に収録",
        evidence: `/world#wa-episode-${c.no}`,
      },
      ...WORLD_CAST_ROSTER.filter((p) => publicName(p.name) && text.includes(p.name)).map((p) => ({
        from: `person:${p.id}`,
        to: `event:${c.no}:${i}`,
        label: "記録に登場",
        evidence: `/world#wa-episode-${c.no}`,
      })),
      ...WORLD_BRIEF.filter((p) => text.includes(p.name)).map((p) => ({
        from: `organization:${p.id}`,
        to: `event:${c.no}:${i}`,
        label: "記録に登場",
        evidence: `/world#wa-episode-${c.no}`,
      })),
    ]),
  ),
];
export function mapNeighbors(id: string) {
  return new Set(
    WORLD_MAP_EDGES.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : [])),
  );
}
export function filterMapNodes(query: string, kind: string) {
  const terms = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return WORLD_MAP_NODES.filter(
    (n) =>
      (kind === "all" || n.kind === kind) &&
      terms.every((t) =>
        `${n.title} ${n.subtitle}`.normalize("NFKC").toLocaleLowerCase().includes(t),
      ),
  );
}
export function validateMapSearch(search: Record<string, unknown>) {
  // Resolve a dossier at this route boundary, so shared navigation never imports
  // the graph's story datasets into every dossier bundle.
  if (typeof search.source === "string" && typeof search.node !== "string") {
    const href = worldMapHrefForDossier(search.source);
    if (href) {
      const params = new URL(href, "https://deception.invalid").searchParams;
      search = { ...search, ...Object.fromEntries(params) };
    }
  }
  return {
    q: typeof search.q === "string" ? search.q.slice(0, 120) : "",
    kind:
      typeof search.kind === "string" && Object.hasOwn(MAP_KINDS, search.kind)
        ? (search.kind as MapKind)
        : ("all" as const),
    node:
      typeof search.node === "string" && WORLD_MAP_NODES.some((n) => n.id === search.node)
        ? search.node
        : "person:yuma",
  };
}

/** Resolve only exact canonical dossier paths. Multiple people share Leddic's
 * dossier; return a role search there instead of silently choosing one person. */
export function worldMapHrefForDossier(path: string): string | undefined {
  const requested = path.split(/[?#]/)[0].replace(/\/$/, "");
  const clean = DOSSIER_PERSON_ALIASES[requested] ?? requested;
  const roster = WORLD_CAST_ROSTER.filter((p) => p.to === clean);
  if (roster.length > 1) return `/world-map?kind=person&q=${encodeURIComponent(roster[0].role)}`;
  if (roster.length === 1) return `/world-map?node=${encodeURIComponent(`person:${roster[0].id}`)}`;
  const dream = DREAM_CHARACTERS.find((p) => clean === `/characters/${p.id}`);
  if (dream) return `/world-map?node=${encodeURIComponent(`dream-person:${dream.id}`)}`;
  const dossier = extraDossiers.find((p) => p.path === clean);
  return dossier ? `/world-map?node=${encodeURIComponent(`dossier:${dossier.id}`)}` : undefined;
}
export function worldMapLabHref(id: string): string | undefined {
  const ids = ["rexonance", "far-from", "illusionculum", "meta-unitas"];
  const form = ids.find((f) => id === `form:saga:${f}`);
  return form ? `/transformation-lab?rider=${form}` : undefined;
}
