import type { CSSProperties } from "react";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import { FAR_FROM_SAGA_STAGE_ORDER, type FarFromStageKey } from "@/lib/far-from-saga-artwork";
import { REXONANCE_STAGE_DURATION_MS } from "@/lib/rexonance-calls";

/* FAR FROM SAGA — the form switch (owner, 2026-10-23: 「これらの切り替えも
   レクソナンスの様な切り替え効果が出る様にして。スクロールも同様に。」).

   The Rexonance page's #stages switch, in FAR FROM's cyber palette:

   - the card (FarFromFormCall): a short full-screen cut on a selection from
     the rail (tap, swipe release, keys) or the comparison drawer. Three
     opaque blades from the first frame, the record's call and the chosen
     form's name, then the blades open as an aperture onto the new form. It
     runs on the Rexonance page's own rest guard (planStageCall): a card is
     retargeted while it shows, and starts stay ≥ 950 ms apart, so any
     tapping cadence keeps to one flash a second;
   - the panel's entrance under it (FarFromSwitchFx and the sheet): the new
     form rises from its floor as the aperture opens, three rings leave its
     core, one refraction band and a hex-cell sweep cross it, the copy
     resolves; a selection without a card changes quietly;
   - in step with a swipe (the tuning band, driven by the page from the
     rail's own contact state): while a finger or pointer drags the lens,
     the figure shows the form under it — a band in that form's light at
     the lens's place along the rail, and its name — and the release plays
     the card as a tap does.

   Decorative only (aria-hidden): the tablist and the panel stay the record.
   Reduced motion, forced colours, economy and Save-Data never mount the
   card, and the sheet keeps the panel still there. */

export const FAR_FROM_STAGE_CALL_MS = REXONANCE_STAGE_DURATION_MS;

/** The record's call the card shows (FAR FROM SAGA's last call). */
const CARD_CALL = FAR_FROM_SAGA.calls[FAR_FROM_SAGA.calls.length - 1];
const pad = (value: number) => String(value).padStart(2, "0");

export function FarFromFormCall({ stage }: { stage: FarFromStageKey }) {
  const index = FAR_FROM_SAGA_STAGE_ORDER.indexOf(stage) + 1;
  const form = FAR_FROM_SAGA.stages[stage];
  return (
    <div
      className="ffs-form-call"
      data-stage={stage}
      aria-hidden="true"
      style={
        {
          "--ffs-call-accent": form.accent,
          "--ffs-call-duration": `${FAR_FROM_STAGE_CALL_MS}ms`,
        } as CSSProperties
      }
    >
      {/* Three blades: the dark ground opens as an aperture (textless). */}
      <div className="ffs-call-ground">
        <i />
        <i />
        <i />
      </div>
      <div className="ffs-call-frame">
        <i className="is-h" />
        <i className="is-v" />
        <i className="is-brackets" />
      </div>
      <div className="ffs-call-signature">
        <i />
        <i />
      </div>
      <p className="ffs-call-caption">
        <span lang="en">FAR FROM SAGA</span>
        <span lang="en">P16 / FORM SEQUENCE</span>
      </p>
      <div className="ffs-call-words">
        <p className="ffs-call-final" lang="en">
          {CARD_CALL}
        </p>
        <p className="ffs-call-form" key={stage}>
          <small lang="en">
            FORM {pad(index)} / {pad(FAR_FROM_SAGA_STAGE_ORDER.length)}
          </small>
          <b>{form.label}</b>
        </p>
      </div>
      <div className="ffs-call-meter">
        {FAR_FROM_SAGA_STAGE_ORDER.map((key, at) => (
          <i key={key} data-reached={at < index || undefined} />
        ))}
      </div>
    </div>
  );
}

// The hex-cell sweep: twelve strips across the art, alternately from the
// left and the right (the Rexonance panel's nanite mesh, in hex cells).
const MESH = Array.from({ length: 12 }, (_, index) => (
  <i key={index} style={{ ["--ffs-d" as string]: index }} />
));

/** The new form's arrival over the stage picture (decorative). */
export function FarFromSwitchFx() {
  return (
    <>
      <i className="ffs-switch-rings" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </i>
      <i className="ffs-switch-mesh" aria-hidden="true">
        {MESH}
      </i>
      {/* In step with a swipe: the page writes the previewed form here. */}
      <i className="ffs-stage-tune" aria-hidden="true">
        <b />
      </i>
    </>
  );
}
