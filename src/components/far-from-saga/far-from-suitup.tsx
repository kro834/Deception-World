import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { LiquidLens } from "@/components/world/liquid-rail";
import { initRail } from "@/lib/liquid/boot.js";
import {
  FAR_FROM_ASSEMBLY_FORMS,
  FAR_FROM_ASSEMBLY_PARTS,
  FAR_FROM_ASSEMBLY_PHASES,
  FAR_FROM_SUIT_CALLS,
  farFromCallUnits,
  farFromEvolveLabel,
  farFromRunwayForm,
  mountFarFromAssembly,
  type FarFromAssemblyForm,
} from "@/lib/far-from-assembly";
import { FAR_FROM_SUIT_SIZE } from "@/lib/far-from-stage";
import {
  FAR_FROM_SUIT_DRIVER_STANDIN,
  FAR_FROM_SUIT_FIGURE,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_UNDERSUIT,
} from "@/lib/far-from-suit";
import { farFromUltraSrc } from "@/lib/far-from-ultra-art";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";

/* FAR FROM SAGA — #suitup, the scroll suit-up (2026-10-22).

   The Rexonance runway (rexonance-saga.tsx, .rzn-suitup) on this page: the
   same frame, layers and HUD (the engine reads them by their rzn- classes
   and flags), FAR FROM's call, parts and stamp, styled by
   styles-far-from-suitup.css. src/lib/far-from-assembly.ts mounts the
   scene on the runway under the motion gate; without it the runway is one
   screen with the finished figure and every line lit.

   The form it ends on (owner, 2026-10-23: 「変身スクロールの後にミドルから
   ウルトラまでのセレクターを置いて…レクソナンスの特設ページと同様の仕組み」):
   the selector right after the runway picks ミドル … ウルトラ, the page's
   one stage state (shared with #stages), and the runway's data-form follows
   it as on the Rexonance page — the scroll builds ミドル, then the end of it
   overwrites the figure through the chain up to the chosen form (ウルトラ
   through マックス, then its body and its interfaces). ウルトラ is one of the
   forms here, no longer a separate segment. */

const LOAD_COPY: Record<string, string> = {
  waiting: "表示設定に合わせて変身演出を準備します。",
  loading: "装甲の素材を読み込んでいます。",
  preparing: "装甲とナノマシンの配置を準備しています。",
  ready: "準備完了。下へ進むと装着、上へ戻ると分解します。",
  error: "素材を読み込めませんでした。接続を確認して再試行できます。",
  static:
    "現在は完成図を表示しています。動きを減らす設定や省エネ表示では、変身アニメーションを省略します。",
};
const COMPLETE_COPY = "装着完了。上へ戻ると分解します。";

const assemblyStatus = (load: string, motionShown: boolean) => {
  const key = load === "static" && motionShown ? "waiting" : load;
  return LOAD_COPY[key] || LOAD_COPY.waiting;
};

const SUIT_UP_LINES = FAR_FROM_SUIT_CALLS.map((call) => farFromCallUnits(call));

/** The still tiers' picture: the chosen form, finished (the same frame). */
const STILLS: Record<FarFromAssemblyForm, string> = {
  middle: FAR_FROM_SUIT_FIGURE,
  high: FAR_FROM_SUIT_FORMS.high,
  xhigh: FAR_FROM_SUIT_FORMS.xhigh,
  max: FAR_FROM_SUIT_FORMS.max,
  ultra: farFromUltraSrc("interface", 768),
};

/** Where "watch the change" lands on the runway's progress: just before the
 * seal, so the lock, the ignition and the chosen form's change play next
 * (the engine's ASSEMBLY_BEATS.seal starts at .86). */
const REPLAY_AT = 0.835;

const FORM_LABELS = FAR_FROM_ASSEMBLY_FORMS.map((key) => FAR_FROM_SAGA.stages[key].label);

/** The ending's sentence: which forms the end of the scroll runs through. */
function endingLine(form: FarFromAssemblyForm) {
  const index = FAR_FROM_ASSEMBLY_FORMS.indexOf(form);
  if (index <= 0) return `装着の最後は、${FORM_LABELS[0]}で完了します。`;
  const path = FORM_LABELS.slice(1, index + 1).join("、");
  return index === 1
    ? `${FORM_LABELS[0]}の装着後、${path}へ移行して完了します。`
    : `${FORM_LABELS[0]}の装着後、${path}の順に移行して完了します。`;
}

/** Scrolls the page to the runway's last beats (the still tiers: to the
 * runway itself). Smooth only where motion is allowed. */
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

/** The runway's script for assistive technology, and its status. */
function FarFromAssemblyGuide({ runwayRef }: { runwayRef: RefObject<HTMLDivElement | null> }) {
  const [load, setLoad] = useState("waiting");
  const [scene, setScene] = useState({ motion: false, complete: false });
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    const update = () => {
      const next = runway.dataset.rznLoad || "waiting";
      const motion = runway.hasAttribute("data-rzn-state");
      const complete =
        next === "ready" && (runway.dataset.rznFormComplete === "true" || false);
      setLoad(next);
      setScene((current) =>
        current.motion === motion && current.complete === complete ? current : { motion, complete },
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(runway, {
      attributes: true,
      attributeFilter: ["data-rzn-load", "data-rzn-state", "data-rzn-phase", "data-rzn-form-complete"],
    });
    return () => observer.disconnect();
  }, [runwayRef]);
  const status = assemblyStatus(load, scene.motion);
  return (
    <div className="ffs-assembly-guide">
      <p className="ffs-assembly-status" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>
      <div className="rxk-sr">
        <ol aria-label="装着の流れ">
          {FAR_FROM_ASSEMBLY_PHASES.map(({ phase, step, label }) => (
            <li key={phase}>
              {step} {label}
            </li>
          ))}
        </ol>
        <ol aria-label="変身音声">
          {FAR_FROM_SAGA.calls.map((call) => (
            <li key={call}>{call}</li>
          ))}
        </ol>
        <p role="status" aria-live="polite" aria-atomic="true">
          {scene.complete ? COMPLETE_COPY : ""}
        </p>
      </div>
      {load === "error" ? (
        <div className="ffs-assembly-controls">
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

export const FarFromSuitUp = memo(function FarFromSuitUp({
  stage,
  onChoose,
}: {
  stage: FarFromAssemblyForm;
  onChoose: (stage: FarFromAssemblyForm) => void;
}) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mountFarFromAssembly(runwayRef.current), []);
  // The selector is a liquid rail (tap, long-press, drag, arrow keys), as
  // #stages' rail is; React mirrors the chosen index into the page's state.
  useEffect(() => {
    const rail = tabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? FAR_FROM_ASSEMBLY_FORMS[index] : undefined;
      if (next) onChoose(next);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, [onChoose]);
  // A choice made elsewhere (#stages) moves this rail's lens too.
  useEffect(() => {
    tabsRef.current?.dispatchEvent(new Event("liquidrelayout"));
  }, [stage]);
  const form = FAR_FROM_SAGA.stages[stage];
  const reached = FAR_FROM_ASSEMBLY_FORMS.indexOf(stage);

  return (
    <section id="suitup" className="rxs-section ffs-suitup" aria-labelledby="ffs-suitup-title">
      <header className="rxs-section-heading rxs-reveal">
        <p>05 / SUIT-UP</p>
        <h2 id="ffs-suitup-title">変身シークエンス</h2>
        <span>
          スクロールの速さに合わせて装着が進みます。炎の到達から爆散、ナノマシンの集結、装甲の固定、出力の起動、選んだ形態への移行までを、自分のペースで確認できます。
        </span>
      </header>
      <FarFromAssemblyGuide runwayRef={runwayRef} />
      <div
        ref={runwayRef}
        className="ffs-runway rzn-suitup"
        aria-hidden="true"
        id="far-from-assembly-runway"
        // The runway ends on the form chosen in the selector below (owner,
        // 2026-10-23; the Rexonance page's data-form={stage}).
        data-form={farFromRunwayForm(stage)}
        style={{
          ["--rzn-aspect" as string]: `${FAR_FROM_SUIT_SIZE.width} / ${FAR_FROM_SUIT_SIZE.height}`,
        }}
      >
        {/* The figure's placement (--rzn-fig-h/w/x/b) is the sheet's, by
            layout tier (src/lib/far-from-stage.ts holds the same numbers for
            the Ultra segment); an inline value would pin every tier to
            the desktop's. */}
        <div className="rzn-frame">
          <i className="rzn-light" />
          <i className="rzn-depth" />
          <i className="rzn-aura" />
          <i className="rzn-crown" />
          <i className="rzn-floor" />
          {/* The still tiers' picture: the chosen form, finished. */}
          <img
            className="rzn-still"
            src={STILLS[stage]}
            alt=""
            width={FAR_FROM_SUIT_SIZE.width}
            height={FAR_FROM_SUIT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          {/* While the scene prepares, the undersuit stands in (never the
              finished suit before the scroll). */}
          <img
            className="rzn-under"
            src={FAR_FROM_SUIT_UNDERSUIT}
            alt=""
            width={FAR_FROM_SUIT_SIZE.width}
            height={FAR_FROM_SUIT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <img
            className="rzn-driver-standin"
            src={FAR_FROM_SUIT_DRIVER_STANDIN}
            alt=""
            width={FAR_FROM_SUIT_SIZE.width}
            height={FAR_FROM_SUIT_SIZE.height}
            loading="lazy"
            decoding="async"
          />
          <canvas className="rzn-canvas" width={0} height={0} />
          <div className="rzn-call">
            <p className="rzn-kicker">
              <span>SUIT-UP</span>
              <span>NANITE ASSEMBLY</span>
            </p>
            <p className="rzn-phase">
              {FAR_FROM_ASSEMBLY_PHASES.map(({ phase, step, label }) => (
                <span key={phase} data-phase={phase}>
                  <b>{step}</b>
                  {phase === "evolve" ? farFromEvolveLabel(form.label) : label}
                </span>
              ))}
            </p>
            <ol className="rzn-lines">
              {SUIT_UP_LINES.map((units, index) => (
                <li key={FAR_FROM_SUIT_CALLS[index]} className="rzn-line">
                  {units.map((unit, unitIndex) => (
                    <span key={`${unit}-${unitIndex}`} className="rzn-chip">
                      {unit}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
            <p className="rzn-hint">
              <span className="rzn-hint-live">スクロールで装着</span>
              <span className="rzn-hint-wait">装着準備中</span>
            </p>
          </div>
          <div className="rzn-hud">
            <p className="rzn-readout">
              <b className="rzn-percent">100</b>
              <span>%</span>
            </p>
            <p className="rzn-nanites">
              <small>NANITES</small>
              <span className="rzn-count">ONLINE</span>
            </p>
            <ol className="rzn-parts">
              {FAR_FROM_ASSEMBLY_PARTS.map((part) => (
                <li key={part} className="rzn-part">
                  {part}
                </li>
              ))}
            </ol>
            <p className="rzn-stamp">
              <span>FAR FROM SAGA</span>
              <b>{form.code}</b>
            </p>
          </div>
          <i className="rzn-rail">
            <i />
          </i>
        </div>
      </div>
      {/* The selector, right after the runway: the form the scroll ends on. */}
      <div
        className="rxs-stage-switcher ffs-ending"
        data-stage={stage}
        style={{ ["--ffs-accent" as string]: form.accent }}
      >
        <header className="ffs-ending-head">
          <p lang="en">FINAL FORM</p>
          <h3 id="ffs-ending-title">変身後の形態</h3>
        </header>
        <div
          ref={tabsRef}
          className="rxs-stage-tabs liquid-swipe-tabs ffs-stage-tabs ffs-ending-tabs"
          role="tablist"
          aria-labelledby="ffs-ending-title"
          aria-describedby="ffs-ending-hint"
          data-liquid-glass="true"
          data-stage={stage}
        >
          <LiquidLens />
          {FAR_FROM_ASSEMBLY_FORMS.map((key) => (
            <button
              key={key}
              id={`ffs-ending-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={stage === key}
              aria-controls="ffs-ending-panel"
              tabIndex={stage === key ? 0 : -1}
              className={stage === key ? "is-active" : ""}
              style={{ ["--liquid-accent" as string]: FAR_FROM_SAGA.stages[key].accent }}
              onClick={() => onChoose(key)}
            >
              <span>{FAR_FROM_SAGA.stages[key].label}</span>
              <small lang="en">{FAR_FROM_SAGA.stages[key].code}</small>
            </button>
          ))}
        </div>
        <p id="ffs-ending-hint" className="rxs-stage-hint">
          タップ・長押し・左右スライド・矢印キーで切り替え
        </p>
        <div
          id="ffs-ending-panel"
          className="ffs-ending-panel"
          role="tabpanel"
          aria-labelledby={`ffs-ending-tab-${stage}`}
        >
          <ol className="ffs-ending-route" aria-label="移行の順序">
            {FAR_FROM_ASSEMBLY_FORMS.map((key, index) => (
              <li
                key={key}
                data-reached={index <= reached || undefined}
                data-current={index === reached || undefined}
                style={{ ["--ffs-node" as string]: FAR_FROM_SAGA.stages[key].accent }}
              >
                <b lang="en">{FAR_FROM_SAGA.stages[key].code}</b>
                <span>{FAR_FROM_SAGA.stages[key].label}</span>
              </li>
            ))}
          </ol>
          <p className="ffs-ending-line">{endingLine(stage)}</p>
          {stage === "ultra" ? (
            <div className="ffs-ending-ultra">
              <p>
                マックスから移行する、60秒間の最上位形態。全身が白に染まった後、ウルトラ専用のナノマシンが追加機構を生成し、腕の外側などに補助インターフェースが展開します。
              </p>
              <p className="ffs-note">補助インターフェースの表示内容はイメージです。</p>
            </div>
          ) : null}
          <div className="ffs-assembly-controls">
            <button type="button" onClick={() => watchEnding(runwayRef.current)}>
              {form.label}への変身を見る
            </button>
            <a href="#suitup">最初から装着を確認</a>
          </div>
        </div>
      </div>
    </section>
  );
});
