import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";

type RexonanceStage = "standard" | "max" | "ultra";
type P14Baseline = "p1" | "p2";

const STAGES: Record<
  RexonanceStage,
  {
    label: string;
    code: string;
    image: string;
    alt: string;
    title: string;
    lede: string;
    points: readonly string[];
  }
> = {
  standard: {
    label: "スタンダード",
    code: "HIGH",
    image: "/rider-rexonance-saga-pickup.jpeg",
    alt: "仮面ライダーレクソナンスサーガの全身ビジュアル",
    title: "無限出力を、実効攻撃へ。",
    lede: "超自己進化と絶対秩序をSA-GA OS 5.5で統合。標準運用の時点で、エクスプリーム・ウルトラ以上の実効戦闘性能を高い安定性で維持します。",
    points: ["高安定・高継戦", "REXONANCE DRIVE", "標準カタログ値を公開"],
  },
  max: {
    label: "マックス",
    code: "MAX",
    image: "/rider-rexonance-max.webp",
    alt: "仮面ライダーレクソナンスサーガ・マックスの全身ビジュアル",
    title: "全身を、一撃のために。",
    lede: "P14を完全加速し、全神飾を攻撃用機構へ連続実装。動作の途中で出力を必要部位へ何度も移し替え、攻撃限界を拡張します。",
    points: ["P14完全加速", "SCALER《MAX》", "出力の連続再配分"],
  },
  ultra: {
    label: "ウルトラ",
    code: "ULTRA / 60 SEC",
    image: "/rider-rexonance-ultra.webp",
    alt: "仮面ライダーレクソナンスサーガ・ウルトラの全身ビジュアル",
    title: "ただ一つの実在へ、収束する。",
    lede: "身体、武装、リアクター、極小主権宇宙を一つの巨大な攻撃機関へ統合。60秒間、全演算・神属権限・出力を現在の一動作へ集中します。",
    points: ["単一実在収束", "SCALER《ULTRA》", "60秒間の最上位状態"],
  },
};

const COMPARISONS = [
  {
    label: "パンチ力",
    current: "332.2t",
    previous: "205.6t",
    gain: "+61.6%",
    bar: 62,
  },
  {
    label: "キック力",
    current: "480.5t",
    previous: "308.9t",
    gain: "+55.6%",
    bar: 64,
  },
  {
    label: "ジャンプ力",
    current: "6000m",
    previous: "1033.5m",
    gain: "+480.6%",
    bar: 17,
  },
  {
    label: "100m走",
    current: "0.00021秒",
    previous: "0.002秒",
    gain: "−89.5%",
    bar: 11,
  },
] as const;

const P14_METRICS = [
  {
    label: "同じエーテル量で発揮する性能",
    p1: "100%",
    p2: "180%",
    p14: "900%",
    delta: { p1: "9.0倍 / +800%", p2: "5.0倍 / +400%" },
    deltaLabel: "性能向上",
  },
  {
    label: "実効変換率",
    p1: "10%",
    p2: "18%",
    p14: "90%",
    delta: { p1: "9.0倍 / +800%", p2: "5.0倍 / +400%" },
    deltaLabel: "変換率向上",
  },
  {
    label: "熱として失われる割合",
    p1: "35%",
    p2: "25%",
    p14: "3%",
    delta: { p1: "−91.4%", p2: "−88.0%" },
    deltaLabel: "損失削減",
  },
  {
    label: "位相ノイズとして失われる割合",
    p1: "25%",
    p2: "18%",
    p14: "2%",
    delta: { p1: "−92.0%", p2: "−88.9%" },
    deltaLabel: "損失削減",
  },
  {
    label: "能力間干渉による損失",
    p1: "20%",
    p2: "14%",
    p14: "2%",
    delta: { p1: "−90.0%", p2: "−85.7%" },
    deltaLabel: "損失削減",
  },
  {
    label: "高負荷時の出力低下",
    p1: "約35%",
    p2: "約18%",
    p14: "約4%",
    delta: { p1: "約−88.6%", p2: "約−77.8%" },
    deltaLabel: "低下率削減",
  },
  {
    label: "出力変更への応答時間",
    p1: "約1.0ms",
    p2: "約0.45ms",
    p14: "約0.06ms",
    delta: { p1: "約−94.0%", p2: "約−86.7%" },
    deltaLabel: "応答時間短縮",
  },
  {
    label: "瞬間的な負荷変動への追従率",
    p1: "62%",
    p2: "81%",
    p14: "99.4%",
    delta: { p1: "+60.3%", p2: "+22.7%" },
    deltaLabel: "追従率向上",
  },
  {
    label: "連続最大出力時の安定率",
    p1: "58%",
    p2: "79%",
    p14: "96%",
    delta: { p1: "+65.5%", p2: "+21.5%" },
    deltaLabel: "安定率向上",
  },
] as const;

const CORE_SYSTEMS = [
  {
    number: "01",
    code: "EVOLUTION",
    title: "超自己進化",
    body: "観測した敵能力と戦況から、次世代の装甲・演算・権限構造を生成。戦闘中にも攻撃の周波数、位相、権限署名を更新し続けます。",
  },
  {
    number: "02",
    code: "ABSOLUTE ORDER",
    title: "絶対秩序",
    body: "進化した要素へ境界と役割を与え、破綻のない戦闘体系として即時に固定。進化を止めず、同時に自己崩壊を防ぎます。",
  },
  {
    number: "03",
    code: "HUMAN WILL",
    title: "月城悠真の意思",
    body: "レックスとゼウスを融合で消さず、独立したまま超共鳴。何を破壊し、何を残すかという最終決定権は常に悠真へ固定されます。",
  },
] as const;

export function RexonanceSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<RexonanceStage>("standard");
  const [p14Baseline, setP14Baseline] = useState<P14Baseline>("p1");
  const [nativeIOSSelection, setNativeIOSSelection] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const activeStage = STAGES[stage];
  const syncP14Baseline = (value: number) => setP14Baseline(value >= 2 ? "p2" : "p1");

  useEffect(() => {
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setNativeIOSSelection(isIOSDevice);
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
      { rootMargin: "0px 0px -10%", threshold: 0.12 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!motionReady) return;
    const page = pageRef.current;
    if (!page) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
      page.style.setProperty("--rxs-hero-progress", progress.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [motionReady]);

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page"
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
            <span>REXONANCE</span>
            <b>レクソナンスサーガ</b>
          </GuardedLink>
          <nav aria-label="レクソナンスサーガ ページ内ナビゲーション">
            <a href="#performance">性能</a>
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

      <SideMenuLayer context="rexonance" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="rxs-hero" aria-labelledby="rxs-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-copy">
          <p>THE NEXT GENERATION OF SA-GA</p>
          <h1 id="rxs-title">
            <span>REXONANCE SAGA</span>
            限りなく、
            <br />
            限りない
          </h1>
          <p className="rxs-hero-lede">史上最強のサーガ</p>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <img
            src="/rider-rexonance-saga-pickup.jpeg"
            alt=""
            width="1200"
            height="1600"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <a className="rxs-scroll-cue" href="#performance">
          <span>性能を見る</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section id="performance" className="rxs-performance rxs-section">
        <header className="rxs-section-heading rxs-reveal">
          <p>PERFORMANCE</p>
          <h2>
            比較にならない。
            <br />
            それが、標準状態。
          </h2>
          <span>公開済みの標準カタログ値で、エクスプリームサーガ標準値と比較しています。</span>
        </header>

        <div className="rxs-headline-metrics">
          <article className="rxs-reveal">
            <small>REACTION / VS VINCULUM</small>
            <strong>
              650<span>%+</span>
            </strong>
            <p>ヴィンクルムサーガと比較した反応速度</p>
          </article>
          <article className="rxs-reveal">
            <small>MOBILITY / VS EXTREME</small>
            <strong>
              900<span>%</span>
            </strong>
            <p>エクスプリームサーガと比較した最大機動力</p>
          </article>
        </div>

        <div className="rxs-comparison rxs-reveal" aria-label="標準カタログ値の比較">
          <div className="rxs-comparison-key" aria-hidden="true">
            <span>
              <i className="is-rexonance" />
              レクソナンス
            </span>
            <span>
              <i className="is-extreme" />
              エクスプリーム
            </span>
          </div>
          {COMPARISONS.map((metric) => (
            <article key={metric.label}>
              <header>
                <div>
                  <small>{metric.label}</small>
                  <strong>{metric.current}</strong>
                </div>
                <b>{metric.gain}</b>
              </header>
              <div
                className="rxs-bars"
                aria-label={`${metric.label}、レクソナンス${metric.current}、エクスプリーム${metric.previous}`}
              >
                <i className="is-rexonance" />
                <i className="is-extreme" style={{ width: `${metric.bar}%` }} />
              </div>
              <p>EXTREME STANDARD / {metric.previous}</p>
            </article>
          ))}
        </div>
        <p className="rxs-comparison-note rxs-reveal">
          100m走は所要時間の短縮率です。各値は最大出力ではなく標準運用値であり、マックス／ウルトラの定量上限を示すものではありません。
        </p>
      </section>

      <section id="p14" className="rxs-p14 rxs-section" aria-labelledby="rxs-p14-title">
        <header className="rxs-section-heading rxs-reveal">
          <p>PROCESSING CORE / P14</p>
          <h2 id="rxs-p14-title">
            エーテルを、
            <br />
            ほぼそのまま力へ。
          </h2>
          <span>
            P14は、出力変換・位相制御・能力間調停を一体化した第14世代演算基盤です。同じエーテル量からP1の9倍に相当する性能を引き出し、熱・位相ノイズ・能力間干渉による損失を合計7%まで抑えます。
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
            <small>P14 / FOURTEENTH GENERATION</small>
            <h3>速く、強く、失わない。</h3>
            <p>
              入力されたエーテルを攻撃・機動・防御へ変換する際の損失を局所ごとに抑え、必要な部位へ出力を再配分します。急激な負荷変動にも99.4%で追従し、連続最大出力でも96%の安定率を維持。マックスでは、このP14を完全加速して全神飾の連続実装を支えます。
            </p>
            <dl aria-label="P14の主要指標">
              <div>
                <dt>実効変換率</dt>
                <dd>90%</dd>
              </div>
              <div>
                <dt>応答時間</dt>
                <dd>約0.06ms</dd>
              </div>
              <div>
                <dt>最大出力安定率</dt>
                <dd>96%</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rxs-p14-comparator rxs-reveal">
          <header>
            <div>
              <small>GENERATION COMPARISON</small>
              <h3>P14 / {p14Baseline.toUpperCase()}比</h3>
            </div>
            <output htmlFor="rxs-p14-baseline">{p14Baseline.toUpperCase()}比</output>
          </header>

          <div className="rxs-p14-range-control" data-baseline={p14Baseline}>
            <div className="rxs-p14-range-labels">
              <button
                type="button"
                className={p14Baseline === "p1" ? "is-active" : undefined}
                aria-pressed={p14Baseline === "p1"}
                onClick={() => setP14Baseline("p1")}
              >
                P1比
              </button>
              <button
                type="button"
                className={p14Baseline === "p2" ? "is-active" : undefined}
                aria-pressed={p14Baseline === "p2"}
                onClick={() => setP14Baseline("p2")}
              >
                P2比
              </button>
            </div>
            {nativeIOSSelection ? (
              <label className="rxs-p14-native-select">
                <span>iOS標準選択</span>
                <select
                  id="rxs-p14-baseline"
                  value={p14Baseline}
                  aria-label="P14の比較基準"
                  onChange={(event) => setP14Baseline(event.currentTarget.value as P14Baseline)}
                >
                  <option value="p1">P1比</option>
                  <option value="p2">P2比</option>
                </select>
              </label>
            ) : (
              <div className="rxs-p14-ios-slider" data-value={p14Baseline}>
                <span className="rxs-p14-ios-track" aria-hidden="true">
                  <i />
                </span>
                <span className="rxs-p14-ios-thumb" aria-hidden="true" />
                <input
                  id="rxs-p14-baseline"
                  type="range"
                  min="1"
                  max="2"
                  step="1"
                  value={p14Baseline === "p1" ? 1 : 2}
                  aria-label="P14の比較対象"
                  aria-valuetext={`比較対象 ${p14Baseline.toUpperCase()}`}
                  onInput={(event) => syncP14Baseline(event.currentTarget.valueAsNumber)}
                  onChange={(event) => syncP14Baseline(event.currentTarget.valueAsNumber)}
                  onPointerUp={(event) => syncP14Baseline(event.currentTarget.valueAsNumber)}
                  onTouchEnd={(event) => syncP14Baseline(event.currentTarget.valueAsNumber)}
                />
              </div>
            )}
            <p>
              {nativeIOSSelection
                ? "iOS標準選択から、P14の比較基準をP1比またはP2比へ切り替えられます。"
                : "スライダーを動かすか両端をタップして、P14の比較基準をP1比またはP2比へ切り替えられます。"}
            </p>
          </div>

          <div
            key={p14Baseline}
            className="rxs-p14-metrics"
            data-baseline={p14Baseline}
            aria-live="polite"
            aria-atomic="true"
          >
            {P14_METRICS.map((metric) => (
              <article key={metric.label}>
                <small>{metric.label}</small>
                <div className="rxs-p14-values">
                  <span>
                    <i>{p14Baseline.toUpperCase()}比</i>
                    <b>{metric[p14Baseline]}</b>
                  </span>
                  <span>
                    <i>P14</i>
                    <strong>{metric.p14}</strong>
                  </span>
                </div>
                <p key={`${metric.label}-${p14Baseline}`}>
                  <span>{metric.deltaLabel}</span>
                  <b>{metric.delta[p14Baseline]}</b>
                </p>
              </article>
            ))}
          </div>
          <p className="rxs-p14-method-note">
            向上率は選択中の比較基準（P1比／P2比）から算出しています。損失割合、高負荷時の出力低下、応答時間は、値が小さいほど高性能なため削減率・短縮率で表示しています。
          </p>
        </div>
      </section>

      <section id="stages" className="rxs-stages rxs-section">
        <header className="rxs-section-heading rxs-reveal">
          <p>THREE OPERATING STAGES</p>
          <h2>
            状況に合わせて、
            <br />
            攻撃そのものを再設計。
          </h2>
        </header>

        <div className="rxs-stage-switcher rxs-reveal">
          <div
            className="rxs-stage-tabs"
            role="tablist"
            aria-label="レクソナンスの運用段階"
            data-liquid-glass="true"
            data-stage={stage}
          >
            <span className="rxs-stage-liquid-indicator" aria-hidden="true" />
            {(Object.keys(STAGES) as RexonanceStage[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={stage === key}
                aria-controls="rxs-stage-panel"
                onClick={() => setStage(key)}
              >
                <span>{STAGES[key].label}</span>
                <small>{STAGES[key].code}</small>
              </button>
            ))}
          </div>

          <div id="rxs-stage-panel" className="rxs-stage-panel" role="tabpanel" aria-live="polite">
            <figure key={stage}>
              <span aria-hidden="true" />
              <img
                src={activeStage.image}
                alt={activeStage.alt}
                width={stage === "max" ? 1086 : 1200}
                height={stage === "max" ? 1448 : 1600}
                loading={stage === "standard" ? "eager" : "lazy"}
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

      <section id="system" className="rxs-system rxs-section">
        <header className="rxs-section-heading rxs-reveal">
          <p>TRINITY RESONANCE</p>
          <h2>
            三者は消えない。
            <br />
            独立したまま、響き合う。
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
            <small>KHAOS DeuX</small>
            <strong>
              50,000<span>YOPS</span>
            </strong>
            <p>∞ CORE</p>
          </div>
          <i aria-hidden="true">×</i>
          <div>
            <small>KOSMOS DeuX</small>
            <strong>
              9,000<span>TOPS</span>
            </strong>
            <p>300 CORE</p>
          </div>
        </div>
      </section>

      <footer className="rxs-footer">
        <div>
          <p>REXONANCE SAGA / FINAL ARRIVAL</p>
          <h2>この力を、誰のために使うのか。</h2>
        </div>
        <GuardedLink to="/riders/saga" assets={[]}>
          <span>人物・能力の詳細を見る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink to="/form-archive" assets={[]}>
          <span>全形態を比較する</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
      </footer>
    </main>
  );
}
