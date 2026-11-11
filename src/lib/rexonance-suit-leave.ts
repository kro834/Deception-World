/* REXONANCE'S LEAVE (owner, 2026-11-11): the state of the suit's leave over
   the finished figure — the retract on its own clock (the skin's
   skinRetractFrame) or, where there is no skin to play it (reduced motion,
   economy, another form's art, no WebGL), a short fade — apart from the
   canvases, so every way out of it is one path: over, the reader moving the
   playhead (a scroll, the auto movie's scrubber, the lab's slider), the one
   who asked calling it off, the scene stopping. Whichever comes, the one
   who asked is answered exactly once, and nothing of the leave is left
   behind. This module imports nothing and touches no DOM. */

/** The leave plays over the finished suit: from this progress on. */
export const LEAVE_FROM = 0.93;
/** Reduced motion, economy, another form's art, no WebGL: a short fade. */
export const LEAVE_FADE_MS = 250;
/** A playhead that moves this far under a leave is the reader's (a scroll
 * settles within it; a playhead given directly has no such noise: 0). */
export const LEAVE_SLACK = 0.012;
/** Over, the bare body stands this long for the page to move; then the
 * scene is the playhead's again. */
export const LEAVE_HOLD_MS = 1200;
/** A playhead that jumps this far in one frame is a seek: streams in flight
 * were aimed at a front that is no longer there. */
export const SEEK_JUMP = 0.03;

/** `ok`: the page may move on (false: the reader took the playhead). */
export type LeaveAnswer = (ok?: boolean) => void;
export type LeaveMode = "" | "retract" | "fade";
/** A frame's verdict: "play" (the leave at `ms`), "hold" (over: it stands as
 * it ended until the page has moved), "moved" (it ended this frame because
 * the playhead moved, or its sequence could not go on), "" (none). */
export type LeaveStep = "" | "play" | "hold" | "moved";

export class SuitLeave {
  mode: LeaveMode = "";
  /** Since the leave began (ms), as of the last step. */
  ms = 0;
  /** Its sequence has run and the one who asked was told to go on. */
  over = false;
  private from = 0;
  private at = -1;
  private answer: LeaveAnswer | null = null;

  get active() {
    return this.mode !== "";
  }

  /** A leave begins (one at a time: false if one is in play). */
  begin(mode: "retract" | "fade", now: number, answer: LeaveAnswer) {
    if (this.mode) return false;
    this.mode = mode;
    this.from = now;
    this.ms = 0;
    this.at = -1;
    this.over = false;
    this.answer = answer;
    return true;
  }

  private reply(ok: boolean) {
    const answer = this.answer;
    this.answer = null;
    answer?.(ok);
  }

  /** Its sequence has run: the one who asked goes on; it stands until the
   * page has moved (step) or is let go (end). */
  finish() {
    if (!this.mode || this.over) return;
    this.over = true;
    this.reply(true);
  }

  /** It ends here, whatever its state. `ok`: the answer, if none was given
   * yet. Returns whether there was one to end. */
  end(ok: boolean) {
    if (!this.mode) return false;
    this.mode = "";
    this.over = false;
    this.reply(ok);
    return true;
  }

  /** One frame. `target`: the playhead as the page has it; `able`: the
   * sequence can still be drawn (the skin's context is alive); `duration`:
   * the sequence's length (ms); `slack`: see LEAVE_SLACK. */
  step(now: number, target: number, able: boolean, duration: number, slack = LEAVE_SLACK): LeaveStep {
    if (!this.mode) return "";
    this.ms = now - this.from;
    if (this.at < 0) this.at = target;
    if (!able || Math.abs(target - this.at) > slack) {
      // The reader took the playhead (or the context went). Before the
      // sequence was over that is a no: nothing plays behind their back.
      this.end(this.over || !able);
      return "moved";
    }
    if (!this.over && this.ms >= duration) this.finish();
    else if (this.over && this.ms > duration + LEAVE_HOLD_MS) {
      // (The page never moved: the scene is the playhead's again.)
      this.end(true);
      return "moved";
    }
    return this.over ? "hold" : "play";
  }
}

/** Whether a playhead's step from `last` to `q` is a seek (SEEK_JUMP). */
export const isSeek = (last: number, q: number) => last >= 0 && Math.abs(q - last) > SEEK_JUMP;
