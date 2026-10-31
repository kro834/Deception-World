import { GuardedLink } from "@/components/load-gate";
import { useWorldMode } from "@/components/world/use-world-mode";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LAB_BEATS,
  LAB_NAMES,
  LAB_FORMS,
  validLabForm,
  LAB_RIDERS,
  advanceLab,
  labSearch,
  parseLabState,
  type LabRider,
  type LabState,
  type LabZoom,
} from "@/lib/transformation-lab-state.js";
import { LabPartRecord } from "./lab-part-record";
import { LabStage } from "./lab-stage";

export function TransformationLab() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (menuOpen) setPlaying(false);
  }, [menuOpen]);
  const [state, setState] = useState<LabState>(() => parseLabState(""));
  const [hydrated, setHydrated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1);
  const [ready, setReady] = useState(false);
  const [side, setSide] = useState<"a" | "b">("a");
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 680px)");
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const [copied, setCopied] = useState(false);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    const restore = () => {
      setState(parseLabState(location.search));
      setPlaying(false);
    };
    restore();
    setHydrated(true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!hydrated || playing) return;
    const url = new URL(location.href);
    url.search = labSearch(state);
    window.history.replaceState(window.history.state, "", url);
  }, [state, hydrated, playing]);
  useEffect(() => {
    if (!playing || !ready || state.compare) return;
    let frame = 0;
    let previous = 0;
    const tick = (now: number) => {
      const elapsed = previous ? now - previous : 0;
      previous = now;
      const next = advanceLab(current.current.progress, elapsed, current.current.speed, direction);
      current.current = { ...current.current, progress: next };
      setState(current.current);
      if (next === (direction > 0 ? 1 : 0)) {
        if (current.current.loop) {
          current.current = { ...current.current, progress: direction > 0 ? 0 : 1 };
          setState(current.current);
        } else {
          setPlaying(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [playing, ready, direction, state.compare]);
  const primaryReady = useCallback((value: boolean) => setReady(value), []);
  const comparisonReady = useCallback(() => {}, []);
  const change = (patch: Partial<LabState>) => {
    setPlaying(false);
    setCopied(false);
    setState((value) => {
      const next = { ...value, ...patch };
      next.form = validLabForm(next.rider, next.form);
      next.compareForm = validLabForm(next.compare || next.rider, next.compareForm);
      return next;
    });
  };
  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (state.progress === (direction > 0 ? 1 : 0))
      setState((value) => ({ ...value, progress: direction > 0 ? 0 : 1 }));
    setPlaying(true);
  };
  const copy = async () => {
    const url = new URL(location.href);
    url.search = labSearch(state);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <main id="lab-main" className="world transformation-lab">
        <header className="lab-header">
          <div className="lab-topbar">
            <GuardedLink to="/world" assets={[]}>
              DECEPTION WORLD
            </GuardedLink>
            <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
          </div>
          <h1>変身・フォーム研究室</h1>
          <p>変身の一瞬を、手元で確かめる。</p>
        </header>
        <div className="lab-selectors">
          <label>
            ライダー
            <select
              value={state.rider}
              onChange={(event) => change({ rider: event.target.value as LabRider })}
            >
              {LAB_RIDERS.map((rider) => (
                <option key={rider} value={rider}>
                  {LAB_NAMES[rider]}
                </option>
              ))}
            </select>
          </label>
          <label>
            フォーム
            <select value={state.form} onChange={(event) => change({ form: event.target.value })}>
              {LAB_FORMS[state.rider].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            同じ瞬間を比較
            <select
              value={state.compare}
              onChange={(event) => {
                setSide("a");
                change({ compare: event.target.value as LabState["compare"] });
              }}
            >
              <option value="">比較しない</option>
              {LAB_RIDERS.map((rider) => (
                <option key={rider} value={rider}>
                  {LAB_NAMES[rider]}
                </option>
              ))}
            </select>
          </label>
          {state.compare && (
            <label>
              比較フォーム
              <select
                value={state.compareForm}
                onChange={(event) => change({ compareForm: event.target.value })}
              >
                {LAB_FORMS[state.compare].map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {state.compare && (
          <div className="lab-mobile-switch" role="group" aria-label="比較するライダーを切り替え">
            <button aria-pressed={side === "a"} onClick={() => setSide("a")}>
              {LAB_NAMES[state.rider]}・
              {LAB_FORMS[state.rider].find(([key]) => key === state.form)?.[1]}
            </button>
            <button aria-pressed={side === "b"} onClick={() => setSide("b")}>
              {LAB_NAMES[state.compare]}・
              {LAB_FORMS[state.compare].find(([key]) => key === state.compareForm)?.[1]}
            </button>
          </div>
        )}
        <div className="lab-stages" data-compare={Boolean(state.compare)} data-side={side}>
          <div className="lab-side-a">
            {(!compact || !state.compare || side === "a") && (
              <LabStage
                form={state.form}
                rider={state.rider}
                progress={state.progress}
                zoom={state.zoom}
                onReady={primaryReady}
              />
            )}
          </div>
          {state.compare && (
            <div className="lab-side-b">
              {(!compact || side === "b") && (
                <LabStage
                  form={state.compareForm}
                  rider={state.compare}
                  progress={state.progress}
                  zoom={state.zoom}
                  onReady={comparisonReady}
                />
              )}
            </div>
          )}
        </div>
        <div className="lab-zoom" role="group" aria-label="拡大する部位">
          {(
            [
              ["full", "全身"],
              ["head", "頭部"],
              ["reactor", "リアクター"],
              ["legs", "脚部"],
            ] as [LabZoom, string][]
          ).map(([zoom, label]) => (
            <button key={zoom} aria-pressed={state.zoom === zoom} onClick={() => change({ zoom })}>
              {label}
            </button>
          ))}
        </div>
        <LabPartRecord
          rider={side === "b" && state.compare ? state.compare : state.rider}
          zoom={state.zoom}
        />
        <div className="lab-controls">
          <div className="lab-transport">
            <button onClick={play} disabled={!ready || Boolean(state.compare)}>
              {playing ? "一時停止" : "再生"}
            </button>
            <button
              aria-pressed={direction < 0}
              disabled={Boolean(state.compare)}
              onClick={() => {
                setDirection((value) => -value);
              }}
            >
              逆再生
            </button>
            <button onClick={() => change({ progress: 0 })}>最初へ</button>
            <button
              aria-pressed={state.loop}
              disabled={Boolean(state.compare)}
              onClick={() => setState((value) => ({ ...value, loop: !value.loop }))}
            >
              ループ
            </button>
            <label>
              速度
              <select
                value={state.speed}
                onChange={(event) =>
                  setState((value) => ({ ...value, speed: Number(event.target.value) }))
                }
              >
                {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}×
                  </option>
                ))}
              </select>
            </label>
            <button onClick={copy}>{copied ? "コピーしました" : "この瞬間のURLをコピー"}</button>
          </div>
          {state.compare && (
            <p className="lab-note">
              比較中は同じ瞬間で静止します。スライダーや段階を選んで見比べられます。
            </p>
          )}
          <label className="lab-seek">
            変身の進行 <output>{Math.round(state.progress * 100)}%</output>
            <input
              aria-label="変身の進行"
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={state.progress}
              onChange={(event) => change({ progress: Number(event.target.value) })}
            />
          </label>
          <div className="lab-beats" role="group" aria-label="変身の段階">
            {LAB_BEATS.map((beat) => (
              <button
                key={beat.at}
                aria-pressed={Math.abs(state.progress - beat.at) < 0.001}
                onClick={() => change({ progress: beat.at })}
              >
                {beat.label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
