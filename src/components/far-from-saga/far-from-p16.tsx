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
  p16ChangeAgainstExtremeSpoken,
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
   「P14との性能差は想像して生成してみて」): the comparator's third option
   draws it with the same cards as the other two, says 暫定ベンチマーク／設定案
   where they say 暫定ベンチマーク, and closes on its ※ notes, after the
   owner's sentence naming Extreme's P14. */

type Baseline = "p14" | "p2" | "extreme";

/** The three bases: the owner's 「P14比」「P2比」 over the form that carries
 * the unit, so Rexonance's P14 and Extreme's read apart. */
const BASELINES: readonly { key: Baseline; label: string; form: string }[] = [
  { key: "p14", label: "P14比", form: "レクソナンス" },
  { key: "p2", label: "P2比", form: "ヴィンクルム" },
  { key: "extreme", label: "P14比", form: "エクスプリーム" },
];

/** The header's name for each comparison; Extreme's P14 by its full name. */
const TITLES: Record<Baseline, string> = {
  p14: "P14比",
  p2: "P2比",
  extreme: `${EXTREME_P14_NAME}比`,
};

/** +50% / −35%: the owner's figure with its sign. */
const signed = (change: number) => `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;

const reading = (lowerIsBetter: boolean) => (lowerIsBetter ? "低いほど優秀" : "高いほど優秀");

const barStyle = (fraction: number) =>
  ({ ["--ffs-bar" as string]: Math.max(0, Math.min(1, fraction)) }) as CSSProperties;

/** The 暫定 mark; over the Extreme option it also says 設定案. */
function ProvisionalTag({ proposal = false }: { proposal?: boolean }) {
  return (
    <span className="ffs-provisional-tag">
      {proposal ? "暫定ベンチマーク／設定案" : "暫定ベンチマーク"}
    </span>
  );
}

/** A unit's name with its tuning, 「P14（Extreme tuning）」: the parenthetical
 * never breaks inside, so a narrow line breaks before 「（」 if at all. */
export function UnitName({ value }: { value: string }) {
  const at = value.indexOf("（");
  if (at <= 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at)}
      <span className="ffs-unit-tuning">{value.slice(at)}</span>
    </>
  );
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

/** The base at 100%: the form that carries the unit, then the unit. Every
 * option's cards open the same way, so a phone that shows one card at a time
 * still says whose P14 it is. */
function BaseValue({ form, unit }: { form: string; unit: string }) {
  return (
    <span>
      <i>{form}</i>
      <i>{unit}（基準）</i>
      <b>100%</b>
    </span>
  );
}

function MetricRow({ metric }: { metric: P16Metric }) {
  const p16 = 100 + metric.change;
  const longer = Math.max(p16, 100);
  return (
    <article className="ffs-p16-metric">
      <small>{metric.label}</small>
      <div className="ffs-p16-values">
        <BaseValue form="レクソナンス" unit="P14" />
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
        <span>{reading(metric.lowerIsBetter)}</span>
        <b>
          {signed(metric.change)} {metric.verb}
        </b>
      </p>
    </article>
  );
}

/** P16 with P14（Extreme tuning）at 100%: the 設定案, drawn as the P14 cards
 * are, with the two indices (Rexonance's P14 = 100) under the reading. */
function ExtremeMetricRow({ metric }: { metric: ExtremeP14Metric }) {
  const p16 = p16AgainstExtreme(metric);
  const text = p16AgainstExtremeText(metric);
  const approx = text.startsWith("約");
  const longer = Math.max(p16, 100);
  return (
    <article className="ffs-p16-metric">
      <small>{metric.label}</small>
      <div className="ffs-p16-values">
        <BaseValue form="エクスプリーム" unit="P14" />
        <span>
          <i>P16（換算）</i>
          <strong>
            {approx ? <small>約</small> : null}
            {approx ? text.slice(1) : text}
          </strong>
        </span>
      </div>
      <div
        className="ffs-p16-bars"
        role="img"
        aria-label={`${metric.label}、${EXTREME_P14_NAME}を100%としたP16は${text}、${p16ChangeAgainstExtremeSpoken(metric)}（暫定ベンチマーク／設定案）`}
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
          {reading(metric.lowerIsBetter)}
          <small>
            指数 {metric.extreme} → {metric.p16}
          </small>
        </span>
        <b>{p16ChangeAgainstExtremeText(metric)}</b>
      </p>
    </article>
  );
}

/** Where P14（Extreme tuning）leads Rexonance's P14: the short peak. */
function ExtremeStrength() {
  const { burst } = P16_VS_EXTREME;
  return (
    <div className="ffs-p16-strength">
      <small>
        <UnitName value={EXTREME_P14_NAME} />
        の強み
      </small>
      <p>
        <span>{burst.label}</span>
        <b>
          <small>指数</small>
          {burst.extreme}
        </b>
        <i>レクソナンスのP14＝100</i>
      </p>
    </div>
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
          <h3>
            P16 / <UnitName value={TITLES[baseline]} />
          </h3>
        </div>
        <ProvisionalTag proposal={baseline === "extreme"} />
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
              <span>
                {item.label} <small>{item.form}</small>
              </span>
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
                  <BaseValue form="ヴィンクルム" unit="P2" />
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
                  <span>{reading(false)}</span>
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
            <div className="ffs-p16-metrics">
              {P16_VS_EXTREME.metrics.map((metric) => (
                <ExtremeMetricRow key={metric.key} metric={metric} />
              ))}
            </div>
            <ExtremeStrength />
            <blockquote className="ffs-p16-source">
              <p>{P16_VS_EXTREME.source}</p>
            </blockquote>
            <div className="ffs-p16-reading">
              {P16_VS_EXTREME.text.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <ul className="ffs-p16-caveats" aria-label="設定案の注意">
              {P16_VS_EXTREME.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
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
              {/* P14: Extreme's earlier generation, then Rexonance's. */}
              <span className="ffs-p16-lineage-forms">
                {step.forms.map((form, index) =>
                  index < step.forms.length - 1 ? (
                    <span key={form}>
                      {form}
                      <i aria-hidden="true">→</i>
                      <span className="ffs-visually-hidden">、のちに</span>
                    </span>
                  ) : (
                    <span key={form}>{form}</span>
                  ),
                )}
              </span>
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
