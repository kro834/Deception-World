/* Archive state bridge. The /form-archive page keeps the reader's form and
   the compared pair in its own URL (?form=…&compare=a.b), so a shared link,
   a reload or Back opens the same record. The archive runs in a sandboxed
   frame that cannot read that URL, so the page passes the state in the
   frame's fragment (#form=…&compare=a.b).

   This deferred script runs after the document is parsed and before the
   archive controllers start on DOMContentLoaded. It hands the requested form
   to the form controller (html[data-archive-requested-form]) and checks the
   requested pair in the comparison, then reports each later choice to the
   page. Unknown ids are ignored: the archive opens on its defaults and the
   page drops them from its URL. Only the page's own frame is answered. */
(() => {
  "use strict";

  const STATE_MESSAGE = "deception-world:archive-state";
  const ID = /^[a-z0-9-]{1,40}$/;
  const REPORT_DELAY_MS = 220;
  const html = document.documentElement;
  const kind = html.dataset.archiveKind || "";

  let params;
  try {
    params = new URLSearchParams(window.location.hash.slice(1));
  } catch {
    params = new URLSearchParams();
  }
  const requestedForm = params.get("form") || "";
  const requestedPair = (params.get("compare") || "").split(".");

  if (ID.test(requestedForm)) html.dataset.archiveRequestedForm = requestedForm;

  const compare = document.querySelector('[id$="saga-form-compare-ios"]');
  const prefix = compare ? compare.id.slice(0, -"saga-form-compare-ios".length) : "";
  const selectFor = (side) => document.getElementById(`${prefix}saga-compare-select-${side}`);
  const options = (select) =>
    select instanceof HTMLSelectElement ? [...select.options].map((option) => option.value) : [];

  const sides = ["a", "b"];
  let restoring = false;

  // Check the radio (the comparison's own state, read by the Saga controller
  // when it starts) and the native select (followed by the Realm controller,
  // which has already started, through its change event).
  const applyPair = (pair) => {
    if (!compare || pair.length !== 2) return false;
    const controls = sides.map(selectFor);
    if (!controls.every((select) => select instanceof HTMLSelectElement)) return false;
    if (!pair.every((id, index) => ID.test(id) && options(controls[index]).includes(id))) {
      return false;
    }
    restoring = true;
    try {
      pair.forEach((id, index) => {
        const side = sides[index];
        const radio = document.getElementById(`${prefix}saga-compare-${side}-${id}`);
        if (radio instanceof HTMLInputElement) radio.checked = true;
        const select = controls[index];
        select.value = id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } finally {
      restoring = false;
    }
    return true;
  };

  const restoredPair = applyPair(requestedPair);

  if (window.parent === window) return;

  // The pair the markup opens with (Multi / Last Multi, Stella / Royal).
  const defaultPair = () =>
    sides
      .map((side) => {
        const select = selectFor(side);
        if (!(select instanceof HTMLSelectElement)) return "";
        return ([...select.options].find((option) => option.defaultSelected) ?? select.options[0])
          ?.value;
      })
      .join(".");
  const currentPair = () => {
    const pair = sides.map((side) => selectFor(side)?.value || "");
    return pair.every((id) => ID.test(id)) ? pair.join(".") : "";
  };

  const state = { form: null, compare: null };
  let timer = 0;
  const post = () => {
    timer = 0;
    window.parent.postMessage({ type: STATE_MESSAGE, kind, ...state }, "*");
  };
  const schedule = (delay = REPORT_DELAY_MS) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(post, delay);
  };

  document.addEventListener("archive:formchange", (event) => {
    const detail = event.detail || {};
    if (!ID.test(detail.formId || "")) return;
    const form = detail.isDefault ? null : detail.formId;
    if (form === state.form) return;
    state.form = form;
    schedule();
  });

  let pairFrame = 0;
  const readPair = () => {
    if (restoring || pairFrame) return;
    // Both controllers commit a choice within the frame after its event.
    pairFrame = window.requestAnimationFrame(() => {
      pairFrame = window.requestAnimationFrame(() => {
        pairFrame = 0;
        const pair = currentPair();
        const next = !pair || pair === defaultPair() ? null : pair;
        if (next === state.compare) return;
        state.compare = next;
        schedule();
      });
    });
  };

  // Once the controllers have opened the archive, say what it really shows.
  // An unknown or default request leaves the page URL with nothing to keep.
  const settle = () => {
    // The first chip is the archive's default form (Multi, Stella).
    const chips = [...document.querySelectorAll(".form-chip[data-form-id]")];
    const selected = chips.find((chip) => chip.getAttribute("aria-checked") === "true");
    state.form = selected && selected !== chips[0] ? selected.dataset.formId || null : null;
    const pair = currentPair();
    state.compare = restoredPair && pair && pair !== defaultPair() ? pair : null;
    const requested = { form: requestedForm || null, compare: params.get("compare") || null };
    if (requested.form !== state.form || requested.compare !== state.compare) schedule(0);
    if (compare) {
      for (const type of ["input", "change", "click"]) {
        compare.addEventListener(type, readPair, true);
      }
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(settle, 0), {
      once: true,
    });
  } else {
    window.setTimeout(settle, 0);
  }
})();
