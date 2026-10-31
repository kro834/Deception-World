/** Pure transport and URL contract. All engines share the established 0..1 beats. */
export const LAB_RIDERS = ["rexonance", "far-from", "illusionculum", "meta-unitas"];
export const LAB_ZOOMS = ["full", "head", "reactor", "legs"];
export const LAB_BEATS = [
  { label: "開始", at: 0 },
  { label: "走査", at: 0.07 },
  { label: "生成", at: 0.32 },
  { label: "装着", at: 0.62 },
  { label: "頭部", at: 0.82 },
  { label: "点灯", at: 0.9 },
  { label: "形態移行", at: 0.945 },
  { label: "完成", at: 1 },
];
export const clampProgress = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
export function parseLabState(search) {
  const p = new URLSearchParams(search);
  const rider = LAB_RIDERS.includes(p.get("rider")) ? p.get("rider") : "rexonance";
  const compare = LAB_RIDERS.includes(p.get("compare")) ? p.get("compare") : "";
  return {
    form: validLabForm(rider, p.get("form")),
    compareForm: validLabForm(compare || rider, p.get("compareForm")),
    loop: p.get("loop") === "1",
    rider: LAB_RIDERS.includes(p.get("rider")) ? p.get("rider") : "rexonance",
    compare: LAB_RIDERS.includes(p.get("compare")) ? p.get("compare") : "",
    progress: clampProgress(p.get("at")),
    zoom: LAB_ZOOMS.includes(p.get("zoom")) ? p.get("zoom") : "full",
    speed: [0.25, 0.5, 1, 1.5, 2].includes(Number(p.get("speed"))) ? Number(p.get("speed")) : 1,
  };
}
export function labSearch(state) {
  const p = new URLSearchParams();
  p.set("rider", state.rider);
  p.set("form", state.form || "standard");
  p.set("compareForm", state.compareForm || "standard");
  if (state.loop) p.set("loop", "1");
  p.set("at", state.progress.toFixed(4));
  p.set("zoom", state.zoom);
  p.set("speed", String(state.speed));
  if (state.compare) p.set("compare", state.compare);
  return p.toString();
}
export function advanceLab(progress, milliseconds, speed, direction) {
  // A presentation clock only. The established engine's beat positions stay intact.
  return clampProgress(
    progress + (Math.max(0, Math.min(milliseconds, 100)) / 12000) * speed * direction,
  );
}

export const LAB_NAMES = {
  rexonance: "レクソナンス",
  "far-from": "ファーフロム",
  illusionculum: "イリュージョンクルム",
  "meta-unitas": "メタ・ウニタス",
};

export const LAB_FORMS = {
  rexonance: [
    ["standard", "スタンダード"],
    ["max", "マックス"],
    ["ultra", "ウルトラ"],
    ["excelsior", "エクセルシオール"],
  ],
  "far-from": [
    ["standard", "ミドル"],
    ["high", "ハイ"],
    ["xhigh", "エックスハイ"],
    ["max", "マックス"],
    ["ultra", "ウルトラ"],
  ],
  illusionculum: [
    ["standard", "スタンダード"],
    ["more", "リアクター・モア"],
    ["ultra", "ウルトラ"],
    ["ultraMore", "ウルトラ＋リアクター・モア"],
  ],
  "meta-unitas": [
    ["standard", "ミドル"],
    ["ultra", "ウルトラ"],
  ],
};
export const validLabForm = (rider, form) =>
  LAB_FORMS[rider]?.some(([key]) => key === form) ? form : "standard";
