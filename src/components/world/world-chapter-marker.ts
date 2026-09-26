/* The World's reading line. WorldSectionNav (world-home.tsx) lights a header
   chapter once that chapter's top has crossed it; the menu (world-chrome.tsx)
   lights 六詠 while the archive spans it. Until the header imports these, the
   E3 elevation test holds its copy equal to this one, so the header and the
   menu never mark different chapters. */
export function worldChapterMarker() {
  return Math.max(92, Math.min(200, window.innerHeight * 0.22));
}

/* Short landscape viewports can place the native hash landing (96px) just
   below the visual marker (92px). Count that landing as reaching the line.
   Read on every call, so a route stylesheet that applies late still counts. */
export function worldChapterLine(section: Element, marker = worldChapterMarker()) {
  const landing = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
  return Math.max(marker, landing + 8);
}
