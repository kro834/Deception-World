/* ================================================================
   Form Archive — power profile, VS overlay radar and the sortable
   leaderboard (rx9 Cockpit edition, 2026-10-10)

   A classic deferred layer, linked after archive-comparison-modern.js
   in both standalone documents. It reads the owner's values from the
   DOM after the master is ready (and after the Rexonance script has
   rewritten its rows), parses them once, and then:
   1. appends a section.archive-profile (six-axis radar + ability
      octagon + read-out) to the active form's .detail-overview, lazily
      and cached per form;
   2. inserts one section.archive-versus-profile before the analyzer's
      .compare-layout with the A/B polygons on the same six axes;
   3. turns the ratio / performance table into a sortable leaderboard by
      moving the existing rows (never adding columns).
   It never rewrites the owner's values, never creates analyzer
   (compare-*) classes, never touches storage and never opens a dialog.
   ================================================================ */
(() => {
  "use strict";

  const AXES = [
    { key: "punch", label: "パンチ" },
    { key: "kick", label: "キック" },
    { key: "jump", label: "ジャンプ" },
    { key: "speed", label: "速度", sub: "100M" },
    { key: "compute", label: "演算" },
    { key: "emp", label: "EMP" },
  ];
  /* The lowest figure on an axis still reaches the first ring (0.25), so
     the shape of a base form reads as a shape, not a dot. */
  const FLOOR = 0.22;
  const POINT_STATES = new Set([
    "exact",
    "estimate",
    "lower-bound",
    "mode-switch",
    "range",
    "unlimited",
    "yops-only",
  ]);
  const TAGS = {
    "lower-bound": "下限値",
    estimate: "推定",
    unmeasurable: "測定不能",
    none: "記載なし",
    unknown: "記載なし",
    unlimited: "無制限",
    qualitative: "定性",
  };

  /* ---------- Pure helpers (exposed for scripts/archive-profile.test.mjs) ---------- */

  const norm = (text) =>
    String(text ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();

  const stripCommas = (text) => text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");

  const NUMBER = /\d+(?:\.\d+)?/g;

  /** Classify one printed value (report-data §7 order). */
  function classifyValue(raw) {
    const printed = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const text = stripCommas(norm(raw));
    const base = { raw: printed, state: "exact", value: null, min: null, max: null };
    if (!text || /^[—―–-]+$/.test(text)) return { ...base, state: "none" };
    if (/測定不能/.test(text)) return { ...base, state: "unmeasurable" };
    if (/不詳|不明|非公開/.test(text)) return { ...base, state: "unknown" };
    if (/^無制限/.test(text)) return { ...base, state: "unlimited", value: Infinity };
    const numbers = (text.match(NUMBER) || []).map(Number);
    if (/⇄/.test(text) && numbers.length) {
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      return { ...base, state: "mode-switch", value: max, min, max };
    }
    const range = text.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/);
    if (range) {
      const min = Math.min(Number(range[1]), Number(range[2]));
      const max = Math.max(Number(range[1]), Number(range[2]));
      return { ...base, state: "range", value: max, min, max };
    }
    if (!numbers.length) return { ...base, state: "qualitative" };
    const value = numbers[0];
    if (/^≥/.test(text) || /[〜~]/.test(text)) return { ...base, state: "lower-bound", value };
    if (/est\.|推定/i.test(text)) return { ...base, state: "estimate", value };
    return { ...base, value };
  }

  /** TOPS and YOPS stay separate systems; YOPS is never converted. */
  function parseCompute(raw) {
    const printed = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const fragments = [];
    const tops = [];
    const yops = [];
    let bounded = false;
    const pattern = /(\d[\d,]*(?:\.\d+)?)\s*([YZEPTG])OPS(\s*[〜～~])?/g;
    for (const match of printed.matchAll(pattern)) {
      const value = Number(match[1].replace(/,/g, ""));
      fragments.push(match[0].replace(/\s+/g, ""));
      if (match[2] === "T") {
        tops.push(value);
        if (match[3]) bounded = true;
      } else if (match[2] === "Y") yops.push(value);
    }
    if (!fragments.length) {
      const fallback = classifyValue(raw);
      return { ...fallback, display: printed || "—", tops: null, yops: null, hasYops: /YOPS/.test(printed) };
    }
    const switching = /⇄/.test(printed) && tops.length > 1;
    const top = tops.length ? Math.max(...tops) : null;
    const yop = yops.length ? Math.max(...yops) : null;
    let state = "exact";
    if (top == null) state = "yops-only";
    else if (switching) state = "mode-switch";
    else if (bounded) state = "lower-bound";
    else if (/est\.|推定/i.test(norm(printed))) state = "estimate";
    return {
      raw: printed,
      display: fragments.join(switching ? " ⇄ " : " + "),
      state,
      value: top,
      min: switching ? Math.min(...tops) : null,
      max: switching ? top : null,
      tops: top,
      yops: yop,
      hasYops: yop != null,
    };
  }

  /** Split the composite Saga labels (身長・体重, パンチ・キック, ジャンプ・100m) only. */
  const splitComposite = (text) =>
    String(text ?? "")
      .replace(/\s+/g, " ")
      .split(/\s*[/／]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

  /** Of several printed parts (e.g. 右脚 / 左脚), keep the largest figure as printed. */
  function largestPart(parts) {
    let best = parts[0];
    let bestValue = -Infinity;
    for (const part of parts) {
      const { value } = classifyValue(part);
      if (Number.isFinite(value) && value > bestValue) {
        best = part;
        bestValue = value;
      }
    }
    return best;
  }

  /** Six radar axes from a label → printed value map. */
  function extractAxes(specs) {
    const get = (...labels) => {
      for (const label of labels) if (specs.has(label)) return specs.get(label);
      return undefined;
    };
    let punch;
    let kick;
    let jump;
    let time;
    const punchKick = specs.get("パンチ・キック");
    if (punchKick != null) {
      const parts = splitComposite(punchKick);
      punch = parts[0];
      kick = parts.length > 2 ? largestPart(parts.slice(1)) : parts[1];
    } else {
      punch = get("パンチ力", "パンチ");
      kick = get("キック力", "キック");
    }
    const jumpTime = specs.get("ジャンプ・100m");
    if (jumpTime != null) {
      const parts = splitComposite(jumpTime);
      jump = parts[0];
      time = parts[1];
    } else {
      jump = get("ジャンプ力", "ジャンプ");
      time = get("走力", "100m");
    }
    const computeParts = [specs.get("演算"), specs.get("演算2")].filter((value) => value != null);
    const compute = computeParts.length ? computeParts.join(" + ") : undefined;
    const emp = get("EMP");

    const axis = (raw) => {
      if (raw == null) return { ...classifyValue(""), display: "—" };
      const parsed = classifyValue(raw);
      return { ...parsed, display: parsed.raw || "—" };
    };
    const speed = axis(time);
    if (Number.isFinite(speed.value) && speed.value > 0) {
      // 100 m in t seconds → m/s; a shorter time is a faster form.
      speed.time = speed.value;
      speed.value = 100 / speed.value;
      if (speed.min != null) [speed.min, speed.max] = [100 / speed.max, 100 / speed.min];
    }
    const computeAxis = compute == null ? { ...axis(undefined) } : parseCompute(compute);
    return {
      punch: axis(punch),
      kick: axis(kick),
      jump: axis(jump),
      speed,
      compute: computeAxis,
      emp: axis(emp),
    };
  }

  /** Log scale per archive per axis, over finite figures only. */
  function makeScale(values) {
    const finite = values.filter((value) => Number.isFinite(value) && value > 0);
    if (!finite.length) return null;
    return { min: Math.min(...finite), max: Math.max(...finite) };
  }

  function scoreFor(value, scale) {
    if (value === Infinity) return 1;
    if (!scale || !Number.isFinite(value) || value <= 0) return null;
    const low = Math.log10(scale.min);
    const high = Math.log10(scale.max);
    if (high - low < 1e-9) return 1;
    const t = (Math.log10(value) - low) / (high - low);
    return Math.min(1, Math.max(FLOOR, FLOOR + (1 - FLOOR) * t));
  }

  function scaleValues(axis) {
    const out = [];
    if (["exact", "estimate", "lower-bound"].includes(axis.state)) out.push(axis.value);
    if (["mode-switch", "range"].includes(axis.state)) out.push(axis.min, axis.max);
    return out;
  }

  function buildScales(forms) {
    const scales = {};
    for (const { key } of AXES)
      scales[key] = makeScale(forms.flatMap((form) => scaleValues(form.axes[key])));
    return scales;
  }

  /** Radar score for one axis, or null for a gap. */
  function axisScore(axis, scale) {
    if (axis.state === "unlimited" || axis.state === "yops-only") return 1;
    if (!POINT_STATES.has(axis.state)) return null;
    return scoreFor(axis.value, scale);
  }

  /** Sort key for a leaderboard cell. kind: "time" ranks by 1/t. */
  function cellSortKey(text, kind) {
    const compute = parseCompute(text);
    if (compute.state === "yops-only") return { primary: Infinity, secondary: compute.yops ?? 0 };
    const parsed = compute.tops != null ? compute : classifyValue(text);
    if (parsed.state === "unlimited") return { primary: Infinity, secondary: 0 };
    if (!Number.isFinite(parsed.value)) return null;
    let primary = parsed.value;
    let secondary = parsed.min ?? primary;
    if (kind === "time") {
      if (primary <= 0) return null;
      primary = 1 / primary;
      secondary = primary;
    }
    if (parsed.state === "lower-bound") primary *= 1 + 1e-9;
    return { primary, secondary };
  }

  /** Order rows: numbers by key (then archive order), unrated rows last in archive order. */
  function orderRows(entries, direction) {
    const sign = direction === "ascending" ? 1 : -1;
    const rated = entries.filter((entry) => entry.key);
    const unrated = entries.filter((entry) => !entry.key);
    rated.sort(
      (a, b) =>
        sign * compareNumbers(a.key.primary, b.key.primary) ||
        sign * compareNumbers(a.key.secondary, b.key.secondary) ||
        a.index - b.index,
    );
    unrated.sort((a, b) => a.index - b.index);
    return [...rated, ...unrated];
  }

  function compareNumbers(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  /** Competition ranks (1 = highest); ties share a rank. */
  function rankEntries(entries) {
    const ranks = new Map();
    const rated = orderRows(entries, "descending").filter((entry) => entry.key);
    let previous = null;
    rated.forEach((entry, position) => {
      const same =
        previous &&
        previous.key.primary === entry.key.primary &&
        previous.key.secondary === entry.key.secondary;
      ranks.set(entry, same ? ranks.get(previous) : position + 1);
      previous = entry;
    });
    return ranks;
  }

  /* ---------- DOM helpers ---------- */

  const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function printedText(node) {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.data;
      else if (child.nodeName === "BR") out += "\n";
      else if (child.nodeType === 1) out += printedText(child);
    }
    return out;
  }

  const f1 = (n) => Math.round(n * 10) / 10;
  const C = 100;
  const R = 64;
  const angle = (index, count) => ((-90 + (360 / count) * index) * Math.PI) / 180;
  const at = (index, count, radius) => [
    f1(C + Math.cos(angle(index, count)) * radius),
    f1(C + Math.sin(angle(index, count)) * radius),
  ];
  const pointsAttr = (points) => points.map((p) => p.join(",")).join(" ");

  /* The grid is two nodes: the filled rim, and one path for the inner
     rings and the spokes. Each grid is built once and reused. */
  const ringCache = new Map();
  function ringMarkup(count, radius, steps) {
    const cacheKey = `${count}:${radius}:${steps.join(",")}`;
    if (ringCache.has(cacheKey)) return ringCache.get(cacheKey);
    let lines = "";
    for (const step of steps) {
      if (step === 1) continue;
      const points = Array.from({ length: count }, (_, i) => at(i, count, radius * step));
      lines += `M${points.map((p) => p.join(",")).join("L")}Z`;
    }
    for (let i = 0; i < count; i++) lines += `M${C},${C}L${at(i, count, radius).join(",")}`;
    const rim = Array.from({ length: count }, (_, i) => at(i, count, radius));
    const out =
      `<polygon class="ap-ring ap-ring--rim" points="${pointsAttr(rim)}"/>` +
      `<path class="ap-ring" d="${lines}"/>`;
    ringCache.set(cacheKey, out);
    return out;
  }

  /** Marks of one kind share a single path: circles as two arcs each. */
  function markSet() {
    const groups = new Map();
    const add = (className, d) => groups.set(className, (groups.get(className) || "") + d);
    return {
      circle(className, x, y, r) {
        add(className, `M${f1(x - r)},${y}a${r},${r} 0 1,0 ${f1(2 * r)},0a${r},${r} 0 1,0 ${f1(-2 * r)},0`);
      },
      line(className, points) {
        add(className, `M${points.map((p) => p.join(",")).join("L")}`);
      },
      markup() {
        let out = "";
        for (const [className, d] of groups) out += `<path class="${className}" d="${d}"/>`;
        return out;
      },
    };
  }

  const near = (a, b, distance) => Math.hypot(a[0] - b[0], a[1] - b[1]) < distance;

  /** Polygon through the plotted axes; gaps are skipped and neighbours joined. */
  function shapeMarkup(points, className) {
    if (points.length >= 3)
      return `<polygon class="${className}" points="${pointsAttr(points)}"/>`;
    if (points.length === 2)
      return `<polyline class="${className} ap-shape--open" points="${pointsAttr(points)}"/>`;
    return "";
  }

  function radarMarkup(axes, scales) {
    const count = AXES.length;
    const marks = markSet();
    let glyphs = "";
    const points = [];
    const placed = [];
    AXES.forEach(({ key }, i) => {
      const axis = axes[key];
      const score = axisScore(axis, scales[key]);
      const [dx, dy] = [Math.cos(angle(i, count)), Math.sin(angle(i, count))];
      if (axis.state === "unmeasurable") {
        const [x, y] = at(i, count, R);
        marks.circle("ap-mark ap-mark--unmeasurable", x, y, 5);
        return;
      }
      if (score == null) return;
      const radius = R * score;
      const point = at(i, count, radius);
      points.push(point);
      const [x, y] = point;
      // A vertex that would sit on top of another one is drawn smaller.
      const crowded = placed.some((other) => near(other, point, 6));
      placed.push(point);
      if (axis.state === "mode-switch" || axis.state === "range") {
        const low = scoreFor(axis.min, scales[key]) ?? FLOOR;
        const lowPoint = at(i, count, R * low);
        marks.line("ap-span", [lowPoint, point]);
        if (!near(lowPoint, point, 6)) marks.circle("ap-mark ap-mark--span-low", lowPoint[0], lowPoint[1], 2.6);
      }
      if (axis.hasYops) {
        marks.circle("ap-halo", x, y, 8.5);
        marks.circle("ap-halo ap-halo--outer", x, y, 12.5);
      }
      const scale = crowded ? 0.6 : 1;
      if (axis.state === "estimate") marks.circle("ap-mark ap-mark--estimate", x, y, f1(4.4 * scale));
      else if (axis.state === "yops-only") marks.circle("ap-mark ap-mark--yops", x, y, f1(4 * scale));
      else marks.circle("ap-mark", x, y, f1(3.6 * scale));
      if (axis.state === "lower-bound") {
        const nx = -dy;
        const ny = dx;
        const tip = [f1(x + dx * 12), f1(y + dy * 12)];
        const left = [f1(x + dx * 6 + nx * 4.5), f1(y + dy * 6 + ny * 4.5)];
        const right = [f1(x + dx * 6 - nx * 4.5), f1(y + dy * 6 - ny * 4.5)];
        marks.line("ap-chevron", [left, tip, right]);
      }
      if (axis.state === "unlimited") {
        const [tx, ty] = at(i, count, R - 15);
        glyphs += `<text class="ap-glyph" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">∞</text>`;
      }
      if (axis.state === "yops-only") {
        const [tx, ty] = at(i, count, R - 34);
        glyphs += `<text class="ap-glyph ap-glyph--yops" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">YOPS</text>`;
      }
    });
    return (
      ringMarkup(count, R, [0.25, 0.5, 0.75, 1]) +
      shapeMarkup(points, "ap-shape ap-shape--glow") +
      shapeMarkup(points, "ap-shape") +
      marks.markup() +
      glyphs
    );
  }

  /** Axis names, placed straight on the plot (no wrapper) and hidden from
      assistive technology: the chart's own label carries the values. */
  function axisLabelsMarkup(labels, count, radiusPercent, className, states = []) {
    return labels
      .map((label, i) => {
        const cos = Math.cos(angle(i, count));
        const sin = Math.sin(angle(i, count));
        const x = f1(50 + cos * radiusPercent);
        const y = f1(50 + sin * radiusPercent);
        const state = states[i] ? ` data-state="${states[i]}"` : "";
        /* --ax/--ay push the label outward by part of its own size, so wide
           names clear the rim markers on the diagonal axes. */
        return `<span class="${className}"${state} aria-hidden="true" style="left:${x}%;top:${y}%;--ax:${f1(cos * 100) / 100};--ay:${f1(sin * 100) / 100}">${label}</span>`;
      })
      .join("");
  }

  /** Axis names around the radar; a gap axis is marked so its name dims. */
  const radarLabels = (axes, scales) =>
    axisLabelsMarkup(
      AXES.map((axis) => escapeHtml(axis.label)),
      AXES.length,
      42,
      "archive-profile__axis",
      axes
        ? AXES.map(({ key }) =>
            axes[key].state === "unmeasurable"
              ? "unmeasurable"
              : axisScore(axes[key], scales[key]) == null
                ? "gap"
                : "",
          )
        : [],
    );

  /** The state tag a reading carries, or "" when the printed value already says it (e.g. 測定不能t). */
  function stateTag(axis) {
    const tag = TAGS[axis?.state];
    if (!tag) return "";
    return String(axis.display || "").includes(tag) ? "" : tag;
  }

  function axisSummary(axes) {
    return AXES.map(({ key, label }) => {
      const axis = axes[key];
      const tag = stateTag(axis);
      const value = axis.state === "none" ? "" : axis.display;
      const note = tag ? `（${tag}）` : "";
      return `${label} ${value}${note}`.trim();
    }).join("、");
  }

  /* ---------- Archive context ---------- */

  function setupArchive(root) {
    if (root.dataset.profileReady === "true") return;
    const p = root.id.startsWith("realm--") ? "realm--" : "";
    const isRealm = Boolean(p);
    const forms = [];
    const byId = new Map();
    for (const chip of root.querySelectorAll(".form-chip[data-form-id]")) {
      const id = chip.dataset.formId;
      const article = document.getElementById(chip.getAttribute("aria-controls") || "");
      if (!id || !article || byId.has(id)) continue;
      const specs = new Map();
      for (const item of article.querySelectorAll(".viz-grid .spec-item")) {
        const label = item.querySelector(".text-muted");
        const value = item.querySelector(".spec-value");
        if (label && value) specs.set(norm(label.textContent), printedText(value));
      }
      const form = {
        id,
        article,
        name: norm(chip.querySelector(".chip-name")?.textContent) || id,
        axes: extractAxes(specs),
        abilities: null,
        section: null,
      };
      forms.push(form);
      byId.set(id, form);
    }
    if (!forms.length) return;
    const scales = buildScales(forms);

    // Ability matrix (8 columns): ● 2, ○ 1, — 0.
    const abilityHead = document.getElementById(`${p}saga-ability-head-v5`);
    const abilityLabels = abilityHead
      ? [...abilityHead.cells].slice(1).map((cell) => norm(cell.textContent))
      : [];
    const abilityBody = document.getElementById(`${p}saga-ability-body-v5`);
    if (abilityBody) {
      for (const row of abilityBody.rows) {
        const form = byId.get(row.dataset.formId);
        if (!form) continue;
        form.abilities = [...row.cells].slice(1).map((cell) =>
          cell.classList.contains("cap-core") ? 2 : cell.classList.contains("cap-support") ? 1 : 0,
        );
      }
    }

    const context = { root, p, isRealm, forms, byId, scales, abilityLabels };
    root.dataset.profileReady = "true";

    const ensure = (id) => {
      try {
        renderProfile(context, byId.get(id));
      } catch (error) {
        console.warn("[archive-profile]", error);
      }
    };
    // Render before the switch transition measures the next article.
    root.addEventListener("archive:formchange", (event) => ensure(event.detail?.formId));
    new MutationObserver(() => ensure(root.dataset.activeForm)).observe(root, {
      attributes: true,
      attributeFilter: ["data-active-form"],
    });
    ensure(root.dataset.activeForm || forms[0].id);
    guard(() => fitNames(forms));
    guard(() => setupRailFocus(root));

    // The analyzer radar and the leaderboard sit far below the first
    // screen: build them in idle time, each in its own task.
    whenIdle(() => guard(() => setupVersus(context)));
    whenIdle(() => guard(() => setupLeaderboard(context)));
  }

  function guard(fn) {
    try {
      fn();
    } catch (error) {
      console.warn("[archive-profile]", error);
    }
  }

  function whenIdle(fn) {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 1500 });
    else setTimeout(fn, 200);
  }

  /** The longest run of a name that cannot break (no space, no <wbr>, not
      after ・), so the HUD can size the name to fit its column. */
  function longestRun(node) {
    let longest = 0;
    let run = 0;
    const walk = (parent) => {
      for (const child of parent.childNodes) {
        if (child.nodeType === 3) {
          for (const character of child.data) {
            if (/\s/.test(character)) {
              run = 0;
              continue;
            }
            run += 1;
            if (run > longest) longest = run;
            if (character === "・") run = 0;
          }
        } else if (child.nodeName === "WBR") run = 0;
        else if (child.nodeType === 1) walk(child);
      }
    };
    walk(node);
    return longest;
  }

  // Set on the name itself, so only the name restyles (not its article).
  function fitNames(forms) {
    for (const form of forms) {
      const name = form.article.querySelector(".detail-head h3");
      const run = name ? longestRun(name) : 0;
      if (run) name.style.setProperty("--ck-name-len", String(run));
    }
  }

  /* ---------- Rail keyboard: the focused card stays on screen ----------
     From 901px the rail's card list is pinned under its search, but until
     the page has scrolled it into place the list can run below the
     window. The controller moves focus without scrolling and centres the
     card inside the list only, so after an arrow key the page scrolls
     just enough to show the focused card once the list has settled. */
  function setupRailFocus(root) {
    const list = root.querySelector('[id$="form-selector"] .progression');
    if (!list || typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia("(min-width: 901px)");
    const keys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
    let run = 0;
    list.addEventListener("keydown", (event) => {
      if (!wide.matches || !keys.has(event.key)) return;
      const token = ++run;
      let frames = 0;
      let still = 0;
      let last = NaN;
      const settle = () => {
        if (token !== run) return;
        const chip = document.activeElement;
        if (!chip || !list.contains(chip) || !chip.classList.contains("form-chip")) return;
        const top = list.scrollTop;
        still = top === last ? still + 1 : 0;
        last = top;
        frames += 1;
        // Wait out the controller's image warm-up and its smooth scroll.
        if ((frames < 8 || still < 3) && frames < 90) {
          requestAnimationFrame(settle);
          return;
        }
        const rect = chip.getBoundingClientRect();
        const gap = 16;
        const view = window.innerHeight || document.documentElement.clientHeight;
        let delta = 0;
        if (rect.bottom > view - gap) delta = Math.min(rect.bottom - (view - gap), rect.top - gap);
        else if (rect.top < gap) delta = rect.top - gap;
        if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "auto" });
      };
      requestAnimationFrame(settle);
    });
  }

  /* ---------- 1. Power profile ---------- */

  function renderProfile(context, form) {
    if (!form || form.section?.isConnected) return;
    const overview = form.article.querySelector(".detail-overview");
    if (!overview) return;
    const titleId = `${form.article.id}-profile-title`;
    const plotted = AXES.some(({ key }) => axisScore(form.axes[key], context.scales[key]) != null);
    const measuredGap = AXES.some(({ key }) => form.axes[key].state === "unmeasurable");
    const empty = !plotted && !measuredGap;

    const section = document.createElement("section");
    section.className = "archive-profile";
    section.setAttribute("aria-labelledby", titleId);
    section.dataset.profileForm = form.id;
    if (empty) section.dataset.profileEmpty = "true";

    const readout = AXES.map(({ key, label, sub }) => {
      const axis = form.axes[key];
      const tag = stateTag(axis);
      const value = axis.display || "—";
      const tagMarkup =
        tag
          ? `<span class="archive-profile__tag" data-state="${axis.state}">${tag}</span>`
          : "";
      return (
        `<li class="archive-profile__reading" data-axis="${key}" data-state="${axis.state}">` +
        `<span class="archive-profile__reading-label">${escapeHtml(label)}${sub && !/100m/i.test(value) ? `<small>${sub}</small>` : ""}</span>` +
        `<span class="archive-profile__reading-value">${escapeHtml(value).replace(/\//g, "\u200b/")}</span>${tagMarkup}</li>`
      );
    }).join("");

    const summary = empty ? "性能プロファイル：数値の記載なし" : `性能プロファイル：${axisSummary(form.axes)}`;
    section.innerHTML =
      `<header class="archive-profile__head">` +
      `<span class="archive-profile__kicker" aria-hidden="true">POWER PROFILE</span>` +
      `<h4 class="archive-profile__title" id="${titleId}">性能プロファイル</h4>` +
      `<span class="archive-profile__scale">対数目盛</span>` +
      `</header>` +
      `<div class="archive-profile__charts">` +
      `<figure class="archive-profile__chart archive-profile__chart--radar">` +
      `<div class="archive-profile__plot">` +
      `<svg class="archive-profile__svg" viewBox="0 0 200 200" role="img" aria-label="${escapeHtml(summary)}" focusable="false">` +
      radarMarkup(form.axes, context.scales) +
      `</svg>` +
      radarLabels(form.axes, context.scales) +
      (empty ? `<p class="archive-profile__empty">数値の記載なし</p>` : "") +
      `</div></figure>` +
      abilityMarkup(context, form) +
      `</div>` +
      `<ul class="archive-profile__readout">${readout}</ul>`;
    overview.append(section);
    form.section = section;
  }

  function abilityMarkup(context, form) {
    const levels = form.abilities;
    const labels = context.abilityLabels;
    if (!levels || levels.length !== labels.length || !levels.length) return "";
    const count = levels.length;
    const radius = 52;
    const absent = context.isRealm ? "非搭載" : "記載なし";
    const levelName = (level) => (level === 2 ? "中核" : level === 1 ? "補助" : absent);
    const marks = markSet();
    const points = [];
    levels.forEach((level, i) => {
      if (level === 0) {
        if (context.isRealm) points.push(at(i, count, 0));
        else {
          const [x, y] = at(i, count, radius * 0.5);
          marks.circle("ap-mark ap-mark--unstated", x, y, 3.6);
        }
        return;
      }
      const point = at(i, count, (radius * level) / 2);
      points.push(point);
      marks.circle(`ap-mark ap-mark--level${level}`, point[0], point[1], level === 2 ? 3.6 : 3);
    });
    const summary = `能力系統：${labels.map((label, i) => `${label} ${levelName(levels[i])}`).join("、")}`;
    // The labels keep their own line breaks after ・ (white-space: pre-line).
    const labelMarkup = axisLabelsMarkup(
      labels.map((label) => escapeHtml(label).replace(/・/g, "・\n")),
      count,
      37,
      "archive-profile__axis archive-profile__axis--ability",
    );
    return (
      `<figure class="archive-profile__chart archive-profile__chart--ability" data-absent="${context.isRealm ? "fitted" : "unstated"}">` +
      `<div class="archive-profile__plot">` +
      `<svg class="archive-profile__svg" viewBox="0 0 200 200" role="img" aria-label="${escapeHtml(summary)}" focusable="false">` +
      ringMarkup(count, radius, [0.5, 1]) +
      shapeMarkup(points, "ap-shape ap-shape--ability ap-shape--glow") +
      shapeMarkup(points, "ap-shape ap-shape--ability") +
      marks.markup() +
      `</svg>` +
      labelMarkup +
      `</div>` +
      `<figcaption class="archive-profile__legend" aria-hidden="true">` +
      `<span class="archive-profile__kicker">ABILITY</span>` +
      `<span><i class="archive-profile__key archive-profile__key--2"></i>中核</span>` +
      `<span><i class="archive-profile__key archive-profile__key--1"></i>補助</span>` +
      `<span><i class="archive-profile__key archive-profile__key--0"></i>${absent}</span>` +
      `</figcaption>` +
      `</figure>`
    );
  }

  /* ---------- 2. VS overlay radar ---------- */

  function setupVersus(context) {
    const { p, byId, scales } = context;
    const compare = document.getElementById(`${p}saga-form-compare-ios`);
    const layout = compare?.querySelector(":scope > .compare-layout");
    const selectA = document.getElementById(`${p}saga-compare-select-a`);
    const selectB = document.getElementById(`${p}saga-compare-select-b`);
    if (!compare || !layout || !selectA || !selectB) return;
    if (compare.querySelector(":scope > .archive-versus-profile")) return;

    const titleId = `${p}archive-versus-profile-title`;
    const section = document.createElement("section");
    section.className = "archive-versus-profile";
    section.setAttribute("aria-labelledby", titleId);
    section.innerHTML =
      `<header class="archive-versus-profile__head">` +
      `<span class="archive-profile__kicker" aria-hidden="true">VS PROFILE</span>` +
      `<h3 class="archive-versus-profile__title" id="${titleId}">性能プロファイル比較</h3>` +
      `</header>` +
      `<div class="archive-versus-profile__body">` +
      `<div class="archive-profile__plot archive-versus-profile__plot">` +
      `<svg class="archive-profile__svg" viewBox="0 0 200 200" role="img" aria-label="性能プロファイル比較" focusable="false"></svg>` +
      radarLabels() +
      `</div>` +
      `<ul class="archive-versus-profile__legend">` +
      `<li data-side="a"><i class="archive-versus-profile__swatch" aria-hidden="true"></i><b>A</b><span></span></li>` +
      `<li data-side="b"><i class="archive-versus-profile__swatch" aria-hidden="true"></i><b>B</b><span></span></li>` +
      `</ul>` +
      `<p class="archive-profile__scale archive-versus-profile__note">対数目盛</p>` +
      `</div>`;
    layout.before(section);

    const svg = section.querySelector("svg");
    const names = section.querySelectorAll(".archive-versus-profile__legend span");
    let lastPair = "";
    let visible = false;
    let queued = false;

    // Each side's markup is built once per form and reused.
    const sideCache = new Map();
    const sideMarkup = (form, side) => {
      if (!form) return "";
      const cacheKey = `${side}:${form.id}`;
      if (sideCache.has(cacheKey)) return sideCache.get(cacheKey);
      const points = [];
      const marks = markSet();
      AXES.forEach(({ key }, i) => {
        const axis = form.axes[key];
        if (axis.state === "unmeasurable") {
          const [x, y] = at(i, AXES.length, R);
          marks.circle("ap-mark ap-mark--unmeasurable", x, y, 4.6);
          return;
        }
        const score = axisScore(axis, scales[key]);
        if (score == null) return;
        const point = at(i, AXES.length, R * score);
        points.push(point);
        marks.circle(axis.state === "estimate" ? "ap-mark ap-mark--estimate" : "ap-mark", point[0], point[1], 3.4);
      });
      const out =
        `<g class="avp-side" data-side="${side}">` +
        shapeMarkup(points, "ap-shape ap-shape--glow") +
        shapeMarkup(points, "ap-shape") +
        marks.markup() +
        `</g>`;
      sideCache.set(cacheKey, out);
      return out;
    };

    const optionName = (select) =>
      norm(select.selectedOptions?.[0]?.textContent || select.options?.[select.selectedIndex]?.textContent || "");

    const update = () => {
      queued = false;
      const a = byId.get(selectA.value);
      const b = byId.get(selectB.value);
      const pair = `${selectA.value}::${selectB.value}`;
      if (pair === lastPair && svg.childNodes.length) return;
      if (!visible) return;
      lastPair = pair;
      const nameA = optionName(selectA) || a?.name || "";
      const nameB = optionName(selectB) || b?.name || "";
      names[0].textContent = nameA;
      names[1].textContent = nameB;
      svg.innerHTML =
        ringMarkup(AXES.length, R, [0.25, 0.5, 0.75, 1]) +
        sideMarkup(a, "a") +
        sideMarkup(b, "b");
      const sideSummary = (label, name, form) =>
        form ? `${label} ${name}：${axisSummary(form.axes)}` : `${label} ${name}`;
      svg.setAttribute(
        "aria-label",
        `性能プロファイル比較。${sideSummary("A", nameA, a)}。${sideSummary("B", nameB, b)}`,
      );
    };
    // Keep the radar immediately before .compare-layout, also after the
    // analyzer inserts its difference panel there.
    const keepPlace = () => {
      if (section.nextElementSibling !== layout && layout.parentElement === compare) layout.before(section);
    };
    const schedule = () => {
      keepPlace();
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => requestAnimationFrame(update));
    };

    compare.addEventListener("input", schedule, true);
    compare.addEventListener("change", schedule, true);
    new MutationObserver(schedule).observe(compare, {
      attributes: true,
      attributeFilter: ["data-compare-diff-rows", "data-catalog-comparison", "data-pair"],
    });
    window.addEventListener("pageshow", schedule);

    // Draw only once the analyzer comes near the viewport.
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          visible = true;
          update();
        },
        { rootMargin: "100% 0px" },
      );
      observer.observe(section);
    } else {
      visible = true;
      update();
    }
  }

  /* ---------- 3. Sortable leaderboard ---------- */

  function setupLeaderboard(context) {
    const { p, isRealm } = context;
    const tbody = document.getElementById(`${p}saga-ratio-body-v5`);
    const table = tbody?.closest("table");
    const headRow = table?.tHead?.rows?.[0];
    if (!table || !headRow || table.dataset.sortReady === "true") return;
    const ths = [...headRow.cells];
    const rows = [...tbody.rows];
    if (!rows.length) return;

    const columns = ths.map((th, index) => {
      const label = norm(th.textContent);
      const restores = index === 0 || label === "段階・役割";
      const kind = isRealm && label === "100m" ? "time" : "value";
      return { th, index, label, restores, kind };
    });

    const entries = rows.map((row, index) => {
      const keys = columns.map((column) => {
        if (column.restores) return null;
        const cell = row.cells[column.index];
        if (!cell) return null;
        const valueNode = cell.querySelector(".ratio-value");
        return cellSortKey(printedText(valueNode || cell), column.kind);
      });
      return { row, index, keys, key: null };
    });

    const wrap = table.closest(".table-responsive") || table;
    const status = document.createElement("span");
    status.className = "archive-sort-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    wrap.after(status);

    let current = { column: -1, direction: null };

    const apply = (columnIndex, direction, announce) => {
      const column = columns[columnIndex];
      const sorted = Boolean(direction && column && !column.restores);
      entries.forEach((entry) => {
        entry.key = sorted ? entry.keys[columnIndex] : null;
      });
      const order = sorted ? orderRows(entries, direction) : [...entries].sort((a, b) => a.index - b.index);
      const ranks = sorted ? rankEntries(entries) : new Map();
      const fragment = document.createDocumentFragment();
      for (const entry of order) fragment.append(entry.row);
      tbody.append(fragment);
      for (const entry of entries) {
        const rank = ranks.get(entry);
        const head = entry.row.cells[0];
        if (rank) {
          entry.row.dataset.rank = String(rank);
          head?.setAttribute("data-rank-label", String(rank).padStart(2, "0"));
        } else {
          delete entry.row.dataset.rank;
          head?.removeAttribute("data-rank-label");
        }
      }
      for (const item of columns) {
        if (sorted && item.index === columnIndex) item.th.setAttribute("aria-sort", direction);
        else item.th.removeAttribute("aria-sort");
      }
      if (sorted) table.dataset.sortCol = String(columnIndex + 1);
      else delete table.dataset.sortCol;
      current = { column: sorted ? columnIndex : -1, direction: sorted ? direction : null };
      if (announce)
        status.textContent = sorted
          ? `${column.label}の${direction === "descending" ? "降順" : "昇順"}`
          : "アーカイブ順";
    };

    for (const column of columns) {
      const { th } = column;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "archive-sort";
      if (column.restores) {
        // These two columns put the table back in archive order.
        button.dataset.sortRestore = "true";
        button.setAttribute("aria-label", `${column.label}（アーカイブ順に戻す）`);
        button.title = "アーカイブ順に戻す";
      }
      const label = document.createElement("span");
      label.className = "archive-sort__label";
      while (th.firstChild) label.append(th.firstChild);
      const icon = document.createElement("span");
      icon.className = "archive-sort__icon";
      icon.setAttribute("aria-hidden", "true");
      button.append(label, icon);
      th.append(button);
      th.classList.add("archive-sort-head");
      button.addEventListener("click", () => {
        if (column.restores) {
          apply(-1, null, true);
          return;
        }
        let next = "descending";
        if (current.column === column.index)
          next = current.direction === "descending" ? "ascending" : current.direction === "ascending" ? null : "descending";
        apply(next ? column.index : -1, next, true);
      });
    }
    table.dataset.sortReady = "true";
  }

  /* ---------- Boot ---------- */

  const internals = Object.freeze({
    classifyValue,
    parseCompute,
    splitComposite,
    extractAxes,
    makeScale,
    scoreFor,
    buildScales,
    axisScore,
    cellSortKey,
    orderRows,
    rankEntries,
    stateTag,
    longestRun,
    FLOOR,
  });
  try {
    Object.defineProperty(window, "ArchiveProfileInternals", { value: internals, configurable: true });
  } catch {
    /* a frozen global is fine */
  }

  const doc = typeof document === "undefined" ? null : document;
  if (!doc || !doc.documentElement) return;

  function start() {
    const kind = doc.documentElement.dataset?.archiveKind;
    const roots = [...doc.querySelectorAll('[id$="saga-forms-performance-v5"]')].filter(
      (root) => !kind || (kind === "realm") === root.id.startsWith("realm--"),
    );
    for (const root of roots) {
      const boot = () => guard(() => setupArchive(root));
      if (root.dataset.masterReady === "true") {
        boot();
        continue;
      }
      const observer = new MutationObserver(() => {
        if (root.dataset.masterReady !== "true") return;
        observer.disconnect();
        setTimeout(boot, 0);
      });
      observer.observe(root, { attributes: true, attributeFilter: ["data-master-ready"] });
    }
  }

  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", () => setTimeout(start, 0), { once: true });
  else setTimeout(start, 0);
})();
