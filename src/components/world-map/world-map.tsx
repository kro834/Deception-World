import { useEffect, useMemo, useRef, useState } from "react";
import { DisplayName } from "@/components/name-text";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import {
  MAP_KINDS,
  WORLD_MAP_EDGES,
  WORLD_MAP_NODES,
  filterMapNodes,
  mapNeighbors,
  worldMapLabHref,
  type MapKind,
} from "@/lib/world-map-data";

type State = { q: string; kind: MapKind | "all"; node: string };

const KIND_OPTICS: Record<MapKind, { stroke: string; hi: string }> = {
  person: { stroke: "#7ae8ff", hi: "#d8f8ff" },
  organization: { stroke: "#f0c488", hi: "#ffecd0" },
  form: { stroke: "#c6b2ff", hi: "#ece4ff" },
  event: { stroke: "#8ec5ff", hi: "#dceeff" },
  chapter: { stroke: "#e6cfa4", hi: "#fff3dc" },
};

function hexPoints(radius: number): string {
  return Array.from({ length: 6 }, (_, idx) => {
    const angle = (idx * Math.PI) / 3 - Math.PI / 6;
    return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
  }).join(" ");
}

function renderNodeGlyph(kind: MapKind, isCenter: boolean) {
  if (kind === "person") {
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <circle className="wm-node-pip" r={isCenter ? 4.5 : 2.6} />
      </g>
    );
  }
  if (kind === "organization") {
    const outer = isCenter ? 15 : 6;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <polygon className="wm-node-plate" points={hexPoints(outer)} />
      </g>
    );
  }
  if (kind === "form") {
    const s = isCenter ? 15 : 6;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <polygon className="wm-node-plate" points={`0,${-s} ${s},0 0,${s} ${-s},0`} />
      </g>
    );
  }
  if (kind === "chapter") {
    const w = isCenter ? 10.5 : 4.4;
    const h = isCenter ? 12.5 : 5.2;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <rect className="wm-node-plate" x={-w} y={-h} width={w * 2} height={h * 2} rx="1.5" />
      </g>
    );
  }
  const tick = isCenter ? 11 : 4.8;
  return (
    <g className="wm-node-glyph" aria-hidden="true">
      <path className="wm-node-tick" d={`M0 ${-tick}V${tick}M${-tick} 0H${tick}`} />
    </g>
  );
}

export function WorldMap({
  q,
  kind,
  node,
  onChange,
}: State & { onChange: (patch: Partial<State>) => void }) {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const restoredInitialQuery = useRef(false);
  useEffect(() => {
    if (restoredInitialQuery.current) return;
    restoredInitialQuery.current = true;
    // Safari can retain text typed into the server-rendered field before React attaches.
    const value = searchInput.current?.value;
    if (value != null && value !== q) onChange({ q: value });
  }, [onChange, q]);
  const svgRef = useRef<SVGSVGElement>(null);
  const selected = WORLD_MAP_NODES.find((n) => n.id === node) ?? WORLD_MAP_NODES[0];
  const neighbors = useMemo(() => mapNeighbors(selected.id), [selected.id]);
  const results = useMemo(() => filterMapNodes(q, kind), [q, kind]);
  const queryMatches = useMemo(() => filterMapNodes(q, "all"), [q]);
  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { all: queryMatches.length };
    for (const key of Object.keys(MAP_KINDS)) counts[key] = 0;
    for (const item of queryMatches) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
    return counts;
  }, [queryMatches]);
  const neighborhood = WORLD_MAP_NODES.filter(
    (n) => neighbors.has(n.id) && results.some((r) => r.id === n.id),
  );
  const nodes = [selected, ...neighborhood];
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    inverse: DOMMatrix;
  } | null>(null);

  const totalNeighbors = nodes.length - 1;
  const orbitTracks =
    totalNeighbors > 14
      ? [
          [175, 130],
          [305, 215],
          [425, 292],
        ]
      : totalNeighbors > 7
        ? [
            [215, 155],
            [355, 255],
          ]
        : [[265, 195]];
  const ringCount = orbitTracks.length;
  const angularSlots = Math.max(1, Math.ceil(totalNeighbors / ringCount) * ringCount);

  const points = nodes.map((n, i) => {
    if (i === 0) return { ...n, x: 0, y: 0 };
    const slot = i - 1;
    const angle = (slot / angularSlots) * Math.PI * 2 - Math.PI / 2;
    const tier = slot % ringCount;
    const [rx, ry] = orbitTracks[tier];
    return {
      ...n,
      x: Number((Math.cos(angle) * rx).toFixed(3)),
      y: Number((Math.sin(angle) * ry).toFixed(3)),
    };
  });

  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const crossEdges = useMemo(
    () =>
      WORLD_MAP_EDGES.filter(
        (e) =>
          e.from !== selected.id &&
          e.to !== selected.id &&
          pointById.has(e.from) &&
          pointById.has(e.to),
      ),
    [pointById, selected.id],
  );

  const connections = WORLD_MAP_EDGES.filter((e) => e.from === selected.id || e.to === selected.id);
  const choose = (id: string) => {
    onChange({ node: id });
    setView({ x: 0, y: 0, zoom: 1 });
  };
  const zoom = (by: number) =>
    setView((v) => ({
      ...v,
      zoom: Math.max(0.45, Math.min(2, Math.round((v.zoom + by) * 100) / 100)),
    }));
  const moveNodeFocus = (index: number) => {
    const list = svgRef.current?.querySelectorAll<SVGGElement>(".wm-node");
    if (!list?.length) return;
    const wrapped = (index + list.length) % list.length;
    list[wrapped]?.focus();
  };
  const selectedOptic = KIND_OPTICS[selected.kind];
  const isFiltering = Boolean(q.trim()) || kind !== "all";
  const directory = (
    <section className="wm-index" data-filtered={isFiltering} aria-labelledby="wm-index-title">
      <div className="wm-index-heading">
        <h2 id="wm-index-title">資料から選ぶ</h2>
        <span role="status">{results.length} 件</span>
        {isFiltering && <a href="#wm-selected-record">選択中の資料へ ↓</a>}
      </div>
      <div className="wm-index-grid">
        {results.map((n) => (
          <button
            key={n.id}
            type="button"
            data-kind={n.kind}
            aria-pressed={n.id === selected.id}
            onClick={() => choose(n.id)}
          >
            <small>{MAP_KINDS[n.kind]}</small>
            {/* Names break at their own seams (仮面ライダー／サイファー), not
                wherever the column ends; the stored title is untouched. */}
            <span>
              <DisplayName value={n.title} />
            </span>
          </button>
        ))}
      </div>
      {!results.length && <p>該当する資料がありません。検索語や種類を変えてください。</p>}
    </section>
  );

  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <main id="world-map-main" className="world wm-page">
        <header className="wm-header">
          <a href="/world" className="wm-back">
            ← WORLD
          </a>
          <div className="wm-header-actions">
            <a href="/transformation-lab" className="wm-lab-link">
              変身ラボ ↗
            </a>
            <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
          </div>
        </header>
        <div className="wm-intro">
          <div>
            <h1 id="world-map-title">
              世界関係図<span>記録の、その先へ。</span>
            </h1>
          </div>
          <p>
            人物から形態へ。出来事から章へ。
            <br />
            ひとつの接続を選び、世界を辿る。
          </p>
        </div>
        <div className="wm-tools">
          <div className="wm-search-shell">
            <label className="wm-search">
              <span className="wm-search-label">検索</span>
              <input
                ref={searchInput}
                type="search"
                value={q}
                maxLength={120}
                onChange={(e) => onChange({ q: e.target.value })}
                placeholder="人物・形態・章を探す"
              />
            </label>
            {q ? (
              <button
                type="button"
                className="wm-search-clear"
                aria-label="検索語をクリア"
                onClick={() => {
                  onChange({ q: "" });
                  searchInput.current?.focus();
                }}
              >
                ×
              </button>
            ) : null}
          </div>
          <div className="wm-filters" role="group" aria-label="種類で絞り込み">
            {([["all", "すべて"], ...Object.entries(MAP_KINDS)] as [string, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  data-kind={key}
                  aria-pressed={kind === key}
                  onClick={() => onChange({ kind: key as State["kind"] })}
                >
                  <span>{label}</span>
                  <em className="wm-filter-count" aria-hidden="true">
                    {kindCounts[key] ?? 0}
                  </em>
                </button>
              ),
            )}
          </div>
        </div>
        {isFiltering && directory}
        <div className="wm-workspace">
          <section
            className="wm-canvas"
            data-selected-kind={selected.kind}
            aria-label={`${selected.title}を中心とした相関図`}
          >
            <svg
              ref={svgRef}
              viewBox="-500 -360 1000 720"
              role="group"
              aria-label="選択した項目の直接の接続。下の一覧でも同じ項目を選択できます。"
              onPointerDown={(e) => {
                if (!e.isPrimary || e.button !== 0 || drag.current) return;
                if ((e.target as Element).closest("[data-node]")) return;
                const matrix = e.currentTarget.getScreenCTM();
                if (!matrix) return;
                const inverse = matrix.inverse();
                const start = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  pointerId: e.pointerId,
                  x: start.x,
                  y: start.y,
                  originX: view.x,
                  originY: view.y,
                  inverse,
                };
              }}
              onPointerMove={(e) => {
                const active = drag.current;
                if (!active || active.pointerId !== e.pointerId) return;
                const current = new DOMPoint(e.clientX, e.clientY).matrixTransform(active.inverse);
                setView((v) => ({
                  ...v,
                  x: active.originX + current.x - active.x,
                  y: active.originY + current.y - active.y,
                }));
              }}
              onPointerUp={(e) => {
                if (drag.current?.pointerId === e.pointerId) drag.current = null;
              }}
              onPointerCancel={(e) => {
                if (drag.current?.pointerId === e.pointerId) drag.current = null;
              }}
              onLostPointerCapture={(e) => {
                if (drag.current?.pointerId === e.pointerId) drag.current = null;
              }}
            >
              <defs>
                <radialGradient id="wm-core">
                  <stop offset="0%" stopColor={selectedOptic.stroke} stopOpacity=".22" />
                  <stop offset="45%" stopColor="#7ae8ff" stopOpacity=".07" />
                  <stop offset="100%" stopColor="#7ae8ff" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="wm-inner-corona">
                  <stop offset="0%" stopColor={selectedOptic.hi} stopOpacity=".18" />
                  <stop offset="68%" stopColor={selectedOptic.stroke} stopOpacity=".04" />
                  <stop offset="100%" stopColor={selectedOptic.stroke} stopOpacity="0" />
                </radialGradient>
                {points.slice(1).map((p, idx) => {
                  const targetOptic = KIND_OPTICS[p.kind];
                  return (
                    <linearGradient
                      key={p.id}
                      id={`wm-edge-grad-${idx}`}
                      gradientUnits="userSpaceOnUse"
                      x1="0"
                      y1="0"
                      x2={p.x}
                      y2={p.y}
                    >
                      <stop offset="0%" stopColor={selectedOptic.hi} stopOpacity="0.92" />
                      <stop offset="48%" stopColor="#7ae8ff" stopOpacity="0.58" />
                      <stop offset="100%" stopColor={targetOptic.stroke} stopOpacity="0.94" />
                    </linearGradient>
                  );
                })}
              </defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
                <g className="wm-astrolabe" aria-hidden="true">
                  <ellipse rx="430" ry="300" fill="url(#wm-core)" />
                  <circle r="120" fill="url(#wm-inner-corona)" />
                  <path className="wm-sighting-axis" d="M-440 0H-48M48 0H440M0 -308V-48M0 48V308" />
                  <ellipse rx="105" ry="78" className="wm-rangefinder-ring" />
                  {orbitTracks.map(([rx, ry], idx) => (
                    <ellipse
                      key={`${rx}-${ry}`}
                      rx={rx}
                      ry={ry}
                      className={idx % 2 === 0 ? "wm-orbit" : "wm-orbit is-outer-track"}
                    />
                  ))}
                </g>

                <g className="wm-constellation" aria-hidden="true">
                  {crossEdges.map((edge) => {
                    const a = pointById.get(edge.from);
                    const b = pointById.get(edge.to);
                    if (!a || !b) return null;
                    return (
                      <line
                        key={`cross-${edge.from}-${edge.to}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        className="wm-line is-secondary-edge"
                      />
                    );
                  })}
                </g>

                {points.slice(1).map((p, idx) => (
                  <g key={`edge-${p.id}`} className="wm-edge-group" aria-hidden="true">
                    <line
                      x1="0"
                      y1="0"
                      x2={p.x}
                      y2={p.y}
                      className={`wm-line-glow wm-kind-${p.kind}`}
                    />
                    <line
                      x1="0"
                      y1="0"
                      x2={p.x}
                      y2={p.y}
                      stroke={`url(#wm-edge-grad-${idx})`}
                      className={`wm-line is-active-edge wm-kind-${p.kind}`}
                    />
                  </g>
                ))}

                {points.map((p, i) => (
                  <g
                    key={p.id}
                    data-node="true"
                    data-kind={p.kind}
                    className={`wm-node wm-kind-${p.kind} ${i === 0 ? "is-selected" : ""}`}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.title}、${MAP_KINDS[p.kind]}`}
                    onClick={() => choose(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        choose(p.id);
                      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        moveNodeFocus(i + 1);
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                        e.preventDefault();
                        moveNodeFocus(i - 1);
                      } else if (e.key === "Home") {
                        e.preventDefault();
                        moveNodeFocus(0);
                      } else if (e.key === "End") {
                        e.preventDefault();
                        moveNodeFocus(points.length - 1);
                      }
                    }}
                  >
                    <circle className="wm-node-hit" r={i === 0 ? 36 : 22} />
                    <circle className="wm-node-disc" r={i === 0 ? 28 : 10} />
                    {renderNodeGlyph(p.kind, i === 0)}
                    <text y={i === 0 ? 50 : 26} textAnchor="middle">
                      {p.title.match(/.{1,8}/gu)?.map((line, index) => (
                        <tspan key={index} x="0" dy={index === 0 ? 0 : 15}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
            <div className="wm-map-toolbar">
              <div className="wm-legend" aria-hidden="true">
                {(Object.entries(MAP_KINDS) as [MapKind, string][]).map(([k, label]) => (
                  <span key={k} data-kind={k}>
                    <i />
                    {label}
                  </span>
                ))}
              </div>
              <div className="wm-view-controls">
                <button
                  type="button"
                  aria-label="縮小"
                  disabled={view.zoom <= 0.45}
                  onClick={() => zoom(-0.15)}
                >
                  −
                </button>
                <output>{Math.round(view.zoom * 100)}%</output>
                <button
                  type="button"
                  aria-label="拡大"
                  disabled={view.zoom >= 2}
                  onClick={() => zoom(0.15)}
                >
                  ＋
                </button>
                <button type="button" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>
                  中央へ
                </button>
              </div>
            </div>
          </section>
          <aside
            className="wm-detail"
            id="wm-selected-record"
            tabIndex={-1}
            data-kind={selected.kind}
            aria-label="選択中の資料"
          >
            <div className="wm-detail-head">
              <span className="wm-eyebrow" data-kind={selected.kind}>
                {MAP_KINDS[selected.kind]}
              </span>
              <h2>{selected.title}</h2>
              <p className="wm-detail-subtitle">{selected.subtitle}</p>
            </div>
            <div className="wm-detail-actions">
              <a className="wm-source" href={selected.href}>
                <span>元の資料を読む</span>
                <b aria-hidden="true">↗</b>
              </a>
              {worldMapLabHref(selected.id) && (
                <a className="wm-source is-lab" href={worldMapLabHref(selected.id)}>
                  <span>この形態を変身ラボで開く</span>
                  <b aria-hidden="true">↗</b>
                </a>
              )}
            </div>
            <h3>
              直接の接続 <span>{connections.length}</span>
            </h3>
            <ul>
              {connections.map((e) => {
                const other = WORLD_MAP_NODES.find(
                  (n) => n.id === (e.from === selected.id ? e.to : e.from),
                );
                return other ? (
                  <li key={`${e.from}-${e.to}`} data-kind={other.kind}>
                    <button type="button" onClick={() => choose(other.id)}>
                      <small>
                        {e.label} / {MAP_KINDS[other.kind]}
                      </small>
                      <span>
                        {other.title} <b aria-hidden="true">→</b>
                      </span>
                    </button>
                    <a href={e.evidence} aria-label={`${other.title}との接続の出典`}>
                      出典 ↗
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
            {!connections.length && <p>公開記録から確定できる接続はありません。</p>}
          </aside>
        </div>
        {!isFiltering && directory}
        <footer className="wm-footer">
          <p>
            接続は公開資料で確認できるもののみを掲載。登場記録は所属・敵対・因果関係を意味しません。
          </p>
          <a href="/library">資料室 ↗</a>
        </footer>
      </main>
    </>
  );
}
