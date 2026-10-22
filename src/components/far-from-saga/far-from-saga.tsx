import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { FINAL_STAGE_ENTER_ASSETS, WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
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
import { FarFromUltra } from "./far-from-ultra";
import { FarFromReport } from "./far-from-report";
import { FarFromSuitUp } from "./far-from-suitup";
import { FarFromFormComparison } from "./far-from-form-comparison";
import {
  FarFromAperture,
  FarFromCallouts,
  FarFromChapterMap,
  FarFromFormStatus,
  FarFromHeroRail,
  FarFromStageSlate,
} from "./far-from-editorial";

/* FAR FROM SAGA special site (owner's record of 2026-10-22; redesigned on
   the Rexonance / Extreme structure, 2026-10-22).

   The third special site beside /extreme-saga and /rexonance-saga, built
   on their composition: the local bar with numbered chapters, a split hero
   (the key visual in its stage with a slate and read-outs, the copy and its
   two doors beside it), the CONTENTS map, then numbered chapters whose
   heads carry a forged numeral, an etched kicker, the title and its lede
   over a hairline, and the end card with the figure standing behind the
   last line. Every word of record is the Final Stage's own
   (final-stage-data.ts, verbatim from the owner); the stage pictures are
   this site's (far-from-saga-artwork.ts). The shared special-site grammar
   (styles-rexonance-saga.css and the showcase sheets) draws the chrome;
   styles-far-from-saga.css is the page's own composition, type and motion.

   Chapters, as the Rexonance order goes (performance → processor →
   suit-up → stages → system) with the record's own chapters around them:
   01 overview (+ the calls), 02 specs, 03 performance (the console, then
   #report, the owner's two documents, as its second half), 04 P16,
   05 suit-up, 06 ultra, 07 stages, 08 mechanism, 09 armour and OS,
   10 authority, 11 weapons, 12 finishers. The numbers are CSS counters
   over the page's direct sections (#report is a sub-chapter and does not
   count), so the mounted chapters' own kickers (05 / SUIT-UP, 06 / ULTRA)
   stay as they are.

   #performance (far-from-comparison.tsx), #report (far-from-report.tsx)
   and #p16 (far-from-p16.tsx) are built from the owner's comparison text
   (far-from-report-text.ts, verbatim). #suitup is the scroll suit-up
   (far-from-suitup.tsx: the Rexonance runway playing FAR FROM's suit
   through src/lib/far-from-assembly.ts, ending on マックス). #ultra
   (far-from-ultra.tsx) is the ウルトラ sequence, the continuation after
   マックス as its own scroll segment. The page-entry transformation is
   far-from-entry-transition.tsx. Every engine is a lazy chunk mounted after
   paint, only where motion is allowed; nothing here delays first paint:
   the chapter reveals are one IntersectionObserver armed after mount, and
   only where motion is allowed. */

const releaseControlFocus = (control: HTMLElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
};

/** Values that run long (the processors, the recognisers) read a size down. */
const LONG_SPEC = 12;

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

/** The record's articles (theories, armour and OS, authority): plates. */
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
            {item.code ? <small lang="en">{item.code}</small> : null}
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

export function FarFromSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<FarFromStageKey>("middle");
  const [motionReady, setMotionReady] = useState(false);
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

  // The chapter reveals (as on the Extreme site): armed after paint, only
  // where motion is allowed; otherwise everything rests fully drawn. The
  // page grants motion (data-motion-ready) only on the same terms, so the
  // shared scroll choreography never runs under reduced motion, economy
  // rendering or a saving connection.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forced = window.matchMedia("(forced-colors: active)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const constrained =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    const allowMotion =
      !media.matches &&
      !forced.matches &&
      !constrained &&
      document.documentElement.dataset.worldEffects !== "economy";

    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!allowMotion || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    setMotionReady(true);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page ffs-page"
      data-motion-ready={motionReady ? "true" : "false"}
    >
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
            <span lang="en">FAR FROM</span>
            <b>
              <DisplayName value={FAR_FROM_SAGA.name} />
            </b>
          </GuardedLink>
          {/* The bar lists the five landmark chapters, numbered as CONTENTS
              numbers them; the side menu lists every chapter. */}
          <nav aria-label="ファーフロムサーガ ページ内ナビゲーション">
            <a href="#overview">
              <span aria-hidden="true">01</span> 概要
            </a>
            <a href="#performance">
              <span aria-hidden="true">03</span> 性能
            </a>
            <a href="#p16">
              <span aria-hidden="true">04</span> P16
            </a>
            <a href="#suitup" data-local-nav-through="far-from-assembly-runway">
              <span aria-hidden="true">05</span> 変身
            </a>
            <a href="#stages">
              <span aria-hidden="true">07</span> 形態
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
          <p lang="en">
            FINAL STAGE <span className="rxs-hero-kicker-tail">/ SPECIAL SITE</span>
          </p>
          <h1 id="ffs-title">
            <span lang="en">{FAR_FROM_SAGA.en}</span>
            <DisplayName value={FAR_FROM_SAGA.name} />
          </h1>
          <p className="rxs-hero-lede">
            <span className="rxs-hero-lede-text">
              <span>どこまで離れても、この拳の一部だ。</span>
              <span>ファイナルステージ限定の超究極フォーム、仮面ライダーファーフロムサーガ。</span>
            </span>
          </p>
          <p className="ffs-stages-line">
            <span lang="en">5 STAGES</span>
            {FAR_FROM_SAGA.stagesLine}
          </p>
          <FarFromHeroRail />
          {/* The name's ghost behind the copy (decorative). */}
          <span className="ffs-mark" aria-hidden="true">
            FAR FROM
          </span>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <FarFromStageSlate />
          <FarFromAperture />
          <i className="ffs-ring is-ice" />
          <i className="ffs-ring is-gold" />
          <i className="ffs-ring is-violet" />
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
          <FarFromCallouts />
        </div>
        <a className="rxs-scroll-cue" href="#overview">
          <span>まず、概要から。</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <FarFromChapterMap />

      {/* 01 — the calls and the record's overview. */}
      <section
        id="overview"
        className="rxs-section ffs-overview"
        aria-labelledby="ffs-overview-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>01 / OVERVIEW</p>
          <h2 id="ffs-overview-title">概要</h2>
          <span>
            ファイナルステージ限定の超究極フォーム。変身音声と、記録の概要を掲載します。
          </span>
        </header>
        <CallOuts calls={FAR_FROM_SAGA.calls} label="ファーフロムサーガ 変身音声" />
        <div className="ffs-copy rxs-reveal">
          {FAR_FROM_SAGA.overview.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      {/* 02 — the spec table, as plates. */}
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
        <dl className="ffs-specs rxs-reveal" aria-label="ファーフロムサーガ スペック">
          {FAR_FROM_SAGA.specs.map((row) => (
            <div key={row.dt} data-long={row.dd.length > LONG_SPEC || undefined}>
              <dt>{row.dt}</dt>
              <dd>{row.dd}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 03 — #performance: the comparison console (far-from-comparison.tsx). */}
      <section
        id="performance"
        className="rxs-section ffs-performance"
        aria-labelledby="ffs-performance-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>03 / PERFORMANCE</p>
          <h2 id="ffs-performance-title">性能比較</h2>
          <span>
            ファーフロムサーガを、ヴィンクルムサーガ、エクスプリームサーガ、レクソナンスサーガと比較します。
          </span>
        </header>
        <FarFromComparison />
      </section>

      {/* 03, continued — #report: the owner's comparison text in full
          (far-from-report.tsx). A sub-chapter: it keeps 03's number. */}
      <section
        id="report"
        className="rxs-section ffs-report-section ffs-subchapter"
        aria-labelledby="ffs-report-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>03 / REPORT</p>
          <h2 id="ffs-report-title">比較資料</h2>
          <span>性能比較の設定資料を、全文で掲載します。</span>
        </header>
        <FarFromReport />
      </section>

      {/* 04 — #p16: the owner's two P16 chapters (far-from-p16.tsx). */}
      <section id="p16" className="rxs-section ffs-p16" aria-labelledby="ffs-p16-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>04 / PROCESSOR</p>
          <h2 id="ffs-p16-title">『P16』</h2>
          <span>レクソナンスサーガの『P14』を基礎とした、第16世代演算加速機構です。</span>
        </header>
        <FarFromP16 />
      </section>

      {/* 05 — #suitup: the scroll suit-up (far-from-suitup.tsx). */}
      <FarFromSuitUp />

      {/* 06 — #ultra: the ウルトラ sequence, the continuation after マックス
          (far-from-ultra.tsx; its engine is a lazy chunk under the motion gate). */}
      <FarFromUltra />

      {/* 07 — the five forms. */}
      <section id="stages" className="rxs-stages rxs-section" aria-labelledby="ffs-stages-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>07 / STAGES</p>
          <h2 id="ffs-stages-title">形態</h2>
          <span>{FAR_FROM_SAGA.stagesLine}</span>
        </header>

        <div className="rxs-stage-switcher rxs-reveal">
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
                <small lang="en">{FAR_FROM_SAGA.stages[key].code}</small>
              </button>
            ))}
          </div>
          <p id="ffs-stage-hint" className="rxs-stage-hint">
            タップ・長押し・左右スライド・矢印キーで切り替え
          </p>
          <FarFromFormStatus stage={stage} />

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
              <i className="ffs-stage-scan" aria-hidden="true" />
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
              <small lang="en">{activeStage.code}</small>
              <h3>{activeStage.label}</h3>
              {activeStage.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {/* The form's code, outlined and huge (decorative). */}
              <i className="ffs-form-code" aria-hidden="true">
                {activeStage.code}
              </i>
            </div>
          </div>
        </div>
        <FarFromFormComparison selected={stage} onChoose={setStage} />
      </section>

      {/* 08 — the four theories. */}
      <section
        id="theories"
        className="rxs-section ffs-theories"
        aria-labelledby="ffs-theories-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>08 / MECHANISM</p>
          <h2 id="ffs-theories-title">中核機構</h2>
          <span>FARFROM DRIVEをはじめとする、4つの新規理論・中核機構。</span>
        </header>
        <Articles items={FAR_FROM_SAGA.theories} columns={2} label="新規理論・中核機構" />
      </section>

      {/* 09 — the floating unit and the OS. */}
      <section id="system" className="rxs-section ffs-system" aria-labelledby="ffs-system-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>09 / ARMOR & OS</p>
          <h2 id="ffs-system-title">装甲・OS</h2>
          <span>浮遊ユニット『ファーフロムビット』と、統合OS『SA-GA OS 6.1』。</span>
        </header>
        <Articles
          items={[FAR_FROM_SAGA.bits, FAR_FROM_SAGA.os]}
          columns={2}
          label="装甲・浮遊ユニットと統合OS"
        />
      </section>

      {/* 10 — the authorities. */}
      <section
        id="authority"
        className="rxs-section ffs-authority"
        aria-labelledby="ffs-authority-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>10 / AUTHORITY</p>
          <h2 id="ffs-authority-title">神属権限</h2>
          <span>FAR FROM DEUSと、Exception World。</span>
        </header>
        <Articles items={FAR_FROM_SAGA.powers} columns={2} label="神属権限・継承能力" />
      </section>

      {/* 11 — the weapons, numbered. */}
      <section id="arsenal" className="rxs-section ffs-arsenal" aria-labelledby="ffs-arsenal-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>11 / WEAPONS</p>
          <h2 id="ffs-arsenal-title">武装</h2>
          <span>追加武装は全10種。</span>
        </header>
        <ul className="ffs-weapons rxs-reveal" aria-label="ファーフロムサーガ 追加武装">
          {FAR_FROM_SAGA.arsenal.map((weapon, index) => (
            <li key={weapon}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {weapon}
            </li>
          ))}
        </ul>
        <p className="ffs-note ffs-arsenal-note">{FAR_FROM_SAGA.arsenalNote}</p>
      </section>

      {/* 12 — the finishers. */}
      <section
        id="finishers"
        className="rxs-section ffs-finishers"
        aria-labelledby="ffs-finishers-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <p>12 / FINISHER</p>
          <h2 id="ffs-finishers-title">必殺技</h2>
          <span>最高位必殺技は2種。発動音声とともに掲載します。</span>
        </header>
        <div className="ffs-finisher-list">
          {FAR_FROM_SAGA.finishers.map((finisher) => (
            <article key={finisher.name} className="ffs-finisher rxs-reveal">
              <small lang="en">{finisher.code}</small>
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

      <footer className="rxs-footer ffs-footer" role="contentinfo">
        {/* The end card: ウルトラ stands behind the last line (lazy; decorative). */}
        <img
          className="ffs-end-figure"
          src={FAR_FROM_SAGA_ARTWORK.ultra.src}
          srcSet={farFromImage("ultra").srcSet}
          sizes="(max-width: 760px) 70vw, 36vw"
          alt=""
          aria-hidden="true"
          width={FAR_FROM_SAGA_ARTWORK.ultra.width}
          height={FAR_FROM_SAGA_ARTWORK.ultra.height}
          loading="lazy"
          decoding="async"
        />
        {/* Back to this page's own top: first in the end card, so its closing
            row still ends on the way home. */}
        <p className="ffs-footer-top">
          <a href="#top">
            <span>ページの先頭へ</span>
            <i aria-hidden="true">↑</i>
          </a>
        </p>
        <div>
          <p lang="en">FAR FROM SAGA / FINAL STAGE</p>
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
