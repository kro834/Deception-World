import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";

type ExtremeStage = "middle" | "ultra";
type ExtremeBaseline = "diluculum" | "vinculum";

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
    title: string;
    lede: string;
    points: readonly string[];
    accent: string;
  }
> = {
  middle: {
    label: "エクスプリーム",
    code: "MIDDLE",
    image: "/saga-extreme-middle.webp",
    alt: "仮面ライダーエクスプリームサーガの全身ビジュアル",
    title: "可能性を増殖し、勝利へ束ねる。",
    lede: "学習した攻撃と戦況から勝利へ至る経路を増殖し、状況ごとに最適な結果を選び取る標準状態。長期戦ほど選択肢を増やし、相手の優位を狭めます。",
    points: ["LEARNING", "DARK MATTER CHARGING", "HIGH SUPREME"],
    accent: "#5edcff",
  },
  ultra: {
    label: "ウルトラ",
    code: "ULTRA / 50 SEC",
    image: "/saga-extreme-ultra.jpeg",
    alt: "仮面ライダーエクスプリームサーガ・ウルトラの全身ビジュアル",
    title: "ただ一つの結果だけを、残す。",
    lede: "無数に増殖した可能性を一つの勝利結果へ固定し、攻撃・防御・修復を同じ結論へ収束。50秒間だけ成立する、短期決着の最上位状態です。",
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
    title: "攻撃を、次の解答へ。",
    body: "受けた攻撃と戦況を学習し、同じ優位を相手へ許さないための対抗手段を更新。戦闘が続くほど、勝利へ至る経路を増やします。",
  },
  {
    number: "02",
    code: "DARK MATTER CHARGING",
    title: "出力を、内側から補う。",
    body: "戦況に応じて暗黒物質系の出力を充填し、増殖した戦闘経路を実行可能なエネルギーへ接続。選択肢だけで終わらせず、攻撃へ変換します。",
  },
  {
    number: "03",
    code: "HIGH SUPREME",
    title: "勝利結果を、固定する。",
    body: "複数の可能性から決着へ至る結果を選び、攻撃・防御・修復を同じ結論へ収束。ウルトラでは50秒間、その固定を限界まで強化します。",
  },
] as const;

export function ExtremeSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<ExtremeStage>("middle");
  const [baseline, setBaseline] = useState<ExtremeBaseline>("diluculum");
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const activeStage = EXTREME_STAGES[stage];
  const activeComparison = COMPARISONS[baseline];

  const releaseControlFocus = (control: HTMLElement) => {
    window.requestAnimationFrame(() => {
      if (document.activeElement === control) control.blur();
    });
  };

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
    setMotionReady(allowMotion);

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

  useEffect(() => {
    if (!motionReady) return;
    const page = pageRef.current;
    if (!page) return;
    let frame = 0;
    let lastProgress = -1;
    const update = () => {
      frame = 0;
      const viewportHeight = window.visualViewport?.height || window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, window.scrollY / viewportHeight));
      if (Math.abs(progress - lastProgress) < 0.002) return;
      lastProgress = progress;
      page.style.setProperty("--rxs-hero-progress", progress.toFixed(3));
    };
    const onScroll = () => {
      if (!frame && document.visibilityState === "visible") {
        frame = window.requestAnimationFrame(update);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onScroll();
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [motionReady]);

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
            <b>エクスプリームサーガ</b>
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

      <section className="rxs-hero exs-hero" aria-labelledby="exs-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-copy">
          <p>THE SUPREME ARRIVAL OF SA-GA</p>
          <h1 id="exs-title">
            <span>EXTREME SAGA</span>
            至高、
            <br />
            極まれり
          </h1>
          <p className="rxs-hero-lede">可能性を、勝利という結果へ。</p>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <img
            src="/saga-extreme-middle.webp"
            alt=""
            width="851"
            height="1280"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <a className="rxs-scroll-cue" href="#performance">
          <span>性能を比較する</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section id="performance" className="rxs-performance rxs-section">
        <header className="rxs-section-heading rxs-reveal">
          <p>PERFORMANCE COMPARISON</p>
          <h2>
            数字を揃えて、
            <br />
            正しく比べる。
          </h2>
          <span>
            ディルクルムサーガまたはヴィンクルムサーガを100%として、公開済みの標準カタログ値だけを換算しています。
          </span>
        </header>

        <div className="rxs-headline-metrics">
          <article className="rxs-reveal">
            <small>PUNCH POWER / EXTREME</small>
            <strong>
              205.6<span>t〜</span>
            </strong>
            <p>標準状態のパンチ力</p>
          </article>
          <article className="rxs-reveal">
            <small>100M TIME / EXTREME</small>
            <strong>
              0.002<span>SEC</span>
            </strong>
            <p>標準状態の100m走破時間</p>
          </article>
        </div>

        <div className="rxs-comparison rxs-reveal" aria-label="標準カタログ値の比較">
          <label className="rxs-comparison-selector">
            <span>iOS標準選択</span>
            <select
              value={baseline}
              aria-label="エクスプリームの比較対象"
              onChange={(event) => {
                const control = event.currentTarget;
                setBaseline(control.value as ExtremeBaseline);
                releaseControlFocus(control);
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
                    <b>{metric.relative}</b>
                    <em>
                      {metric.multiplier} / {metric.delta}
                    </em>
                  </span>
                </header>
                <div
                  className="rxs-bars"
                  aria-label={`${metric.label}、${activeComparison.label}を100%としたエクスプリームの性能は${metric.relative}、${metric.multiplier}、差分${metric.delta}`}
                >
                  <i className="is-rexonance" style={{ width: `${metric.currentBar}%` }} />
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

      <section id="p14" className="rxs-p14 rxs-section exs-p14" aria-labelledby="exs-p14-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>PROCESSING CORE / P14</p>
          <h2 id="exs-p14-title">
            同じP14。
            <br />
            到達点は、異なる。
          </h2>
          <span>
            エクスプリーム専用のP14は、勝利経路の増殖と結果固定へ最適化された先行世代の演算コアです。KHAOS
            UltraとKOSMOS Ultraを統合し、増え続ける可能性を一つの実行可能な結果へ収束させます。
          </span>
        </header>

        <div className="rxs-p14-overview rxs-reveal">
          <figure>
            <img
              src="/rexonance-p14-core.jpg"
              alt="青い回路に接続されたP14演算コア"
              width="1254"
              height="1254"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div className="rxs-p14-copy">
            <small>P14 / EXTREME TUNING</small>
            <h3>結果を選び、固定する。</h3>
            <p>
              KHAOS UltraとKOSMOS
              Ultraを束ね、学習によって増えた可能性を実行可能な勝利経路へ整えます。競合や破綻を除外しながら経路を再評価し、最短の勝利条件へ収束。変換効率・応答・安定率の個別数値は未公表のため、推測値では補いません。
            </p>
            <dl aria-label="エクスプリームのP14構成">
              <div>
                <dt>KHAOS Ultra</dt>
                <dd>20,000YOPS</dd>
              </div>
              <div>
                <dt>KOSMOS Ultra</dt>
                <dd>5,000TOPS</dd>
              </div>
              <div>
                <dt>TUNING</dt>
                <dd>結果固定</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="exs-p14-comparison rxs-reveal">
          <article>
            <small>P14 / EXPANSION</small>
            <h3>可能性を増殖する</h3>
            <p>KHAOS Ultra 20,000YOPSが戦況から成立可能な勝利経路を継続的に生成。</p>
          </article>
          <span aria-hidden="true">→</span>
          <article>
            <small>P14 / FIXATION</small>
            <h3>結果を一つへ固定する</h3>
            <p>KOSMOS Ultra 5,000TOPSが競合する経路を整理し、実行可能な勝利条件へ収束。</p>
          </article>
        </div>
        <p className="rxs-comparison-note rxs-reveal">
          P14は二つの演算系統を直列の役割として接続します。演算器の公開値だけで変換効率を逆算せず、未公表の数値は未公表のまま扱っています。
        </p>
      </section>

      <section id="stages" className="rxs-stages rxs-section">
        <header className="rxs-section-heading rxs-reveal">
          <p>TWO OPERATING STAGES</p>
          <h2>
            増やす。
            <br />
            そして、一つへ。
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
            タップ、長押し、または左右へのスライドで切り替え
          </p>

          <div id="exs-stage-panel" className="rxs-stage-panel" role="tabpanel" aria-live="polite">
            <figure key={stage}>
              <span aria-hidden="true" />
              <img
                src={activeStage.image}
                alt={activeStage.alt}
                width={stage === "middle" ? 851 : 993}
                height={stage === "middle" ? 1280 : 1497}
                loading={stage === "middle" ? "eager" : "lazy"}
                decoding="async"
              />
            </figure>
            <div key={`${stage}-copy`}>
              <small>{activeStage.code}</small>
              <h3>{activeStage.title}</h3>
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
        <header className="rxs-section-heading rxs-reveal">
          <p>EXTREME ARCHITECTURE</p>
          <h2>
            勝利へ至る道を、
            <br />
            システムにする。
          </h2>
        </header>

        <div className="rxs-system-grid">
          {CORE_SYSTEMS.map((system) => (
            <article key={system.number} className="rxs-reveal">
              <header>
                <span>{system.number}</span>
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
          <i aria-hidden="true">×</i>
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
        <div>
          <p>EXTREME SAGA / SUPREME ARRIVAL</p>
          <h2>至高は、勝利という結果になる。</h2>
        </div>
        <GuardedLink to="/riders/saga" assets={[]}>
          <span>人物・能力の詳細を見る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
      </footer>
    </main>
  );
}
