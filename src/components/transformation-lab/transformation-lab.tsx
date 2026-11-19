import { GuardedLink } from "@/components/load-gate";
import { useWorldMode } from "@/components/world/use-world-mode";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  LAB_BEATS,
  LAB_NAMES,
  LAB_FORMS,
  validLabForm,
  LAB_RIDERS,
  advanceLab,
  createLabUrlWriter,
  labSearch,
  parseLabState,
  type LabRider,
  type LabState,
  type LabZoom,
} from "@/lib/transformation-lab-state.js";
import { LAB_LEAVE_FROM, createLabLeave } from "@/lib/transformation-lab-leave";
import { LabPartRecord } from "./lab-part-record";
import { LabStage } from "./lab-stage";

/** One choice among a few, as the lab's own pressed buttons on a rail (it
 * scrolls sideways on a phone; the chosen one is kept in sight). */
function LabChips<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = rail.current;
    const chip = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!box || !chip) return;
    const frame = box.getBoundingClientRect();
    const at = chip.getBoundingClientRect();
    if (at.left < frame.left) box.scrollLeft += at.left - frame.left - 12;
    else if (at.right > frame.right) box.scrollLeft += at.right - frame.right + 12;
  }, [value, options]);
  return (
    <div className="lab-field" role="group" aria-labelledby={id}>
      <span id={id} className="lab-field-label">
        {label}
      </span>
      <div ref={rail} className="lab-chips">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === value}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const LAB_RIDER_OPTIONS = LAB_RIDERS.map((rider) => [rider, LAB_NAMES[rider]] as const);
const LAB_COMPARE_OPTIONS = [["", "比較しない"] as const, ...LAB_RIDER_OPTIONS];
const LAB_SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2].map((speed) => [speed, `${speed}×`] as const);

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
  const [copyResult, setCopyResult] = useState<{ state: LabState; ok: boolean } | null>(null);
  const copyRequest = useRef(0);
  const copied = copyResult?.state === state && copyResult.ok;
  const copyFailed = copyResult?.state === state && !copyResult.ok;
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  // A replay over a finished suit asks the stage first (Rexonance's armour
  // retracts, then the lab moves: transformation-lab-leave.ts). A comparison
  // stands still on both sides and asks nothing.
  const stages = useRef<HTMLDivElement>(null);
  const [leave] = useState(() => createLabLeave());
  const leaveThen = useCallback((then: () => void) => {
    if (current.current.compare) return false;
    const stage = stages.current?.querySelector<HTMLElement>(".lab-side-a .lab-engine") ?? null;
    return leave.ask(stage, then);
  }, [leave]);
  useEffect(() => () => leave.cancel(), [leave]);
  // One write per seek input flooded WebKit's history (see createLabUrlWriter).
  const urlWriter = useRef<ReturnType<typeof createLabUrlWriter> | null>(null);
  // A visit with no moment asked for (no `at`, no comparison) opens on the
  // suit-up itself, played once when its pictures are ready — never under
  // reduced motion or on an economy device, and never after the reader's hand.
  const opening = useRef(false);
  useEffect(() => {
    const writer = createLabUrlWriter(window.history);
    urlWriter.current = writer;
    const restore = () => {
      writer.cancel();
      leave.cancel();
      setState(parseLabState(location.search));
      setPlaying(false);
      opening.current = false;
    };
    restore();
    const asked = new URLSearchParams(location.search);
    const root = document.documentElement;
    opening.current =
      !asked.has("at") &&
      !asked.has("compare") &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      root.dataset.worldEffects !== "economy" &&
      !("rznConstrained" in root.dataset);
    setHydrated(true);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      // The router has already moved on; a late write would rename its page.
      writer.cancel();
      urlWriter.current = null;
    };
  }, [leave]);
  useEffect(() => {
    if (!hydrated || playing) return;
    const url = new URL(location.href);
    url.search = labSearch(state);
    urlWriter.current?.write(url.href);
  }, [state, hydrated, playing]);
  useEffect(() => {
    if (!playing || !ready || state.compare) return;
    let frame = 0;
    let previous = 0;
    let stopped = false;
    const tick = (now: number) => {
      const elapsed = previous ? now - previous : 0;
      previous = now;
      const { progress, speed, rider, form } = current.current;
      const next = advanceLab(progress, elapsed, speed, direction, rider, form);
      current.current = { ...current.current, progress: next };
      setState(current.current);
      if (next === (direction > 0 ? 1 : 0)) {
        if (current.current.loop) {
          const wrap = () => {
            current.current = { ...current.current, progress: direction > 0 ? 0 : 1 };
            setState(current.current);
          };
          // The loop's wrap over the finished suit: the suit leaves first,
          // the playhead held at the end; then the loop goes round (if it
          // was paused meanwhile, the stage still ends at the start).
          if (
            direction > 0 &&
            leaveThen(() => {
              wrap();
              if (stopped) return;
              previous = 0;
              frame = requestAnimationFrame(tick);
            })
          )
            return;
          wrap();
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
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [playing, ready, direction, state.compare, leaveThen]);
  useEffect(() => {
    if (!ready || !opening.current) return;
    opening.current = false;
    if (document.hidden || current.current.compare || current.current.progress !== 0) return;
    setPlaying(true);
  }, [ready]);
  const primaryReady = useCallback((value: boolean) => setReady(value), []);
  const comparisonReady = useCallback(() => {}, []);
  const change = (patch: Partial<LabState>) => {
    // The reader's hand on the playhead or the stage ends a leave in play.
    if ("progress" in patch || "rider" in patch || "compare" in patch) leave.cancel();
    opening.current = false;
    setPlaying(false);
    setCopyResult(null);
    setState((value) => {
      const next = { ...value, ...patch };
      next.form = validLabForm(next.rider, next.form);
      next.compareForm = validLabForm(next.compare || next.rider, next.compareForm);
      return next;
    });
  };
  const play = () => {
    opening.current = false;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (state.progress === (direction > 0 ? 1 : 0)) {
      const restart = () => {
        setState((value) => ({ ...value, progress: direction > 0 ? 0 : 1 }));
        setPlaying(true);
      };
      // From the end, forward: the suit leaves first, then it plays again.
      if (direction > 0 && leaveThen(restart)) return;
      restart();
      return;
    }
    setPlaying(true);
  };
  /** 最初へ: over a finished suit the suit leaves first, then the start. */
  const rewind = () => {
    if (state.progress >= LAB_LEAVE_FROM && leaveThen(() => change({ progress: 0 }))) {
      setPlaying(false);
      return;
    }
    change({ progress: 0 });
  };
  const copy = async () => {
    const request = ++copyRequest.current;
    setCopyResult(null);
    const url = new URL(location.href);
    url.search = labSearch(state);
    try {
      await navigator.clipboard.writeText(url.href);
      if (request === copyRequest.current) setCopyResult({ state, ok: true });
    } catch {
      if (request === copyRequest.current) setCopyResult({ state, ok: false });
    }
  };
  const currentBeat =
    [...LAB_BEATS].reverse().find((beat) => state.progress >= beat.at - 0.005) ?? LAB_BEATS[0];
  const activeRider = side === "b" && state.compare ? state.compare : state.rider;

  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <main
        id="lab-main"
        className="world transformation-lab"
        data-rider={activeRider}
        data-direction={direction < 0 ? "reverse" : "forward"}
        style={{ "--lab-progress": state.progress } as CSSProperties}
      >
        <header className="lab-header">
          <div className="lab-topbar">
            <GuardedLink to="/world" assets={[]}>
              DECEPTION WORLD
            </GuardedLink>
            <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
          </div>
          <div className="lab-title">
            <h1>変身・フォーム研究室</h1>
            <p>変身の一瞬を、手元で確かめる。</p>
          </div>
        </header>
        <div className="lab-selectors">
          <LabChips
            label="ライダー"
            value={state.rider}
            options={LAB_RIDER_OPTIONS}
            onChange={(rider) => change({ rider: rider as LabRider })}
          />
          <LabChips
            label="フォーム"
            value={state.form}
            options={LAB_FORMS[state.rider]}
            onChange={(form) => change({ form })}
          />
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
        <div
          ref={stages}
          className="lab-stages"
          data-compare={Boolean(state.compare)}
          data-side={side}
        >
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
            <button onClick={rewind}>最初へ</button>
            <button
              aria-pressed={state.loop}
              disabled={Boolean(state.compare)}
              onClick={() => setState((value) => ({ ...value, loop: !value.loop }))}
            >
              ループ
            </button>
          </div>
          <p role="status" className={copyFailed ? "lab-note" : "sr-only"}>
            {copyFailed
              ? "コピーできませんでした。一時停止して、アドレス欄のURLをコピーしてください。"
              : copied
                ? "URLをコピーしました。"
                : ""}
          </p>
          {state.compare && (
            <p className="lab-note">
              比較中は同じ瞬間で静止します。スライダーや段階を選んで見比べられます。
            </p>
          )}
          <label className="lab-seek">
            変身の進行 <output>{Math.round(state.progress * 100)}% <span className="lab-seek-milestone">({currentBeat.label})</span></output>
            <span className="lab-seek-slider">
              <span className="lab-seek-rail" aria-hidden="true">
                <i className="lab-seek-fill" />
              </span>
              <input
                aria-label="変身の進行"
                aria-valuetext={`${Math.round(state.progress * 100)}%`}
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={state.progress}
                onChange={(event) => change({ progress: Number(event.target.value) })}
              />
            </span>
            <span className="lab-seek-ticks" aria-hidden="true">
              {LAB_BEATS.map((beat) => {
                const tickState =
                  beat === currentBeat
                    ? "active"
                    : beat.at < currentBeat.at
                      ? "passed"
                      : "upcoming";
                return (
                  <i
                    key={beat.at}
                    className={`lab-seek-tick is-${tickState}`}
                    data-state={tickState}
                    style={{ left: `${beat.at * 100}%` }}
                  />
                );
              })}
            </span>
          </label>
          <div className="lab-transport lab-transport-more">
            <LabChips
              label="速度"
              value={state.speed}
              options={LAB_SPEED_OPTIONS}
              onChange={(speed) => setState((value) => ({ ...value, speed }))}
            />
            <button onClick={copy}>{copied ? "コピーしました" : "この瞬間のURLをコピー"}</button>
          </div>
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
        <div className="lab-selectors lab-compare">
          <LabChips
            label="同じ瞬間を比較"
            value={state.compare}
            options={LAB_COMPARE_OPTIONS}
            onChange={(compare) => {
              setSide("a");
              change({ compare: compare as LabState["compare"] });
            }}
          />
          {state.compare && (
            <LabChips
              label="比較フォーム"
              value={state.compareForm}
              options={LAB_FORMS[state.compare]}
              onChange={(compareForm) => change({ compareForm })}
            />
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
      </main>
    </>
  );
}
