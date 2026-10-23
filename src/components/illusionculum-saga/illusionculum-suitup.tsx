import { memo, useEffect, useRef } from "react";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { initRail } from "@/lib/liquid/boot.js";
import {
  ILLUSIONCULUM_CUTOUT_SIZE,
  ILLUSIONCULUM_FORM_ORDER,
  illusionculumCutout,
  type IllusionculumFormKey,
} from "@/lib/illusionculum-saga-artwork";
import { ILLUSIONCULUM_FORMS, ILLUSIONCULUM_SAGA } from "./illusionculum-data";

/* ILLUSIONCULUM SAGA — #suitup, the scroll suit-up.

   The runway with the form selector right after it, as on /far-from-saga
   and /rexonance-saga: the selector picks the form the scroll ends on (the
   page's one form state, shared with #forms). */

export const IllusionculumSuitUp = memo(function IllusionculumSuitUp({
  form,
  onChoose,
}: {
  form: IllusionculumFormKey;
  onChoose: (form: IllusionculumFormKey) => void;
}) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rail = tabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? ILLUSIONCULUM_FORM_ORDER[index] : undefined;
      if (next) onChoose(next);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, [onChoose]);
  useEffect(() => {
    tabsRef.current?.dispatchEvent(new Event("liquidrelayout"));
  }, [form]);
  const reached = ILLUSIONCULUM_FORM_ORDER.indexOf(form);
  const chosen = ILLUSIONCULUM_FORMS[form];

  return (
    <section
      id="suitup"
      className="rxs-section ics-chapter ics-suitup"
      aria-labelledby="ics-suitup-title"
    >
      <header className="rxs-section-heading ics-heading rxs-reveal">
        <b className="ics-numeral" aria-hidden="true">
          02
        </b>
        <h2 id="ics-suitup-title" className="ics-sr">
          変身
        </h2>
      </header>
      <div
        ref={runwayRef}
        className="ics-runway rzn-suitup"
        aria-hidden="true"
        id="illusionculum-assembly-runway"
        data-form={form}
      >
        <div className="rzn-frame">
          <img
            className="rzn-still"
            src={illusionculumCutout(form, 960)}
            alt=""
            width={ILLUSIONCULUM_CUTOUT_SIZE.width}
            height={ILLUSIONCULUM_CUTOUT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <div className="rzn-call">
            <ol className="rzn-lines">
              {ILLUSIONCULUM_SAGA.calls.map((call) => (
                <li key={call} className="rzn-line">
                  <span className="rzn-chip">{call}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div
        className="rxs-stage-switcher ics-ending"
        data-stage={form}
        style={{ ["--ics-accent" as string]: chosen.accent }}
      >
        <h3 id="ics-ending-title" className="ics-sr">
          変身後の形態
        </h3>
        <div
          ref={tabsRef}
          className="rxs-stage-tabs liquid-swipe-tabs ics-form-tabs ics-ending-tabs"
          role="tablist"
          aria-labelledby="ics-ending-title"
          data-liquid-glass="true"
          data-stage={form}
        >
          <LiquidLens />
          {ILLUSIONCULUM_FORM_ORDER.map((key) => (
            <button
              key={key}
              id={`ics-ending-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={form === key}
              aria-controls="ics-ending-panel"
              tabIndex={form === key ? 0 : -1}
              className={form === key ? "is-active" : ""}
              data-form={key}
              style={{ ["--liquid-accent" as string]: ILLUSIONCULUM_FORMS[key].accent }}
              onClick={() => onChoose(key)}
            >
              <span>
                <DisplayName value={ILLUSIONCULUM_FORMS[key].label} />
              </span>
            </button>
          ))}
        </div>
        <div
          id="ics-ending-panel"
          className="ics-ending-panel"
          role="tabpanel"
          aria-labelledby={`ics-ending-tab-${form}`}
        >
          <ol className="ics-ending-route" aria-label="移行の順序">
            {ILLUSIONCULUM_FORM_ORDER.map((key, index) => (
              <li
                key={key}
                data-reached={index <= reached || undefined}
                data-current={index === reached || undefined}
                style={{ ["--ics-node" as string]: ILLUSIONCULUM_FORMS[key].accent }}
              >
                <span>
                  <DisplayName value={ILLUSIONCULUM_FORMS[key].label} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
});
