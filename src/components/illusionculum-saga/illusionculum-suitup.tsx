import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { withWordBreaks } from "@/lib/name-breaks";
import { DisplayName } from "@/components/name-text";
import { FormSlider } from "@/components/special/form-slider";
import { AssemblyMovie } from "@/components/rexonance-saga/rexonance-assembly-movie";
import { initRail } from "@/lib/liquid/boot.js";
import {
  ILLUSIONCULUM_FORM_ORDER,
  type IllusionculumFormKey,
} from "@/lib/illusionculum-saga-artwork";
import {
  ILLUSIONCULUM_SUIT_CALLS,
  illusionculumCallUnits,
  illusionculumRoute,
  mountIllusionculumAssembly,
} from "@/lib/illusionculum-assembly";
import {
  ILLUSIONCULUM_SUIT_DRIVER_STANDIN,
  ILLUSIONCULUM_SUIT_FIGURE,
  ILLUSIONCULUM_SUIT_FORMS,
  ILLUSIONCULUM_SUIT_SIZE,
  ILLUSIONCULUM_SUIT_UNDERSUIT,
} from "@/lib/illusionculum-suit";
import { ILLUSIONCULUM_FORMS, ILLUSIONCULUM_SAGA } from "./illusionculum-data";

/* ILLUSIONCULUM SAGA — #suitup, the scroll suit-up (2026-10-23).

   The Rexonance runway as /far-from-saga carries it (the same frame,
   layers and flags: the engine reads them by their rzn- classes), with this
   form's suit, call and stamp, styled by styles-illusionculum-suitup.css.
   src/lib/illusionculum-assembly.ts mounts the scene under the motion gate;
   without it the runway is one screen with the chosen form finished and
   every call lit. The armour is projected (src/lib/illusionculum-
   projection.ts): each plate's projections stand apart and close in on its
   real place.

   The selector right after the runway picks the form the scroll ends on
   (the page's one form state, shared with #forms): the standard form, the
   two リアクター・モア deployed from above the shoulders, ウルトラ, or ウルトラ
   with リアクター・モア. No helper text: the runway's own shape (a tall,
   pinned scene) and the call explain it; the status is for assistive tech. */

const STATUS: Record<string, string> = {
  waiting: "変身演出を準備しています。",
  loading: "装甲の素材を読み込んでいます。",
  preparing: "装甲の投影を準備しています。",
  ready: "スクロールで装着が進みます。",
  error: "素材を読み込めませんでした。",
  static: "完成した姿を表示しています。",
};
const COMPLETE = "装着完了。";

/** The still tiers' picture: the chosen form, finished (the same frame). */
const STILLS: Record<IllusionculumFormKey, string> = {
  standard: ILLUSIONCULUM_SUIT_FIGURE,
  ...ILLUSIONCULUM_SUIT_FORMS,
};

/** Where "watch the change" lands: just before the seal, so the lock, the
 * light and the chosen form's change play next (the engine's seal at .86). */
const REPLAY_AT = 0.835;

const LINES = ILLUSIONCULUM_SUIT_CALLS.map((call) => illusionculumCallUnits(call));

const isUltra = (key: IllusionculumFormKey) => key === "ultra" || key === "ultraMore";
/** The engine's end of the chain of forms (ASSEMBLY_BEATS.form[1]). */
const CHAIN_END = 0.975;

type IgnitionModule = typeof import("@/lib/illusionculum-form-ignition");
// The burn's chunk, fetched once the runway is live (a choice into ウルトラ
// must take the frame before the engine's next draw, never after a fetch).
let ignitionModule: IgnitionModule | null = null;
let ignitionLoad: Promise<void> | null = null;
const loadIgnition = () =>
  (ignitionLoad ??= import("@/lib/illusionculum-form-ignition").then(
    (module) => {
      ignitionModule = module;
    },
    () => {
      ignitionLoad = null;
    },
  ));

/** Where the scroll stands on the runway (the engine's own measure). */
function runwayProgress(runway: HTMLElement) {
  const frame = runway.querySelector<HTMLElement>(".rzn-frame");
  if (!frame) return 0;
  const travel = runway.offsetHeight - frame.offsetHeight;
  if (travel <= 0) return 1;
  const pinTop = Number.parseFloat(window.getComputedStyle(frame).top) || 0;
  return (pinTop - runway.getBoundingClientRect().top) / travel;
}

/** The runway at rest on its finished figure, a choice into ウルトラ: the
 * old form burns in red fire into the new one (owner, 2026-11-20), drawn
 * over the engine's hidden canvas (illusionculum-form-ignition.ts). */
function RunwayBurn({
  runwayRef,
  previous,
  stage,
  onDone,
}: {
  runwayRef: RefObject<HTMLDivElement | null>;
  previous: IllusionculumFormKey;
  stage: IllusionculumFormKey;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const runway = runwayRef.current;
    const canvas = canvasRef.current;
    if (!runway || !canvas || !ignitionModule) {
      onDone();
      return;
    }
    const dispose = ignitionModule.mountIllusionculumRunwayIgnition(
      runway,
      canvas,
      STILLS[previous],
      STILLS[stage],
      previous,
      ILLUSIONCULUM_SUIT_SIZE,
      onDone,
    );
    // Scrolled back into the chain mid-burn: the engine's scrubbed frame
    // takes the frame at once (the burn hides the engine's canvas, and the
    // scroll's mapping must show the same frame both ways).
    const onScroll = () => {
      if (runwayProgress(runway) < CHAIN_END) onDone();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      dispose();
    };
  }, [runwayRef, previous, stage, onDone]);
  return <canvas ref={canvasRef} className="ics-runway-burn" />;
}

function watchEnding(runway: HTMLElement | null) {
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
  const top = runway.getBoundingClientRect().top + window.scrollY - pinTop + travel * REPLAY_AT;
  window.scrollTo({ top: Math.max(0, Math.round(top)), behavior });
}

/** The runway's status and script, for assistive technology; the retry. */
function Guide({ runwayRef }: { runwayRef: RefObject<HTMLDivElement | null> }) {
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
    <div className="ics-assembly-guide">
      <div className="ics-sr">
        <p role="status" aria-live="polite" aria-atomic="true">
          {STATUS[load] || STATUS.waiting}
        </p>
        <ol aria-label="変身音声">
          {ILLUSIONCULUM_SAGA.calls.map((call) => (
            <li key={call}>{call}</li>
          ))}
        </ol>
        <p role="status" aria-live="polite" aria-atomic="true">
          {complete ? COMPLETE : ""}
        </p>
      </div>
      {load === "error" ? (
        <div className="ics-assembly-controls">
          <button
            type="button"
            onClick={() => runwayRef.current?.dispatchEvent(new Event("rexonance:assembly-retry"))}
          >
            素材を再読み込み
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The four forms as the shared slider's items (each its own light). */
const FORM_ITEMS = ILLUSIONCULUM_FORM_ORDER.map((key) => ({
  key,
  // The name breaks only at its seams (イリュージョン｜クルム), never mid-word.
  label: withWordBreaks(ILLUSIONCULUM_FORMS[key].label),
  accent: ILLUSIONCULUM_FORMS[key].accent,
}));

export const IllusionculumSuitUp = memo(function IllusionculumSuitUp({
  form,
  onChoose,
}: {
  form: IllusionculumFormKey;
  onChoose: (form: IllusionculumFormKey) => void;
}) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mountIllusionculumAssembly(runwayRef.current), []);
  // A choice into ウルトラ while the finished figure stands on the runway.
  const shownForm = useRef(form);
  const [burn, setBurn] = useState<{ previous: IllusionculumFormKey; stage: IllusionculumFormKey } | null>(null);
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    // The chunk is fetched once the engine is live (the motion tier only).
    const observer = new MutationObserver(() => {
      if (runway.dataset.rznState === "live") void loadIgnition();
    });
    observer.observe(runway, { attributes: true, attributeFilter: ["data-rzn-state"] });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const previous = shownForm.current;
    shownForm.current = form;
    if (previous === form) return;
    const runway = runwayRef.current;
    const frame = runway?.querySelector<HTMLElement>(".rzn-frame")?.getBoundingClientRect();
    const seen =
      Boolean(runway && frame) &&
      frame!.bottom > 0 &&
      frame!.top < window.innerHeight &&
      runway!.dataset.rznState === "live" &&
      document.documentElement.dataset.worldEffects !== "economy" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBurn(
      seen &&
        ignitionModule &&
        isUltra(form) &&
        !isUltra(previous) &&
        runwayProgress(runway!) >= CHAIN_END
        ? { previous, stage: form }
        : null,
    );
  }, [form]);
  const endBurn = useRef(() => setBurn(null)).current;
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
  const route = illusionculumRoute(form);
  const chosen = ILLUSIONCULUM_FORMS[form];
  const ultra = form === "ultra" || form === "ultraMore";

  return (
    <section
      id="suitup"
      className="rxs-section ics-chapter ics-suitup"
      aria-labelledby="ics-suitup-title"
    >
      {/* The chapter's head over the runway, as the Rexonance page's. */}
      <header className="rxs-section-heading ics-heading rxs-reveal">
        <b className="ics-numeral" aria-hidden="true">
          02
        </b>
        <h2 id="ics-suitup-title">変身</h2>
        <span className="ics-heading-plate" data-plate="figure" aria-hidden="true" />
      </header>
      <Guide runwayRef={runwayRef} />
      <AssemblyMovie runwayRef={runwayRef} site="illusionculum" />
      <div
        ref={runwayRef}
        className="ics-runway rzn-suitup"
        aria-hidden="true"
        id="illusionculum-assembly-runway"
        data-form={form}
        data-ultra={ultra || undefined}
        style={{
          ["--rzn-aspect" as string]: `${ILLUSIONCULUM_SUIT_SIZE.width} / ${ILLUSIONCULUM_SUIT_SIZE.height}`,
        }}
      >
        <div className="rzn-frame">
          <i className="rzn-light" />
          <i className="rzn-floor" />
          {/* The chapter's numeral, a graphic mark in the frame's corner. */}
          <img
            className="rzn-still"
            src={STILLS[form]}
            alt=""
            width={ILLUSIONCULUM_SUIT_SIZE.width}
            height={ILLUSIONCULUM_SUIT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <img
            className="rzn-under"
            src={ILLUSIONCULUM_SUIT_UNDERSUIT}
            alt=""
            width={ILLUSIONCULUM_SUIT_SIZE.width}
            height={ILLUSIONCULUM_SUIT_SIZE.height}
            loading="eager"
            decoding="async"
          />
          <img
            className="rzn-driver-standin"
            src={ILLUSIONCULUM_SUIT_DRIVER_STANDIN}
            alt=""
            width={ILLUSIONCULUM_SUIT_SIZE.width}
            height={ILLUSIONCULUM_SUIT_SIZE.height}
            loading="eager"
            decoding="async"
          />
          <canvas className="rzn-canvas" width={0} height={0} />
          {burn ? (
            <RunwayBurn
              key={`${burn.previous}-${burn.stage}`}
              runwayRef={runwayRef}
              previous={burn.previous}
              stage={burn.stage}
              onDone={endBurn}
            />
          ) : null}
          <div className="rzn-call">
            <ol className="rzn-lines">
              {LINES.map((units, index) => (
                <li key={ILLUSIONCULUM_SUIT_CALLS[index]} className="rzn-line">
                  {units.map((unit, unitIndex) => (
                    <span key={`${unit}-${unitIndex}`} className="rzn-chip">
                      {unit}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </div>
          <div className="rzn-hud">
            <p className="rzn-stamp">
              <b>
                <DisplayName value={chosen.label} />
              </b>
            </p>
          </div>
          <i className="rzn-rail">
            <i />
          </i>
        </div>
      </div>
      {/* The selector, right after the runway: the form the scroll ends on. */}
      <div
        className="rxs-stage-switcher ics-ending"
        data-stage={form}
        style={{ ["--ics-accent" as string]: chosen.accent }}
      >
        <h3 id="ics-ending-title" className="ics-sr">
          変身後の形態
        </h3>
        <FormSlider
          ref={tabsRef}
          className="ics-form-tabs ics-ending-tabs"
          items={FORM_ITEMS}
          value={form}
          onSelect={onChoose}
          idPrefix="ics-ending-tab"
          panelId="ics-ending-panel"
          ariaLabelledBy="ics-ending-title"
        />
        <div
          id="ics-ending-panel"
          className="ics-ending-panel"
          role="tabpanel"
          aria-labelledby={`ics-ending-tab-${form}`}
        >
          {/* The route the end of the scroll runs: a lit bar per form. */}
          <ol className="ics-ending-route" aria-label="移行の順序">
            {ILLUSIONCULUM_FORM_ORDER.map((key) => (
              <li
                key={key}
                data-reached={route.includes(key) || undefined}
                data-current={key === form || undefined}
                style={{ ["--ics-node" as string]: ILLUSIONCULUM_FORMS[key].accent }}
              >
                <span className="ics-sr">{ILLUSIONCULUM_FORMS[key].label}</span>
              </li>
            ))}
          </ol>
          <div className="ics-assembly-controls">
            <button type="button" onClick={() => watchEnding(runwayRef.current)}>
              {chosen.label}への変身を見る
            </button>
            <a href="#suitup">最初から</a>
          </div>
        </div>
      </div>
    </section>
  );
});
