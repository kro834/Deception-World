import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { FormSlider } from "@/components/special/form-slider";
import { initRail } from "@/lib/liquid/boot.js";
import {
  META_UNITAS_CALL_LINES,
  META_UNITAS_FORMS,
  mountMetaUnitasAssembly,
  type MetaUnitasAssemblyForm,
} from "@/lib/meta-unitas-assembly";
import {
  META_UNITAS_RX_DRIVER_STANDIN,
  META_UNITAS_RX_FIGURE,
  META_UNITAS_RX_FORMS,
  META_UNITAS_RX_SIZE,
  META_UNITAS_RX_UNDERSUIT,
} from "@/lib/meta-unitas-rx-suit";
import { AssemblyMovie } from "@/components/rexonance-saga/rexonance-assembly-movie";
import { META_UNITAS_SAGA } from "./meta-unitas-data";

/* META UNITAS SAGA — #suitup, the scroll suit-up (2026-10-23).

   The Rexonance runway (owner: 「メタ・ウニタスはレクソナンスと同じ装着です」):
   the same frame, layers and HUD the engine reads by their rzn- classes
   (src/lib/meta-unitas-assembly.ts → meta-unitas-rx-engine.ts, the Rexonance
   scroll engine with Meta Unitas' SAM-cut suit), the undersuit standing in
   until it is ready, the five calls lighting in turn and the form's name. The scroll builds ミドル; the selector right after the
   runway chooses what the end of it becomes (ミドル, or ウルトラ partitioning
   it again), as the Rexonance and Far From pages do. Without motion the
   runway is one screen: the chosen form finished, every call lit. */

export const FORM_LABELS: Record<MetaUnitasAssemblyForm, string> = {
  middle: "ミドル",
  ultra: "ウルトラ",
};
export const FORM_ACCENTS: Record<MetaUnitasAssemblyForm, string> = {
  middle: "#ff9a4a",
  ultra: "#e9d8ff",
};

/** Where "watch it" lands: just before the seal (the engine's beats), so the
 * lock, the ignition and the chosen form's change play next. */
const REPLAY_AT: Record<MetaUnitasAssemblyForm, number> = { middle: 0.835, ultra: 0.835 };
/** The still tiers' picture: the chosen form, finished. */
const STILLS: Record<MetaUnitasAssemblyForm, string> = {
  middle: META_UNITAS_RX_FIGURE,
  ultra: META_UNITAS_RX_FORMS.ultra,
};
/** The engine's data-form: ミドル is its "standard" (the base figure). */
const runwayForm = (form: MetaUnitasAssemblyForm) => (form === "middle" ? "standard" : form);

function watchEnding(runway: HTMLElement | null, form: MetaUnitasAssemblyForm) {
  if (!runway) return;
  const frame = runway.querySelector<HTMLElement>(".rzn-frame");
  const smooth =
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.worldEffects !== "economy";
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  const travel = frame ? runway.offsetHeight - frame.offsetHeight : 0;
  if (!frame || travel <= 0) {
    runway.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const pinTop = Number.parseFloat(window.getComputedStyle(frame).top) || 0;
  const top =
    runway.getBoundingClientRect().top + window.scrollY - pinTop + travel * REPLAY_AT[form];
  window.scrollTo({ top: Math.max(0, Math.round(top)), behavior });
}

/** What assistive technology hears of the runway (it is a picture). */
function SuitUpStatus({ runwayRef }: { runwayRef: RefObject<HTMLDivElement | null> }) {
  const [load, setLoad] = useState("waiting");
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    const update = () => {
      setLoad(runway.dataset.rznLoad || "waiting");
      setComplete(runway.dataset.rznFormComplete === "true");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(runway, {
      attributes: true,
      attributeFilter: ["data-rzn-load", "data-rzn-form-complete"],
    });
    return () => observer.disconnect();
  }, [runwayRef]);
  return (
    <>
      <div className="visually-hidden">
        <ol aria-label="変身音声">
          {META_UNITAS_SAGA.calls.map((call, index) => (
            <li key={`${index}-${call}`}>{call}</li>
          ))}
        </ol>
        <p role="status" aria-live="polite" aria-atomic="true">
          {complete ? "装着完了" : ""}
        </p>
      </div>
      {load === "error" ? (
        <div className="mus-suitup-error" role="alert">
          <p>変身演出の素材を読み込めませんでした。</p>
          <button
            type="button"
            onClick={() => runwayRef.current?.dispatchEvent(new Event("rexonance:assembly-retry"))}
          >
            再読み込み
          </button>
        </div>
      ) : null}
    </>
  );
}

export const MetaUnitasSuitUp = memo(function MetaUnitasSuitUp({
  stage,
  onChoose,
}: {
  stage: MetaUnitasAssemblyForm;
  onChoose: (stage: MetaUnitasAssemblyForm) => void;
}) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mountMetaUnitasAssembly(runwayRef.current), []);
  useEffect(() => {
    const rail = tabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? META_UNITAS_FORMS[index] : undefined;
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
  }, [stage]);

  return (
    <section id="suitup" className="mus-chapter mus-suitup" aria-labelledby="mus-suitup-title">
      <header className="mus-head rxs-reveal">
        <h2 id="mus-suitup-title">変身</h2>
      </header>
      <SuitUpStatus runwayRef={runwayRef} />
      {/* The auto transformation movie (the Rexonance and Far From pages'
          control): it drives the page's scroll, so the engine draws the
          movie's frames as it draws a scroll's, ending on the chosen form. */}
      <AssemblyMovie runwayRef={runwayRef} site="meta-unitas" />
      <div
        ref={runwayRef}
        id="meta-unitas-runway"
        className="mus-runway rzn-suitup"
        aria-hidden="true"
        data-form={runwayForm(stage)}
        style={{
          ["--rzn-aspect" as string]: `${META_UNITAS_RX_SIZE.width} / ${META_UNITAS_RX_SIZE.height}`,
        }}
      >
        <div className="rzn-frame">
          <i className="rzn-light" />
          <i className="rzn-depth" />
          <i className="rzn-aura" />
          <i className="rzn-crown" />
          <i className="rzn-floor" />
          <img
            className="rzn-still"
            src={STILLS[stage]}
            alt=""
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <img
            className="rzn-under"
            src={META_UNITAS_RX_UNDERSUIT}
            alt=""
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <img
            className="rzn-driver-standin"
            src={META_UNITAS_RX_DRIVER_STANDIN}
            alt=""
            width={META_UNITAS_RX_SIZE.width}
            height={META_UNITAS_RX_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <canvas className="rzn-canvas" width={0} height={0} />
          {/* The calls, lit on the engine's beats. The engine's own read-outs
              (phase, percent, parts) are kept for it and never shown. */}
          <div className="rzn-call">
            <p className="rzn-phase" hidden />
            <ol className="rzn-lines">
              {META_UNITAS_CALL_LINES.map((units, index) => (
                <li key={index} className="rzn-line" data-chant={units.length > 1 || undefined}>
                  {units.map((unit, unitIndex) => (
                    <span key={`${unit}-${unitIndex}`} className="rzn-chip">
                      {unitIndex === 0 ? <span className="mus-bracket">【</span> : null}
                      {unit}
                      {unitIndex === units.length - 1 ? (
                        <span className="mus-bracket">】</span>
                      ) : null}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </div>
          <div className="rzn-hud">
            <p className="rzn-readout" hidden>
              <b className="rzn-percent">100</b>
            </p>
            <p className="rzn-stamp">
              <b>{FORM_LABELS[stage]}</b>
            </p>
          </div>
          <i className="rzn-rail">
            <i />
          </i>
        </div>
      </div>
      {/* The selector, right after the runway: what the scroll ends on. */}
      <div
        className="mus-ending"
        data-stage={stage}
        style={{ ["--mus-accent" as string]: FORM_ACCENTS[stage] }}
      >
        <FormSlider
          ref={tabsRef}
          className="mus-tabs"
          items={META_UNITAS_FORMS.map((key) => ({
            key,
            label: FORM_LABELS[key],
            accent: FORM_ACCENTS[key],
          }))}
          value={stage}
          onSelect={onChoose}
          idPrefix="mus-ending-tab"
          panelId="mus-ending-panel"
          ariaLabel="変身後の形態"
        />
        <div
          id="mus-ending-panel"
          className="mus-ending-panel"
          role="tabpanel"
          aria-labelledby={`mus-ending-tab-${stage}`}
        >
          <button
            type="button"
            className="mus-watch"
            onClick={() => watchEnding(runwayRef.current, stage)}
          >
            {FORM_LABELS[stage]}への変身を見る
          </button>
        </div>
      </div>
    </section>
  );
});
