import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { FINAL_STAGE_ENTER_ASSETS, WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
import { FAR_FROM_ASSEMBLY_BEATS, mountFarFromAssembly } from "@/lib/far-from-assembly";
import { FAR_FROM_SAGA, type Article } from "@/components/final-stage/final-stage-data";
import {
  FAR_FROM_SAGA_ARTWORK,
  FAR_FROM_SAGA_STAGE_ORDER,
  farFromImage,
  type FarFromStageKey,
} from "@/lib/far-from-saga-artwork";
import { FarFromEntryTransition } from "./far-from-entry-transition";
import { FarFromComparison } from "./far-from-comparison";
import { FarFromP16 } from "./far-from-p16";
import { FarFromReport } from "./far-from-report";

/* FAR FROM SAGA special site (owner's record of 2026-10-22).

   The third special site beside /extreme-saga and /rexonance-saga. Every word
   of record is the Final Stage's own (final-stage-data.ts, verbatim from the
   owner); the stage pictures are this site's (far-from-saga-artwork.ts). The
   shared special-site grammar (styles-rexonance-saga.css and the showcase
   sheets) draws the chrome; styles-far-from-saga.css adds what this page
   alone needs.

   #performance (far-from-comparison.tsx), #report (far-from-report.tsx) and
   #p16 (far-from-p16.tsx) are built from the owner's comparison text
   (far-from-report-text.ts, verbatim). Still prepared, not built
   (準備中): the nanite entry transition (far-from-entry-transition.tsx,
   renders nothing) and #suitup (a still runway; src/lib/far-from-assembly.ts
   is its seam). None of them loads a canvas or an engine, and none delays
   first paint. */

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

/** The record's articles (theories, armour and OS, authority). */
function Articles({
  items,
  columns,
  label,
}: {
  items: readonly Article[];
  columns: 2 | 3;
  label: string;
}) {
  return (
    <div className={`ffs-articles ffs-articles-${columns}`} role="list" aria-label={label}>
      {items.map((item, index) => (
        <article key={item.title} className="rxs-reveal" role="listitem">
          <header>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.code ? <small>{item.code}</small> : null}
          </header>
          <h3>{item.title}</h3>
          {item.body.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
        </article>
      ))}
    </div>
  );
}

/** The 準備中 mark every prepared chapter wears: a short note, then the state. */
function Pending({ line }: { line: string }) {
  return (
    <p className="ffs-pending" role="note">
      <span>{line}</span>
      <b>準備中</b>
    </p>
  );
}

export function FarFromSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<FarFromStageKey>("middle");
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const runwayRef = useRef<HTMLDivElement | null>(null);

  const activeStage = FAR_FROM_SAGA.stages[stage];
  const activeArt = FAR_FROM_SAGA_ARTWORK[stage];
  const keyVisual = FAR_FROM_SAGA_ARTWORK.middle;

  useEffect(() => mountLocalNavCurrent(pageRef.current?.querySelector(".rxs-local-nav nav")), []);

  // The suit-up runway's seam: a no-op today (準備中), the port's mount later.
  useEffect(() => mountFarFromAssembly(runwayRef.current, { beats: FAR_FROM_ASSEMBLY_BEATS }), []);

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
      {/* Entry transition: prepared, renders nothing, never blocks paint. */}
      <FarFromEntryTransition stage={stage} />

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
              <span aria-hidden="true">06</span> 形態
            </a>
            <a href="#theories">
              <span aria-hidden="true">07</span> 中核機構
            </a>
            <a href="#finishers">
              <span aria-hidden="true">11</span> 必殺技
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
          <p>FINAL STAGE / SPECIAL SITE</p>
          <h1 id="ffs-title">
            <span>{FAR_FROM_SAGA.en}</span>
            <DisplayName value={FAR_FROM_SAGA.name} />
          </h1>
          <p className="rxs-hero-lede">
            <span className="rxs-hero-lede-text">
              <span>どこまで離れても、この拳の一部だ。</span>
              <span>ファイナルステージ限定の超究極フォーム、仮面ライダーファーフロムサーガ。</span>
            </span>
          </p>
          <p className="ffs-stages-line">{FAR_FROM_SAGA.stagesLine}</p>
          <p className="ffs-provisional" role="note">
            <span aria-hidden="true">NOW UPDATING</span>
            特設サイトは順次更新します。
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
          <span>SCROLL</span>
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
          <span>標準稼働時の数値です。</span>
        </header>
        <dl className="ffs-specs" aria-label="ファーフロムサーガ スペック">
          {FAR_FROM_SAGA.specs.map((row) => (
            <div key={row.dt}>
              <dt>{row.dt}</dt>
              <dd>{row.dd}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* #performance: the comparison console (far-from-comparison.tsx). */}
      <section
        id="performance"
        className="rxs-section ffs-performance"
        aria-labelledby="ffs-performance-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>03 / COMPARISON</p>
          <h2 id="ffs-performance-title">性能比較</h2>
          <span>
            ファーフロムサーガを、ヴィンクルムサーガ、エクスプリームサーガ、レクソナンスサーガと比較します。
          </span>
        </header>
        <FarFromComparison />
      </section>

      {/* #report: the owner's comparison text in full (far-from-report.tsx). */}
      <section
        id="report"
        className="rxs-section ffs-report-section"
        aria-labelledby="ffs-report-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>03 / REPORT</p>
          <h2 id="ffs-report-title">比較資料</h2>
          <span>性能比較の設定資料を、全文で掲載します。</span>
        </header>
        <FarFromReport />
      </section>

      {/* #p16: the owner's two P16 chapters (far-from-p16.tsx). */}
      <section id="p16" className="rxs-section ffs-p16" aria-labelledby="ffs-p16-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>04 / PROCESSOR</p>
          <h2 id="ffs-p16-title">『P16』</h2>
          <span>レクソナンスサーガの『P14』を基礎とした、第16世代演算加速機構です。</span>
        </header>
        <FarFromP16 />
      </section>

      {/* 準備中 — #suitup: the scroll runway, still; far-from-assembly.ts is its seam. */}
      <section
        id="suitup"
        className="rxs-section ffs-suitup ffs-prepared"
        aria-labelledby="ffs-suitup-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>05 / SUIT-UP</p>
          <h2 id="ffs-suitup-title">変身シークエンス</h2>
          <span>スクロールに合わせて、ナノマシンが装甲を形成するまでを見せるコーナーです。</span>
        </header>
        <div ref={runwayRef} className="ffs-runway" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <Pending line="変身シークエンスは現在準備中です。" />
      </section>

      <section id="stages" className="rxs-stages rxs-section" aria-labelledby="ffs-stages-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>06 / STAGES</p>
          <h2 id="ffs-stages-title">形態</h2>
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

      <section
        id="theories"
        className="rxs-section ffs-theories"
        aria-labelledby="ffs-theories-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>07 / MECHANISM</p>
          <h2 id="ffs-theories-title">中核機構</h2>
          <span>FARFROM DRIVEをはじめとする、4つの新規理論・中核機構。</span>
        </header>
        <Articles items={FAR_FROM_SAGA.theories} columns={2} label="新規理論・中核機構" />
      </section>

      <section id="system" className="rxs-section ffs-system" aria-labelledby="ffs-system-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>08 / ARMOR & OS</p>
          <h2 id="ffs-system-title">装甲・OS</h2>
          <span>浮遊ユニット『ファーフロムビット』と、統合OS『SA-GA OS 6.1』。</span>
        </header>
        <Articles
          items={[FAR_FROM_SAGA.bits, FAR_FROM_SAGA.os]}
          columns={2}
          label="装甲・浮遊ユニットと統合OS"
        />
      </section>

      <section
        id="authority"
        className="rxs-section ffs-authority"
        aria-labelledby="ffs-authority-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>09 / AUTHORITY</p>
          <h2 id="ffs-authority-title">神属権限</h2>
          <span>FAR FROM DEUSと、Exception World。</span>
        </header>
        <Articles items={FAR_FROM_SAGA.powers} columns={2} label="神属権限・継承能力" />
      </section>

      <section id="arsenal" className="rxs-section ffs-arsenal" aria-labelledby="ffs-arsenal-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>10 / WEAPONS</p>
          <h2 id="ffs-arsenal-title">武装</h2>
          <span>追加武装は全10種。</span>
        </header>
        <ul className="ffs-weapons" aria-label="ファーフロムサーガ 追加武装">
          {FAR_FROM_SAGA.arsenal.map((weapon, index) => (
            <li key={weapon}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {weapon}
            </li>
          ))}
        </ul>
        <p className="ffs-note ffs-arsenal-note">{FAR_FROM_SAGA.arsenalNote}</p>
      </section>

      <section
        id="finishers"
        className="rxs-section ffs-finishers"
        aria-labelledby="ffs-finishers-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>11 / FINISHER</p>
          <h2 id="ffs-finishers-title">必殺技</h2>
        </header>
        <div className="ffs-finisher-list">
          {FAR_FROM_SAGA.finishers.map((finisher) => (
            <article key={finisher.name} className="ffs-finisher rxs-reveal">
              <small>{finisher.code}</small>
              <h3>{finisher.name}</h3>
              <CallOuts calls={finisher.calls} label={`${finisher.name} 発動音声`} />
              <div className="ffs-copy">
                {finisher.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="rxs-footer ffs-footer">
        <div>
          <p>FAR FROM SAGA / SPECIAL SITE</p>
          <h2>
            ファーフロムサーガの活躍は、
            <br />
            ファイナルステージで。
          </h2>
        </div>
        <GuardedLink to="/final-stage" hash="far-from-saga" assets={FINAL_STAGE_ENTER_ASSETS}>
          <span>ファイナルステージへ</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink to="/riders/saga" assets={[]}>
          <span>仮面ライダーサーガのページへ</span>
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
