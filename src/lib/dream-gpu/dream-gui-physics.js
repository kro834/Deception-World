// Dream chapter dynamic GUI (Tier A + B). Loaded lazily with the GPU engine;
// Tier C never imports it.
//
// The programme desk's tickets, dossier chips, reel buttons and the reel
// panel are bodies on small damped springs. Each writes only the individual
// CSS `translate` / `rotate` / `scale` properties (transforms: no layout
// shift, and they compose with the sheets' own `transform`), so the real DOM
// stays the hit target. Per body:
//   - a magnetic lean and a tilt toward the pointer (or toward the keyboard
//     focus, which tilts and lights the element the same way);
//   - a gentle repel among neighbours of the same row;
//   - press squash and a release bounce (pointer, Enter and Space);
// The reel window takes a horizontal drag: the sheet follows with rubber
// resistance and a flick (distance or speed) turns the reel by clicking its
// own 前へ / 次へ button; the new sheet arrives carrying the flick's speed.
// Tier B also gets a ghost of the previous sheet that slides out in slats
// (the CSS approximation of Tier A's previous-frame composite).
//
// The solver runs on requestAnimationFrame only while something moves and
// sleeps at rest. `gui` is shared with the GPU engine: the ink splats (the
// pointer's wake for the fluid field) and the lens target.

const DESK = ".dream-programme-desk";
const BODY_SELECTOR = [
  ".dream-programme-ticket",
  ".dream-programme-dossier-chip",
  ".dream-programme-spotlight-modes button",
  ".dream-programme-spotlight-controls button",
  ".dream-programme-reel-frame",
].join(",");
const REEL_WINDOW = ".dream-programme-reel-window";
const REEL_SHEET = ".dream-programme-reel-sheet";
const INK_MAX = 12;

/** Shared with dream-gpu-engine.js. Positions are CSS px in the viewport. */
export const gui = {
  /** ring buffer of { x, y, vx, vy, at, s } */
  ink: [],
  /** the lens target: pointer or focused element */
  lens: { x: -1, y: -1, r: 0, on: 0, focus: false, pressed: 0 },
  /** last section / reel change: performance.now() and its direction */
  turn: { at: -1e9, dir: 1 },
  active: false,
};

const K_STIFF = 210; // spring stiffness (1/s²): a card, not a cushion
const K_DAMP = 14; // damping (1/s): under-damped so a release bounces once, cleanly
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeBody(el) {
  const kind = el.matches(".dream-programme-reel-frame")
    ? "panel"
    : el.matches(".dream-programme-ticket")
      ? "ticket"
      : el.matches(".dream-programme-dossier-chip")
        ? "chip"
        : "button";
  // [value, velocity, target] for tx, ty, rx, ry, sx, sy
  const ch = () => ({ v: 0, w: 0, to: 0 });
  return {
    el,
    kind,
    row: el.parentElement?.closest("nav, ul, [role=group], .dream-programme-spotlight-controls") ?? null,
    tx: ch(),
    ty: ch(),
    rx: ch(),
    ry: ch(),
    s: { v: 1, w: 0, to: 1 },
    q: { v: 0, w: 0, to: 0 }, // squash: +x wide / −y short
    rect: null,
    pressed: false,
    written: false,
  };
}

const LIMITS = {
  ticket: { lean: 6, tilt: 6, lift: 1.022 }, // a paper ticket: wide, so it tilts less
  chip: { lean: 4, tilt: 10, lift: 1.045 }, // a small chip turns freely under the finger
  button: { lean: 3, tilt: 8, lift: 1.03 },
  panel: { lean: 0, tilt: 1.8, lift: 1 }, // the reel frame barely breathes
};

export function startDreamGui({ tier } = {}) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const bodies = new Map();
  let list = [];
  let desk = null;
  let raf = 0;
  let last = 0;
  let pointer = { x: -1e4, y: -1e4, inside: false, lastMove: 0 };
  let focusEl = null;
  let keyboardFocus = false;
  gui.active = true;

  const collect = () => {
    desk = document.querySelector(DESK);
    const els = desk ? [...desk.querySelectorAll(BODY_SELECTOR)] : [];
    for (const [el, b] of bodies) {
      if (!els.includes(el)) {
        clearStyle(b);
        bodies.delete(el);
      }
    }
    for (const el of els) if (!bodies.has(el)) bodies.set(el, makeBody(el));
    list = [...bodies.values()];
  };

  const clearStyle = (b) => {
    b.el.style.removeProperty("translate");
    b.el.style.removeProperty("rotate");
    b.el.style.removeProperty("scale");
    b.written = false;
  };

  // ---- targets -------------------------------------------------------------
  const setTargets = () => {
    for (const b of list) b.rect = b.el.getBoundingClientRect();
    const lead = []; // bodies that push their neighbours: [body, strength]
    for (const b of list) {
      const L = LIMITS[b.kind];
      const r = b.rect;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let tx = 0;
      let ty = 0;
      let rx = 0;
      let ry = 0;
      let s = 1;
      const focused = focusEl === b.el && keyboardFocus;
      if (focused) {
        // Focus: a lit lean toward the reader, a tilt as if the lamp sat above-left.
        rx = L.tilt * 0.55;
        ry = -L.tilt * 0.4;
        ty = -L.lean * 0.4;
        s = L.lift;
        lead.push([b, 1]);
      } else if (pointer.x > -1e3 && (!coarse || b.pressed)) {
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        const hw = r.width / 2;
        const hh = r.height / 2;
        const inside = Math.abs(dx) <= hw && Math.abs(dy) <= hh;
        // magnetic field reaches a little beyond the box
        const ox = Math.max(0, Math.abs(dx) - hw);
        const oy = Math.max(0, Math.abs(dy) - hh);
        const reach = Math.exp(-(ox * ox + oy * oy) / (2 * 60 * 60));
        if (reach > 0.02) {
          const nx = clamp(dx / Math.max(hw, 1), -1.4, 1.4);
          const ny = clamp(dy / Math.max(hh, 1), -1.4, 1.4);
          tx = clamp(nx, -1, 1) * L.lean * reach;
          ty = clamp(ny, -1, 1) * L.lean * 0.7 * reach;
          if (inside) {
            // the card tips toward the pointer, like paper pressed by a finger
            ry = clamp(nx, -1, 1) * L.tilt;
            rx = -clamp(ny, -1, 1) * L.tilt;
            s = L.lift;
            lead.push([b, 1]);
          } else {
            ry = clamp(nx, -1, 1) * L.tilt * 0.25 * reach;
            rx = -clamp(ny, -1, 1) * L.tilt * 0.25 * reach;
          }
        }
      }
      b.tx.to = tx;
      b.ty.to = ty;
      b.rx.to = rx;
      b.ry.to = ry;
      b.s.to = s;
      b.q.to = b.pressed ? 1 : 0;
    }
    // neighbours lean away from the lit one (same row only)
    for (const [a, k] of lead) {
      if (a.kind === "panel") continue;
      const ar = a.rect;
      const acx = ar.left + ar.width / 2;
      const acy = ar.top + ar.height / 2;
      for (const b of list) {
        if (b === a || b.row !== a.row || b.kind === "panel") continue;
        const br = b.rect;
        const dx = br.left + br.width / 2 - acx;
        const dy = br.top + br.height / 2 - acy;
        const d = Math.hypot(dx, dy) || 1;
        const span = (Math.max(ar.width, ar.height) + Math.max(br.width, br.height)) * 0.75;
        const f = Math.exp(-((d / span) ** 2)) * k * LIMITS[b.kind].lean * 0.8;
        b.tx.to += (dx / d) * f;
        b.ty.to += (dy / d) * f * 0.6;
        b.ry.to += (dx / d) * f * 0.6;
      }
    }
  };

  // ---- integration ---------------------------------------------------------
  const stepCh = (c, dt, stiff = K_STIFF, damp = K_DAMP) => {
    const a = (c.to - c.v) * stiff - c.w * damp;
    c.w += a * dt;
    c.v += c.w * dt;
    return Math.abs(c.to - c.v) > 0.004 || Math.abs(c.w) > 0.01;
  };
  const write = (b) => {
    // squash: a card pressed into the desk goes wide and short (volume held)
    const sx = b.s.v * (1 + b.q.v * 0.042);
    const sy = b.s.v * (1 - b.q.v * 0.082);
    const idle =
      Math.abs(b.tx.v) < 0.01 &&
      Math.abs(b.ty.v) < 0.01 &&
      Math.abs(b.rx.v) < 0.01 &&
      Math.abs(b.ry.v) < 0.01 &&
      Math.abs(sx - 1) < 0.0005 &&
      Math.abs(sy - 1) < 0.0005;
    if (idle) {
      if (b.written) clearStyle(b);
      return;
    }
    const st = b.el.style;
    st.translate = `${b.tx.v.toFixed(2)}px ${b.ty.v.toFixed(2)}px`;
    // one rotation about the axis perpendicular to the tilt direction
    const ang = Math.hypot(b.rx.v, b.ry.v);
    st.rotate = ang < 0.01 ? "none" : `${(b.rx.v / ang).toFixed(4)} ${(b.ry.v / ang).toFixed(4)} 0 ${ang.toFixed(3)}deg`;
    st.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
    b.written = true;
  };

  // reel drag state
  const drag = { id: -1, x0: 0, y0: 0, x: 0, t: 0, v: 0, on: false, sheet: null, moved: false };
  const reel = { v: 0, w: 0, to: 0 }; // the sheet's x offset (px)
  let reelSheet = null;
  const writeReel = () => {
    const sheet = document.querySelector(`${DESK} ${REEL_SHEET}`);
    if (sheet !== reelSheet) {
      if (reelSheet?.isConnected) reelSheet.style.removeProperty("translate");
      reelSheet = sheet;
    }
    if (!sheet) return;
    if (Math.abs(reel.v) < 0.05 && Math.abs(reel.w) < 0.5 && !drag.on) {
      sheet.style.removeProperty("translate");
      sheet.style.removeProperty("rotate");
      return;
    }
    sheet.style.translate = `${reel.v.toFixed(2)}px 0`;
    sheet.style.rotate = `0 1 0 ${clamp(reel.v * 0.03, -6, 6).toFixed(3)}deg`;
  };

  const frame = (now) => {
    raf = 0;
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    if (!desk?.isConnected) collect();
    setTargets();
    let moving = false;
    for (const b of list) {
      const m =
        stepCh(b.tx, dt) |
        stepCh(b.ty, dt) |
        stepCh(b.rx, dt) |
        stepCh(b.ry, dt) |
        stepCh(b.s, dt, 260, 16) |
        stepCh(b.q, dt, 420, 13);
      if (m) moving = true;
      write(b);
    }
    if (!drag.on) {
      if (stepCh(reel, dt, 140, 13)) moving = true;
    }
    writeReel();
    // keep running while the pointer hovers a body (its tilt follows the pointer)
    const hovering = !coarse && pointer.inside && now - pointer.lastMove < 400;
    if (moving || drag.on || hovering) kick();
  };
  const kick = () => {
    if (!raf) {
      if (!last || performance.now() - last > 100) last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  // ---- input ---------------------------------------------------------------
  let lastInk = 0;
  const pushInk = (x, y, vx, vy, s) => {
    gui.ink.push({ x, y, vx, vy, at: performance.now(), s });
    if (gui.ink.length > INK_MAX) gui.ink.shift();
  };
  let prev = null;
  const onMove = (e) => {
    const now = performance.now();
    const inDesk = !!desk?.contains(e.target);
    pointer = { x: e.clientX, y: e.clientY, inside: inDesk, lastMove: now };
    keyboardFocus = false;
    gui.lens.x = e.clientX;
    gui.lens.y = e.clientY;
    gui.lens.focus = false;
    gui.lens.on = inDesk && (e.pointerType === "mouse" || e.pointerType === "pen" || e.buttons > 0) ? 1 : 0;
    gui.lens.r = 0;
    if (prev) {
      const dt = Math.max(8, now - prev.t);
      const vx = ((e.clientX - prev.x) / dt) * 1000;
      const vy = ((e.clientY - prev.y) / dt) * 1000;
      const sp = Math.hypot(vx, vy);
      if (now - lastInk > 33 && sp > 60) {
        lastInk = now;
        pushInk(e.clientX, e.clientY, vx, vy, clamp(sp / 1600, 0.15, 1));
      }
    }
    prev = { x: e.clientX, y: e.clientY, t: now };
    if (inDesk || list.some((b) => b.written)) kick();
    if (drag.id === e.pointerId) onDragMove(e);
  };
  const onLeave = () => {
    pointer = { x: -1e4, y: -1e4, inside: false, lastMove: 0 };
    gui.lens.on = 0;
    prev = null;
    kick();
  };
  const bodyOf = (t) => {
    const el = t?.closest?.(BODY_SELECTOR);
    return el && bodies.get(el);
  };
  const press = (b, on) => {
    if (!b || b.kind === "panel") return;
    b.pressed = on;
    if (!on) {
      // the release throws the card up a little: a bounce past rest
      b.q.w -= 9;
      b.s.w += 0.9;
    }
    kick();
  };
  let pressed = null;
  const onDown = (e) => {
    if (!desk?.contains(e.target)) return;
    collect();
    pointer = { x: e.clientX, y: e.clientY, inside: true, lastMove: performance.now() };
    gui.lens.x = e.clientX;
    gui.lens.y = e.clientY;
    gui.lens.on = 1;
    gui.lens.pressed = performance.now();
    pushInk(e.clientX, e.clientY, 0, 0, 1);
    pressed = bodyOf(e.target);
    if (pressed) press(pressed, true);
    const win = e.target.closest?.(REEL_WINDOW);
    if (win && e.isPrimary && e.button === 0) {
      drag.id = e.pointerId;
      drag.x0 = drag.x = e.clientX;
      drag.y0 = e.clientY;
      drag.t = performance.now();
      drag.v = 0;
      drag.on = false;
      drag.moved = false;
    }
    kick();
  };
  const onUp = (e) => {
    if (pressed) press(pressed, false);
    pressed = null;
    if (coarse) {
      setTimeout(() => {
        if (!drag.on) onLeave();
      }, 600);
    }
    if (drag.id === e.pointerId) onDragEnd(e.type === "pointercancel");
  };

  // reel flick
  const onDragMove = (e) => {
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) {
        if (Math.abs(dy) > 12) drag.id = -1; // a vertical swipe: leave it to the page
        return;
      }
      drag.on = true;
      drag.moved = true;
      try {
        e.target.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is optional */
      }
    }
    const now = performance.now();
    const dt = Math.max(8, now - drag.t);
    drag.v = drag.v * 0.6 + (((e.clientX - drag.x) / dt) * 1000) * 0.4;
    drag.x = e.clientX;
    drag.t = now;
    // rubber resistance: the paper gives less the further it goes
    const lim = 120;
    reel.v = (lim * dx) / (Math.abs(dx) + lim);
    reel.w = 0;
    kick();
  };
  const onDragEnd = (cancel) => {
    const was = drag.on;
    const dx = drag.x - drag.x0;
    drag.id = -1;
    drag.on = false;
    if (!was) return;
    const v = drag.v;
    reel.to = 0;
    if (!cancel && (Math.abs(dx) > 70 || Math.abs(v) > 650)) {
      const dir = (Math.abs(v) > 650 ? -Math.sign(v) : -Math.sign(dx)) || 1;
      const buttons = desk?.querySelectorAll(".dream-programme-spotlight-controls button");
      const btn = buttons?.[dir < 0 ? 0 : 1];
      if (btn) {
        ghostOut(dir);
        btn.click();
        // the new sheet comes in from the far side with the flick's speed
        reel.v = dir * 70;
        reel.w = clamp(v * 0.5, -1800, 1800);
        if (Math.sign(reel.w) === Math.sign(reel.v)) reel.w = -reel.w;
      }
    } else {
      reel.w = v * 0.3;
    }
    kick();
  };
  // a drag must not open the quote's links
  const onClickCapture = (e) => {
    if (drag.moved && e.target.closest?.(REEL_WINDOW)) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.moved = false;
  };

  // Tier B: a ghost of the previous sheet slides out in slats.
  const ghostOut = (dir) => {
    gui.turn = { at: performance.now(), dir };
    if (tier !== "B") return;
    const win = desk?.querySelector(REEL_WINDOW);
    const sheet = win?.querySelector(REEL_SHEET);
    if (!win || !sheet || typeof sheet.animate !== "function") return;
    const ghost = sheet.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ghost.classList.add("dream-gui-ghost");
    ghost.style.translate = "";
    ghost.style.rotate = "";
    ghost.style.width = `${sheet.offsetWidth}px`;
    ghost.style.height = `${sheet.offsetHeight}px`;
    win.append(ghost);
    const anim = ghost.animate(
      [
        { transform: "translateX(0)", opacity: 1 },
        { transform: `translateX(${-dir * 38}px)`, opacity: 0 },
      ],
      { duration: 420, easing: "cubic-bezier(.3,.6,.2,1)" },
    );
    const done = () => ghost.remove();
    anim.onfinish = done;
    anim.oncancel = done;
    setTimeout(done, 800);
  };
  const onControlClick = (e) => {
    // a click on 前へ / 次へ (keyboard included) also leaves a ghost
    if (!e.isTrusted) return;
    const ctl = e.target.closest?.(".dream-programme-spotlight-controls button");
    if (!ctl || !desk?.contains(ctl)) return;
    const dir = /前/.test(ctl.getAttribute("aria-label") ?? "") ? -1 : 1;
    ghostOut(dir);
    reel.v = dir * 26;
    reel.w = 0;
    kick();
  };

  // keyboard: focus drives the same dynamics, Enter / Space squash
  const onFocusIn = (e) => {
    const b = bodyOf(e.target);
    if (!b) return;
    focusEl = b.el;
    let visible = false;
    try {
      visible = e.target.matches(":focus-visible");
    } catch {
      visible = true;
    }
    keyboardFocus = visible;
    if (visible) {
      const r = b.el.getBoundingClientRect();
      gui.lens.x = r.left + r.width / 2;
      gui.lens.y = r.top + r.height / 2;
      gui.lens.r = Math.max(r.width, r.height) / 2 + 12;
      gui.lens.focus = true;
      gui.lens.on = 1;
      b.el.setAttribute("data-dream-gui-lit", "");
    }
    kick();
  };
  const onFocusOut = (e) => {
    const b = bodyOf(e.target);
    b?.el.removeAttribute("data-dream-gui-lit");
    if (b && focusEl === b.el) {
      focusEl = null;
      keyboardFocus = false;
      if (gui.lens.focus) gui.lens.on = 0;
      gui.lens.focus = false;
    }
    kick();
  };
  const onKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const b = bodyOf(e.target);
    if (b && !e.repeat) {
      press(b, true);
      gui.lens.pressed = performance.now();
    }
  };
  const onKeyUp = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const b = bodyOf(e.target);
    if (b?.pressed) press(b, false);
  };
  const onScroll = () => {
    // the lens follows a focused element as the page scrolls
    if (gui.lens.focus && focusEl) {
      const r = focusEl.getBoundingClientRect();
      gui.lens.x = r.left + r.width / 2;
      gui.lens.y = r.top + r.height / 2;
    }
  };

  const opts = { passive: true };
  document.addEventListener("pointermove", onMove, opts);
  document.addEventListener("pointerdown", onDown, opts);
  document.addEventListener("pointerup", onUp, opts);
  document.addEventListener("pointercancel", onUp, opts);
  document.documentElement.addEventListener("pointerleave", onLeave, opts);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("click", onControlClick, opts);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  addEventListener("scroll", onScroll, opts);
  const mo = new MutationObserver(() => {
    if (!desk?.isConnected) collect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  collect();
  document.documentElement.dataset.dreamGui = "on";

  return () => {
    gui.active = false;
    gui.lens.on = 0;
    cancelAnimationFrame(raf);
    mo.disconnect();
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("click", onControlClick);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    removeEventListener("scroll", onScroll);
    for (const b of bodies.values()) {
      clearStyle(b);
      b.el.removeAttribute("data-dream-gui-lit");
    }
    reelSheet?.style.removeProperty("translate");
    reelSheet?.style.removeProperty("rotate");
    delete document.documentElement.dataset.dreamGui;
  };
}
