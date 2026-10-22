import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { FINAL_STAGE_ENTER_ASSETS, WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import {
  FAR_FROM_SAGA_ARTWORK,
  FAR_FROM_SAGA_STAGE_ORDER,
  farFromImage,
  type FarFromStageKey,
} from "@/lib/far-from-saga-artwork";

/* FAR FROM SAGA special site — provisional scaffold (2026-10-22).

   The third special site beside /extreme-saga and /rexonance-saga, kept to
   the bones the owner will flesh out: hero, calls, overview, specs, the five
   stages' artwork, and the way home. Every word of record is the Final
   Stage's own (final-stage-data.ts); only the stage pictures are this
   site's (far-from-saga-artwork.ts). The shared special-site grammar
   (styles-rexonance-saga.css and the showcase sheets) draws the chrome;
   styles-far-from-saga.css adds what this page alone needs. */

const releaseControlFocus = (control: HTMLElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
};

function CallOuts({ calls, label }: { calls: readonly string[]; label: string }) {
  return (
    <div className="ffs-calls" role="list" aria-label={label}>
      {calls.map((call, index) => (
        <b key={`${call}-${index}`} role="listitem">
          {call}
        </b>
      ))}
    </div>
  );
}

export function FarFromSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<FarFromStageKey>("middle");
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);

  const activeStage = FAR_FROM_SAGA.stages[stage];
  const activeArt = FAR_FROM_SAGA_ARTWORK[stage];
  const keyVisual = FAR_FROM_SAGA_ARTWORK.middle;

  useEffect(() => mountLocalNavCurrent(pageRef.current?.querySelector(".rxs-local-nav nav")), []);

  // The liquid rail owns tap, long-press, drag and keyboard selection; React
  // only mirrors the chosen index back into state.
  useEffect(() => {
    const rail = stageTabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? FAR_FROM_SAGA_STAGE_ORDER[index] : undefined;
      if (next) setStage(next);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, []);

  return (
    <main ref={pageRef} id="top" className="rxs-page ffs-page">
      <header className="rxs-local-nav">
        <div className="rxs-local-nav-inner">
          <GuardedLink
            className="rxs-brand"
            to="/world"
            hash="top"
            assets={WORLD_ENTER_ASSETS}
            aria-label="ディセプションワールドへ戻る"
          >
            <span>FAR FROM</span>
            <b>
              <DisplayName value={FAR_FROM_SAGA.name} />
            </b>
          </GuardedLink>
          <nav aria-label="ファーフロムサーガ ページ内ナビゲーション">
            <a href="#overview">
              <span aria-hidden="true">01</span> 概要
            </a>
            <a href="#specs">
              <span aria-hidden="true">02</span> スペック
            </a>
            <a href="#stages">
              <span aria-hidden="true">03</span> 形態
            </a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="far-from" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="rxs-hero ffs-hero" aria-labelledby="ffs-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-copy">
          <p>FINAL STAGE / RIDER RECORD 01</p>
          <h1 id="ffs-title">
            <span>{FAR_FROM_SAGA.en}</span>
            <DisplayName value={FAR_FROM_SAGA.name} />
          </h1>
          <p className="rxs-hero-lede">
            <span className="rxs-hero-lede-text">
              <span>レクソナンスの超共鳴と、ヴィンクルムの接続を一つの戦闘体系へ。</span>
              <span>ファイナルステージ限定の超究極フォーム。</span>
            </span>
          </p>
          <p className="ffs-stages-line">{FAR_FROM_SAGA.stagesLine}</p>
          <p className="ffs-provisional" role="note">
            特設サイト、準備中。
          </p>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <img
            src={keyVisual.src}
            {...farFromImage("middle")}
            alt=""
            width={keyVisual.width}
            height={keyVisual.height}
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <a className="rxs-scroll-cue" href="#overview">
          <span>記録を読む</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section
        id="overview"
        className="rxs-section ffs-overview"
        aria-labelledby="ffs-overview-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>01 / OVERVIEW</p>
          <h2 id="ffs-overview-title">概要</h2>
        </header>
        <CallOuts calls={FAR_FROM_SAGA.calls} label="ファーフロムサーガ 変身音声" />
        <div className="ffs-copy">
          {FAR_FROM_SAGA.overview.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section
        id="specs"
        className="rxs-section ffs-specs-section"
        aria-labelledby="ffs-specs-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>02 / SPECS</p>
          <h2 id="ffs-specs-title">スペック</h2>
          <span>ミドルの暫定標準値。</span>
        </header>
        <dl className="ffs-specs" aria-label="ファーフロムサーガ スペック">
          {FAR_FROM_SAGA.specs.map((row) => (
            <div key={row.dt}>
              <dt>{row.dt}</dt>
              <dd>{row.dd}</dd>
            </div>
          ))}
        </dl>
        <p className="ffs-note">{FAR_FROM_SAGA.specNote}</p>
      </section>

      <section id="stages" className="rxs-stages rxs-section" aria-labelledby="ffs-stages-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>03 / FIVE STAGES</p>
          <h2 id="ffs-stages-title">五つの形態段階</h2>
          <span>{FAR_FROM_SAGA.stagesLine}</span>
        </header>

        <div className="rxs-stage-switcher">
          <div
            ref={stageTabsRef}
            className="rxs-stage-tabs liquid-swipe-tabs ffs-stage-tabs"
            role="tablist"
            aria-label="ファーフロムサーガの形態段階"
            aria-describedby="ffs-stage-hint"
            data-liquid-glass="true"
            data-stage={stage}
          >
            <LiquidLens />
            {FAR_FROM_SAGA_STAGE_ORDER.map((key) => (
              <button
                key={key}
                id={`ffs-stage-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={stage === key}
                aria-controls="ffs-stage-panel"
                tabIndex={stage === key ? 0 : -1}
                className={stage === key ? "is-active" : ""}
                style={{ ["--liquid-accent" as string]: FAR_FROM_SAGA.stages[key].accent }}
                onClick={() => setStage(key)}
                onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
              >
                <span>{FAR_FROM_SAGA.stages[key].label}</span>
                <small>{FAR_FROM_SAGA.stages[key].code}</small>
              </button>
            ))}
          </div>
          <p id="ffs-stage-hint" className="rxs-stage-hint">
            タップ・長押し・左右スライド・矢印キーで切り替え
          </p>

          <div
            id="ffs-stage-panel"
            className="rxs-stage-panel ffs-stage-panel"
            role="tabpanel"
            aria-labelledby={`ffs-stage-tab-${stage}`}
            aria-live="polite"
            style={{ ["--ffs-accent" as string]: activeStage.accent }}
          >
            <figure key={stage}>
              <span aria-hidden="true" />
              <img
                src={activeArt.src}
                {...farFromImage(stage, stage !== "middle")}
                alt={activeStage.alt}
                width={activeArt.width}
                height={activeArt.height}
                // ミドル is the hero's own file, already decoded by now.
                loading={stage === "middle" ? "eager" : "lazy"}
                decoding="async"
              />
            </figure>
            <div key={`${stage}-copy`}>
              <small>{activeStage.code}</small>
              <h3>{activeStage.label}</h3>
              {activeStage.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="rxs-footer ffs-footer">
        <div>
          <p>FAR FROM SAGA / FINAL FORM SITE</p>
          <h2>
            記録の全文は、
            <br />
            ファイナルステージへ。
          </h2>
        </div>
        <GuardedLink to="/final-stage" hash="far-from-saga" assets={FINAL_STAGE_ENTER_ASSETS}>
          <span>ファイナルステージの記録を開く</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink to="/riders/saga" assets={[]}>
          <span>サーガの人物・能力を見る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink
          to="/world"
          hash="top"
          assets={WORLD_ENTER_ASSETS}
          className="rxs-footer-return"
        >
          <span>メインサイトへ戻る</span>
          <i aria-hidden="true">←</i>
        </GuardedLink>
      </footer>
    </main>
  );
}
