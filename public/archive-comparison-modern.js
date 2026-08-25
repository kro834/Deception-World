(() => {
  "use strict";

  const ROOT_SELECTOR = '[id$="saga-form-compare-ios"].saga-compare-section';
  const HIGHER_IS_BETTER = /^(パンチ力|キック力|ジャンプ力|飛行速度|演算|演算2|EMP|総合性能|完全実装|能力性能|アバター生成|スケープゴート生成)$/;
  const LOWER_IS_BETTER = /^走力$/;
  const COMPOSITES = new Map([
    ["パンチ・キック", [1, 1]],
    ["ジャンプ・100m", [1, -1]],
    ["マルチ比 P / K / 速 / 演", [1, 1, 1, 1]],
  ]);
  const UNRATED_VALUE = /(不明|不詳|非公開|測定不能|算出していない|データなし|該当なし)/;
  const UNIT_SCALE = {
    Y: 1e12,
    Z: 1e9,
    E: 1e6,
    P: 1e3,
    T: 1,
    G: 1e-3,
  };

  const normalize = (value) =>
    String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();

  const readNumber = (value, label) => {
    const text = normalize(value).replaceAll(",", "");
    if (!text || UNRATED_VALUE.test(text)) return null;
    if (/無制限/.test(text)) return Number.POSITIVE_INFINITY;
    if (/演算/.test(label)) {
      const operation = text.match(/(-?\d+(?:\.\d+)?)\s*([YZEPTG])?OPS/i);
      if (operation) {
        const prefix = (operation[2] || "T").trim().toUpperCase();
        return Number(operation[1]) * (UNIT_SCALE[prefix] ?? 1);
      }
    }
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

  const metricVector = (label, value) => {
    if (HIGHER_IS_BETTER.test(label)) {
      const number = readNumber(value, label);
      return number === null ? null : [{ number, direction: 1 }];
    }
    if (LOWER_IS_BETTER.test(label)) {
      const number = readNumber(value, label);
      return number === null ? null : [{ number, direction: -1 }];
    }
    const directions = COMPOSITES.get(label);
    if (!directions) return null;
    const parts = normalize(value).split(/[/／]/);
    if (parts.length < directions.length) return null;
    const vector = directions.map((direction, index) => ({
      number: readNumber(parts[index], label),
      direction,
    }));
    return vector.some((entry) => entry.number === null) ? null : vector;
  };

  const scalarOrder = (left, right) => {
    if (left === right) return 0;
    if (!Number.isFinite(left) || !Number.isFinite(right)) return left > right ? 1 : -1;
    const tolerance = Math.max(1, Math.abs(left), Math.abs(right)) * 1e-9;
    if (Math.abs(left - right) <= tolerance) return 0;
    return left > right ? 1 : -1;
  };

  const compareVectors = (left, right) => {
    if (!left || !right || left.length !== right.length) return null;
    const orders = left.map((entry, index) =>
      scalarOrder(entry.number, right[index].number) * entry.direction,
    );
    if (orders.every((order) => order === 0)) return 0;
    if (orders.every((order) => order >= 0)) return 1;
    if (orders.every((order) => order <= 0)) return -1;
    return null;
  };

  const activeCard = (side) => {
    const select = side.querySelector(".compare-native-select");
    const selected = select instanceof HTMLSelectElement ? select.value : "";
    const radio = side.querySelector('.compare-radio:checked, input[type="radio"]:checked');
    const formId = selected || (radio instanceof HTMLInputElement ? radio.value : "");
    const cards = [...side.querySelectorAll(".compare-form-card[data-form-id]")];
    return cards.find((card) => card.dataset.formId === formId)
      || cards.find((card) => !card.hidden && getComputedStyle(card).display !== "none")
      || null;
  };

  const rowsByLabel = (card) => {
    const rows = new Map();
    if (!(card instanceof HTMLElement)) return rows;
    card.querySelectorAll(".spec-item").forEach((item) => {
      const label = normalize(item.querySelector(".text-muted")?.textContent);
      const value = normalize(item.querySelector(".spec-value")?.textContent);
      if (label && value && !rows.has(label)) rows.set(label, { item, value });
    });
    return rows;
  };

  const clearResults = (root) => {
    root.querySelectorAll(".spec-item[data-compare-result]").forEach((item) => {
      item.removeAttribute("data-compare-result");
      item.removeAttribute("data-compare-note");
      item.removeAttribute("title");
    });
    root.querySelectorAll(".spec-compare-badge").forEach((badge) => badge.remove());
  };

  const decorate = (row, result, label) => {
    row.item.dataset.compareResult = result;
    const messages = {
      lead: `${label}: この形態が比較優位`,
      trail: `${label}: 比較相手が優位`,
      tie: `${label}: 同値`,
    };
    const badgeText = { lead: "優位", trail: "相手優位", tie: "同値" }[result];
    row.item.dataset.compareNote = messages[result];
    row.item.title = messages[result];
    const badge = document.createElement("span");
    badge.className = "spec-compare-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = badgeText;
    row.item.appendChild(badge);
  };

  const ensureSummary = (side) => {
    let summary = side.querySelector(":scope > .compare-advantage-summary");
    if (summary instanceof HTMLElement) return summary;
    summary = document.createElement("div");
    summary.className = "compare-advantage-summary";
    summary.setAttribute("role", "status");
    summary.innerHTML = '<span>CATALOG EDGE</span><b>--</b><small>判定中</small>';
    const stack = side.querySelector(":scope > .compare-card-stack");
    side.insertBefore(summary, stack || null);
    return summary;
  };

  const updateSummary = (side, leads, comparable, sameForm) => {
    const summary = ensureSummary(side);
    const count = summary.querySelector("b");
    const label = summary.querySelector("small");
    summary.dataset.advantage = String(leads);
    if (count) count.textContent = sameForm ? "=" : comparable ? String(leads).padStart(2, "0") : "--";
    if (label) label.textContent = sameForm ? "同一形態" : comparable ? "優位項目" : "判定可能項目なし";
    summary.setAttribute(
      "aria-label",
      sameForm
        ? "同じ形態を比較中"
        : comparable
          ? `${leads}項目で比較優位`
          : "判定可能な共通スペックがありません",
    );
  };

  const refreshRoot = (root) => {
    const sideA = root.querySelector(".compare-side-a");
    const sideB = root.querySelector(".compare-side-b");
    if (!(sideA instanceof HTMLElement) || !(sideB instanceof HTMLElement)) return;
    const cardA = activeCard(sideA);
    const cardB = activeCard(sideB);
    if (!(cardA instanceof HTMLElement) || !(cardB instanceof HTMLElement)) return;

    clearResults(root);
    const rowsA = rowsByLabel(cardA);
    const rowsB = rowsByLabel(cardB);
    let leadsA = 0;
    let leadsB = 0;
    let comparable = 0;

    rowsA.forEach((rowA, label) => {
      const rowB = rowsB.get(label);
      if (!rowB) return;
      const result = compareVectors(metricVector(label, rowA.value), metricVector(label, rowB.value));
      if (result === null) return;
      comparable += 1;
      if (result > 0) {
        leadsA += 1;
        decorate(rowA, "lead", label);
        decorate(rowB, "trail", label);
      } else if (result < 0) {
        leadsB += 1;
        decorate(rowA, "trail", label);
        decorate(rowB, "lead", label);
      } else {
        decorate(rowA, "tie", label);
        decorate(rowB, "tie", label);
      }
    });

    const sameForm = cardA.dataset.formId === cardB.dataset.formId;
    updateSummary(sideA, leadsA, comparable, sameForm);
    updateSummary(sideB, leadsB, comparable, sameForm);
    sideA.classList.toggle("is-catalog-leader", leadsA > leadsB);
    sideB.classList.toggle("is-catalog-leader", leadsB > leadsA);
    root.dataset.catalogComparison = "ready";
    root.dataset.catalogLeads = `${leadsA}:${leadsB}`;
  };

  const initialize = () => {
    const roots = [...document.querySelectorAll(ROOT_SELECTOR)];
    if (!roots.length) return;
    let frame = 0;
    const refresh = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        roots.forEach(refreshRoot);
      });
    };
    roots.forEach((root) => {
      root.addEventListener("input", refresh, true);
      root.addEventListener("change", refresh, true);
      root.addEventListener("click", refresh, true);
      new MutationObserver(refresh).observe(root, {
        attributes: true,
        attributeFilter: ["data-pair"],
      });
    });
    refresh();
    window.setTimeout(refresh, 120);
    window.setTimeout(refresh, 720);
    window.addEventListener("pageshow", refresh);
    window.ArchiveComparisonUI = { refresh };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
