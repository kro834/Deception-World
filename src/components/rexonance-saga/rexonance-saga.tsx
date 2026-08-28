import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";

type RexonanceStage = "standard" | "max" | "ultra";

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
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const activeStage = STAGES[stage];

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
          <div className="rxs-stage-tabs" role="tablist" aria-label="レクソナンスの運用段階">
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
