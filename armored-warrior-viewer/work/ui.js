// UI v2 (a) — interface-only behaviour. Never touches the canvas, WebGL or the viewer's internals.

// iOS Safari only applies :active to elements when the document has a touch listener.
// A passive no-op listener turns on the pressed feedback in viewer.css; it never blocks gestures.
document.addEventListener('touchstart', () => {}, { passive: true });

// First-visit gesture hint: once the 3D is ready, the caption band shows the hint (#hint) instead of
// the view name, then fades back after 7 s, at the first drag / pinch / scroll / key on the stage, or
// when any button is used.
// Shown once per browser (localStorage; if storage is unavailable it simply shows on every visit).
// #hint always keeps its text: the canvas is aria-describedby="hint".
(() => {
  const root = document.documentElement;
  const stage = document.querySelector('#stage');
  const KEY = 'sokou-viewer-hint-seen';
  try { if (localStorage.getItem(KEY) === '1' && !/[?&]hint=1\b/.test(location.search)) return; } catch { /* show it */ }

  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    root.classList.remove('hint-on');
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    for (const type of ['pointerdown', 'wheel', 'keydown']) stage.removeEventListener(type, hide);
    document.removeEventListener('click', onButton, true);
  };
  // Using any control also retires the hint: the visitor is already finding their way.
  const onButton = (event) => { if (event.target.closest('button')) hide(); };
  const show = () => {
    root.classList.add('hint-on');
    timer = setTimeout(hide, 7000);
    for (const type of ['pointerdown', 'wheel', 'keydown']) stage.addEventListener(type, hide, { passive: true });
    document.addEventListener('click', onButton, true);
  };

  if (root.dataset.viewer === 'ready') { show(); return; }
  const watch = new MutationObserver(() => {
    if (root.dataset.viewer === 'ready') { watch.disconnect(); show(); }
  });
  watch.observe(root, { attributes: true, attributeFilter: ['data-viewer'] });
})();

// Caption band: shows the pressed view chip's label (labels belong to the current model and the
// viewer may rewrite them), or 「自由視点」 when the camera was moved by hand and no chip is pressed.
// The caption is aria-hidden: the pressed chip already carries the state for assistive tech.
(() => {
  const caption = document.querySelector('.caption');
  const views = document.querySelector('.views');
  if (!caption || !views) return;
  const update = () => {
    const chip = views.querySelector('[data-view][aria-pressed="true"]:not([hidden])');
    const text = chip ? (chip.querySelector('.tile-name')?.textContent || '').trim() : '自由視点';
    if (caption.textContent !== text) caption.textContent = text;
  };
  new MutationObserver(update).observe(views, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed', 'hidden'],
  });
  update();
})();
