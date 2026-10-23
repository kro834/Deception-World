import { useId, useState, type CSSProperties } from "react";
import {
  P16_CAVEATS,
  P16_FUNCTIONS,
  P16_HEAT_NOTE,
  P16_INTRO,
  P16_LINEAGE,
  P16_METRICS,
  P16_TOPICS,
  P16_VS_EXTREME,
  P16_VS_P2,
  EXTREME_P14_NAME,
  p16AgainstExtreme,
  p16AgainstExtremeText,
  p16ChangeAgainstExtremeText,
  type ExtremeP14Metric,
  type P16Metric,
} from "./far-from-p16-data";

/* #p16 — 『P16』, from the owner's comparison text (2026-10-22).

   Every sentence here is the owner's, quoted whole from the two
   【P16・第16世代演算加速機構】 chapters (far-from-p16-data.ts). The figures
   are only the ones those sentences state: the provisional benchmark against
   P14 (+50% / −35% / −40% / −27%) and Vinculum's P2 (約3倍, 暫定). Wherever
   they appear the chapter says 暫定ベンチマーク. The one set of figures that
   is not the owner's is P16 / P14（Extreme tuning）(owner, 2026-10-23:
   「P14との性能差は想像して生成してみて」), labelled 暫定ベンチマーク／設定案
   with its note, beside the owner's sentence naming Extreme's P14. */

type Baseline = "p14" | "p2" | "extreme";

const BASELINES: readonly { key: Baseline; label: string }[] = [
  { key: "p14", label: "P14比" },
  { key: "p2", label: "P2比" },
  { key: "extreme", label: "エクスプリーム" },
];

/** The header's name for each comparison. */
const TITLES: Record<Baseline, string> = {
  p14: "P14比",
  p2: "P2比",
  extreme: `エクスプリーム ${EXTREME_P14_NAME}`,
};

/** +50% / −35%: the owner's figure with its sign. */
const signed = (change: number) => `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;

const barStyle = (fraction: number) =>
  ({ ["--ffs-bar" as string]: Math.max(0, Math.min(1, fraction)) }) as CSSProperties;

function ProvisionalTag() {
  return <span className="ffs-provisional-tag">暫定ベンチマーク</span>;
}

/** The drawn stand-in for P16's artwork: a package, its pins and a die. */
function P16Core() {
  // The owner's P16 artwork (2026-10-23), as Rexonance shows its P14 core.
  return (
    <figure className="ffs-p16-core">
      <img
        src="/far-from-p16-core-20261023-720.webp"
        srcSet="/far-from-p16-core-20261023-720.webp 720w, /far-from-p16-core-20261023.webp 1254w"
        sizes="(max-width: 760px) 92vw, min(46vw, 560px)"
        alt="青と紫の光に囲まれたP16演算コア"
        width="1254"
        height="1254"
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}

function MetricRow({ metric }: { metric: P16Metric }) {
  const p16 = 100 + metric.change;
  const longer = Math.max(p16, 100);
  return (
    <article className="ffs-p16-metric">
      <small>{metric.label}</small>
      <div className="ffs-p16-values">
        <span>
          <i>P14（基準）</i>
          <b>100%</b>
        </span>
        <span>
          <i>P16（換算）</i>
          <strong>{p16}%</strong>
        </span>
      </div>
      <div
        className="ffs-p16-bars"
        role="img"
        aria-label={`${metric.label}、P14を100%としたP16は${p16}%、${Math.abs(metric.change)}%${metric.verb}（暫定ベンチマーク）`}
      >
        <span data-unit="p14">
          <i style={barStyle(100 / longer)} />
        </span>
        <span data-unit="p16">
          <i style={barStyle(p16 / longer)} />
        </span>
      </div>
      <p>
        <span>{metric.lowerIsBetter ? "低いほど優秀" : "高いほど優秀"}</span>
        <b>
          {signed(metric.change)} {metric.verb}
        </b>
      </p>
    </article>
  );
}

/** P16 with Extreme's P14 (Extreme tuning) at 100%: the 設定案. */
function ExtremeMetricRow({ metric }: { metric: ExtremeP14Metric }) {
  const p16 = p16AgainstExtreme(metric);
  const approxText = p16AgainstExtremeText(metric);
  const longer = Math.max(p16, 100);
  return (
    <article className="ffs-p16-metric">
      <small>{metric.label}</small>
      <div className="ffs-p16-values">
        <span>
          <i>エクスプリーム（基準）</i>
          <b>100%</b>
        </span>
        <span>
          <i>P16（換算）</i>
          <strong>
            {approxText.startsWith("約") ? (
              <>
                <small>約</small>
                {approxText.slice(1)}
              </>
            ) : (
              approxText
            )}
          </strong>
        </span>
      </div>
      <div
        className="ffs-p16-bars"
        role="img"
        aria-label={`${metric.label}、${EXTREME_P14_NAME}を100%としたP16は${p16AgainstExtremeText(metric)}、${p16ChangeAgainstExtremeText(metric)}（暫定ベンチマーク／設定案）`}
      >
        <span data-unit="extreme">
          <i style={barStyle(100 / longer)} />
        </span>
        <span data-unit="p16">
          <i style={barStyle(p16 / longer)} />
        </span>
      </div>
      <p>
        <span>
          指数 {metric.extreme} → {metric.p16}
        </span>
        <b>{p16ChangeAgainstExtremeText(metric)}</b>
      </p>
    </article>
  );
}

function P16Comparator() {
  const [baseline, setBaseline] = useState<Baseline>("p14");
  const groupName = useId();
  return (
    <div className="ffs-p16-comparator rxs-reveal">
      <header>
        <div>
          <small lang="en">GENERATION COMPARISON</small>
          <h3>P16 / {TITLES[baseline]}</h3>
        </div>
        <ProvisionalTag />
      </header>

      <fieldset className="ffs-views ffs-p16-switch">
        <legend>比較の基準</legend>
        <div>
          {BASELINES.map((item) => (
            <label key={item.key} className={baseline === item.key ? "is-active" : undefined}>
              <input
                type="radio"
                name={groupName}
                value={item.key}
                checked={baseline === item.key}
                onChange={() => setBaseline(item.key)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="ffs-p16-result" aria-live="polite">
        {baseline === "p14" ? (
          <>
            <div className="ffs-p16-metrics">
              {P16_METRICS.map((metric) => (
                <MetricRow key={metric.key} metric={metric} />
              ))}
            </div>
            <blockquote className="ffs-p16-source">
              <p>{P16_METRICS[0].sources[1]}</p>
            </blockquote>
            <ul className="ffs-p16-caveats" aria-label="比較の注意">
              {P16_CAVEATS.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </>
        ) : baseline === "p2" ? (
          <>
            <div className="ffs-p16-metrics ffs-p16-metrics-single">
              <article className="ffs-p16-metric">
                <small>{P16_VS_P2.label}</small>
                <div className="ffs-p16-values">
                  <span>
                    <i>P2（基準）</i>
                    <b>100%</b>
                  </span>
                  <span>
                    <i>P16（暫定）</i>
                    <strong>{P16_VS_P2.value}</strong>
                  </span>
                </div>
                <div
                  className="ffs-p16-bars"
                  role="img"
                  aria-label={`${P16_VS_P2.label}、P2を基準にしたP16は${P16_VS_P2.value}（暫定）`}
                >
                  <span data-unit="p2">
                    <i style={barStyle(1 / P16_VS_P2.multiplier)} />
                  </span>
                  <span data-unit="p16">
                    <i style={barStyle(1)} />
                  </span>
                </div>
                <p>
                  <span>ヴィンクルムのP2と比較</span>
                  <b>暫定値</b>
                </p>
              </article>
            </div>
            <blockquote className="ffs-p16-source">
              <p>{P16_VS_P2.source}</p>
            </blockquote>
          </>
        ) : (
          <>
            <p className="ffs-p16-proposal">
              <span className="ffs-provisional-tag">暫定ベンチマーク／設定案</span>
              <span>指数はレクソナンスのP14＝100。{P16_VS_EXTREME.note}</span>
            </p>
            <div className="ffs-p16-metrics">
              {P16_VS_EXTREME.metrics.map((metric) => (
                <ExtremeMetricRow key={metric.key} metric={metric} />
              ))}
            </div>
            <p className="ffs-p16-burst">
              <span>{P16_VS_EXTREME.burst.label}</span>
              <b>
                {P16_VS_EXTREME.name} {P16_VS_EXTREME.burst.extreme}%
              </b>
              <small>レクソナンスのP14＝100%</small>
            </p>
            <blockquote className="ffs-p16-source">
              <p>{P16_VS_EXTREME.source}</p>
            </blockquote>
            <div className="ffs-p16-proposal-text">
              {P16_VS_EXTREME.text.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FarFromP16() {
  return (
    <>
      <div className="ffs-p16-overview rxs-reveal">
        <P16Core />
        <div className="ffs-p16-copy">
          <small lang="en">P16 / SIXTEENTH GENERATION</small>
          <h3>第16世代演算加速機構</h3>
          <p>{P16_INTRO.basis}</p>
          <p>{P16_INTRO.generations}</p>
          <ul className="ffs-p16-functions" aria-label="P16が高度化した機能">
            {P16_FUNCTIONS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="ffs-p16-figures">
            <p>
              <ProvisionalTag />
              <span>P14比</span>
            </p>
            <dl aria-label="P16の暫定ベンチマーク（P14比）">
              {P16_METRICS.map((metric) => (
                <div key={metric.key}>
                  <dt>{metric.label}</dt>
                  <dd>
                    {signed(metric.change)}
                    <small>{metric.verb}</small>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <P16Comparator />

      <section className="ffs-p16-lineage rxs-reveal" aria-labelledby="ffs-p16-lineage-title">
        <header>
          <small lang="en">LINEAGE</small>
          <h3 id="ffs-p16-lineage-title">P2からP16へ</h3>
        </header>
        <ol>
          {P16_LINEAGE.steps.map((step) => (
            <li key={step.unit} data-current={step.unit === "P16" || undefined}>
              <b>{step.unit}</b>
              <span>{step.form}</span>
            </li>
          ))}
        </ol>
        <p>{P16_LINEAGE.text}</p>
      </section>

      <div className="ffs-p16-topics" role="list" aria-label="P16の機能">
        {P16_TOPICS.map((topic, index) => (
          <article key={topic.key} className="rxs-reveal" role="listitem">
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <small lang="en">{topic.code}</small>
            </header>
            <h3>{topic.title}</h3>
            {topic.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
      </div>

      <aside className="ffs-p16-note rxs-reveal" aria-labelledby="ffs-p16-note-title">
        <h3 id="ffs-p16-note-title">熱負荷とウルトラの60秒制限</h3>
        <p>{P16_HEAT_NOTE}</p>
      </aside>
    </>
  );
}
