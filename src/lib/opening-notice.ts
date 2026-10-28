/* Owner (2026-10-28): once the opening has been passed through (ENTER THE
   WORLD, directly or after SKIP), /world shows an SCP-wiki style notice,
   「お知らせが1件届いています」. Pressing it cuts to the image for three
   seconds; × or Escape dismisses it. It is armed by the opening of this page
   load only, and taken once, so a later visit to /world does not show it. */
export const OPENING_NOTICE_TEXT = "お知らせが1件届いています";
export const OPENING_NOTICE_IMAGE_MS = 3000;
export const OPENING_NOTICE_IMAGE = {
  webp: "/opening-notice-20261028.webp",
  jpeg: "/opening-notice-20261028.jpg",
  width: 724,
  height: 2172,
} as const;

let armed = false;

/** The opening's ENTER THE WORLD: the next arrival on /world shows the notice. */
export function armOpeningNotice() {
  armed = true;
}

/** The opening stayed (a cancelled or failed handoff): nothing to show. */
export function disarmOpeningNotice() {
  armed = false;
}

export function isOpeningNoticeArmed() {
  return armed;
}

/** Takes the notice for /world. True once per opening pass. */
export function takeOpeningNotice(pathname: string) {
  if (!armed || pathname !== "/world") return false;
  armed = false;
  return true;
}
