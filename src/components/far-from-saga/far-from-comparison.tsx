import { useId, useState } from "react";
import {
  COMPARISON_BASELINES,
  COMPARISON_CITATIONS,
  COMPARISON_COLUMNS,
  NUMERIC_METRICS,
  TEXT_ROWS,
  UNPUBLISHED,
  comparisonColumn,
  formatMultiplier,
  formatPercent,
  metricFigure,
  metricRatio,
  type ComparisonBaselineKey,
  type ComparisonColumnKey,
  type MetricValue,
  type NumericMetric,
} from "./far-from-comparison-data";

/* #performance — the comparison console.

   One radio group picks the view: FAR FROM against Rexonance, FAR FROM
   against Extreme (the baseline at 100%), or all three side by side. Every
   figure on screen is a published value; the ratios are those values divided
   by each other, nothing more. Rows without a shared number are listed as
   text below the console, and the owner's own comparison sentences close the
   chapter, quoted as written. */

type View = ComparisonBaselineKey | "all";

const VIEWS: readonly { key: View; label: string }[] = [
  ...COMPARISON_BASELINES.map((key) => ({ key, label: `${comparisonColumn(key).label}と比較` })),
  { key: "all", label: "3機を並べる" },
];

const SPECIAL_VALUES = new Set(["可変", "測定不能", "無制限", "無限大"]);

const accentStyle = (key: ComparisonColumnKey) => ({
  ["--ffs-col-accent" as string]: comparisonColumn(key).accent,
});

function FloorMark({ value }: { value: MetricValue }) {
  return value.floor ? (
    <span className="ffs-floor" title="「〜」付きの公表値">
      ※
    </span>
  ) : null;
}

function PairMetric({
  metric,
  baseline,
}: {
  metric: NumericMetric;
  baseline: ComparisonBaselineKey;
}) {
  const ratio = metricRatio(metric, baseline);
  const base = comparisonColumn(baseline);
  const farFrom = metric.values.farFrom;
  const other = metric.values[baseline];
  if (!ratio) return null;
  const summary = metric.lowerIsBetter
    ? `${metric.label}、${base.name}を100%としたファーフロムサーガの速さは${formatPercent(ratio.percent)}、${formatMultiplier(ratio.multiplier)}`
    : `${metric.label}、${base.name}を100%としたファーフロムサーガの値は${formatPercent(ratio.percent)}、${formatMultiplier(ratio.multiplier)}`;
  return (
    <article className="ffs-metric">
      <header>
        <div>
          <small>{metric.label}</small>
          <strong>
            {metricFigure(farFrom)}
            <FloorMark value={farFrom} />
          </strong>
        </div>
        <p className="ffs-metric-result">
          <i>{metric.lowerIsBetter ? "速さの比" : "基準比"}</i>
          <b>{formatPercent(ratio.percent)}</b>
          <em>{formatMultiplier(ratio.multiplier)}</em>
        </p>
      </header>
      <div className="ffs-bars" role="img" aria-label={summary}>
        <span style={accentStyle("farFrom")}>
          <i style={{ ["--ffs-bar" as string]: ratio.farFromBar / 100 }} />
        </span>
        <span style={accentStyle(baseline)}>
          <i style={{ ["--ffs-bar" as string]: ratio.baselineBar / 100 }} />
        </span>
      </div>
      <p className="ffs-metric-base">
        <span>{base.label}</span>
        <span>
          {metricFigure(other)}
          <FloorMark value={other} />
        </span>
        {ratio.timeCut !== null ? (
          <span>100mの所要時間 {formatPercent(ratio.timeCut)}短縮</span>
        ) : null}
      </p>
    </article>
  );
}

function TrioMetric({ metric }: { metric: NumericMetric }) {
  // Bars on one scale: the best of the three at 100 (for 走力, the fastest).
  const score = (value: MetricValue) =>
    value.value === null ? null : metric.lowerIsBetter ? 1 / value.value : value.value;
  const scores = COMPARISON_COLUMNS.map((column) => score(metric.values[column.key]) ?? 0);
  const top = Math.max(...scores);
  return (
    <article className="ffs-metric ffs-metric-trio">
      <header>
        <div>
          <small>{metric.label}</small>
          <strong>
            {metric.lowerIsBetter ? "100mの所要時間（バーは速さ）" : `単位：${metric.unit}`}
          </strong>
        </div>
      </header>
      <ul className="ffs-trio" aria-label={`${metric.label}の公表値`}>
        {COMPARISON_COLUMNS.map((column, index) => {
          const value = metric.values[column.key];
          return (
            <li key={column.key} style={accentStyle(column.key)}>
              <span>{column.label}</span>
              <b>
                {value.value === null ? "記載なし" : metricFigure(value)}
                <FloorMark value={value} />
              </b>
              <span className="ffs-trio-bar" aria-hidden="true">
                <i style={{ ["--ffs-bar" as string]: top > 0 ? scores[index] / top : 0 }} />
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function FarFromComparison() {
  const [view, setView] = useState<View>("rexonance");
  const groupName = useId();
  const baseline = view === "all" ? null : comparisonColumn(view);

  return (
    <>
      <div className="ffs-console rxs-reveal" role="group" aria-label="標準値の比較">
        <div className="ffs-console-head">
          <fieldset className="ffs-views">
            <legend>表示する比較</legend>
            <div>
              {VIEWS.map((item) => (
                <label key={item.key} className={view === item.key ? "is-active" : undefined}>
                  <input
                    type="radio"
                    name={groupName}
                    value={item.key}
                    checked={view === item.key}
                    onChange={() => setView(item.key)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="ffs-console-formula">
            {baseline ? (
              <>
                比較基準：<b>{baseline.name}＝100%</b>
              </>
            ) : (
              <>
                3機の公表値を、<b>項目ごとに同じ目盛り</b>で表示
              </>
            )}
          </p>
          <ul className="ffs-console-key" aria-hidden="true">
            {COMPARISON_COLUMNS.filter(
              (column) => !baseline || column.key === "farFrom" || column.key === baseline.key,
            ).map((column) => (
              <li key={column.key} style={accentStyle(column.key)}>
                <i />
                {column.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="ffs-metric-grid" data-view={view} aria-live="polite" aria-atomic="false">
          {NUMERIC_METRICS.map((metric) =>
            view === "all" ? (
              <TrioMetric key={`all-${metric.key}`} metric={metric} />
            ) : (
              <PairMetric key={metric.key} metric={metric} baseline={view} />
            ),
          )}
        </div>

        <ul className="ffs-console-notes">
          <li>比率は、同じ単位の公表値どうしを割って算出しています。</li>
          <li>走力は100mの所要時間です。値が小さいほど速く、比率は速さで表しています。</li>
          <li>
            <span className="ffs-floor">※</span>
            は「〜」付きの公表値です。表記の数値で計算しています。
          </li>
          <li>ファーフロムサーガのハイ以降の数値は公表されていません。</li>
        </ul>
      </div>

      <section className="ffs-text-compare rxs-reveal" aria-labelledby="ffs-text-compare-title">
        <header>
          <small lang="en">OTHER SPECS</small>
          <h3 id="ffs-text-compare-title">数値で比べない項目</h3>
        </header>
        <div className="ffs-text-rows">
          {TEXT_ROWS.map((row) => (
            <article key={row.label} className="ffs-text-row">
              <h4>{row.label}</h4>
              <dl>
                {COMPARISON_COLUMNS.map((column) => {
                  const value = row.values[column.key];
                  return (
                    <div key={column.key} style={accentStyle(column.key)}>
                      <dt>{column.label}</dt>
                      <dd
                        data-kind={
                          value === UNPUBLISHED
                            ? "none"
                            : SPECIAL_VALUES.has(value)
                              ? "special"
                              : undefined
                        }
                      >
                        {value === UNPUBLISHED ? "記載なし" : value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="ffs-citations-block rxs-reveal" aria-labelledby="ffs-citations-title">
        <header>
          <small lang="en">FROM THE RECORD</small>
          <h3 id="ffs-citations-title">設定資料での比較</h3>
        </header>
        <ul className="ffs-citations">
          {COMPARISON_CITATIONS.map((citation) => (
            <li key={citation.text}>
              <small>{citation.source}</small>
              <q>{citation.text}</q>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
