export const DOG_ARCHIVE_IDS = [1, 2, 3, 4, 5] as const;
export type DogArchiveId = (typeof DOG_ARCHIVE_IDS)[number];

const ORDINALS = ["第一", "第二", "第三", "第四", "第五"] as const;
export const DOG_ARCHIVE_ENTRIES = DOG_ARCHIVE_IDS.map((id) => ({
  id,
  numeral: ["I", "II", "III", "IV", "V"][id - 1],
  title: `${ORDINALS[id - 1]}の“犬”`,
  name: id === 2 ? "ダンテ／ヴァルグ" : undefined,
}));

export function parseDogArchiveSearch(search: Record<string, unknown>): { dog: DogArchiveId } {
  const value = search.dog;
  const dog =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-5]$/.test(value)
        ? Number(value)
        : 5;
  return { dog: DOG_ARCHIVE_IDS.includes(dog as DogArchiveId) ? (dog as DogArchiveId) : 5 };
}
