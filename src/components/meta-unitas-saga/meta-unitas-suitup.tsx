import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { LiquidLens } from "@/components/world/liquid-rail";
import { initRail } from "@/lib/liquid/boot.js";
import {
  META_UNITAS_CALL_LINES,
  META_UNITAS_FORMS,
  mountMetaUnitasAssembly,
  type MetaUnitasAssemblyForm,
} from "@/lib/meta-unitas-assembly";
import { META_UNITAS_SUIT, META_UNITAS_SUIT_SIZE } from "@/lib/meta-unitas-suit";
import { META_UNITAS_BEATS } from "@/lib/meta-unitas-timeline";
import { META_UNITAS_SAGA } from "./meta-unitas-data";
import { CallLine } from "./meta-unitas-parts";

/* META UNITAS SAGA — #suitup, the scroll suit-up (2026-10-23).

   A tall runway with a sticky frame: the canvas (the partition engine,
   src/lib/meta-unitas-assembly.ts → meta-unitas-assembly-engine.ts), the
   undersuit standing in until it is ready, the five calls lighting in turn
   and the form's name. The scroll builds ミドル; the selector right after the
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

/** Where "watch it" lands: just before the seal (ミドル) or ウルトラ's turn. */
const REPLAY_AT: Record<MetaUnitasAssemblyForm, number> = {
  middle: META_UNITAS_BEATS.bits[0] - 0.02,
  ultra: META_UNITAS_BEATS.ultra[0] - 0.03,
};

function watchEnding(runway: HTMLElement | null, form: MetaUnitasAssemblyForm) {
  if (!runway) return;
  const frame = runway.querySelector<HTMLElement>(".mus-frame");
  const smooth =
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.worldEffects !== "economy";
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  const travel = frame ? runway.offsetHeight - frame.offsetHeight : 0;
  if (!frame || travel <= 0) {
    runway.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const top = runway.getBoundingClientRect().top + window.scrollY + travel * REPLAY_AT[form];
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
      setLoad(runway.dataset.musLoad || "waiting");
      setComplete(runway.dataset.musComplete === "true");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(runway, {
      attributes: true,
      attributeFilter: ["data-mus-load", "data-mus-complete"],
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
            onClick={() =>
              runwayRef.current?.dispatchEvent(new Event("meta-unitas:assembly-retry"))
            }
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
      <div
        ref={runwayRef}
        id="meta-unitas-runway"
        className="mus-runway"
        aria-hidden="true"
        data-form={stage}
        style={{
          ["--mus-aspect" as string]: `${META_UNITAS_SUIT_SIZE.width} / ${META_UNITAS_SUIT_SIZE.height}`,
        }}
      >
        <div className="mus-frame">
          <i className="mus-frame-ground" />
          <i className="mus-frame-orbit is-a" />
          <i className="mus-frame-orbit is-b" />
          {/* The still tiers' picture: the chosen form, finished. */}
          <img
            className="mus-still"
            src={META_UNITAS_SUIT[stage].figure}
            alt=""
            width={META_UNITAS_SUIT_SIZE.width}
            height={META_UNITAS_SUIT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          {/* While the scene prepares, the wearer stands in. */}
          <img
            className="mus-under"
            src={META_UNITAS_SUIT.undersuit}
            alt=""
            width={META_UNITAS_SUIT_SIZE.width}
            height={META_UNITAS_SUIT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <canvas className="mus-canvas" width={0} height={0} />
          <ol className="mus-call-lines">
            {META_UNITAS_CALL_LINES.map((units, index) => (
              <li key={index} className="mus-call-line" data-chant={units.length > 1 || undefined}>
                <CallLine units={units} />
              </li>
            ))}
          </ol>
          <p className="mus-stamp">
            <b className="is-middle">{FORM_LABELS.middle}</b>
            <b className="is-ultra">{FORM_LABELS.ultra}</b>
          </p>
          <i className="mus-rail">
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
        <div
          ref={tabsRef}
          className="rxs-stage-tabs liquid-swipe-tabs mus-tabs"
          role="tablist"
          aria-label="変身後の形態"
          data-liquid-glass="true"
          data-stage={stage}
        >
          <LiquidLens />
          {META_UNITAS_FORMS.map((key) => (
            <button
              key={key}
              id={`mus-ending-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={stage === key}
              aria-controls="mus-ending-panel"
              tabIndex={stage === key ? 0 : -1}
              className={stage === key ? "is-active" : ""}
              style={{ ["--liquid-accent" as string]: FORM_ACCENTS[key] }}
              onClick={() => onChoose(key)}
            >
              <span>{FORM_LABELS[key]}</span>
            </button>
          ))}
        </div>
        <div
          id="mus-ending-panel"
          className="mus-ending-panel"
          role="tabpanel"
          aria-labelledby={`mus-ending-tab-${stage}`}
        >
          <ol className="mus-route" aria-hidden="true">
            {META_UNITAS_FORMS.map((key, index) => (
              <li key={key} data-reached={index <= META_UNITAS_FORMS.indexOf(stage) || undefined}>
                <span>{FORM_LABELS[key]}</span>
              </li>
            ))}
          </ol>
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
