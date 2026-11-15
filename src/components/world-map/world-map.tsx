import { useMemo, useRef, useState } from "react";
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

const KIND_OPTICS: Record<MapKind, { stroke: string; hi: string; code: string }> = {
  person: { stroke: "#7ae8ff", hi: "#d8f8ff", code: "PRS" },
  organization: { stroke: "#f0c488", hi: "#ffecd0", code: "ORG" },
  form: { stroke: "#c6b2ff", hi: "#ece4ff", code: "FRM" },
  event: { stroke: "#8ec5ff", hi: "#dceeff", code: "EVT" },
  chapter: { stroke: "#e6cfa4", hi: "#fff3dc", code: "CHP" },
};

const ASTROLABE_TICKS = Array.from({ length: 72 }, (_, index) => {
  const deg = index * 5;
  const rad = ((deg - 90) * Math.PI) / 180;
  const major = deg % 30 === 0;
  const medium = !major && deg % 15 === 0;
  const outerRx = 504;
  const outerRy = 384;
  const inset = major ? 18 : medium ? 11 : 6;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    deg,
    major,
    x1: Number((cos * (outerRx - inset)).toFixed(2)),
    y1: Number((sin * (outerRy - inset)).toFixed(2)),
    x2: Number((cos * outerRx).toFixed(2)),
    y2: Number((sin * outerRy).toFixed(2)),
  };
});

const CARDINAL_BEARINGS = [
  { label: "000°", x: 0, y: -396 },
  { label: "090°", x: 534, y: 4 },
  { label: "180°", x: 0, y: 406 },
  { label: "270°", x: -534, y: 4 },
] as const;

function hexPoints(radius: number): string {
  return Array.from({ length: 6 }, (_, idx) => {
    const angle = (idx * Math.PI) / 3 - Math.PI / 6;
    return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
  }).join(" ");
}

function renderNodeGlyph(kind: MapKind, isCenter: boolean) {
  if (kind === "person") {
    const outer = isCenter ? 33 : 15;
    const inner = isCenter ? 14 : 5.2;
    const core = isCenter ? 4.2 : 2.4;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <circle className="wm-node-ring" r={outer} strokeDasharray={isCenter ? "10 6" : "6 4"} />
        <circle className="wm-node-inner" r={inner} />
        <circle className="wm-node-pip" r={core} />
      </g>
    );
  }
  if (kind === "organization") {
    const outer = isCenter ? 23 : 9.6;
    const inner = isCenter ? 10 : 3.6;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <circle className="wm-node-ring" r={isCenter ? 33 : 15} strokeDasharray="3 5" />
        <polygon className="wm-node-plate" points={hexPoints(outer)} />
        <circle className="wm-node-inner" r={inner} />
      </g>
    );
  }
  if (kind === "form") {
    const s = isCenter ? 22 : 9.4;
    const c = isCenter ? 10 : 4.2;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <circle className="wm-node-ring" r={isCenter ? 33 : 15} strokeDasharray="12 4 2 4" />
        <polygon className="wm-node-plate" points={`0,${-s} ${s},0 0,${s} ${-s},0`} />
        <polygon className="wm-node-inner" points={`0,${-c} ${c},0 0,${c} ${-c},0`} />
      </g>
    );
  }
  if (kind === "chapter") {
    const w = isCenter ? 16 : 7;
    const h = isCenter ? 19 : 8.2;
    return (
      <g className="wm-node-glyph" aria-hidden="true">
        <circle className="wm-node-ring" r={isCenter ? 33 : 15} strokeDasharray="8 4" />
        <rect className="wm-node-plate" x={-w} y={-h} width={w * 2} height={h * 2} rx="2" />
        <line className="wm-node-tick" x1={-w + 3} y1="0" x2={w - 3} y2="0" />
      </g>
    );
  }
  const tick = isCenter ? 22 : 10;
  const gap = isCenter ? 11 : 5;
  return (
    <g className="wm-node-glyph" aria-hidden="true">
      <circle className="wm-node-ring" r={isCenter ? 33 : 15} strokeDasharray="4 4" />
      <path
        className="wm-node-tick"
        d={`M0 ${-tick}V${-gap}M0 ${gap}V${tick}M${-tick} 0H${-gap}M${gap} 0H${tick}`}
      />
      <circle className="wm-node-pip" r={isCenter ? 3.8 : 2.2} />
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
          [205, 165],
          [340, 265],
          [475, 355],
        ]
      : totalNeighbors > 7
        ? [
            [235, 185],
            [385, 295],
          ]
        : [[295, 225]];
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
            <span className="wm-eyebrow">DECEPTION WORLD // ASTROLABE ATLAS</span>
            <h1>
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
                type="search"
                value={q}
                onChange={(e) => onChange({ q: e.target.value })}
                placeholder="人物・形態・章を探す"
              />
            </label>
            {q ? (
              <button
                type="button"
                className="wm-search-clear"
                aria-label="検索語をクリア"
                onClick={() => onChange({ q: "" })}
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
        <div className="wm-workspace">
          <section
            className="wm-canvas"
            data-selected-kind={selected.kind}
            aria-label={`${selected.title}を中心とした相関図`}
          >
            <div className="wm-map-caption">
              <span data-kind={selected.kind}>
                <i aria-hidden="true">{selectedOptic.code} //</i> {MAP_KINDS[selected.kind]}
              </span>
              <strong>{selected.title}</strong>
              <small>{neighborhood.length} 件の接続</small>
            </div>
            <div className="wm-legend" aria-hidden="true">
              {(Object.entries(MAP_KINDS) as [MapKind, string][]).map(([k, label]) => (
                <span key={k} data-kind={k}>
                  <i />
                  {label}
                </span>
              ))}
            </div>
            <svg
              ref={svgRef}
              viewBox="-580 -440 1160 880"
              role="img"
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
                  <stop offset="0%" stopColor={selectedOptic.stroke} stopOpacity=".24" />
                  <stop offset="42%" stopColor="#7ae8ff" stopOpacity=".08" />
                  <stop offset="100%" stopColor="#7ae8ff" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="wm-inner-corona">
                  <stop offset="0%" stopColor={selectedOptic.hi} stopOpacity=".2" />
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
                  <ellipse rx="500" ry="380" fill="url(#wm-core)" />
                  <circle r="150" fill="url(#wm-inner-corona)" />
                  <path
                    className="wm-sighting-axis"
                    d="M-504 0H-56M56 0H504M0 -384V-56M0 56V384"
                  />
                  <path
                    className="wm-sighting-diag"
                    d="M-342 -260L-46 -35M46 35L342 260M342 -260L46 -35M-46 35L-342 260"
                  />
                  <ellipse rx="112" ry="86" className="wm-rangefinder-ring" />
                  <ellipse rx="486" ry="366" className="wm-bezel-inner" />
                  <ellipse rx="504" ry="384" className="wm-bezel-outer" />
                  {orbitTracks.map(([rx, ry], idx) => (
                    <ellipse
                      key={`${rx}-${ry}`}
                      rx={rx}
                      ry={ry}
                      className={idx % 2 === 0 ? "wm-orbit" : "wm-orbit is-outer-track"}
                    />
                  ))}
                  {ASTROLABE_TICKS.map((t) => (
                    <line
                      key={t.deg}
                      x1={t.x1}
                      y1={t.y1}
                      x2={t.x2}
                      y2={t.y2}
                      className={t.major ? "wm-azimuth-tick is-major" : "wm-azimuth-tick"}
                    />
                  ))}
                  {CARDINAL_BEARINGS.map((b) => (
                    <text
                      key={b.label}
                      x={b.x}
                      y={b.y}
                      textAnchor="middle"
                      className="wm-bearing-label"
                    >
                      {b.label}
                    </text>
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
                  <g key={`edge-${p.id}`} aria-hidden="true">
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
                    <circle
                      cx={Number((p.x * 0.54).toFixed(2))}
                      cy={Number((p.y * 0.54).toFixed(2))}
                      r="1.9"
                      className={`wm-edge-node wm-kind-${p.kind}`}
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
                    <circle className="wm-node-disc" r={i === 0 ? 28 : 11} />
                    {renderNodeGlyph(p.kind, i === 0)}
                    <text y={i === 0 ? 54 : 29} textAnchor="middle">
                      {p.title.match(/.{1,8}/gu)?.map((line, index) => (
                        <tspan key={index} x="0" dy={index === 0 ? 0 : 16}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
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
          </section>
          <aside className="wm-detail" data-kind={selected.kind} aria-label="選択中の資料">
            <div className="wm-detail-head">
              <span className="wm-eyebrow" data-kind={selected.kind}>
                <i aria-hidden="true">{selectedOptic.code} //</i> {MAP_KINDS[selected.kind]}
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
        <section className="wm-index" aria-labelledby="wm-index-title">
          <div className="wm-index-heading">
            <h2 id="wm-index-title">資料から選ぶ</h2>
            <span role="status">{results.length} 件</span>
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
                <span>{n.title}</span>
              </button>
            ))}
          </div>
          {!results.length && <p>該当する資料がありません。検索語や種類を変えてください。</p>}
        </section>
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
