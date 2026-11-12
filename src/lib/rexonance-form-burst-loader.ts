/* REXONANCE FORM BURST, on demand (see rexonance-form-burst.ts): the play's
   chunk — its shader, its particles, and through it the suit-up's cells and
   the fire's noise — is fetched only by Rexonance's own pages, and only
   once a form change may play in full motion: the 03 panel near the view,
   the scroll scene past its middle with MAX or ULTRA chosen, the lab with
   Rexonance on a form. Nothing of it is in any page's first load. */

type FormBurstStage = typeof import("./rexonance-form-burst-stage");

export type FormBurstKind = "max" | "ultra" | "release";

const FORMS = ["standard", "max", "ultra"];

/** The play between two forms (null: none — the same form, or a form this
 * change does not know: EXCELSIOR keeps the scene's own overwrite). ULTRA
 * plays from whichever form is on screen: it no longer runs through MAX. */
export function formBurstKind(from: string, to: string): FormBurstKind | null {
  if (from === to || !FORMS.includes(from) || !FORMS.includes(to)) return null;
  return to === "standard" ? "release" : (to as FormBurstKind);
}

/** Reduced motion, economy, no WebGL: the forms cross-fade over this. */
export const FORM_BURST_FADE_MS = 240;

/** Caches a successful import; a failed one may be asked for again. */
export function createFormBurstLoader(load: () => Promise<FormBurstStage>) {
  let stage: FormBurstStage | null = null;
  let pending: Promise<FormBurstStage | null> | null = null;
  return {
    /** The stage, if it has arrived. */
    get stage() {
      return stage;
    },
    load() {
      pending ??= Promise.resolve()
        .then(load)
        .then(
          (module) => (stage = module),
          () => {
            pending = null;
            return null;
          },
        );
      return pending;
    },
  };
}

export const formBurst = createFormBurstLoader(() => import("./rexonance-form-burst-stage"));

/** No play here: the reader asked for calm (the forms cross-fade). */
export const formBurstCalm = () =>
  Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ||
  globalThis.document?.documentElement.dataset.worldEffects === "economy";
