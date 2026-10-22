// Variable faces preserve all existing weights without repeating the Japanese
// unicode-range table for every weight. Keep this URL stable across routes so
// entering the World reuses the opening's already downloaded fonts.
export const SITE_CORE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@400..700&family=Noto+Sans+JP:wght@400..600&family=Oxanium:wght@400..700&display=swap";

// This static display family is used by the site's reading/menu surfaces, not
// the opening. Its large character-range stylesheet should not block the title.
// Zen Kaku Gothic New has no 600 face; use its actual Medium and Bold weights.
export const SITE_DISPLAY_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=swap";

export function siteFontLinks(opening: boolean) {
  return [SITE_CORE_FONTS_URL, ...(opening ? [] : [SITE_DISPLAY_FONTS_URL])].map((href) => ({
    rel: "stylesheet" as const,
    href,
  }));
}
