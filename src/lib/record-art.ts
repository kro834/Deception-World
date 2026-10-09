// The index pages' art (rx10 STAGE, /library and /search): which existing
// picture stands for a record, and the record's HUD code and edition light.
// Only files that are already published are named, each at the smallest
// delivery variant the site already makes (the rider rail's 720 px WebPs, the
// manager cards' 480 px, the cast wall's 360 px, the Form Archive's 240 px
// thumbnails, the episode cards' 600 px). A record without a picture, or
// whose only file is too heavy for a card, gets a typographic plate instead.
// Paths and positions only: no prose, and nothing heavy is imported.

export type RecordEdition =
  "world" | "dream" | "rexonance" | "extreme" | "final" | "gallery" | "archive";

export type RecordArt = {
  /** A published image, or none for a typographic plate. */
  src?: string;
  /** object-position for the crop. */
  pos?: string;
  edition: RecordEdition;
  /** A short HUD code (capitals and digits). */
  code: string;
};

type Picture = { src: string; pos?: string };

/** The eight riders, in the World's rider order, with the rail's crops. */
export const RIDER_ART: readonly (Picture & { id: string; no: string; tone: string })[] = [
  {
    id: "saga",
    no: "01",
    tone: "#248cff",
    src: "/rider-saga-rexonance-thumbnail-20260827.webp",
    pos: "50% 22%",
  },
  { id: "realm", no: "02", tone: "#f14a60", src: "/rider-realm.webp", pos: "50% 16%" },
  { id: "lore", no: "03", tone: "#67d8ff", src: "/rider-loa.webp", pos: "50% 12%" },
  {
    id: "vandal",
    no: "04",
    tone: "#e71a9c",
    src: "/rider-vandal-thumbnail-20260827.webp",
    pos: "50% 14%",
  },
  { id: "leddic", no: "05", tone: "#69df74", src: "/rider-leddic-home.webp", pos: "50% 18%" },
  { id: "argenome", no: "06", tone: "#d71920", src: "/rider-algenome.webp", pos: "50% 16%" },
  {
    id: "over-zeztz",
    no: "07",
    tone: "#32e1d0",
    src: "/rider-over-zeztz-thumbnail-20260829.webp",
    pos: "50% 30%",
  },
  {
    id: "cipher",
    no: "08",
    tone: "#f05bcf",
    src: "/rider-cipher-thumbnail-20260825.webp",
    pos: "50% 8%",
  },
];
const RIDERS = new Map(RIDER_ART.map((rider) => [rider.id, rider]));

/** 六詠, first to sixth, with the manager cards' crops. */
const MANAGERS: readonly (Picture & { id: string })[] = [
  { id: "zeus", src: "/manager-zeus-thumb-480.webp", pos: "50% 0%" },
  { id: "rex-loi", src: "/manager-rex-loi-thumb-480.webp", pos: "50% 0%" },
  { id: "shuza", src: "/manager-shuza-thumb-480.webp", pos: "50% 16%" },
  { id: "lejas", src: "/manager-lejas-portrait-thumb-480.webp", pos: "50% 8%" },
  { id: "opus", src: "/manager-opus-thumb-480.webp", pos: "50% 0%" },
  { id: "reemu", src: "/manager-reemu-thumb-480.webp", pos: "50% 14%" },
];
const MANAGER_BY_ID = new Map(
  MANAGERS.map((manager, index) => [manager.id, { ...manager, index }]),
);

const CHARACTERS: Record<string, Picture> = {
  ciel: { src: "/ciel-thumb-20260924-480.webp", pos: "50% 12%" },
  luna: { src: "/character-luna-360.webp", pos: "50% 12%" },
  terra: { src: "/character-terra-360.webp", pos: "50% 10%" },
  "yoake-mamori": { src: "/character-yoake-mamori-delivery-360.webp", pos: "50% 12%" },
  dante: { src: "/character-dante-thumb.webp", pos: "50% 14%" },
};
const CHARACTER_ORDER = ["ciel", "terra", "luna", "dante", "yoake-mamori"];

/** The World cast wall's portraits (world-annex.tsx), at their 360 px step. */
const WORLD_CAST: Record<string, Picture> = {
  yuma: { src: "/civilian-yuma-20260826-delivery-360.webp", pos: "50% 10%" },
  bell: { src: "/civilian-bell-20260826-delivery-360.webp", pos: "50% 12%" },
  roa: { src: "/civilian-lore-delivery-360.webp", pos: "50% 0%" },
  rex: { src: "/manager-rex-loi-thumb-480.webp", pos: "50% 14%" },
  reemu: { src: "/manager-reemu-thumb-480.webp", pos: "50% 6%" },
  shuza: { src: "/manager-shuza-thumb-480.webp", pos: "50% 18%" },
  hanabi: { src: "/civilian-leddic-delivery-360.webp", pos: "50% 12%" },
  chigiri: { src: "/civilian-naikami-chigiri-delivery-360.webp", pos: "50% 16%" },
  mamoru: { src: "/civilian-argenome-delivery-360.webp", pos: "50% 14%" },
  james: { src: "/character-james-20260829-360.webp", pos: "50% 8%" },
  luna: CHARACTERS.luna,
  terra: CHARACTERS.terra,
  yoake: CHARACTERS["yoake-mamori"],
};

/** Final Stage's cast (final-stage-data.ts CAST), at card-sized files. */
const FINAL_CAST: Record<string, Picture> = {
  yuma: WORLD_CAST.yuma,
  bell: WORLD_CAST.bell,
  lore: WORLD_CAST.roa,
  nagi: { src: "/character-nagi-20260922-delivery-640.webp", pos: "50% 12%" },
  "rex-loi": MANAGERS[1],
  zeus: MANAGERS[0],
  archive: { src: "/character-archive-delivery-640.webp", pos: "50% 12%" },
};

/** The Dream Chapter's files and Dolminence records (their own portraits). */
const DREAM_PEOPLE: Record<string, Picture> = {
  ciel: { src: "/dream-chapter-ciel.jpeg", pos: "50% 10%" },
  keiya: { src: "/dream-chapter-keiya.jpeg", pos: "50% 12%" },
  kaisaku: { src: "/dream-chapter-kaisaku.jpeg", pos: "50% 20%" },
  "lord-knight": { src: "/dream-chapter-lord-knight.jpeg", pos: "50% 14%" },
  "lord-chaos": { src: "/dream-chapter-lord-chaos.jpeg", pos: "50% 14%" },
  dread: { src: "/dream-chapter-dread.jpeg", pos: "50% 14%" },
  lupin: { src: "/dream-chapter-lupin.jpeg", pos: "50% 18%" },
};

const EPISODES: Record<string, Picture> = {
  "01": { src: "/episode-01-hide-and-seek-delivery-600.webp", pos: "50% 30%" },
  "02": { src: "/episode-02-legends-delivery-600.webp", pos: "50% 40%" },
  "03": { src: "/episode-03-deception-world-delivery-600.webp", pos: "50% 30%" },
  "04": { src: "/episode-04-kill-delivery-600.webp", pos: "50% 30%" },
  "05": { src: "/episode-05-farce-delivery-600.webp", pos: "50% 40%" },
  "06": { src: "/episode-06-deus-600.webp", pos: "50% 40%" },
};

/** The Form Archive's own 240 px portrait thumbnails. */
const formThumb = (archive: string, id: string): Picture => ({
  src: `/archive-media/thumbs/${archive}-${id}.webp`,
  pos: "50% 18%",
});

/** The sites and rooms, as their key art. */
const PAGES: Record<string, Picture & { edition: RecordEdition; code: string }> = {
  "/world": {
    src: "/poster-card-03-delivery.webp",
    pos: "50% 22%",
    edition: "world",
    code: "WORLD",
  },
  "/dream-chapter": {
    src: "/dream-chapter-poster-thumb-01.jpeg",
    pos: "50% 30%",
    edition: "dream",
    code: "DREAM",
  },
  "/gallery": { src: "/gallery/g01-480.webp", pos: "50% 30%", edition: "gallery", code: "GALLERY" },
  "/form-archive": { ...formThumb("saga", "multi"), edition: "archive", code: "ARCHIVE" },
  "/rexonance-saga": {
    ...formThumb("saga", "rexonance-ultra"),
    edition: "rexonance",
    code: "REXONANCE",
  },
  "/extreme-saga": { ...formThumb("saga", "extreme-ultra"), edition: "extreme", code: "EXTREME" },
  "/final-stage": {
    src: "/rider-far-from-saga-max-delivery-640.webp",
    pos: "50% 18%",
    edition: "final",
    code: "FINAL",
  },
};

export function editionOf(path: string): RecordEdition {
  if (path === "/dream-chapter") return "dream";
  if (path === "/rexonance-saga") return "rexonance";
  if (path === "/extreme-saga") return "extreme";
  if (path === "/final-stage") return "final";
  if (path === "/gallery") return "gallery";
  if (path === "/form-archive") return "archive";
  return "world";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A record's own dossier picture, by its page path (/riders/x, /managers/x, /characters/x). */
function dossierArt(path: string): RecordArt | undefined {
  const [, section, id] = path.split("/");
  if (section === "riders") {
    const rider = RIDERS.get(id);
    if (rider)
      return { src: rider.src, pos: rider.pos, edition: "world", code: `RIDER ${rider.no}` };
  }
  if (section === "managers") {
    const manager = MANAGER_BY_ID.get(id);
    if (manager)
      return {
        src: manager.src,
        pos: manager.pos,
        edition: "world",
        code: `RIKUEI ${pad(manager.index + 1)}`,
      };
  }
  if (section === "characters" && CHARACTERS[id]) {
    return {
      ...CHARACTERS[id],
      edition: "world",
      code: `FILE ${pad(CHARACTER_ORDER.indexOf(id) + 1)}`,
    };
  }
  return undefined;
}

/** The art for any page path and fragment the library or a guide points at. */
export function pathArt(path: string, hash?: string): RecordArt {
  const dossier = dossierArt(path);
  if (dossier) return dossier;
  if (path === "/dream-chapter" && hash?.startsWith("dream-case-")) {
    return { edition: "dream", code: `CASE ${hash.slice("dream-case-".length)}` };
  }
  const page = PAGES[path];
  if (page) return { src: page.src, pos: page.pos, edition: page.edition, code: page.code };
  return { edition: editionOf(path), code: "RECORD" };
}

type ArtDocument = {
  id: string;
  category: string;
  to: string;
  hash?: string;
  search?: Readonly<Record<string, string>>;
};

const CATEGORY_CODES: Record<string, string> = {
  people: "PEOPLE",
  riders: "RIDERS",
  forms: "FORMS",
  story: "STORY",
  world: "WORLD",
  systems: "SYSTEMS",
  pages: "PAGES",
};

const SYSTEM_ART: Record<string, Picture> = {
  "system-extreme-01": formThumb("saga", "extreme"),
  "system-extreme-02": formThumb("saga", "extreme-ultra"),
  "system-extreme-03": formThumb("saga", "extreme-ultra"),
  "system-rexonance-01": formThumb("saga", "rexonance"),
  "system-rexonance-02": formThumb("saga", "rexonance-max"),
  "system-rexonance-03": formThumb("saga", "rexonance-ultra"),
};

const RIDER_RECORD_ART: Record<string, Picture> = {
  "extreme-saga": formThumb("saga", "extreme-ultra"),
  "rexonance-saga": formThumb("saga", "rexonance-ultra"),
  "far-from-saga": { src: "/rider-far-from-saga-max-delivery-640.webp", pos: "50% 18%" },
  "realm-royal": formThumb("realm", "royal"),
};

const SITE_ART: Record<string, readonly Picture[]> = {
  "/rexonance-saga": [
    formThumb("saga", "rexonance-ultra"),
    formThumb("saga", "rexonance-max"),
    formThumb("saga", "rexonance"),
  ],
  "/extreme-saga": [formThumb("saga", "extreme-ultra"), formThumb("saga", "extreme")],
  "/final-stage": [PAGES["/final-stage"], formThumb("realm", "royal")],
};

/** A search record's picture (src may be empty: a typographic plate). */
function documentPicture(document: ArtDocument): Picture | undefined {
  const { id, to } = document;
  if (id.startsWith("form-") && to === "/form-archive" && document.search?.form) {
    return formThumb(document.search.archive === "realm" ? "realm" : "saga", document.search.form);
  }
  if (SYSTEM_ART[id]) return SYSTEM_ART[id];
  if (RIDER_RECORD_ART[id]) return RIDER_RECORD_ART[id];
  if (id.startsWith("world-episode-")) return EPISODES[id.slice("world-episode-".length)];
  if (id.startsWith("person-") && WORLD_CAST[id.slice("person-".length)])
    return WORLD_CAST[id.slice("person-".length)];
  if (id.startsWith("final-stage-cast-")) return FINAL_CAST[id.slice("final-stage-cast-".length)];
  if (id.startsWith("dream-dossier-")) return DREAM_PEOPLE[id.slice("dream-dossier-".length)];
  if (id.startsWith("dream-dolminence-")) return DREAM_PEOPLE[id.slice("dream-dolminence-".length)];
  if (/^\/(?:riders|managers|characters)\//.test(to)) {
    const dossier = dossierArt(to);
    if (dossier?.src) return { src: dossier.src, pos: dossier.pos };
  }
  if (id === "final-stage") return PAGES["/final-stage"];
  if (id === "form-archive") return PAGES["/form-archive"];
  if (id.startsWith("page-") && PAGES[to]) return PAGES[to];
  // A special site's own sections take one of the site's forms, turn about.
  if (id.startsWith("site-") && SITE_ART[to]) {
    const set = SITE_ART[to];
    const turn = [...(document.hash ?? "")].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    return set[turn % set.length];
  }
  return undefined;
}

/** The art and HUD code for a search record; `number` is its place in the index. */
export function documentArt(document: ArtDocument, number: number): RecordArt {
  const picture = documentPicture(document);
  return {
    src: picture?.src,
    pos: picture?.pos,
    edition: editionOf(document.to),
    code: `${CATEGORY_CODES[document.category] ?? "RECORD"} ${String(number).padStart(3, "0")}`,
  };
}
