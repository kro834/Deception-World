/* FAR FROM SAGA — the page's Japanese display face (owner, 2026-10-23:
   「ファーフロムのページのフォントは未来風なサイバー風なものにして」).

   M PLUS 1, the geometric gothic: ExtraBold for every Japanese title and
   Medium for the Japanese inside kickers and labels. The Latin, the
   figures and the kickers use faces the site already loads (Michroma,
   Oxanium) or the page's local Saira ("Rexonance Forge"); reading text
   keeps the system gothic, so the face is only ever asked for the glyphs
   of the page's display text.

   Delivery: Google Fonts' text= subsetting, as the site's HUD face does,
   with display=swap. After paint (an idle callback once the page has
   mounted) the page reads which of its own characters are set in M PLUS 1
   (the computed font stack, so the CSS stays the one source of truth) and
   asks for exactly those, one request a weight: tens of kilobytes rather
   than the unicode-range slices' hundreds. When a view adds characters
   (a console view, the comparison drawer), one refreshed subset replaces
   the old once it has loaded: the subsets are FontFace objects that join
   document.fonts loaded (polish sweep, 2026-10-23), so no refresh shows
   the fallback in between. Never on the first paint's path; until the
   face arrives, and on Save-Data or 2G, the Japanese draws in the system
   gothic behind it in the stack (styles-far-from-saga.css
   --fft-jp-display). */

export const FAR_FROM_DISPLAY_FAMILY = "M PLUS 1";
/** Medium (labels) and ExtraBold (titles): the two weights the page asks for. */
export const FAR_FROM_DISPLAY_WEIGHTS = [500, 800] as const;
type Weight = (typeof FAR_FROM_DISPLAY_WEIGHTS)[number];

/** Past this many characters the page asks for the face's unicode-range
 * slices instead (a text= URL must stay short). */
const MAX_GLYPHS = 900;
/** Subset refreshes (view changes that brought new glyphs), at most. */
const MAX_REFRESHES = 8;

export function farFromDisplayFontsUrl(weight: Weight, text?: string): string {
  const base = `https://fonts.googleapis.com/css2?family=M+PLUS+1:wght@${weight}&display=swap`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}

/** The characters (beyond ASCII) set in the display face under root, by
 * the weight the browser will match them to. */
export function collectFarFromGlyphs(root: Element): Record<Weight, Set<string>> {
  const glyphs: Record<Weight, Set<string>> = { 500: new Set(), 800: new Set() };
  const view = root.ownerDocument.defaultView;
  if (!view) return glyphs;
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let parent: Element | null = null;
  let bucket: Set<string> | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (!text || !/[^\t-~]/.test(text)) continue;
    if (node.parentElement !== parent) {
      parent = node.parentElement;
      const style = parent ? view.getComputedStyle(parent) : null;
      bucket = style?.fontFamily.includes(FAR_FROM_DISPLAY_FAMILY)
        ? glyphs[Number(style.fontWeight) >= 600 ? 800 : 500]
        : null;
    }
    if (!bucket) continue;
    for (const char of text) if (char > "\u007f" && char.trim()) bucket.add(char);
  }
  return glyphs;
}

type SavingConnection = { saveData?: boolean; effectiveType?: string };
type Applied = { glyphs: Set<string>; faces: FontFace[]; link: HTMLLinkElement | null };
const applied = new Map<Weight, Applied>();

/** The faces a Google Fonts stylesheet declares: each @font-face's first
 * src url and its unicode-range (a text= subset is one face a weight). */
export function parseFontFaces(css: string): { url: string; unicodeRange?: string }[] {
  const faces: { url: string; unicodeRange?: string }[] = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const url = /src:[^;]*?url\(["']?([^"')]+)["']?\)/.exec(block)?.[1];
    if (!url) continue;
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(block)?.[1].trim();
    faces.push(unicodeRange ? { url, unicodeRange } : { url });
  }
  return faces;
}

/** Retires the subset a successor has replaced (its faces, or its link). */
function retire(doc: Document, previous: Applied | undefined) {
  if (!previous) return;
  for (const face of previous.faces) doc.fonts.delete(face);
  previous.link?.remove();
}

/** Applies a subset holding these glyphs (and every earlier one); false
 * when the current subset already holds them all.
 *
 * A text= subset is fetched as a stylesheet's text (the CSS endpoint
 * allows cross-origin reads) and set as FontFace objects that join
 * document.fonts only once they have loaded, so a refresh never re-sets
 * the page's titles in the fallback gothic while the successor is on its
 * way (a <link> re-declared the face: the hero grew and shrank by a line
 * each time, a layout shift of 0.1). The first subset shows the fallback
 * until it lands, as display=swap did. The whole family (past MAX_GLYPHS)
 * stays a <link>, its unicode-range slices fetched as the text needs
 * them; so does a subset whose stylesheet could not be read. */
function apply(doc: Document, weight: Weight, glyphs: Set<string>): boolean {
  const current = applied.get(weight);
  if (current && [...glyphs].every((char) => current.glyphs.has(char))) return false;
  const union = new Set([...(current?.glyphs ?? []), ...glyphs]);
  const text = [...union].sort().join("");
  const subset = union.size <= MAX_GLYPHS && typeof FontFace === "function";
  const href = farFromDisplayFontsUrl(weight, subset ? text : undefined);
  const next: Applied = { glyphs: union, faces: [], link: null };
  applied.set(weight, next);
  const link = () => {
    const element = doc.createElement("link");
    element.rel = "stylesheet";
    element.href = href;
    element.dataset.farFromFonts = String(weight);
    // The previous subset stays until its successor has loaded: no flash.
    element.onload = () => retire(doc, current);
    doc.head.append(element);
    next.link = element;
  };
  if (!subset) {
    link();
    return true;
  }
  fetch(href, { mode: "cors" })
    .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
    .then((css) => {
      const faces = parseFontFaces(css).map(
        ({ url, unicodeRange }) =>
          new FontFace(FAR_FROM_DISPLAY_FAMILY, `url(${url}) format("woff2")`, {
            weight: String(weight),
            display: "swap",
            ...(unicodeRange ? { unicodeRange } : {}),
          }),
      );
      if (!faces.length) return Promise.reject(new Error("no faces"));
      return Promise.all(faces.map((face) => face.load())).then(() => {
        for (const face of faces) doc.fonts.add(face);
        next.faces = faces;
        retire(doc, current);
      });
    })
    .catch(() => {
      // The stylesheet could not be read or loaded: the browser's own way.
      if (applied.get(weight) === next) link();
    });
  return true;
}

/** Collects the page's display glyphs after paint and applies their
 * subsets; follows view changes. `seed` is text the page will set in the
 * face later (the forms' names a switch writes into labels): its glyphs
 * ride along in both weights' first subsets, so a switch never fetches a
 * refreshed subset that re-sets every label once it arrives. Returns the
 * disposer (the applied faces stay, so a return visit reuses them). */
export function mountFarFromFonts(root: HTMLElement | null, seed = ""): () => void {
  const view = root?.ownerDocument.defaultView;
  if (!root || !view) return () => {};
  const connection = (view.navigator as Navigator & { connection?: SavingConnection }).connection;
  if (
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  )
    return () => {};
  const doc = root.ownerDocument;
  let refreshes = 0;
  let timer = 0;
  let idle = 0;
  // The first pass reads the whole page; later passes only what changed.
  let pending = new Set<Element>([root]);
  const run = () => {
    idle = 0;
    const scopes = pending;
    pending = new Set();
    const glyphs: Record<Weight, Set<string>> = { 500: new Set(), 800: new Set() };
    for (const scope of scopes) {
      if (!scope.isConnected) continue;
      const found = collectFarFromGlyphs(scope);
      for (const weight of FAR_FROM_DISPLAY_WEIGHTS)
        for (const char of found[weight]) glyphs[weight].add(char);
    }
    if (scopes.has(root))
      for (const char of seed)
        if (char > "\u007f" && char.trim())
          for (const weight of FAR_FROM_DISPLAY_WEIGHTS) glyphs[weight].add(char);
    for (const weight of FAR_FROM_DISPLAY_WEIGHTS) {
      if (!glyphs[weight].size || refreshes >= MAX_REFRESHES) continue;
      // A refresh that finds new glyphs counts against the cap; the first pass does not.
      if (apply(doc, weight, glyphs[weight]) && !scopes.has(root)) refreshes += 1;
    }
  };
  const schedule = () => {
    if (idle) return;
    idle =
      typeof view.requestIdleCallback === "function"
        ? view.requestIdleCallback(run, { timeout: 1200 })
        : view.setTimeout(run, 200);
  };
  schedule();
  // Only new non-ASCII text can need a glyph (the HUD's ticking figures never do).
  const nonAscii = (node: Node | null) => !!node && /[^\t-~]/.test(node.textContent ?? "");
  const observer = new view.MutationObserver((records) => {
    if (refreshes >= MAX_REFRESHES) return;
    for (const record of records) {
      const nodes = record.type === "characterData" ? [record.target] : [...record.addedNodes];
      for (const node of nodes) {
        if (!nonAscii(node)) continue;
        const scope = node.nodeType === 1 ? (node as Element) : node.parentElement;
        if (scope) pending.add(scope);
      }
    }
    if (!pending.size) return;
    view.clearTimeout(timer);
    timer = view.setTimeout(schedule, 500);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    view.clearTimeout(timer);
    if (idle && typeof view.cancelIdleCallback === "function") view.cancelIdleCallback(idle);
    else if (idle) view.clearTimeout(idle);
  };
}
