import { useId, useState, type CSSProperties } from "react";
import {
  ACCEL_LABEL,
  BASELINES,
  BASIC_METRICS,
  BASIC_TABLE,
  BASIC_TEXT_ROWS,
  BENCHMARK_BASE,
  BENCHMARK_ROWS,
  BENCHMARK_SCALE,
  BENCHMARK_TABLE,
  FORMS,
  form,
  formatChange,
  formatMultiplier,
  formatPercent,
  ratio,
  type BaselineKey,
  type BasicMetric,
  type BenchmarkRow,
  type CellValue,
  type FormKey,
} from "./far-from-comparison-data";
import { UnitName } from "./far-from-p16";
import { P16_VS_EXTREME, p16ChangeAgainstExtremeFigure } from "./far-from-p16-data";
import { reportChapter, sentence } from "./far-from-report-data";

/* #performance — the comparison console (owner's comparison text, 2026-10-22).

   One radio group picks the view: FAR FROM against ヴィンクルム, エクスプリーム
   or レクソナンス (the baseline at 100%), or all four side by side. It drives
   both panels: the owner's 【基本性能比較】 table as metric cards, and the
   【同条件ベンチマーク・暫定評価】 indices as a bar chart (レクソナンス・ハイ =
   100; 熱負荷 reads lower = better). Every figure on screen is one of the
   owner's cells or the ratio of two cells in the same row; each table's ※
   note is printed under it, verbatim. The one exception is labelled as such:
   in the エクスプリーム view, 加速機構 adds P16 / P14（Extreme tuning）, the
   暫定ベンチマーク／設定案 the owner asked for (far-from-p16-data.ts), with
   its ※ notes; the same figures, in the same form, as #p16's comparator. */

type View = BaselineKey | "all";

const VIEWS: readonly { key: View; label: string }[] = [
  ...BASELINES.map((key) => ({ key, label: `${form(key).label}と比較` })),
  { key: "all", label: "4機を並べる" },
];

/** The owner's sentence that names the indices 暫定指数. */
const BENCHMARK_LEDE = sentence(
  reportChapter("report-saga", "同条件ベンチマーク・暫定評価"),
  "暫定指数となる",
);

const accentStyle = (key: FormKey) =>
  ({ ["--ffs-col-accent" as string]: form(key).accent }) as CSSProperties;
const barStyle = (fraction: number) =>
  ({ ["--ffs-bar" as string]: Math.max(0, Math.min(1, fraction)) }) as CSSProperties;

/** 推定値 / 下限値 marks, from the cells themselves: 「〜」 is a lower bound
 * (the ※ note's エクスプリームの打撃力, and the 主演算 of レクソナンス and
 * ファーフロム), 「（est.）」 a 推定値 (the ※ note's ヴィンクルムの身体値).
 * The cell prints without its （est.）; the mark says it. */
function CellMark({ cell }: { cell: CellValue }) {
  if (cell.floor)
    return (
      <span className="ffs-cell-mark" data-mark="floor">
        下限値
      </span>
    );
  if (cell.estimate)
    return (
      <span className="ffs-cell-mark" data-mark="estimate">
        推定値
      </span>
    );
  return null;
}

function PairMetric({ metric, baseline }: { metric: BasicMetric; baseline: BaselineKey }) {
  const farFrom = metric.values.farFrom;
  const other = metric.values[baseline];
  const result = ratio(farFrom.value, other.value, metric.reading);
  const base = form(baseline);
  const longer = Math.max(result.multiplier, 1);
  const time = metric.reading === "time";
  const summary = time
    ? `${metric.label}、${base.name}を基準にした速さは${formatMultiplier(result.multiplier)}、所要時間は${formatPercent(result.timeCut ?? 0)}短縮`
    : `${metric.label}、${base.name}を基準にした値は${formatChange(result.change)}、${formatMultiplier(result.multiplier)}`;
  return (
    <article className="ffs-metric">
      <header>
        <div>
          <small>{metric.label}</small>
          <strong>
            {farFrom.figure}
            <CellMark cell={farFrom} />
          </strong>
        </div>
        <p className="ffs-metric-result">
          <i>{time ? "速さの比" : "基準比"}</i>
          <b>{time ? formatMultiplier(result.multiplier) : formatChange(result.change)}</b>
          <em>
            {time ? `速さ ${formatChange(result.change)}` : formatMultiplier(result.multiplier)}
          </em>
        </p>
      </header>
      <div className="ffs-bars" role="img" aria-label={summary}>
        <span style={accentStyle("farFrom")}>
          <i style={barStyle(result.multiplier / longer)} />
        </span>
        <span style={accentStyle(baseline)}>
          <i style={barStyle(1 / longer)} />
        </span>
      </div>
      <p className="ffs-metric-base">
        <span>{base.label}</span>
        <span>
          {other.figure}
          <CellMark cell={other} />
        </span>
        {result.timeCut !== null ? (
          <span>100mの所要時間 {formatPercent(result.timeCut)}短縮</span>
        ) : null}
      </p>
    </article>
  );
}

function AllMetric({ metric }: { metric: BasicMetric }) {
  // One scale per row: the best of the four at 100 (for 100m走力, the fastest).
  const score = (cell: CellValue) => (metric.reading === "time" ? 1 / cell.value : cell.value);
  const top = Math.max(...FORMS.map((item) => score(metric.values[item.key])));
  return (
    <article className="ffs-metric ffs-metric-all">
      <header>
        <div>
          <small>{metric.label}</small>
          <strong>
            {metric.reading === "time"
              ? "所要時間（バーは速さ）"
              : `単位：${metric.values.farFrom.unit}`}
          </strong>
        </div>
      </header>
      <ul className="ffs-all" aria-label={`${metric.label}の4機の値`}>
        {FORMS.map((item) => {
          const cell = metric.values[item.key];
          return (
            <li key={item.key} style={accentStyle(item.key)}>
              <span>{item.label}</span>
              <b>
                {cell.figure}
                <CellMark cell={cell} />
              </b>
              <span className="ffs-all-bar" aria-hidden="true">
                <i style={barStyle(score(cell) / top)} />
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function TextRows({ baseline }: { baseline: BaselineKey | null }) {
  const shown = FORMS.filter(
    (item) => !baseline || item.key === "farFrom" || item.key === baseline,
  ).sort((a, b) => (baseline ? (a.key === "farFrom" ? -1 : b.key === "farFrom" ? 1 : 0) : 0));
  return (
    <div className="ffs-text-rows">
      {BASIC_TEXT_ROWS.map((row) => (
        <article key={row.label} className="ffs-text-row">
          <h4>{row.label}</h4>
          <dl>
            {shown.map((item) => (
              <div key={item.key} style={accentStyle(item.key)}>
                <dt>{item.label}</dt>
                <dd>
                  <UnitName value={row.shown[item.key]} />
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      {baseline === "extreme" ? <AccelVsExtreme /> : null}
    </div>
  );
}

/** 加速機構, エクスプリームと比較: P16 against P14（Extreme tuning）, the
 * 暫定ベンチマーク／設定案 of far-from-p16-data.ts (not the owner's text),
 * in a text row's frame: its label, then the pair, then the four changes. */
function AccelVsExtreme() {
  return (
    <article className="ffs-accel-compare" aria-labelledby="ffs-accel-compare-title">
      <header>
        <div>
          <h4 id="ffs-accel-compare-title">{ACCEL_LABEL}の性能差</h4>
          <p>
            P16 / <UnitName value={`${P16_VS_EXTREME.name}比`} />
          </p>
        </div>
        <span className="ffs-provisional-tag">暫定ベンチマーク／設定案</span>
      </header>
      <dl>
        {P16_VS_EXTREME.metrics.map((metric) => (
          <div key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>
              <b>
                {p16ChangeAgainstExtremeFigure(metric)}
                <small>{metric.verb}</small>
              </b>
              <small>
                指数 {metric.extreme} → {metric.p16}
              </small>
            </dd>
          </div>
        ))}
      </dl>
      <ul aria-label="設定案の注意">
        {P16_VS_EXTREME.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </article>
  );
}

function benchmarkDelta(row: BenchmarkRow, baseline: BaselineKey) {
  const result = ratio(row.values.farFrom, row.values[baseline], row.reading);
  return row.reading === "load"
    ? {
        main: `${formatPercent(-result.change)}削減`,
        sub: `${row.values[baseline]} → ${row.values.farFrom}`,
      }
    : { main: formatChange(result.change), sub: formatMultiplier(result.multiplier) };
}

function BenchmarkChart({ baseline }: { baseline: BaselineKey | null }) {
  const ticks = Array.from({ length: BENCHMARK_SCALE / 100 + 1 }, (_, index) => index * 100);
  const reference = {
    ["--ffs-ref" as string]: BENCHMARK_BASE / BENCHMARK_SCALE,
  } as CSSProperties;
  return (
    <div className="ffs-bench" style={reference}>
      <div className="ffs-bench-axis" aria-hidden="true">
        <span className="ffs-bench-axis-pad" />
        <div className="ffs-bench-scale">
          <span />
          <span className="ffs-bench-ticks">
            {ticks.map((tick) => (
              <i
                key={tick}
                style={{ ["--ffs-tick" as string]: tick / BENCHMARK_SCALE } as CSSProperties}
              >
                {tick}
              </i>
            ))}
          </span>
          <span />
        </div>
      </div>
      <ol className="ffs-bench-rows">
        {BENCHMARK_ROWS.map((row) => {
          const delta = baseline ? benchmarkDelta(row, baseline) : null;
          return (
            <li key={row.label} data-reading={row.reading}>
              <div className="ffs-bench-head">
                <h4>{row.label}</h4>
                {row.reading === "load" ? (
                  <span className="ffs-bench-flag">
                    <i aria-hidden="true">↓</i>低いほど優秀
                  </span>
                ) : null}
                {delta ? (
                  <p className="ffs-bench-delta">
                    <span className="ffs-visually-hidden">
                      {form(baseline as BaselineKey).label}比
                    </span>
                    <b>{delta.main}</b>
                    <em>{delta.sub}</em>
                  </p>
                ) : null}
              </div>
              <ul>
                {FORMS.map((item) => (
                  <li
                    key={item.key}
                    style={accentStyle(item.key)}
                    data-dim={
                      (baseline && item.key !== "farFrom" && item.key !== baseline) || undefined
                    }
                  >
                    <span>{item.label}</span>
                    <span className="ffs-bench-track" aria-hidden="true">
                      <i style={barStyle(row.values[item.key] / BENCHMARK_SCALE)} />
                    </span>
                    <b>{row.values[item.key]}</b>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function FarFromComparison() {
  const [view, setView] = useState<View>("rexonance");
  const groupName = useId();
  const baseline = view === "all" ? null : view;
  const baseForm = baseline ? form(baseline) : null;

  return (
    <div className="ffs-console rxs-reveal" role="group" aria-label="性能比較コンソール">
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
          {baseForm ? (
            <>
              比較基準：<b>{baseForm.name}＝100%</b>
            </>
          ) : (
            <>
              4機の値を、<b>項目ごとに同じ目盛り</b>で表示
            </>
          )}
        </p>
        <ul className="ffs-console-key" aria-label="凡例">
          {FORMS.map((item) => (
            <li
              key={item.key}
              style={accentStyle(item.key)}
              data-dim={(baseline && item.key !== "farFrom" && item.key !== baseline) || undefined}
            >
              <i aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <section className="ffs-panel" aria-labelledby="ffs-basic-title">
        <header className="ffs-panel-head">
          <h3 id="ffs-basic-title">{BASIC_TABLE.title}</h3>
        </header>
        <div className="ffs-metric-grid" data-view={view} aria-live="polite" aria-atomic="false">
          {BASIC_METRICS.map((metric) =>
            baseline ? (
              <PairMetric key={`${baseline}-${metric.key}`} metric={metric} baseline={baseline} />
            ) : (
              <AllMetric key={`all-${metric.key}`} metric={metric} />
            ),
          )}
        </div>
        <TextRows baseline={baseline} />
        <p className="ffs-table-note">{BASIC_TABLE.note}</p>
      </section>

      <section className="ffs-panel ffs-panel-bench" aria-labelledby="ffs-bench-title">
        <header className="ffs-panel-head">
          <h3 id="ffs-bench-title">{BENCHMARK_TABLE.title}</h3>
          <p className="ffs-bench-badges">
            <span className="ffs-provisional-tag">暫定指数</span>
            <span>
              レクソナンス・ハイ＝{BENCHMARK_BASE}
              <i aria-hidden="true" className="ffs-bench-ref-key" />
            </span>
            <span>
              <i aria-hidden="true">↓</i>熱負荷は低いほど優秀
            </span>
          </p>
          <p className="ffs-panel-lede">{BENCHMARK_LEDE}</p>
        </header>
        <BenchmarkChart baseline={baseline} />
        <p className="ffs-table-note">{BENCHMARK_TABLE.note}</p>
      </section>

      <ul className="ffs-console-notes">
        <li>
          比率は、表の同じ行の値どうしを割って算出し、小数第2位で四捨五入しています。四捨五入した値には「約」を付けています。
        </li>
        <li>100m走力は所要時間です。値が小さいほど速く、比率は速さで表しています。</li>
        <li>「〜」付きの値は、表記の数値で計算しています。</li>
        <li>暫定指数は、比較基準の値を100%とした増減で表しています。熱負荷は削減率です。</li>
      </ul>
    </div>
  );
}
