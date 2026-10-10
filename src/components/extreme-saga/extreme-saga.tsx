import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountExtremeMotion, mountExtremeNavReserve } from "@/lib/extreme-motion.js";
import { mountExtremeImpact } from "@/lib/extreme-impact.js";
import { ExtremeImpactDefs } from "./extreme-impact-art";

type ExtremeStage = "middle" | "ultra";
type ExtremeBaseline = "diluculum" | "vinculum";

// The panel's art follows a change of form at most this often. The Ultra art
// is far brighter than the Middle art, so a reader flicking between the two
// would otherwise strobe the figure; the tabs and the copy follow at once.
const STAGE_CUT_GAP_MS = 1100;

type ComparisonMetric = {
  label: string;
  current: string;
  previous: string;
  relative: string;
  multiplier: string;
  delta: string;
  note?: string;
  currentBar: number;
  baselineBar: number;
};

const EXTREME_STAGES: Record<
  ExtremeStage,
  {
    label: string;
    code: string;
    image: string;
    alt: string;
    width: number;
    height: number;
    title: string;
    lede: string;
    points: readonly string[];
    accent: string;
  }
> = {
  middle: {
    label: "ミドル",
    code: "MIDDLE",
    image: "/saga-extreme-middle-20261006.webp",
    alt: "仮面ライダーエクスプリームサーガの全身ビジュアル",
    width: 1023,
    height: 1538,
    title: "殴られるほど、賢くなる。",
    lede: "標準状態では、学習した攻撃と戦況から勝利へ至る経路を増殖させ、状況ごとに最適な結果を選び取ります。戦いが長引くほど選択肢が増え、相手の優位を狭めていきます。",
    points: ["LEARNING", "DARK MATTER CHARGING", "HIGH SUPREME"],
    accent: "#5edcff",
  },
  ultra: {
    label: "ウルトラ",
    code: "ULTRA / 50 SEC",
    image: "/saga-extreme-ultra-20261006.jpeg",
    alt: "仮面ライダーエクスプリームサーガ・ウルトラの全身ビジュアル",
    width: 1022,
    height: 1538,
    title: "50秒で、片をつける。",
    lede: "無数に増殖した可能性を一つの勝利結果へ固定し、攻撃・防御・修復を同じ結論へ収束させます。50秒間だけ成立する、短期決着の最上位状態です。",
    points: ["結果固定", "絶対攻撃・絶対防御", "50秒間の限界運用"],
    accent: "#ffcf72",
  },
};

const COMPARISONS: Record<
  ExtremeBaseline,
  {
    label: string;
    code: string;
    metrics: readonly ComparisonMetric[];
    baselineSpecs: readonly string[];
    extremeSpecs: readonly string[];
    verdict: string;
    unavailable: readonly string[];
  }
> = {
  diluculum: {
    label: "ディルクルム",
    code: "DILUCULUM STANDARD",
    metrics: [
      {
        label: "パンチ力",
        current: "205.6t〜",
        previous: "120.8t（est.）",
        relative: "170.2%",
        multiplier: "1.70倍",
        delta: "+70.2%",
        currentBar: 100,
        baselineBar: 58.8,
      },
      {
        label: "キック力",
        current: "308.9t〜",
        previous: "178.8t（est.）",
        relative: "172.8%",
        multiplier: "1.73倍",
        delta: "+72.8%",
        currentBar: 100,
        baselineBar: 57.9,
      },
      {
        label: "ジャンプ力",
        current: "1033.5m",
        previous: "151.0m（est.）",
        relative: "684.4%",
        multiplier: "6.84倍",
        delta: "+584.4%",
        currentBar: 100,
        baselineBar: 14.6,
      },
      {
        label: "走力（100m）",
        current: "0.002秒",
        previous: "0.4秒（est.）",
        relative: "20,000%",
        multiplier: "200倍",
        delta: "+19,900%",
        note: "所要時間 99.5%短縮",
        currentBar: 100,
        baselineBar: 0.5,
      },
    ],
    baselineSpecs: [
      "パンチ 120.8t（est.） / キック 178.8t（est.）",
      "ギガンティム 50000Kt（est.）",
      "ジャンプ 151.0m（est.） / 100m 0.4秒（est.）",
      "飛行速度 マッハ88（est.）",
      "3,000TOPS / 200Core · URANUS X",
      "TAMAYURA X（アクセラレータ）",
      "60,000TOPS / 300Core · URANUS Z Extreme",
      "TAMAYURA Z Extreme（アクセラレータ）",
      "Paranormal Realizer",
    ],
    extremeSpecs: [
      "パンチ 205.6t〜 / キック 308.9t〜",
      "ジャンプ 1033.5m / 100m 0.002秒",
      "20,000YOPS / ∞Core · KHAOS Ultra",
      "5,000TOPS / 300Core · KOSMOS Ultra",
      "P14（Extreme tuning）",
    ],
    verdict:
      "物理カタログ値では、エクスプリームが打撃・跳躍・地上速度で上回ります。演算はYOPSとTOPSを合算せず、同じTOPS表記でも役割の異なる系統として並列表示しています。",
    unavailable: [
      "飛行速度：ディルクルムはマッハ88（est.）。エクスプリームは公開値不詳のため倍率換算しません。",
      "ギガンティム：ディルクルムは50000Kt（est.）。エクスプリーム側の同条件値が不詳のため倍率換算しません。",
    ],
  },
  vinculum: {
    label: "ヴィンクルム",
    code: "VINCULUM STANDARD",
    metrics: [
      {
        label: "パンチ力",
        current: "205.6t〜",
        previous: "98.8t（est.）",
        relative: "208.1%",
        multiplier: "2.08倍",
        delta: "+108.1%",
        currentBar: 100,
        baselineBar: 48.1,
      },
      {
        label: "キック力",
        current: "308.9t〜",
        previous: "198.8t（est.）",
        relative: "155.4%",
        multiplier: "1.55倍",
        delta: "+55.4%",
        currentBar: 100,
        baselineBar: 64.4,
      },
      {
        label: "ジャンプ力",
        current: "1033.5m",
        previous: "5000.0m（est.）",
        relative: "20.7%",
        multiplier: "0.21倍",
        delta: "−79.3%",
        note: "ヴィンクルムが約4.84倍",
        currentBar: 20.7,
        baselineBar: 100,
      },
      {
        label: "走力（100m）",
        current: "0.002秒",
        previous: "0.1秒（est.）",
        relative: "5,000%",
        multiplier: "50倍",
        delta: "+4,900%",
        note: "所要時間 98.0%短縮",
        currentBar: 100,
        baselineBar: 2,
      },
    ],
    baselineSpecs: [
      "パンチ 98.8t（est.） / キック 198.8t（est.）",
      "ジャンプ 5000.0m（est.） / 100m 0.1秒（est.）",
      "10,000YOPS / 500Core · KHAOS",
      "300TOPS / 300Core · KOSMOS",
      "P2",
      "Paranormal Realizer Pro",
      "Neural Resonancer Pro",
    ],
    extremeSpecs: [
      "パンチ 205.6t〜 / キック 308.9t〜",
      "ジャンプ 1033.5m / 100m 0.002秒",
      "20,000YOPS / ∞Core · KHAOS Ultra",
      "5,000TOPS / 300Core · KOSMOS Ultra",
      "P14（Extreme tuning）",
    ],
    verdict:
      "同一単位・同系統では、KHAOS系YOPSが2.0倍、KOSMOS系TOPSが約16.67倍です。物理値は跳躍のみヴィンクルムが上回るため、優劣を一つの総合倍率にはまとめていません。",
    unavailable: [
      "演算のCore数と補助機構は構成差として併記し、YOPSとTOPSは別指標のまま比較しています。",
    ],
  },
};

const CORE_SYSTEMS = [
  {
    number: "01",
    code: "LEARNING",
    title: "受けた攻撃が、対抗策に。",
    body: "受けた攻撃と戦況を学習し、相手が同じ手で優位に立てないよう対抗手段を更新します。戦闘が続くほど、勝利へ至る経路が増えていきます。",
  },
  {
    number: "02",
    code: "DARK MATTER CHARGING",
    title: "暗黒物質を、戦う出力へ。",
    body: "戦況に応じて暗黒物質系の出力を充填し、増殖した戦闘経路を実行するためのエネルギーを供給します。生み出した選択肢を、実際の攻撃へ繋げます。",
  },
  {
    number: "03",
    code: "HIGH SUPREME",
    title: "決着を固定する。",
    body: "複数の可能性から決着へ至る結果を選び、攻撃・防御・修復を同じ結論へ収束させます。ウルトラでは50秒間、その固定を限界まで強化します。",
  },
] as const;

const releaseControlFocus = (control: HTMLElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
};

// Keep performance selection updates inside their own chapter.
const ExtremePerformance = memo(function ExtremePerformance() {
  const [baseline, setBaseline] = useState<ExtremeBaseline>("diluculum");
  const activeComparison = COMPARISONS[baseline];
  const selectPointerInteractionRef = useRef(false);

  const releaseSelectFocusAfterPointerChange = (control: HTMLSelectElement) => {
    if (!selectPointerInteractionRef.current) return;
    selectPointerInteractionRef.current = false;
    releaseControlFocus(control);
  };
  return (
    <section id="performance" className="rxs-performance rxs-section">
      <header className="rxs-section-heading rxs-reveal" data-exi-hit="">
        <p>PERFORMANCE COMPARISON</p>
        <h2>
          <span className="exo-line">肉弾戦なら、</span>
          <br />
          <span className="exo-line">話が早い。</span>
        </h2>
        <span>
          肉弾戦に最適化したエクスプリーム。
          <br />
          <span>既存の形態と並べた。</span>
          <span>負けた欄も、隠さない。</span>
        </span>
      </header>

      {/* IMPACT (rx11): the punch meter. The stage holds the two figures and
          hidden ornaments (focus lines, the shock ring, the cut between them,
          speed lines); a decorative tally runs over the owner's figure,
          which stays in the text. */}
      <div className="rxs-headline-metrics">
        <div className="exi-stage">
          <article className="rxs-reveal" data-exi-hit="" data-exi-line="mid">
            <small>PUNCH POWER / EXTREME</small>
            <strong>
              <b className="exi-figure">
                <b className="exi-real">205.6</b>
                <b className="exi-tally" aria-hidden="true" data-exi-tally="205.6" />
              </b>
              <span>t〜</span>
              <i className="exo-burst" aria-hidden="true" />
              <i className="exi-rays" aria-hidden="true">
                <svg
                  viewBox="-100 -100 200 200"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <use href="#exi-rays" x="-100" y="-100" width="200" height="200" />
                </svg>
              </i>
              <i className="exi-ring" aria-hidden="true" />
            </strong>
            <p>標準状態のパンチ力</p>
          </article>
          <article className="rxs-reveal" data-exi-hit="" data-exi-line="mid">
            <i className="exi-streaks" aria-hidden="true">
              <svg
                viewBox="0 0 200 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <use href="#exi-streaks" width="200" height="100" />
              </svg>
            </i>
            <small>100M TIME / EXTREME</small>
            <strong>
              0.002<span>SEC</span>
              <i className="exo-speed" aria-hidden="true" />
            </strong>
            <p>標準状態の100m走破時間</p>
          </article>
          <i className="exi-band" aria-hidden="true" />
        </div>
      </div>

      <div
        className="rxs-comparison rxs-reveal"
        aria-label="標準カタログ値の比較"
        data-exi-hit=""
        data-exi-rekey=""
      >
        <label className="rxs-comparison-selector">
          <span>比較する相手</span>
          <select
            value={baseline}
            aria-label="エクスプリームの比較対象"
            onPointerDown={() => {
              selectPointerInteractionRef.current = true;
            }}
            onKeyDown={() => {
              selectPointerInteractionRef.current = false;
            }}
            onBlur={() => {
              selectPointerInteractionRef.current = false;
            }}
            onChange={(event) => {
              const control = event.currentTarget;
              setBaseline(control.value as ExtremeBaseline);
              releaseSelectFocusAfterPointerChange(control);
            }}
          >
            <option value="diluculum">ディルクルムサーガ</option>
            <option value="vinculum">ヴィンクルムサーガ</option>
          </select>
        </label>
        <p className="rxs-comparison-formula">
          比較基準：<b>{activeComparison.label}＝100%</b>
        </p>
        <div className="rxs-comparison-key" aria-hidden="true">
          <span>
            <i className="is-rexonance" />
            エクスプリーム
          </span>
          <span>
            <i className="is-extreme" />
            {activeComparison.label}
          </span>
        </div>
        <div
          key={baseline}
          className="rxs-comparison-metrics"
          data-baseline={baseline}
          aria-live="polite"
          aria-atomic="true"
        >
          {activeComparison.metrics.map((metric) => (
            <article key={metric.label}>
              <header>
                <div>
                  <small>{metric.label}</small>
                  <strong>{metric.current}</strong>
                </div>
                <span className="rxs-comparison-result">
                  <i>基準比</i>
                  <b className="exi-figure">
                    <span className="exi-real">{metric.relative}</span>
                    <span
                      className="exi-tally"
                      aria-hidden="true"
                      data-exi-tally={metric.relative}
                    />
                  </b>
                  <em>
                    {metric.multiplier} / {metric.delta}
                  </em>
                </span>
              </header>
              <div
                className="rxs-bars"
                aria-label={`${metric.label}、${activeComparison.label}を100%としたエクスプリームの性能は${metric.relative}、${metric.multiplier}、差分${metric.delta}`}
              >
                {/* --exo-base: where the baseline's bar ends inside Extreme's
                    bar; the stretch beyond it is drawn as the overdrive. */}
                <i
                  className="is-rexonance"
                  style={{
                    width: `${metric.currentBar}%`,
                    ["--exo-base" as string]: `${Math.min(100, (metric.baselineBar / metric.currentBar) * 100).toFixed(1)}%`,
                  }}
                />
                <i className="is-extreme" style={{ width: `${metric.baselineBar}%` }} />
              </div>
              <p>
                {activeComparison.code} / {metric.previous}
                {metric.note ? <span> / {metric.note}</span> : null}
              </p>
            </article>
          ))}
        </div>

        <section
          key={`${baseline}-processing`}
          className="rxs-processing-comparison"
          aria-label={`${activeComparison.label}とエクスプリームの構成比較`}
        >
          <header>
            <small>CATALOG / PROCESSING ARCHITECTURE</small>
            <h3>同じ指標だけを、倍率へ。</h3>
          </header>
          <div>
            <section>
              <h4>{activeComparison.label}</h4>
              <ul>
                {activeComparison.baselineSpecs.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4>エクスプリーム</h4>
              <ul>
                {activeComparison.extremeSpecs.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          </div>
          <p>{activeComparison.verdict}</p>
          <ul className="exs-unavailable">
            {activeComparison.unavailable.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
      <p className="rxs-comparison-note rxs-reveal">
        主表示は選択形態を100%としたエクスプリームの性能比です。走力は100m所要時間の逆数から速度性能を換算しています。「est.」は推定値を示し、YOPSとTOPS、異なる演算系統、公開値不詳の項目は一つの倍率へ合算していません。
      </p>
    </section>
  );
});

export function ExtremeSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<ExtremeStage>("middle");
  // The form whose art the panel shows, and whether a reader has changed it
  // yet: the cut (styles-extreme-overdrive.css) never plays at first paint.
  const [shownStage, setShownStage] = useState<ExtremeStage>("middle");
  const [stageCut, setStageCut] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const lastCutRef = useRef(Number.NEGATIVE_INFINITY);

  const activeStage = EXTREME_STAGES[stage];
  const shownArt = EXTREME_STAGES[shownStage];

  useEffect(() => mountExtremeNavReserve(pageRef.current), []);
  useEffect(() => mountExtremeMotion(pageRef.current, setMotionReady), []);
  useEffect(() => mountExtremeImpact(pageRef.current), []);

  // A change of form cuts the art in before the next paint, unless the last
  // cut was under STAGE_CUT_GAP_MS ago; then it waits, and a reader who has
  // flicked back to the shown form in the meantime sees no cut at all.
  useLayoutEffect(() => {
    if (shownStage === stage) return;
    const cut = () => {
      lastCutRef.current = performance.now();
      setStageCut(true);
      setShownStage(stage);
    };
    const wait = lastCutRef.current + STAGE_CUT_GAP_MS - performance.now();
    if (wait <= 0) {
      cut();
      return;
    }
    const timer = window.setTimeout(cut, wait);
    return () => window.clearTimeout(timer);
  }, [stage, shownStage]);

  useEffect(() => {
    const rail = stageTabsRef.current;
    if (!rail) return;
    const stages = Object.keys(EXTREME_STAGES) as ExtremeStage[];
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const nextStage = typeof index === "number" ? stages[index] : undefined;
      if (nextStage) setStage(nextStage);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const constrained =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    const allowMotion = !media.matches && !constrained;

    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!allowMotion || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.1 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page exs-page"
      data-motion-ready={motionReady ? "true" : "false"}
    >
      <header className="rxs-local-nav">
        <div className="rxs-local-nav-inner">
          <GuardedLink
            className="rxs-brand"
            to="/world"
            hash="top"
            assets={WORLD_ENTER_ASSETS}
            aria-label="ディセプションワールドへ戻る"
          >
            <span>EXTREME</span>
            <b><DisplayName value="エクスプリームサーガ" /></b>
          </GuardedLink>
          <nav aria-label="エクスプリームサーガ ページ内ナビゲーション">
            <a href="#performance">比較</a>
            <a href="#p14">P14</a>
            <a href="#stages">形態</a>
            <a href="#system">システム</a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="extreme" open={menuOpen} onOpenChange={setMenuOpen} />
      <ExtremeImpactDefs />

      <section className="rxs-hero exs-hero" aria-labelledby="exs-title">
        <i className="exi-rays" aria-hidden="true" data-exi-depth="-0.5">
          <svg
            viewBox="-100 -100 200 200"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            focusable="false"
          >
            <use href="#exi-rays" x="-100" y="-100" width="200" height="200" />
          </svg>
        </i>
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-copy">
          <p>THE SUPREME ARRIVAL OF SA-GA</p>
          <h1 id="exs-title">
            <span>EXTREME SAGA</span>
            殴り合い、
            <br />
            歓迎。
          </h1>
          <p className="rxs-hero-lede">
            <span className="rxs-hero-lede-text">
              <span>戦うほど、勝ち筋が増す。</span>
              <span>長引くほど、こっちのもの。</span>
            </span>
          </p>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <i className="exs-dial" />
          <i className="exo-zone" />
          <i className="exo-rev" />
          <i className="exo-shock" />
          <img
            src="/saga-extreme-middle-20261006.webp"
            alt=""
            width="1023"
            height="1538"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <i className="exi-shards" aria-hidden="true" data-exi-depth="1.2">
          <svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
            <polygon points="-58,-34 -46,-29 -78,-49" />
            <polygon points="52,-41 63,-47 86,-66 66,-44" />
            <polygon points="-66,22 -52,18 -90,33" />
            <polygon points="60,30 72,33 94,44" />
            <polygon points="-24,-70 -18,-62 -31,-92" />
            <polygon points="30,-66 26,-74 40,-93" />
          </svg>
        </i>
        <a className="rxs-scroll-cue" href="#performance">
          <span>腕っぷしを、数字で。</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <nav className="rxs-chapter-index exs-chapter-index" aria-label="エクスプリームの見どころ">
        <a href="#p14">
          <small>P14</small>
          <span>演算コア</span>
          <i aria-hidden="true">↗</i>
        </a>
        <a href="#stages">
          <small>2 STAGES</small>
          <span>二つの形態</span>
          <i aria-hidden="true">↗</i>
        </a>
        <a href="#system">
          <small>SYSTEM</small>
          <span>中核システム</span>
          <i aria-hidden="true">↗</i>
        </a>
      </nav>

      <ExtremePerformance />

      <section id="p14" className="rxs-p14 rxs-section exs-p14" aria-labelledby="exs-p14-title">
        <header className="rxs-section-heading rxs-reveal" data-exi-hit="">
          <p>PROCESSING CORE / P14</p>
          <h2 id="exs-p14-title">
            <span className="exo-line">可能性は増やす。</span>
            <br />
            <span className="exo-line">答えは一つ。</span>
          </h2>
          <span>
            エクスプリーム専用のP14は、勝利経路の増殖と結果固定へ最適化された先行世代の演算コアです。KHAOS
            UltraとKOSMOS Ultraを統合し、増え続ける可能性を一つの実行可能な結果へ収束させます。
          </span>
        </header>

        <div className="rxs-p14-overview rxs-reveal" data-exi-hit="">
          <figure>
            <i className="exi-rays" aria-hidden="true">
              <svg
                viewBox="-100 -100 200 200"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true"
                focusable="false"
              >
                <use href="#exi-rays" x="-100" y="-100" width="200" height="200" />
              </svg>
            </i>
            <img
              src="/extreme-p14-core.jpg"
              alt="青い回路に接続されたP14演算コア"
              width="1000"
              height="1000"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div className="rxs-p14-copy">
            <small>P14 / EXTREME TUNING</small>
            <h3>選んだ結果を、勝利に固定する。</h3>
            <p>
              KHAOS UltraとKOSMOS
              Ultraを束ね、学習によって増えた可能性を実行可能な勝利経路へ整えます。競合や破綻を除外しながら経路を再評価し、最短の勝利条件へ収束させます。変換効率・応答・安定率の個別数値は未公表です。
            </p>
            <dl aria-label="エクスプリームのP14構成">
              <div className="exo-read">
                <dt>KHAOS Ultra</dt>
                <dd>
                  <span className="exi-figure">
                    <span className="exi-real">20,000</span>
                    <span className="exi-tally" aria-hidden="true" data-exi-tally="20,000" />
                  </span>
                  YOPS
                </dd>
              </div>
              <div className="exo-read">
                <dt>KOSMOS Ultra</dt>
                <dd>
                  <span className="exi-figure">
                    <span className="exi-real">5,000</span>
                    <span className="exi-tally" aria-hidden="true" data-exi-tally="5,000" />
                  </span>
                  TOPS
                </dd>
              </div>
              <div className="exo-read">
                <dt>TUNING</dt>
                <dd>結果固定</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="exs-p14-comparison rxs-reveal">
          <article>
            <small>P14 / EXPANSION</small>
            <h3>
              <span>戦況から、</span>
              <span>勝ち筋を</span>
              <span>生み出す。</span>
            </h3>
            <p>KHAOS Ultra 20,000YOPSが、戦況から成立可能な勝利経路を継続的に生成します。</p>
          </article>
          <span className="exo-arrow" aria-hidden="true">
            →
          </span>
          <article>
            <small>P14 / FIXATION</small>
            <h3>勝ち筋を、実行できる形へ。</h3>
            <p>KOSMOS Ultra 5,000TOPSが競合する経路を整理し、実行可能な勝利条件へ収束させます。</p>
            <i className="exo-lock" aria-hidden="true" />
          </article>
        </div>
        <p className="rxs-comparison-note rxs-reveal">
          P14は二つの演算系統を直列の役割として接続します。
        </p>
      </section>

      <section id="stages" className="rxs-stages rxs-section">
        <header className="rxs-section-heading rxs-reveal" data-exi-hit="">
          <p>TWO OPERATING STAGES</p>
          <h2>
            <span className="exo-line">ミドルで育てて、</span>
            <br />
            <span className="exo-line">ウルトラで決める。</span>
          </h2>
        </header>

        <div className="rxs-stage-switcher rxs-reveal">
          <div
            ref={stageTabsRef}
            className="rxs-stage-tabs liquid-swipe-tabs exs-stage-tabs"
            role="tablist"
            aria-label="エクスプリームの運用段階"
            aria-describedby="exs-stage-hint"
            data-liquid-glass="true"
            data-stage={stage}
          >
            <LiquidLens />
            {(Object.keys(EXTREME_STAGES) as ExtremeStage[]).map((key) => (
              <button
                key={key}
                id={`exs-stage-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={stage === key}
                aria-controls="exs-stage-panel"
                tabIndex={stage === key ? 0 : -1}
                className={stage === key ? "is-active" : ""}
                style={{ ["--liquid-accent" as string]: EXTREME_STAGES[key].accent }}
                onClick={() => setStage(key)}
                onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
              >
                <span>{EXTREME_STAGES[key].label}</span>
                <small>{EXTREME_STAGES[key].code}</small>
              </button>
            ))}
          </div>
          <p id="exs-stage-hint" className="rxs-stage-hint">
            タップ・長押し・左右スライド・矢印キーで切り替え
          </p>

          <div
            id="exs-stage-panel"
            className="rxs-stage-panel"
            role="tabpanel"
            aria-labelledby={`exs-stage-tab-${stage}`}
            aria-live="polite"
            data-exo-cut={stageCut ? "true" : undefined}
            data-exi-warm={`${EXTREME_STAGES.middle.image} ${EXTREME_STAGES.ultra.image}`}
          >
            <figure key={shownStage} data-form={shownStage}>
              <i className="exi-streaks" aria-hidden="true">
                <svg
                  viewBox="0 0 200 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <use href="#exi-streaks" width="200" height="100" />
                </svg>
              </i>
              <span className="exo-frame" aria-hidden="true" />
              <img
                src={shownArt.image}
                alt={shownArt.alt}
                width={shownArt.width}
                height={shownArt.height}
                loading={shownStage === "middle" ? "eager" : "lazy"}
                decoding="async"
              />
              <i className="exo-slash" aria-hidden="true" />
              <i className="exi-rays" aria-hidden="true">
                <svg
                  viewBox="-100 -100 200 200"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                  focusable="false"
                >
                  <use href="#exi-rays" x="-100" y="-100" width="200" height="200" />
                </svg>
              </i>
            </figure>
            <div key={`${stage}-copy`}>
              <small>{activeStage.code}</small>
              {/* Two lines at every width, broken after the 、, so a change
                  of form never moves the figure under the title. */}
              <h3>
                <span className="exo-title-line">
                  {activeStage.title.slice(0, activeStage.title.indexOf("、") + 1)}
                </span>
                <span className="exo-title-line">
                  {activeStage.title.slice(activeStage.title.indexOf("、") + 1)}
                </span>
              </h3>
              <p>{activeStage.lede}</p>
              <ul>
                {activeStage.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="system" className="rxs-system rxs-section exs-system">
        <header className="rxs-section-heading rxs-reveal" data-exi-hit="">
          <p>EXTREME ARCHITECTURE</p>
          <h2>
            <span className="exo-line">学習、充填、</span>
            <br />
            <span className="exo-line">結果固定。</span>
          </h2>
        </header>

        <div className="rxs-system-grid">
          {CORE_SYSTEMS.map((system) => (
            <article key={system.number} className="rxs-reveal">
              <header>
                <span className="exo-number">{system.number}</span>
                <small>{system.code}</small>
              </header>
              <h3>{system.title}</h3>
              <p>{system.body}</p>
            </article>
          ))}
        </div>

        <div className="rxs-specs rxs-reveal">
          <div>
            <small>KHAOS Ultra</small>
            <strong>
              20,000<span>YOPS</span>
            </strong>
            <p>∞ CORE</p>
          </div>
          <i className="exo-joint" aria-hidden="true" />
          <div>
            <small>KOSMOS Ultra</small>
            <strong>
              5,000<span>TOPS</span>
            </strong>
            <p>300 CORE</p>
          </div>
        </div>
      </section>

      <footer className="rxs-footer">
        <i className="exi-rays" aria-hidden="true">
          <svg
            viewBox="-100 -100 200 200"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            focusable="false"
          >
            <use href="#exi-rays" x="-100" y="-100" width="200" height="200" />
          </svg>
        </i>
        <div>
          <p>EXTREME SAGA / SUPREME ARRIVAL</p>
          <h2>
            <span className="exo-line">長期戦なら、</span>
            <br />
            <span className="exo-line">なおさら歓迎。</span>
          </h2>
        </div>
        <GuardedLink to="/riders/saga" assets={[]} className="exo-door">
          <span>人物・能力の詳細を見る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink to="/form-archive" assets={[]} className="exo-door">
          <span>全形態を比較する</span>
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
