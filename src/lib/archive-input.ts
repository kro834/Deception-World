const ARCHIVE_DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

function removeArchiveControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 0x08 ||
      (code >= 0x0b && code <= 0x0c) ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      continue;
    }
    result += character;
  }
  return result;
}

function replaceLoneSurrogates(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\ufffd";
      }
      continue;
    }
    result += code >= 0xdc00 && code <= 0xdfff ? "\ufffd" : value[index];
  }
  return result;
}

/** Preserve authored typography while making browser/server transport deterministic. */
export function normalizeArchiveInput(value: string): string {
  return removeArchiveControlCharacters(replaceLoneSurrogates(value))
    .replace(/\r\n?/gu, "\n")
    .normalize("NFC");
}

/** NFKC is intentionally limited to intent classification, never visible user copy. */
export function normalizeArchiveClassifierText(value: string): string {
  return normalizeArchiveInput(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(ARCHIVE_DEFAULT_IGNORABLE, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function hasVisibleArchiveText(value: string): boolean {
  return normalizeArchiveInput(value).replace(ARCHIVE_DEFAULT_IGNORABLE, "").trim().length > 0;
}

/**
 * Truncate at a grapheme boundary while respecting the API's UTF-16 limits.
 * Intl.Segmenter is present in modern browsers and Node; the code-point fallback
 * still guarantees that a surrogate pair is never split.
 */
export function truncateArchiveInput(value: string, maxCodeUnits: number): string {
  const normalized = normalizeArchiveInput(value);
  const limit = Math.max(0, Math.floor(maxCodeUnits));
  if (!limit || !normalized) return "";
  if (normalized.length <= limit) return normalized;

  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment(input: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  const segments = Segmenter
    ? [...new Segmenter("ja", { granularity: "grapheme" }).segment(normalized)].map(
        ({ segment }) => segment,
      )
    : Array.from(normalized);

  let result = "";
  for (const segment of segments) {
    if (result.length + segment.length > limit) break;
    result += segment;
  }
  return result;
}
