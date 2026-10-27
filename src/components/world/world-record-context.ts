import {
  WORLD_BRIEF,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
} from "./world-annex-data.ts";

export type WorldRecordLink = { href: string; label: string };
export type WorldRecordGroup = {
  label: string;
  links: readonly WorldRecordLink[];
};

type RecordReferences = {
  brief: readonly string[];
  locations: readonly string[];
  terms: readonly string[];
};

// References into the existing archive, not additional story descriptions.
// Keep these limited to subjects covered by the corresponding episode notes.
const EPISODE_REFERENCES: Readonly<Record<string, RecordReferences>> = {
  "01": { brief: ["rikuei"], locations: ["碧栄"], terms: ["脚本"] },
  "02": {
    brief: ["realms"],
    locations: ["コンビニ", "レルムズフランス本部"],
    terms: ["レジェンズルーレット"],
  },
  "03": {
    brief: ["code"],
    locations: ["天守閣", "悠真の夢"],
    terms: ["管理権限", "マキャベルゴアナイトメア", "夢への扉"],
  },
  "04": {
    brief: ["rikuei"],
    locations: ["悠真の夢", "碧栄"],
    terms: ["ネクストピース"],
  },
};

const briefLinks = new Map(
  WORLD_BRIEF.map(({ id, name }) => [id, { href: `#wa-brief-${id}`, label: name }]),
);
const locationLinks = new Map(
  WORLD_LOCATIONS.map(({ name }) => [name, { href: `#wa-location-${name}`, label: name }]),
);
const termLinks = new Map(
  WORLD_GLOSSARY.map(({ term }) => [term, { href: `#wa-term-${term}`, label: term }]),
);

function resolveLinks(
  references: readonly string[],
  source: ReadonlyMap<string, WorldRecordLink>,
): readonly WorldRecordLink[] {
  return references.map((reference) => {
    const link = source.get(reference);
    if (!link) throw new Error(`Missing World record reference: ${reference}`);
    return link;
  });
}

export const WORLD_EPISODE_INDEX = WORLD_EPISODE_NOTES.map(({ no, title }) => ({
  no,
  title,
  href: `#wa-episode-${no}`,
}));

export const WORLD_RECORD_CONTEXTS = WORLD_EPISODE_NOTES.map(({ no }) => {
  const references = EPISODE_REFERENCES[no];
  const groups: readonly WorldRecordGroup[] = references
    ? [
        { label: "世界と組織", links: resolveLinks(references.brief, briefLinks) },
        { label: "舞台", links: resolveLinks(references.locations, locationLinks) },
        { label: "用語集", links: resolveLinks(references.terms, termLinks) },
      ]
    : [];
  return { no, groups };
});
