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
    // Mode switches and bounded ranges do not have one fixed value. Reading
    // only the first endpoint can announce a winner that reverses in another
    // declared mode (for example 3,000 ⇄ 60,000 TOPS against 50,000 TOPS).
    if (/[⇄↔]/.test(text) || /\d[\d.]*\s*[–—-]\s*\d/.test(text)) return null;
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
    // Three values such as punch / right kick / left kick cannot be reduced
    // to the two-value punch / kick model by silently dropping the last leg.
    if (parts.length !== directions.length) return null;
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

  const createPlaceholder = (label) => {
    const item = document.createElement("div");
    item.className = "spec-item compare-spec-placeholder";
    item.setAttribute("aria-label", `${label}: この形態には比較可能な数値がありません`);
    item.innerHTML = `<span class="text-small text-muted"></span><span class="spec-value">NO DATA</span>`;
    const name = item.querySelector(".text-muted");
    if (name) name.textContent = label;
    return item;
  };

  const naturalHeight = (element) => {
    element.style.removeProperty("--compare-row-height");
    return Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height));
  };

  const alignSpecRows = (cardA, cardB) => {
    [cardA, cardB].forEach((card) => {
      card.style.removeProperty("--compare-head-height");
      card.style.removeProperty("--compare-lead-height");
      card.querySelectorAll(".compare-spec-placeholder").forEach((item) => item.remove());
      card.querySelectorAll(".spec-item").forEach((item) => {
        item.style.removeProperty("order");
        item.style.removeProperty("--compare-row-height");
        item.removeAttribute("data-compare-row");
      });
    });

    const artworkHeight = window.matchMedia("(max-width: 390px)").matches
      ? 150
      : window.matchMedia("(max-width: 700px)").matches
        ? 176
        : 300;
    [cardA, cardB].forEach((card) => {
      const artwork = card.querySelector(".form-art");
      if (!(artwork instanceof HTMLElement)) return;
      artwork.style.setProperty("height", `${artworkHeight}px`, "important");
      artwork.style.setProperty("min-height", `${artworkHeight}px`, "important");
      artwork.style.setProperty("max-height", `${artworkHeight}px`, "important");
      artwork.style.setProperty("object-fit", "contain", "important");
    });

    const gridA = cardA.querySelector(".viz-grid");
    const gridB = cardB.querySelector(".viz-grid");
    if (!(gridA instanceof HTMLElement) || !(gridB instanceof HTMLElement)) return 0;
    const rowsA = rowsByLabel(cardA);
    const rowsB = rowsByLabel(cardB);
    const labels = [...rowsA.keys(), ...[...rowsB.keys()].filter((label) => !rowsA.has(label))];

    const pairs = labels.map((label, index) => {
      let rowA = rowsA.get(label)?.item;
      let rowB = rowsB.get(label)?.item;
      if (!(rowA instanceof HTMLElement)) {
        rowA = createPlaceholder(label);
        gridA.appendChild(rowA);
      }
      if (!(rowB instanceof HTMLElement)) {
        rowB = createPlaceholder(label);
        gridB.appendChild(rowB);
      }
      const order = String(index + 1);
      rowA.style.order = order;
      rowB.style.order = order;
      rowA.dataset.compareRow = order;
      rowB.dataset.compareRow = order;
      return [rowA, rowB];
    });
    // Every row is measured in one layout, then sized: a read after each
    // write laid both 17-card stacks out again for every field.
    const heights = pairs.map(([rowA, rowB]) => Math.max(naturalHeight(rowA), naturalHeight(rowB)));
    pairs.forEach(([rowA, rowB], index) => {
      const height = heights[index];
      rowA.style.setProperty("--compare-row-height", `${height}px`);
      rowB.style.setProperty("--compare-row-height", `${height}px`);
    });

    const headA = cardA.querySelector(".detail-head");
    const headB = cardB.querySelector(".detail-head");
    if (headA instanceof HTMLElement && headB instanceof HTMLElement) {
      // scrollHeight rounds and excludes borders. A fractionally taller title
      // can therefore exceed that shared minimum and offset every spec row.
      const height = Math.ceil(
        Math.max(
          headA.scrollHeight,
          headA.getBoundingClientRect().height,
          headB.scrollHeight,
          headB.getBoundingClientRect().height,
        ),
      );
      cardA.style.setProperty("--compare-head-height", `${height}px`);
      cardB.style.setProperty("--compare-head-height", `${height}px`);
    }
    const leadA = cardA.querySelector(".detail-lead");
    const leadB = cardB.querySelector(".detail-lead");
    if (leadA instanceof HTMLElement && leadB instanceof HTMLElement) {
      const height = Math.ceil(
        Math.max(
          leadA.scrollHeight,
          leadA.getBoundingClientRect().height,
          leadB.scrollHeight,
          leadB.getBoundingClientRect().height,
        ),
      );
      cardA.style.setProperty("--compare-lead-height", `${height}px`);
      cardB.style.setProperty("--compare-lead-height", `${height}px`);
    }
    return labels.length;
  };

  const clearResults = (root) => {
    root.querySelectorAll(".spec-item[data-compare-result]").forEach((item) => {
      item.removeAttribute("data-compare-result");
      item.removeAttribute("data-compare-note");
      item.removeAttribute("title");
    });
    root.querySelectorAll(".spec-compare-badge").forEach((badge) => badge.remove());
    root.querySelectorAll(".compare-result-a11y").forEach((note) => note.remove());
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
    const accessibleNote = document.createElement("span");
    accessibleNote.className = "sr-only compare-result-a11y";
    accessibleNote.textContent = `${messages[result]}。値 ${row.value}`;
    row.item.appendChild(accessibleNote);
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

  /* Spec difference. One aligned row per numeric field, so both forms read
     side by side at any width: the two values, a bar for each (longer is
     the stronger reading; a time bar shows speed), and how far apart they
     are. The multiple is only given when both values are exact and share a
     unit; bounds (〜), mode switches, 無制限 and the 演算 lines (whose
     YOPS and TOPS systems the archive keeps apart) stay text. */
  const DIFF_FIELDS = [
    { label: "身長・体重", parts: [["身長", 0], ["体重", 0]] },
    { label: "身長", parts: [["身長", 0]] },
    { label: "体重", parts: [["体重", 0]] },
    { label: "パンチ・キック", parts: [["パンチ", 1], ["キック", 1]] },
    { label: "パンチ力", parts: [["パンチ", 1]] },
    { label: "キック力", parts: [["キック", 1]] },
    { label: "ジャンプ・100m", parts: [["ジャンプ", 1], ["100m", -1]] },
    { label: "ジャンプ力", parts: [["ジャンプ", 1]] },
    { label: "走力", parts: [["100m", -1]] },
    { label: "飛行速度", parts: [["飛行速度", 1]] },
    { label: "演算", parts: [["演算", null]] },
    { label: "演算2", parts: [["演算2", null]] },
    { label: "EMP", parts: [["EMP", 1]] },
  ];
  const DIFF_ORDER = [...new Set(DIFF_FIELDS.flatMap((field) => field.parts.map(([name]) => name)))];
  const BOUNDED_VALUE = /[〜~≥≦≤＋+]|以上|以下|推定|est\./i;

  // The printed value, its <br> line breaks kept as line breaks.
  const printedText = (node) => {
    if (!node) return "";
    if (node.nodeType === 3) return node.nodeValue ?? "";
    if (node.nodeName === "BR") return "\n";
    return [...(node.childNodes ?? [])].map(printedText).join("");
  };

  // Parsed from the NFKC form; shown exactly as the archive prints it.
  const readFigure = (text) => {
    const shown = String(text ?? "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    const value = normalize(text);
    const figure = { text: shown || "—", number: null, unit: "", decimals: 0, exact: false };
    if (!value || UNRATED_VALUE.test(value) || /^[—–-]+$/.test(value)) return figure;
    if (/[⇄↔]/.test(value) || /\d[\d.]*\s*[–—-]\s*\d/.test(value)) return figure;
    if (/^無制限/.test(value)) return { ...figure, unlimited: true };
    if (/∞/.test(value)) return figure;
    const match = value.match(/^[^\d-]*?(-?\d[\d,]*(?:\.\d+)?)\s*([^\s\d/／（(〜~≥≦≤＋+]*)/);
    if (!match) return figure;
    const digits = match[1].replaceAll(",", "");
    const prefix = value.slice(0, value.indexOf(match[1])).trim();
    return {
      text: shown,
      number: Number(digits),
      unit: `${prefix}|${match[2]}`,
      shownUnit: match[2],
      decimals: (digits.split(".")[1] || "").length,
      exact: !BOUNDED_VALUE.test(value),
    };
  };

  const diffFigures = (card) => {
    const figures = new Map();
    rowsByLabel(card).forEach(({ item }, label) => {
      const field = DIFF_FIELDS.find((entry) => entry.label === label);
      if (!field) return;
      const value = printedText(item.querySelector(".spec-value"))
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
      const parts = field.parts.length > 1 ? value.split(/\s*[/／]\s*/) : [value];
      // A field with an extra declared value (two kick legs) is not split.
      if (parts.length !== field.parts.length) return;
      field.parts.forEach(([name, direction], index) => {
        const figure = direction === null ? { ...readFigure(""), text: parts[index] } : readFigure(parts[index]);
        figures.set(name, { ...figure, direction });
      });
    });
    return figures;
  };

  const formatMultiple = (ratio) =>
    ratio >= 100
      ? Math.round(ratio).toLocaleString("en-US")
      : ratio >= 10
        ? ratio.toFixed(1)
        : ratio.toFixed(2);

  const diffRow = (name, left, right) => {
    const a = left ?? readFigure("");
    const b = right ?? readFigure("");
    const direction = (left ?? right)?.direction ?? null;
    const measured =
      direction !== null &&
      Number.isFinite(a.number) &&
      Number.isFinite(b.number) &&
      a.number > 0 &&
      b.number > 0 &&
      a.unit === b.unit;
    let lead = "none";
    let shareA = 0;
    let shareB = 0;
    let delta = "";
    let spoken = "";
    const known = (figure) => figure.unlimited || Number.isFinite(figure.number);
    if (!measured && direction === 1 && (a.unlimited || b.unlimited) && known(a) && known(b)) {
      // 無制限 outranks any figure, as on the cards; no multiple for it.
      if (a.unlimited && b.unlimited) {
        lead = "tie";
        delta = "同値";
        spoken = "同値";
      } else {
        lead = a.unlimited ? "a" : "b";
        delta = `${lead.toUpperCase()} 優位`;
        spoken = `FORM ${lead.toUpperCase()}が優位`;
      }
    }
    if (measured) {
      const order = scalarOrder(a.number, b.number);
      if (direction === 0) {
        const max = Math.max(a.number, b.number);
        shareA = a.number / max;
        shareB = b.number / max;
      } else {
        const strengthA = direction > 0 ? a.number : 1 / a.number;
        const strengthB = direction > 0 ? b.number : 1 / b.number;
        const max = Math.max(strengthA, strengthB);
        shareA = strengthA / max;
        shareB = strengthB / max;
      }
      if (order === 0) {
        lead = "tie";
        delta = "同値";
        spoken = "同値";
      } else {
        const upper = order > 0 ? "a" : "b";
        const side = upper.toUpperCase();
        if (direction === 0 && !(a.exact && b.exact)) {
          delta = "";
        } else if (direction === 0) {
          const decimals = Math.max(a.decimals, b.decimals);
          const gap = `${Math.abs(a.number - b.number).toFixed(decimals)}${a.shownUnit}`;
          delta = `${side} +${gap}`;
          spoken = `FORM ${side}が${gap}上回る`;
        } else {
          lead = direction * order > 0 ? "a" : "b";
          const leader = lead.toUpperCase();
          if (a.exact && b.exact) {
            const ratio =
              Math.max(a.number, b.number) / Math.min(a.number, b.number);
            delta = `${leader} ×${formatMultiple(ratio)}`;
            spoken = `FORM ${leader}が優位、${formatMultiple(ratio)}倍`;
          } else {
            delta = `${leader} 優位`;
            spoken = `FORM ${leader}が優位`;
          }
        }
      }
    }
    return { name, a, b, lead, shareA, shareB, delta, spoken, measured };
  };

  // Divs with table roles: both archives style every table, tr and td with
  // their own (forced) table layout, which this panel must not inherit.
  const element = (tag, className, attributes = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  };

  const diffCell = (side) => {
    const cell = element("div", `compare-diff-side-cell is-${side}`, { role: "cell" });
    const tag = element("b", "compare-diff-tag", { "aria-hidden": "true" });
    tag.textContent = side.toUpperCase();
    const value = element("span", "compare-diff-value");
    const bar = element("span", "compare-diff-bar", { "aria-hidden": "true" });
    const fill = element("i");
    bar.append(fill);
    cell.append(tag, value, bar);
    return { value, bar, fill };
  };

  // One row per field, built once and then only updated: a pair change
  // rewrites a few words and bar lengths, not the whole panel.
  const diffLine = (name) => {
    const line = element("div", "compare-diff-row", { role: "row" });
    const label = element("div", "compare-diff-label", { role: "rowheader" });
    label.textContent = name;
    const a = diffCell("a");
    const b = diffCell("b");
    const delta = element("div", "compare-diff-delta", { role: "cell" });
    const shown = element("span", "", { "aria-hidden": "true" });
    const spoken = element("span", "sr-only");
    delta.append(shown, spoken);
    line.append(label, a.value.parentElement, b.value.parentElement, delta);
    return { line, a, b, shown, spoken };
  };

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  const updateDiffLine = (view, row) => {
    if (view.line.dataset.lead !== row.lead) view.line.dataset.lead = row.lead;
    if (view.line.dataset.measured !== String(row.measured)) {
      view.line.dataset.measured = String(row.measured);
    }
    [
      [view.a, row.a, row.shareA],
      [view.b, row.b, row.shareB],
    ].forEach(([cell, figure, share]) => {
      setText(cell.value, figure.text);
      cell.bar.hidden = !row.measured;
      if (row.measured) cell.fill.style.setProperty("--diff-share", Math.max(0.02, share).toFixed(4));
    });
    setText(view.shown, row.delta);
    setText(view.spoken, row.spoken);
  };

  const diffLines = new WeakMap();

  const ensureDiffPanel = (root) => {
    let panel = root.querySelector(":scope .compare-diff");
    if (panel instanceof HTMLElement) return panel;
    const titleId = `${root.id}-diff-title`;
    panel = document.createElement("div");
    panel.className = "compare-diff";
    panel.innerHTML = `
      <div class="compare-diff-head">
        <h3 class="compare-diff-title" id="${titleId}">スペック差分</h3>
        <p class="compare-diff-pair"><span class="compare-diff-name is-a"><b aria-hidden="true">A</b><span></span></span><span class="compare-diff-name is-b"><b aria-hidden="true">B</b><span></span></span></p>
      </div>
      <div class="compare-diff-table" role="table" aria-labelledby="${titleId}">
        <div class="compare-diff-columns" role="rowgroup"><div role="row"><span role="columnheader">項目</span><span role="columnheader">FORM A</span><span role="columnheader">FORM B</span><span role="columnheader">差</span></div></div>
        <div class="compare-diff-rows" role="rowgroup"></div>
      </div>
      <p class="compare-diff-empty" hidden>数値で比べられる項目はありません。</p>
      <p class="compare-diff-note">倍率と差は表示値から計算。下限値（〜）と演算には倍率を付けていません。</p>`;
    const anchor = root.querySelector(":scope .compare-layout");
    if (anchor) anchor.before(panel);
    else root.append(panel);
    return panel;
  };

  const sideName = (side) => {
    const select = side.querySelector(".compare-native-select");
    return select instanceof HTMLSelectElement
      ? normalize(select.selectedOptions[0]?.textContent)
      : "";
  };

  const renderDiff = (root, sideA, sideB, cardA, cardB) => {
    const panel = ensureDiffPanel(root);
    const figuresA = diffFigures(cardA);
    const figuresB = diffFigures(cardB);
    // A field neither form fills (both "—") has nothing to compare.
    const filled = (figure) => Boolean(figure) && !/^[—–-]*$/.test(figure.text);
    const names = DIFF_ORDER.filter(
      (name) => filled(figuresA.get(name)) || filled(figuresB.get(name)),
    );
    const rows = names.map((name) => diffRow(name, figuresA.get(name), figuresB.get(name)));
    const [nameA, nameB] = [sideA, sideB].map(sideName);
    panel.querySelector(".compare-diff-name.is-a > span").textContent = nameA;
    panel.querySelector(".compare-diff-name.is-b > span").textContent = nameB;
    const body = panel.querySelector(".compare-diff-rows");
    if (!diffLines.has(panel)) diffLines.set(panel, new Map());
    const views = diffLines.get(panel);
    rows.forEach((row, index) => {
      if (!views.has(row.name)) views.set(row.name, diffLine(row.name));
      const view = views.get(row.name);
      updateDiffLine(view, row);
      if (body.children[index] !== view.line) body.insertBefore(view.line, body.children[index] ?? null);
    });
    while (body.children.length > rows.length) body.lastElementChild.remove();
    panel.querySelector(".compare-diff-table").hidden = rows.length === 0;
    panel.querySelector(".compare-diff-empty").hidden = rows.length !== 0;
    root.dataset.compareDiffRows = String(rows.length);
  };

  const refreshRoot = (root) => {
    const sideA = root.querySelector(".compare-side-a");
    const sideB = root.querySelector(".compare-side-b");
    if (!(sideA instanceof HTMLElement) || !(sideB instanceof HTMLElement)) return;
    const cardA = activeCard(sideA);
    const cardB = activeCard(sideB);
    if (!(cardA instanceof HTMLElement) || !(cardB instanceof HTMLElement)) return;

    clearResults(root);
    [cardA, cardB].forEach((card) => {
      card.querySelectorAll(".compare-spec-placeholder").forEach((item) => item.remove());
    });
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
    renderDiff(root, sideA, sideB, cardA, cardB);
    const alignedRows = alignSpecRows(cardA, cardB);

    const sameForm = cardA.dataset.formId === cardB.dataset.formId;
    updateSummary(sideA, leadsA, comparable, sameForm);
    updateSummary(sideB, leadsB, comparable, sameForm);
    sideA.classList.toggle("is-catalog-leader", leadsA > leadsB);
    sideB.classList.toggle("is-catalog-leader", leadsB > leadsA);
    root.dataset.catalogComparison = "ready";
    root.dataset.catalogLeads = `${leadsA}:${leadsB}`;
    root.dataset.catalogRowsAligned = String(alignedRows);
  };

  const initialize = () => {
    const roots = [...document.querySelectorAll(ROOT_SELECTOR)];
    if (!roots.length) return;
    let frame = 0;
    let started = false;
    const refresh = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        roots.forEach(refreshRoot);
      });
    };
    // The analyzer sits a few screens into the archive. Measuring its two
    // card stacks lays them out although they are not drawn yet, so that
    // first pass waits until the analyzer is near, the reader uses it, or the
    // page is idle, instead of running while the archive opens.
    let nearObserver = null;
    const start = () => {
      if (started) return;
      started = true;
      nearObserver?.disconnect();
      refresh();
      document.fonts?.ready.then(refresh);
    };
    const refreshIfStarted = () => {
      if (started) refresh();
    };
    // Using the analyzer starts it. (The state bridge sets a linked pair
    // before this script listens, so that never counts as use.)
    const refreshOnUse = () => {
      start();
      refresh();
    };
    roots.forEach((root) => {
      root.addEventListener("input", refreshOnUse, true);
      root.addEventListener("change", refreshOnUse, true);
      root.addEventListener("click", refreshOnUse, true);
      new MutationObserver(refreshIfStarted).observe(root, {
        attributes: true,
        attributeFilter: ["data-pair"],
      });
    });
    if ("IntersectionObserver" in window) {
      nearObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) start();
        },
        { rootMargin: "100% 0px" },
      );
      roots.forEach((root) => nearObserver.observe(root));
    }
    const startWhenIdle = () => {
      window.setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(start, { timeout: 2000 });
        } else {
          start();
        }
      }, 2500);
    };
    if (document.readyState === "complete") startWhenIdle();
    else window.addEventListener("load", startWhenIdle, { once: true });
    window.addEventListener("pageshow", refreshIfStarted);
    window.addEventListener("resize", refreshIfStarted, { passive: true });
    // Callers (the shared name-word wrapper) ask for a re-measure; before the
    // first pass there is nothing measured yet, and that pass sees their change.
    window.ArchiveComparisonUI = { refresh: refreshIfStarted, start };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
