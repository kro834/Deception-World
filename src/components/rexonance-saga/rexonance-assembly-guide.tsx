import { useEffect, useState, type MouseEvent, type RefObject } from "react";

const LOAD_COPY: Record<string, string> = {
  waiting: "表示設定に合わせて変身演出を準備します。",
  loading: "装甲の素材を読み込んでいます。",
  preparing: "装甲とナノマシンの配置を準備しています。",
  ready: "準備完了。下へ進むと装着、上へ戻ると分解します。",
  error: "素材を読み込めませんでした。接続を確認して再試行できます。",
  static:
    "現在は完成図を表示しています。動きを減らす設定や省エネ表示では、変身アニメーションを省略します。",
};

/** Announced once each time the suit completes (sweep 2, F23). */
const COMPLETE_COPY = "装着完了。上へ戻ると分解します。";

/** The suit-up's phases as its HUD prints them; the runway's data-rzn-phase
 * names the one on screen. The page's word for the three forms is 形態. */
export const REXONANCE_ASSEMBLY_PHASES = [
  { phase: "prepare", step: "01", label: "構成情報を読み込み" },
  { phase: "assemble", step: "02", label: "装甲を装着" },
  { phase: "seal", step: "03", label: "構造を固定" },
  { phase: "ignite", step: "04", label: "出力を起動" },
  { phase: "evolve", step: "05", label: "選択形態へ進化" },
  { phase: "complete", step: "06", label: "装着完了" },
] as const;

/** The status the guide prints for the runway's flags. The undersuit
 * stand-in (data-rzn-state set) is the motion picture, so "static" there is
 * stale (sweep 2, F82: after Reduce Motion is turned off again the copy
 * kept saying the finished still was shown): it reads as waiting. */
function assemblyStatus(load: string, motionShown: boolean) {
  const key = load === "static" && motionShown ? "waiting" : load;
  return LOAD_COPY[key] || LOAD_COPY.waiting;
}

export function RexonanceAssemblyGuide({
  runwayRef,
  calls = [],
}: {
  runwayRef: RefObject<HTMLDivElement | null>;
  /** The call's lines, as the runway (aria-hidden) shows them. */
  calls?: readonly string[];
}) {
  const [load, setLoad] = useState("waiting");
  // Whether the motion picture is up, and whether the suit stands complete.
  const [scene, setScene] = useState({ motion: false, complete: false });
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    const update = () => {
      const next = runway.dataset.rznLoad || "waiting";
      const motion = runway.hasAttribute("data-rzn-state");
      // One announcement per completion: the phase flips on the scroll, the
      // status only when it reaches (or leaves) the finished suit.
      const complete = next === "ready" && runway.dataset.rznPhase === "complete";
      setLoad(next);
      setScene((current) =>
        current.motion === motion && current.complete === complete ? current : { motion, complete },
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(runway, {
      attributes: true,
      attributeFilter: ["data-rzn-load", "data-rzn-state", "data-rzn-phase"],
    });
    return () => observer.disconnect();
  }, [runwayRef]);
  const status = assemblyStatus(load, Boolean(scene.motion));
  // Owner (2026-10-23): 「不要なセカンダリラベルや説明を避ける。」 The head is the
  // chapter's numeral and its catchphrase; the runway below shows its own state
  // (the undersuit while it prepares, the scroll's armour after). The status
  // stays a live region for assistive tech, seen only on a failure (with its
  // retry beside it).
  return (
    <section
      id="assembly"
      className="rxs-assembly-heading"
      data-load={load}
      aria-labelledby="rxs-assembly-title"
    >
      <div>
        <h2 id="rxs-assembly-title">装甲が、身体になる。</h2>
        {/* How the runway answers the scroll, for assistive tech (the runway
            itself is a picture, aria-hidden); on screen the scroll says it. */}
        <p className="visually-hidden">
          スクロールの速さで、装着の速さが変わる。装甲の接近から固定、出力の起動までを、自分のペースで。
        </p>
        <div className={load === "error" ? undefined : "visually-hidden"}>
          <p className="rxs-assembly-status" role="status" aria-live="polite" aria-atomic="true">
            {status}
          </p>
        </div>
        {/* The runway's script, for assistive technology: the runway itself
            is aria-hidden (its canvas and figure layers are pictures), so
            its phases and its call are listed here (sweep 2, F23). */}
        <div className="rxk-sr">
          <ol aria-label="装着の流れ">
            {REXONANCE_ASSEMBLY_PHASES.map(({ phase, step, label }) => (
              <li key={phase}>
                {step} {label}
              </li>
            ))}
          </ol>
          {calls.length ? (
            <ol aria-label="変身コール">
              {calls.map((call) => (
                <li key={call}>{call.replace(/\s+/g, " ")}</li>
              ))}
            </ol>
          ) : null}
          <p role="status" aria-live="polite" aria-atomic="true">
            {scene.complete ? COMPLETE_COPY : ""}
          </p>
        </div>
      </div>
      <div className="rxs-assembly-controls">
        {load === "error" ? (
          <button
            type="button"
            onClick={() => runwayRef.current?.dispatchEvent(new Event("rexonance:assembly-retry"))}
          >
            素材を再読み込み
          </button>
        ) : null}
        <a href="#stages">形態を見る</a>
      </div>
    </section>
  );
}

/** The runway is asked whether its suit leaves on a sequence of its own
 * (rexonance-suit-surge.tsx RETRACT_EVENT, the auto movie's
 * MOVIE_LEAVE_EVENT): `detail.done(ok)` when it is over. */
const RETRACT_EVENT = "rexonance:assembly-leave";
type RetractDetail = { done: (ok?: boolean) => void };
/** How long the replay waits for the suit's leave before it goes anyway. */
const REPLAY_WAIT_MS = 3000;

/** 「もう一度、装着を体験」 (owner, 2026-11-11): over the finished suit the
 * armour first retracts (rexonance-suit-surge.tsx answers RETRACT_EVENT on
 * the runway; a short fade in the still tiers), then the link goes where it
 * always went. With nothing to play, or a modified click, it is a plain link. */
function replayAfterRetract(event: MouseEvent<HTMLAnchorElement>) {
  const anchor = event.currentTarget;
  if (anchor.dataset.leave === "go") {
    // The link's own navigation, after the leave.
    delete anchor.dataset.leave;
    return;
  }
  if (anchor.dataset.leave) {
    event.preventDefault();
    return;
  }
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  const runway = document.getElementById("assembly-runway");
  if (!runway) return;
  let timer = 0;
  const done = (ok = true) => {
    if (anchor.dataset.leave !== "wait") return;
    window.clearTimeout(timer);
    delete anchor.dataset.leave;
    if (!ok || !anchor.isConnected) return;
    anchor.dataset.leave = "go";
    anchor.click();
  };
  const leave = new CustomEvent<RetractDetail>(RETRACT_EVENT, {
    cancelable: true,
    detail: { done },
  });
  anchor.dataset.leave = "wait";
  runway.dispatchEvent(leave);
  if (!leave.defaultPrevented) {
    delete anchor.dataset.leave;
    return;
  }
  event.preventDefault();
  timer = window.setTimeout(done, REPLAY_WAIT_MS);
}

export function RexonanceAssemblyReplay() {
  const [staticMode, setStaticMode] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const update = () => setStaticMode(media.matches || root.dataset.worldEffects === "economy");
    update();
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-world-effects"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return (
    <div id="assembly-replay" className="rxs-assembly-footer">
      <div className="rxs-assembly-controls">
        <a href="#assembly" onClick={replayAfterRetract}>
          {staticMode ? "変身の資料を見る" : "もう一度、装着を体験"}
        </a>
        <a href="#stages">三つの形態へ</a>
      </div>
    </div>
  );
}
