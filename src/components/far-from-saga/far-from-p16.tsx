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
  type P16Metric,
} from "./far-from-p16-data";

/* #p16 — 『P16』, from the owner's comparison text (2026-10-22).

   Every sentence here is the owner's, quoted whole from the two
   【P16・第16世代演算加速機構】 chapters (far-from-p16-data.ts). The figures
   are only the ones those sentences state: the provisional benchmark against
   P14 (+50% / −35% / −40% / −27%), Vinculum's P2 (約3倍, 暫定) and Extreme
   (保留). Wherever they appear the chapter says 暫定ベンチマーク. No P16
   artwork exists yet, so the core is a drawn placeholder, labelled as such. */

type Baseline = "p14" | "p2" | "extreme";

const BASELINES: readonly { key: Baseline; label: string }[] = [
  { key: "p14", label: "P14比" },
  { key: "p2", label: "P2比" },
  { key: "extreme", label: "エクスプリーム" },
];

/** +50% / −35%: the owner's figure with its sign. */
const signed = (change: number) => `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;

const barStyle = (fraction: number) =>
  ({ ["--ffs-bar" as string]: Math.max(0, Math.min(1, fraction)) }) as CSSProperties;

function ProvisionalTag() {
  return <span className="ffs-provisional-tag">暫定ベンチマーク</span>;
}

/** The drawn stand-in for P16's artwork: a package, its pins and a die. */
function P16Core() {
  const pins = Array.from({ length: 9 }, (_, index) => 46 + index * 13.5);
  return (
    <figure className="ffs-p16-core">
      <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="ffs-p16-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7fe6ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#7fe6ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ffs-p16-die" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#12304a" />
            <stop offset="100%" stopColor="#06111d" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="112" fill="url(#ffs-p16-glow)" />
        <g className="ffs-p16-pins">
          {pins.map((at) => (
            <g key={at}>
              <rect x={at} y="22" width="6" height="16" rx="1.5" />
              <rect x={at} y="202" width="6" height="16" rx="1.5" />
              <rect x="22" y={at} width="16" height="6" rx="1.5" />
              <rect x="202" y={at} width="16" height="6" rx="1.5" />
            </g>
          ))}
        </g>
        <rect className="ffs-p16-package" x="38" y="38" width="164" height="164" rx="16" />
        <rect className="ffs-p16-die" x="64" y="64" width="112" height="112" rx="10" />
        <path
          className="ffs-p16-trace"
          d="M64 92h-18M64 148h-18M176 92h18M176 148h18M92 64v-18M148 64v-18M92 176v18M148 176v18"
        />
        <circle className="ffs-p16-ring" cx="120" cy="120" r="40" />
        <text x="120" y="129" textAnchor="middle" className="ffs-p16-label">
          P16
        </text>
      </svg>
      <figcaption>イメージ図（P16のビジュアルは準備中です）</figcaption>
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

function P16Comparator() {
  const [baseline, setBaseline] = useState<Baseline>("p14");
  const groupName = useId();
  return (
    <div className="ffs-p16-comparator rxs-reveal">
      <header>
        <div>
          <small lang="en">GENERATION COMPARISON</small>
          <h3>P16 / {BASELINES.find((item) => item.key === baseline)?.label}</h3>
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
            <p className="ffs-p16-withheld">
              <b>{P16_VS_EXTREME.value}</b>
              <span>エクスプリームとの機構単体の比較値</span>
            </p>
            <blockquote className="ffs-p16-source">
              <p>{P16_VS_EXTREME.source}</p>
            </blockquote>
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
