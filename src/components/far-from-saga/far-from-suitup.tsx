import { memo, useEffect, useRef, useState, type RefObject } from "react";
import {
  FAR_FROM_ASSEMBLY_FORM,
  FAR_FROM_ASSEMBLY_PARTS,
  FAR_FROM_ASSEMBLY_PHASES,
  FAR_FROM_SUIT_CALLS,
  farFromCallUnits,
  mountFarFromAssembly,
} from "@/lib/far-from-assembly";
import { FAR_FROM_SUIT_SIZE, FAR_FROM_STAGE_VARS, FAR_FROM_STAGE } from "@/lib/far-from-stage";
import {
  FAR_FROM_SUIT_DRIVER_STANDIN,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_UNDERSUIT,
} from "@/lib/far-from-suit";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";

/* FAR FROM SAGA — #suitup, the scroll suit-up (2026-10-22).

   The Rexonance runway (rexonance-saga.tsx, .rzn-suitup) on this page: the
   same frame, layers and HUD (the engine reads them by their rzn- classes
   and flags), FAR FROM's call, parts and stamp, styled by
   styles-far-from-suitup.css. src/lib/far-from-assembly.ts mounts the
   scene on the runway under the motion gate; without it the runway is one
   screen with the finished figure and every line lit. The runway ends on
   マックス (data-form): the Ultra segment that follows starts from it. */

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

export const FarFromSuitUp = memo(function FarFromSuitUp() {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mountFarFromAssembly(runwayRef.current), []);
  return (
    <section id="suitup" className="rxs-section ffs-suitup" aria-labelledby="ffs-suitup-title">
      <header className="rxs-section-heading rxs-reveal">
        <p>05 / SUIT-UP</p>
        <h2 id="ffs-suitup-title">変身シークエンス</h2>
        <span>
          スクロールの速さに合わせて装着が進みます。炎の到達から爆散、ナノマシンの集結、装甲の固定、出力の起動、マックスへの移行までを、自分のペースで確認できます。
        </span>
      </header>
      <FarFromAssemblyGuide runwayRef={runwayRef} />
      <div
        ref={runwayRef}
        className="ffs-runway rzn-suitup"
        aria-hidden="true"
        id="far-from-assembly-runway"
        data-form={FAR_FROM_ASSEMBLY_FORM}
        style={{
          ["--rzn-aspect" as string]: `${FAR_FROM_SUIT_SIZE.width} / ${FAR_FROM_SUIT_SIZE.height}`,
        }}
      >
        <div
          className="rzn-frame"
          style={{
            [FAR_FROM_STAGE_VARS.height as string]: FAR_FROM_STAGE.height,
            [FAR_FROM_STAGE_VARS.width as string]: FAR_FROM_STAGE.width,
            [FAR_FROM_STAGE_VARS.x as string]: FAR_FROM_STAGE.x,
            [FAR_FROM_STAGE_VARS.bottom as string]: FAR_FROM_STAGE.bottom,
          }}
        >
          <i className="rzn-light" />
          <i className="rzn-depth" />
          <i className="rzn-aura" />
          <i className="rzn-crown" />
          <i className="rzn-floor" />
          {/* The still tiers' picture: the runway's final form, マックス. */}
          <img
            className="rzn-still"
            src={FAR_FROM_SUIT_FORMS.max}
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
                  {label}
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
              <b>{FAR_FROM_SAGA.stages.max.code}</b>
            </p>
          </div>
          <i className="rzn-rail">
            <i />
          </i>
        </div>
      </div>
      <div className="ffs-assembly-footer">
        <p>
          ミドルの装着からマックスまでを、スクロールで前後に確認できます。見直したい場面では、スクロールを戻してください。
        </p>
        <div className="ffs-assembly-controls">
          <a href="#suitup">もう一度、装着を確認</a>
          <a href="#stages">形態を見る</a>
        </div>
      </div>
    </section>
  );
});
