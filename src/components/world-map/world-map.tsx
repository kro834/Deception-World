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
export function WorldMap({
  q,
  kind,
  node,
  onChange,
}: State & { onChange: (patch: Partial<State>) => void }) {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = WORLD_MAP_NODES.find((n) => n.id === node) ?? WORLD_MAP_NODES[0];
  const neighbors = useMemo(() => mapNeighbors(selected.id), [selected.id]);
  const results = useMemo(() => filterMapNodes(q, kind), [q, kind]);
  const neighborhood = WORLD_MAP_NODES.filter(
    (n) => neighbors.has(n.id) && results.some((r) => r.id === n.id),
  );
  const nodes = [selected, ...neighborhood];
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const points = nodes.map((n, i) => ({
    ...n,
    x:
      i === 0
        ? 0
        : Number(
            (
              Math.cos(((i - 1) / Math.max(1, nodes.length - 1)) * Math.PI * 2 - Math.PI / 2) *
              (nodes.length > 15 ? (i % 2 ? 360 : 250) : 280)
            ).toFixed(3),
          ),
    y:
      i === 0
        ? 0
        : Number(
            (
              Math.sin(((i - 1) / Math.max(1, nodes.length - 1)) * Math.PI * 2 - Math.PI / 2) *
              (nodes.length > 15 ? (i % 2 ? 290 : 190) : 220)
            ).toFixed(3),
          ),
  }));
  const connections = WORLD_MAP_EDGES.filter((e) => e.from === selected.id || e.to === selected.id);
  const choose = (id: string) => {
    onChange({ node: id });
    setView({ x: 0, y: 0, zoom: 1 });
  };
  const zoom = (by: number) =>
    setView((v) => ({ ...v, zoom: Math.max(0.45, Math.min(2, v.zoom + by)) }));
  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <main id="world-map-main" className="world wm-page">
        <header className="wm-header">
          <a href="/world" className="wm-back">
            ← WORLD
          </a>
          <a href="/transformation-lab">変身ラボ ↗</a>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </header>
        <div className="wm-intro">
          <div>
            <span className="wm-eyebrow">DECEPTION WORLD / CONNECTIONS</span>
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
          <label className="wm-search">
            <span>検索</span>
            <input
              type="search"
              value={q}
              onChange={(e) => onChange({ q: e.target.value })}
              placeholder="人物・形態・章を探す"
            />
          </label>
          <div className="wm-filters" aria-label="種類で絞り込み">
            {[["all", "すべて"], ...Object.entries(MAP_KINDS)].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={kind === key}
                onClick={() => onChange({ kind: key as State["kind"] })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="wm-workspace">
          <section className="wm-canvas" aria-label={`${selected.title}を中心とした相関図`}>
            <div className="wm-map-caption">
              <span>{MAP_KINDS[selected.kind]}</span>
              <strong>{selected.title}</strong>
              <small>{neighborhood.length} 件の接続</small>
            </div>
            <svg
              viewBox="-500 -360 1000 720"
              role="img"
              aria-label="選択した項目の直接の接続。下の一覧でも同じ項目を選択できます。"
              onPointerDown={(e) => {
                if ((e.target as Element).closest("[data-node]")) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, originX: view.x, originY: view.y };
              }}
              onPointerMove={(e) => {
                if (drag.current) {
                  const scale = 1000 / e.currentTarget.getBoundingClientRect().width;
                  setView((v) => ({
                    ...v,
                    x: drag.current!.originX + (e.clientX - drag.current!.x) * scale,
                    y: drag.current!.originY + (e.clientY - drag.current!.y) * scale,
                  }));
                }
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <defs>
                <radialGradient id="wm-core">
                  <stop stopColor="#b9e9ec" stopOpacity=".2" />
                  <stop offset="1" stopColor="#b9e9ec" stopOpacity="0" />
                </radialGradient>
              </defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
                <circle r="310" fill="url(#wm-core)" />
                <circle r="140" className="wm-orbit" />
                <circle r="280" className="wm-orbit" />
                {points.slice(1).map((p) => (
                  <line
                    key={p.id}
                    x1="0"
                    y1="0"
                    x2={p.x}
                    y2={p.y}
                    className={`wm-line wm-kind-${p.kind}`}
                  />
                ))}
                {points.map((p, i) => (
                  <g
                    key={p.id}
                    data-node="true"
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
                      }
                    }}
                  >
                    <circle r={i === 0 ? 30 : 8} />
                    <text y={i === 0 ? 57 : 25} textAnchor="middle">
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
            <div className="wm-view-controls">
              <button aria-label="縮小" onClick={() => zoom(-0.15)}>
                −
              </button>
              <output>{Math.round(view.zoom * 100)}%</output>
              <button aria-label="拡大" onClick={() => zoom(0.15)}>
                ＋
              </button>
              <button onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>中央へ</button>
            </div>
          </section>
          <aside className="wm-detail" aria-label="選択中の資料">
            <span className="wm-eyebrow">{MAP_KINDS[selected.kind]}</span>
            <h2>{selected.title}</h2>
            <p>{selected.subtitle}</p>
            <a className="wm-source" href={selected.href}>
              元の資料を読む ↗
            </a>
            {worldMapLabHref(selected.id) && (
              <a className="wm-source" href={worldMapLabHref(selected.id)}>
                この形態を変身ラボで開く ↗
              </a>
            )}
            <h3>
              直接の接続 <span>{connections.length}</span>
            </h3>
            <ul>
              {connections.map((e) => {
                const other = WORLD_MAP_NODES.find(
                  (n) => n.id === (e.from === selected.id ? e.to : e.from),
                );
                return other ? (
                  <li key={`${e.from}-${e.to}`}>
                    <button onClick={() => choose(other.id)}>
                      <small>
                        {e.label} / {MAP_KINDS[other.kind]}
                      </small>
                      <span>
                        {other.title} <b>→</b>
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
              <button key={n.id} aria-pressed={n.id === selected.id} onClick={() => choose(n.id)}>
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
