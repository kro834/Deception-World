import type { CSSProperties } from "react";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CALLS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_STAGE_DURATION_MS,
  REXONANCE_STAGE_LABELS,
  type RexonanceStage,
} from "@/lib/rexonance-calls";

type RexonanceCallSequenceProps = {
  mode: "entry" | "stage";
  phase: "covering" | "revealing";
  tier: "full" | "calm" | "reduced";
  stage?: RexonanceStage;
};

function CallLines({ index }: { index: number }) {
  if (index === 2) {
    return (
      <>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
      </>
    );
  }
  if (index === 3) {
    return (
      <>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
      </>
    );
  }
  if (index === 4) {
    return (
      <>
        <span>REXONANCE</span>
        <span>DEUS！</span>
      </>
    );
  }
  return <span>{REXONANCE_CALLS[index]}</span>;
}

// Decorative only. LoadGate owns navigation, live status, cancellation and
// cover timing; the stage coordinator owns selection and the component's life.
// No browser reads or independent timers: server and client render identically.
export function RexonanceCallSequence({
  mode,
  phase,
  tier,
  stage = "standard",
}: RexonanceCallSequenceProps) {
  const entry = mode === "entry";
  return (
    <div
      className="rx-call-sequence"
      data-mode={mode}
      data-phase={phase}
      data-tier={tier}
      data-stage={stage}
      aria-hidden="true"
      style={
        {
          "--rx-call-cover": `${REXONANCE_ENTRY_TIMINGS.cover}ms`,
          "--rx-call-reveal": `${REXONANCE_ENTRY_TIMINGS.reveal}ms`,
          "--rx-call-stage-duration": `${REXONANCE_STAGE_DURATION_MS}ms`,
        } as CSSProperties
      }
    >
      <div className="rx-call-ground" />
      <div className="rx-call-frame">
        <i className="rx-call-axis rx-call-axis-horizontal" />
        <i className="rx-call-axis rx-call-axis-vertical" />
        <i className="rx-call-brackets" />
      </div>
      <div className="rx-call-caption">
        <span>TRINITY RESONANCE</span>
        <span>{entry ? "P14 / FINAL ARRIVAL" : `P14 / ${REXONANCE_STAGE_LABELS[stage]}`}</span>
      </div>
      <div className="rx-call-words">
        {entry ? (
          REXONANCE_CALLS.map((call, index) => (
            <div
              key={`${index}-${call}`}
              className={`rx-call-beat${index < 2 ? " rx-call-opening" : ""}${index === 4 ? " rx-call-final" : ""}${index === 2 ? " rx-call-chant" : ""}${index === 3 ? " rx-call-repetition" : ""}`}
              data-call={call}
              style={
                {
                  "--rx-call-start": `${REXONANCE_CALL_BEATS[index].start}ms`,
                  "--rx-call-duration": `${REXONANCE_CALL_BEATS[index].duration}ms`,
                } as CSSProperties
              }
            >
              <CallLines index={index} />
            </div>
          ))
        ) : (
          <div className="rx-call-beat rx-call-final">
            <CallLines index={4} />
            <small className="rx-call-operating-stage">
              <span>OPERATING STAGE</span>
              <b>{REXONANCE_STAGE_LABELS[stage]}</b>
            </small>
          </div>
        )}
      </div>
      <div className="rx-call-meter">
        <i />
      </div>
    </div>
  );
}
