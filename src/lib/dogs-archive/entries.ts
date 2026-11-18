export const DOG_ARCHIVE_IDS = [1, 2, 3, 4, 5] as const;
export type DogArchiveId = (typeof DOG_ARCHIVE_IDS)[number];

const ORDINALS = ["第一", "第二", "第三", "第四", "第五"] as const;
type DogPortrait = {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
};

type DogDossier = {
  name: string;
  portrait?: DogPortrait;
  human?: DogPortrait & { name: string };
};

const DOSSIERS: Record<DogArchiveId, DogDossier> = {
  1: {
    name: "アルケオン",
    portrait: { src: "/dogs-archive-20261118/archeon.webp", width: 853, height: 1280 },
  },
  2: {
    name: "ヴァルグ",
    portrait: {
      src: "/character-varg-20261021.webp",
      srcSet:
        "/character-varg-20261021-360.webp 360w, /character-varg-20261021-720.webp 720w, /character-varg-20261021.webp 1088w",
      width: 1088,
      height: 1445,
    },
  },
  3: {
    name: "アガサ",
    portrait: { src: "/dogs-archive-20261118/agatha.webp", width: 896, height: 1280 },
    human: {
      name: "かつての六詠",
      src: "/dogs-archive-20261118/agatha-human.webp",
      width: 1280,
      height: 1199,
    },
  },
  4: {
    name: "エウレル",
    portrait: { src: "/dogs-archive-20261118/eurel.webp", width: 853, height: 1280 },
    human: {
      name: "ゼウス",
      src: "/dogs-archive-20261118/eurel-human.webp",
      width: 1024,
      height: 1280,
    },
  },
  5: {
    name: "シエル",
    human: {
      name: "月城悠真",
      src: "/dogs-archive-20261118/ciel-human.webp",
      width: 960,
      height: 1280,
    },
  },
};

export const CIEL_DOG_ORIGINAL = "/dogs-archive-20261028/reference/guardian-rest.jpg";

export const DOG_ARCHIVE_ENTRIES = DOG_ARCHIVE_IDS.map((id) => ({
  id,
  title: `${ORDINALS[id - 1]}の“犬”`,
  ...DOSSIERS[id],
}));

export const DOG_ARCHIVE_ART_PATHS = [
  CIEL_DOG_ORIGINAL,
  ...DOG_ARCHIVE_ENTRIES.flatMap(({ portrait, human }) =>
    [portrait?.src, human?.src].filter((src) => src !== undefined),
  ),
];

export function parseDogArchiveSearch(search: Record<string, unknown>): {
  dog: DogArchiveId;
  form?: "human";
} {
  const value = search.dog;
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-5]$/.test(value)
        ? Number(value)
        : 5;
  const dog = DOG_ARCHIVE_IDS.find((id) => id === number) ?? 5;
  return search.form === "human" && DOSSIERS[dog].human ? { dog, form: "human" } : { dog };
}
