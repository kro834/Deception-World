import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareConditions } from "./comparison-conditions.mjs";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const median = (numbers) => {
  const values = numbers.filter(Number.isFinite).sort((a, b) => a - b);
  return values.length
    ? values.length % 2
      ? values[(values.length - 1) / 2]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
    : null;
};
export function compareMetrics(probe) {
  const groups = new Map();
  for (const run of probe?.runs ?? []) {
    const key = JSON.stringify([run.engine, run.profile, run.route]);
    if (!groups.has(key))
      groups.set(key, {
        engine: run.engine,
        profile: run.profile,
        route: run.route,
        baseline: [],
        candidate: [],
      });
    if (run.status === "passed") groups.get(key)[run.side]?.push(run);
  }
  const metrics = {
    firstFrameDelay: (r) => r.metrics?.frame?.firstFrameDelayMs,
    frameP95: (r) => r.metrics?.frame?.p95Ms,
    domContentLoaded: (r) => r.metrics?.navigation?.domContentLoaded,
    imageBytes: (r) => r.metrics?.images?.encodedBodySize,
    longTaskTotal: (r) =>
      r.metrics?.longTasks?.supported
        ? r.metrics.longTasks.entries.reduce((n, e) => n + e.duration, 0)
        : null,
  };
  return [...groups.values()].flatMap((group) =>
    Object.entries(metrics).map(([metric, get]) => {
      const paired = group.baseline.length && group.candidate.length;
      const baselineRuns = paired
        ? group.baseline.filter((r) => group.candidate.some((c) => c.sample === r.sample))
        : group.baseline;
      const candidateRuns = paired
        ? group.candidate.filter((r) => group.baseline.some((b) => b.sample === r.sample))
        : group.candidate;
      const conditions = baselineRuns.map((run) => ({
        sample: run.sample,
        ...compareConditions(
          run,
          candidateRuns.find((candidate) => candidate.sample === run.sample),
        ),
      }));
      const conditionProblems = conditions.filter((condition) => condition.status !== "matched");
      const conditionsMatch = conditions.length > 0 && !conditionProblems.length;
      const baselineValues = baselineRuns.map(get).filter(Number.isFinite),
        candidateValues = candidateRuns.map(get).filter(Number.isFinite);
      const baseline = median(baselineValues),
        candidate = median(candidateValues);
      return {
        engine: group.engine,
        profile: group.profile,
        route: group.route,
        metric,
        baseline,
        candidate,
        delta:
          conditionsMatch && baseline != null && candidate != null ? candidate - baseline : null,
        conditions,
        reason: conditionProblems.length
          ? [...new Set(conditionProblems.map((condition) => condition.reason))].join("; ")
          : !conditionsMatch
            ? "No paired observations with verified conditions"
            : null,
        baselineSamples: baselineValues.length,
        candidateSamples: candidateValues.length,
        excludedUnpairedRuns:
          group.baseline.length +
          group.candidate.length -
          baselineRuns.length -
          candidateRuns.length,
        assessment:
          !conditionsMatch || baseline == null || candidate == null
            ? "not-comparable"
            : "observation-only",
      };
    }),
  );
}
function artifactLink(path, label) {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes(":"))
    return escape(label ?? path);
  return `<a href="${escape(path)}">${escape(label ?? path)}</a>`;
}
export function reportHtml(report) {
  const checks = (report.checks ?? [])
    .map(
      (c) =>
        `<tr><td>${escape(c.id)}</td><td>${escape(c.status)}</td><td>${escape(c.durationMs ?? "")}</td><td>${artifactLink(c.log, "ログ")}</td><td>${escape(c.reason ?? c.error)}</td></tr>`,
    )
    .join("");
  const metrics = (report.comparisons ?? [])
    .map(
      (c) =>
        `<tr><td>${escape(`${c.engine} / ${c.profile} / ${c.route}`)}</td><td>${escape(c.metric)}</td><td>${escape(c.baseline?.toFixed(2) ?? "未計測")}</td><td>${escape(c.candidate?.toFixed(2) ?? "未計測")}</td><td>${escape(c.delta?.toFixed(2) ?? "比較不可")}</td><td>${escape(c.reason ?? c.assessment)}</td></tr>`,
    )
    .join("");
  const shots = (report.probe?.runs ?? [])
    .map(
      (r) =>
        `<figure><figcaption>${escape(`${r.side} · ${r.engine} · ${r.profile} · ${r.route} · ${r.sample}`)}</figcaption>${r.screenshot ? `<a href="probe/${escape(r.screenshot)}"><img loading="lazy" src="probe/${escape(r.screenshot)}" alt="${escape(`${r.side} ${r.route}`)}"></a>` : escape(r.status)}${(r.sceneScreenshots ?? []).map((s) => `<p>${escape(s.progress)} / ${escape(s.actual)} ${artifactLink(`probe/${s.screenshot}`, "変身工程")}</p>`).join("")}</figure>`,
    )
    .join("");
  const visual = (report.visualComparisons ?? [])
    .map(
      (v) =>
        `<tr><td>${escape(`${v.engine} / ${v.profile} / ${v.route} / ${v.scene} ${v.progress ?? ""}`)}</td><td>${escape(v.status)}</td><td>${v.diffRatio == null ? "比較不可" : escape((v.diffRatio * 100).toFixed(2) + "%")}</td><td>${v.diffScreenshot ? artifactLink(`probe/${v.diffScreenshot}`, "差分画像") : escape(v.reason)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deception World 検証結果</title><style>body{font:16px/1.6 system-ui;margin:2rem;color:#e9eef9;background:#0c1323}a{color:#8fd1ff}table{border-collapse:collapse;width:100%;font-size:.9rem}td,th{padding:.6rem;border-bottom:1px solid #364156;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem}figure{margin:0}img{width:100%;max-height:540px;object-fit:contain;background:#000}section{margin:2rem 0}.table{overflow:auto}</style><h1>Deception World 検証結果</h1><p><strong>${escape(report.status)}</strong> · ${escape(report.finishedAt)}</p><p>候補: ${escape(report.revision)}<br>基準: ${escape(report.baselineRevision ?? "比較対象なし")}</p><p>同じブラウザ・画面プロファイルで、取得した描画条件が一致する組だけを比較します。観測条件の一致は画質の同等性を保証しません。画面差分は演出の時刻差も含みます。性能値だけで改善を断定しません。実機・GPU資源の解放はこのレポートの検証範囲外です。</p><p>${artifactLink("report.json", "機械可読JSON")}</p><section><h2>検証</h2><div class="table"><table><thead><tr><th>検証</th><th>結果</th><th>ms</th><th>証拠</th><th>理由</th></tr></thead><tbody>${checks}</tbody></table></div></section><section><h2>比較（サンプル中央値）</h2><div class="table"><table><thead><tr><th>条件</th><th>指標</th><th>基準</th><th>候補</th><th>差</th><th>判定・理由</th></tr></thead><tbody>${metrics}</tbody></table></div></section><section><h2>画像差分（参考）</h2><div class="table"><table><thead><tr><th>条件</th><th>状態</th><th>異なるピクセル</th><th>画像</th></tr></thead><tbody>${visual}</tbody></table></div></section><section><h2>画面</h2><div class="shots">${shots}</div></section><section><h2>制限・未検証</h2><pre>${escape(JSON.stringify({ warnings: report.warnings, errors: report.errors, coverage: report.coverage }, null, 2))}</pre></section></html>`;
}
export async function writeReport(output, report) {
  await writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, "report.html"), reportHtml(report));
}
