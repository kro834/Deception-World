import { useId, useState, type CSSProperties } from "react";
import {
  P16_CAVEATS,
  P16_FUNCTIONS,
  P16_HEAT_NOTE,
  P16_INTRO,
  P16_LINEAGE,
  P16_METRICS,
  P16_TOPICS,
  P16_VS_P2,
  P16_VS_STANDARD_SOURCE,
} from "./far-from-p16-data";
import {
  ACCEL_TAGLINES,
  ACCEL_UNITS,
  P16_BENCHMARK_NOTE,
  P16_BENCHMARK_TITLE,
  P16_DESCRIPTIONS,
  P16_GENERATIONS_TITLE,
  P16_MAIN,
  P16_MAIN_TITLE,
  P16_OFFICIAL_METRICS,
  P16_STANDARD_SENTENCE,
  P16_SUMMARY,
  P16_SUMMARY_TITLE,
  accelUnit,
  p16Against,
  p16ChangeAgainst,
  signedPercent,
  type AccelUnitKey,
  type OfficialMetric,
} from "./far-from-p16-official";

/* #p16 — 『P16』, from the owner's comparison text (2026-10-22) and the
   owner's OFFICIAL P14 / P16 setting (公式設定, 2026-10-23).

   The canon: 『P14 Standard』 (エクスプリーム) → 『P14 Extreme Tuning』
   (レクソナンス) → 『P16』 (ファーフロム). Every sentence here is the owner's,
   quoted whole: the two 【P16・第16世代演算加速機構】 chapters
   (far-from-p16-data.ts) and the 公式設定 (far-from-p16-official.ts). The
   figures are the owner's: the 暫定ベンチマーク with P14 Standard = 100, drawn
   for the three units on every metric, and Vinculum's P2 (約3倍, 暫定).
   Wherever they appear the chapter says 暫定ベンチマーク. */

type Baseline = Exclude<AccelUnitKey, "p16"> | "p2";
type UnitBaseline = Exclude<Baseline, "p2">;

/** The three bases: the unit over the form that carries it. */
const BASELINES: readonly { key: Baseline; unit: string; form: string }[] = [
  { key: "tuning", unit: "P14 Extreme Tuning", form: "レクソナンス" },
  { key: "standard", unit: "P14 Standard", form: "エクスプリーム" },
  { key: "p2", unit: "P2", form: "ヴィンクルム" },
];

const reading = (lowerIsBetter: boolean) => (lowerIsBetter ? "低いほど優秀" : "高いほど優秀");

const barStyle = (fraction: number) =>
  ({ ["--ffs-bar" as string]: Math.max(0, Math.min(1, fraction)) }) as CSSProperties;

/** The 暫定 mark, wherever a provisional figure is printed. */
function ProvisionalTag() {
  return <span className="ffs-provisional-tag">暫定ベンチマーク</span>;
}

/** A unit's name, 「P14 Extreme Tuning」: the words after 「P14」 hold
 * together, so a narrow line breaks after 「P14」 if at all. */
export function UnitName({ value }: { value: string }) {
  const at = value.indexOf(" ");
  if (at <= 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at)}{" "}
      <span className="ffs-unit-tuning">{value.slice(at + 1)}</span>
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
 * still says whose unit it is. */
function BaseValue({ form, unit }: { form: string; unit: string }) {
  return (
    <span>
      <i>{form}</i>
      <i>
        <UnitName value={unit} />
        <span className="ffs-nowrap">（基準）</span>
      </i>
      <b>100%</b>
    </span>
  );
}

/** One metric of the 公式設定: P16 with the base at 100%, then the three
 * units' indices (P14 Standard = 100) as bars, the base and P16 marked. */
function OfficialMetricRow({ metric, base }: { metric: OfficialMetric; base: UnitBaseline }) {
  const unit = accelUnit(base);
  const p16 = p16Against(metric, base);
  const change = p16ChangeAgainst(metric, base);
  const longest = Math.max(...ACCEL_UNITS.map((item) => metric.values[item.key]));
  return (
    <article className="ffs-p16-metric">
      <small>{metric.label}</small>
      <div className="ffs-p16-values">
        <BaseValue form={unit.form} unit={unit.name} />
        <span>
          <i>P16（換算）</i>
          <strong>{p16}%</strong>
        </span>
      </div>
      <ul
        className="ffs-p16-trio"
        aria-label={`${metric.label}、${unit.name}を100%としたP16は${p16}%、${Math.abs(change)}%${metric.verb}（暫定ベンチマーク、P14 Standard＝100の指数）`}
      >
        {ACCEL_UNITS.map((item) => (
          <li key={item.key} data-unit={item.key} data-base={item.key === base || undefined}>
            <span>
              <UnitName value={item.name} />
            </span>
            <b>{metric.values[item.key]}</b>
            <span className="ffs-p16-trio-track" aria-hidden="true">
              <i style={barStyle(metric.values[item.key] / longest)} />
            </span>
          </li>
        ))}
      </ul>
      <p>
        <span>
          {reading(metric.lowerIsBetter)}
          <small>指数：P14 Standard＝100</small>
        </span>
        <b>
          {signedPercent(change)} {metric.verb}
        </b>
      </p>
    </article>
  );
}

/** The owner's table, 「P14 Standardを100とした暫定ベンチマーク」, with its
 * note; the chosen base's column marked. */
function BenchmarkTable({ base }: { base: UnitBaseline }) {
  return (
    <figure className="ffs-p16-table">
      <figcaption>
        <span>{P16_BENCHMARK_TITLE}</span>
        <ProvisionalTag />
      </figcaption>
      <table>
        <thead>
          <tr>
            <th scope="col">評価項目</th>
            {ACCEL_UNITS.map((unit) => (
              <th key={unit.key} scope="col" data-base={unit.key === base || undefined}>
                {unit.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {P16_OFFICIAL_METRICS.map((metric) => (
            <tr key={metric.key}>
              <th scope="row">{metric.label}</th>
              {ACCEL_UNITS.map((unit) => (
                <td key={unit.key} data-base={unit.key === base || undefined}>
                  {metric.values[unit.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{P16_BENCHMARK_NOTE}</p>
    </figure>
  );
}

function P16Comparator() {
  const [baseline, setBaseline] = useState<Baseline>("tuning");
  const groupName = useId();
  const title = BASELINES.find((item) => item.key === baseline)?.unit ?? BASELINES[0].unit;
  return (
    <div className="ffs-p16-comparator rxs-reveal">
      <header>
        <div>
          <h3>
            P16 / <UnitName value={`${title}比`} />
          </h3>
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
              <span>
                <span>
                  <UnitName value={`${item.unit}比`} />
                </span>
                <small>{item.form}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="ffs-p16-result" aria-live="polite">
        {baseline === "p2" ? (
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
              {P16_OFFICIAL_METRICS.map((metric) => (
                <OfficialMetricRow key={metric.key} metric={metric} base={baseline} />
              ))}
            </div>
            <BenchmarkTable base={baseline} />
            {baseline === "tuning" ? (
              <>
                <blockquote className="ffs-p16-source">
                  <p>{P16_METRICS[0].sources[1]}</p>
                </blockquote>
                <ul className="ffs-p16-caveats" aria-label="比較の注意">
                  {P16_CAVEATS.map((caveat) => (
                    <li key={caveat}>{caveat}</li>
                  ))}
                </ul>
              </>
            ) : (
              <blockquote className="ffs-p16-source">
                <p>{P16_STANDARD_SENTENCE}</p>
                <p>{P16_VS_STANDARD_SOURCE}</p>
              </blockquote>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 各世代の技術的な違い: the owner's three descriptions, verbatim. */
function Generations() {
  return (
    <section
      className="ffs-p16-generations rxs-reveal"
      aria-labelledby="ffs-p16-generations-title"
    >
      <header>
        <h3 id="ffs-p16-generations-title">{P16_GENERATIONS_TITLE}</h3>
      </header>
      <div>
        {P16_DESCRIPTIONS.map((item) => (
          <article key={item.unit.key} data-unit={item.unit.key}>
            <small>{item.unit.form}</small>
            <h4>{item.heading}</h4>
            {item.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

/** 主演算性能との関係: the owner's paragraphs, table and caution, verbatim. */
function MainCompute() {
  const caution = P16_MAIN.after[P16_MAIN.after.length - 1];
  return (
    <section className="ffs-p16-main rxs-reveal" aria-labelledby="ffs-p16-main-title">
      <header>
        <h3 id="ffs-p16-main-title">{P16_MAIN_TITLE}</h3>
      </header>
      {P16_MAIN.lead.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <table>
        <thead>
          <tr>
            {P16_MAIN.table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {P16_MAIN.table.rows.map(([form, compute, unit]) => (
            <tr key={form}>
              <th scope="row">{form}</th>
              <td>{compute}</td>
              <td>{unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {P16_MAIN.after.slice(0, -1).map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p className="ffs-p16-main-caution">{caution}</p>
    </section>
  );
}

/** 総合評価, verbatim. */
function Summary() {
  return (
    <section className="ffs-p16-summary rxs-reveal" aria-labelledby="ffs-p16-summary-title">
      <header>
        <h3 id="ffs-p16-summary-title">{P16_SUMMARY_TITLE}</h3>
      </header>
      {P16_SUMMARY.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}

export function FarFromP16() {
  return (
    <>
      <div className="ffs-p16-overview rxs-reveal">
        <P16Core />
        <div className="ffs-p16-copy">
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
              <span>
                <UnitName value="P14 Extreme Tuning比" />
              </span>
            </p>
            <dl aria-label="P16の暫定ベンチマーク（P14 Extreme Tuning比）">
              {P16_OFFICIAL_METRICS.map((metric) => (
                <div key={metric.key}>
                  <dt>{metric.label}</dt>
                  <dd>
                    {signedPercent(p16ChangeAgainst(metric, "tuning"))}
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
          <h3 id="ffs-p16-lineage-title">P2からP16へ</h3>
        </header>
        <ol>
          {P16_LINEAGE.steps.map((step) => (
            <li key={step.key} data-current={step.key === "p16" || undefined}>
              <b>
                <UnitName value={step.unit} />
              </b>
              <span>{step.form}</span>
              {step.key !== "p2" ? <small>{ACCEL_TAGLINES[step.key]}</small> : null}
            </li>
          ))}
        </ol>
        <p>{P16_LINEAGE.text}</p>
      </section>

      <Generations />

      <MainCompute />

      <div className="ffs-p16-topics" role="list" aria-label="P16の機能">
        {P16_TOPICS.map((topic, index) => (
          <article key={topic.key} className="rxs-reveal" role="listitem">
            <header aria-hidden="true">
              <span>{String(index + 1).padStart(2, "0")}</span>
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

      <Summary />
    </>
  );
}
