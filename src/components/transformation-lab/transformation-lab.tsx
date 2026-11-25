import { GuardedLink } from "@/components/load-gate";
import { useWorldMode } from "@/components/world/use-world-mode";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { type CSSProperties, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  LAB_BEATS,
  LAB_NAMES,
  LAB_FORMS,
  validLabForm,
  LAB_RIDERS,
  advanceLab,
  createLabUrlWriter,
  labSearch,
  labBeatAt,
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
    if (!box) return;
    const reveal = () => {
      const chip = box.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!chip) return;
      const frame = box.getBoundingClientRect();
      const at = chip.getBoundingClientRect();
      if (at.left < frame.left) box.scrollLeft += at.left - frame.left - 12;
      else if (at.right > frame.right) box.scrollLeft += at.right - frame.right + 12;
    };
    reveal();
    const setup = box.closest("details");
    setup?.addEventListener("toggle", reveal);
    return () => setup?.removeEventListener("toggle", reveal);
  }, [value, options]);
  return (
    <div className="lab-field" role="group" aria-labelledby={id}>
      <span id={id} className="lab-field-label">
        {label}
      </span>
      <div ref={rail} className="lab-chips">
        {options.map(([key, text], index) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === value}
            tabIndex={key === value ? 0 : -1}
            onKeyDown={(event) => {
              const move = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: options.length - 1 };
              if (!(event.key in move)) return;
              event.preventDefault();
              const next = (move[event.key as keyof typeof move] + options.length) % options.length;
              rail.current?.querySelectorAll("button")[next]?.focus();
              onChange(options[next][0]);
            }}
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
  const { direction, side } = state;
  const [firstReady, setFirstReady] = useState(false);
  const [secondReady, setSecondReady] = useState(false);
  // In the paired layout the lead slot draws A. On a phone it draws the
  // selected side, staying mounted as the reader switches between A and B.
  const [{ compact, leadSlot }, setLayout] = useState({ compact: false, leadSlot: 0 });
  const otherSlot = 1 - leadSlot;
  const showPrimary = !compact || !state.compare || side === "a";
  const showComparison = Boolean(state.compare) && (!compact || side === "b");
  const pairedStages = Boolean(state.compare) && !compact;
  const ready = pairedStages ? firstReady && secondReady : leadSlot === 0 ? firstReady : secondReady;
  const [copyResult, setCopyResult] = useState<{ state: LabState; ok: boolean } | null>(null);
  const copyRequest = useRef(0);
  const copied = copyResult?.state === state && copyResult.ok;
  const copyFailed = copyResult?.state === state && !copyResult.ok;
  const current = useRef(state);
  useLayoutEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    const media = matchMedia("(max-width: 680px)");
    const sync = () => {
      const narrow = media.matches;
      const selected = current.current.side;
      setLayout((previous) => previous.compact === narrow ? previous : {
        compact: narrow,
        // B is the opposite slot in the pair. Keep its mounted engine
        // when folding the pair down to B or expanding from B to the pair.
        leadSlot: selected === "b" ? 1 - previous.leadSlot : previous.leadSlot,
      });
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  // A replay over a finished suit asks the stage first (Rexonance's armour
  // retracts, then the lab moves: transformation-lab-leave.ts). Comparisons
  // share a single clock, so a side-specific exit never takes over.
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
    // Save even the last scrub before an immediate reload or a client-side link.
    // Capture the departing entry while the address still belongs to the lab.
    const saveMoment = () => {
      const url = new URL(location.href);
      url.search = labSearch(current.current);
      writer.write(url.href);
      writer.flush();
    };
    const onLink = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) saveMoment();
    };
    const saveWhenHidden = () => {
      if (!document.hidden) return;
      // A comparison can still be loading, or a replay waiting for the suit to leave.
      opening.current = false;
      leave.cancel();
      setPlaying(false);
      saveMoment();
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("pagehide", saveMoment);
    document.addEventListener("click", onLink, true);
    window.addEventListener("popstate", restore);
    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.removeEventListener("pagehide", saveMoment);
      document.removeEventListener("click", onLink, true);
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
    if (!playing || !ready) return;
    let frame = 0;
    let previous = 0;
    let stopped = false;
    const tick = (now: number) => {
      const elapsed = previous ? now - previous : 0;
      previous = now;
      const { progress, speed, rider, form, compare, compareForm } = current.current;
      const next = advanceLab(progress, elapsed, speed, direction, rider, form, compare, compareForm);
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
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [playing, ready, direction, state.compare, leaveThen]);
  useEffect(() => {
    if (!ready || !opening.current) return;
    opening.current = false;
    if (document.hidden || current.current.compare || current.current.progress !== 0) return;
    setPlaying(true);
  }, [ready]);
  const change = (patch: Partial<LabState>) => {
    // The reader's hand on the playhead or the stage ends a leave in play.
    if ("progress" in patch || "rider" in patch || "compare" in patch) leave.cancel();
    opening.current = false;
    setPlaying(false);
    setCopyResult(null);
    setState((value) => {
      const next = { ...value, ...patch };
      if (!next.compare) next.side = "a";
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
    opening.current = false;
    setPlaying(false);
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
  const currentBeat = labBeatAt(state.progress);
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
        <details className="lab-setup">
          <summary>ライダー・フォームの選択と比較</summary>
          <div className="lab-setup-panels">
            <div className="lab-selectors">
              <LabChips
                label="ライダー"
                value={state.rider}
                options={LAB_RIDER_OPTIONS}
                onChange={(rider) => change({ rider: rider as LabRider, side: "a" })}
              />
              <LabChips
                label="フォーム"
                value={state.form}
                options={LAB_FORMS[state.rider]}
                onChange={(form) => change({ form, side: "a" })}
              />
            </div>
            <div className="lab-selectors lab-compare">
              <LabChips
                label="同じ瞬間を比較"
                value={state.compare}
                options={LAB_COMPARE_OPTIONS}
                onChange={(compare) => {
                  change({ compare: compare as LabState["compare"], side: compare ? "b" : "a" });
                }}
              />
              {state.compare && (
                <LabChips
                  label="比較フォーム"
                  value={state.compareForm}
                  options={LAB_FORMS[state.compare]}
                  onChange={(compareForm) => change({ compareForm, side: "b" })}
                />
              )}
            </div>
          </div>
        </details>
        {state.compare && (
          <div className="lab-mobile-switch" role="group" aria-label="比較するライダーを切り替え">
            <button aria-pressed={side === "a"} onClick={() => change({ side: "a" })}>
              {LAB_NAMES[state.rider]}・
              {LAB_FORMS[state.rider].find(([key]) => key === state.form)?.[1]}
            </button>
            <button aria-pressed={side === "b"} onClick={() => change({ side: "b" })}>
              {LAB_NAMES[state.compare]}・
              {LAB_FORMS[state.compare].find(([key]) => key === state.compareForm)?.[1]}
            </button>
          </div>
        )}
        <div className="lab-workbench">
          <div
            ref={stages}
            className="lab-stages"
            data-compare={Boolean(state.compare)}
            data-side={side}
          >
            {(["a", "b"] as const).map((panel) => {
              const primary = panel === "a";
              const rider = primary ? state.rider : state.compare;
              if (!rider || !(primary ? showPrimary : showComparison)) return null;
              const slot = primary || compact ? leadSlot : otherSlot;
              return (
                <div key={slot} className={primary ? "lab-side-a" : "lab-side-b"}>
                  {hydrated ? (
                    <LabStage
                      form={primary ? state.form : state.compareForm}
                      rider={rider}
                      progress={state.progress}
                      zoom={state.zoom}
                      comparing={Boolean(state.compare)}
                      onReady={slot === 0 ? setFirstReady : setSecondReady}
                    />
                  ) : (
                    <div className="lab-stage lab-stage-placeholder" role="status">変身素材を準備中…</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lab-controls">
            <div className="lab-transport">
              <button onClick={play} disabled={!ready && !playing}>
                {playing ? "一時停止" : "再生"}
              </button>
              <button
                aria-pressed={direction < 0}
                onClick={() => {
                  setState((value) => ({ ...value, direction: value.direction === 1 ? -1 : 1 }));
                }}
              >
                逆再生
              </button>
              <button onClick={rewind}>最初へ</button>
              <button
                aria-pressed={state.loop}
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
            <label className="lab-seek">
              <span className="sr-only">変身の進行</span>
              <span className="lab-seek-milestone">{currentBeat.label}</span>
              <output aria-live="off">{Math.round(state.progress * 100)}%</output>
              <span className="lab-seek-slider">
                <span className="lab-seek-rail" aria-hidden="true">
                  <i className="lab-seek-fill" />
                </span>
                <input
                  aria-label="変身の進行"
                  aria-valuetext={`${currentBeat.label}、${Math.round(state.progress * 100)}%`}
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
            <div className="lab-transport lab-transport-more">
              <LabChips
                label="速度"
                value={state.speed}
                options={LAB_SPEED_OPTIONS}
                onChange={(speed) => setState((value) => ({ ...value, speed }))}
              />
              <button onClick={copy}>{copied ? "コピーしました" : "この瞬間のURLをコピー"}</button>
            </div>
            {/* Ring system (2026-11-23): the stages of one suit-up are nodes on
                one ring (chrome only: the engine is not touched). The ring in
                the centre is lit up to the stage in progress: it changes only
                when the stage does, so nothing repaints per frame beside the
                engine. Each node is a wrapper, placed by the orbit; the button
                keeps its own press. */}
            <div
              className="lab-ring ring-orbit ring-orbit-keep ring-enter"
              role="group"
              aria-label="変身の段階"
              style={{ "--ring-n": LAB_BEATS.length } as CSSProperties}
            >
              <span className="ring-orbit-track" aria-hidden="true" />
              <span
                className="lab-ring-core"
                aria-hidden="true"
                style={
                  {
                    "--ring-p": (LAB_BEATS.indexOf(currentBeat) / (LAB_BEATS.length - 1)).toFixed(4),
                  } as CSSProperties
                }
              />
              {LAB_BEATS.map((beat, index) => (
                <span
                  key={beat.at}
                  className="ring-orbit-item"
                  style={{ "--ring-i": index } as CSSProperties}
                >
                  <button
                    aria-pressed={beat === currentBeat}
                    data-state={
                      beat === currentBeat
                        ? "active"
                        : beat.at < currentBeat.at
                          ? "passed"
                          : "upcoming"
                    }
                    onClick={() => change({ progress: beat.at })}
                  >
                    {beat.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="lab-records">
          {showPrimary && <LabPartRecord rider={state.rider} zoom={state.zoom} />}
          {showComparison && state.compare && (!showPrimary || state.compare !== state.rider) && (
            <LabPartRecord rider={state.compare} zoom={state.zoom} />
          )}
        </div>
      </main>
    </>
  );
}
