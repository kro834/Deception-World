

// ─────────────────────────────────────────────────────────────────────────────
// Liquid glass, standalone. A vanilla port of LiquidSwipeTabs + the WebGL
// renderer, with no build step and no framework. Every tunable that mattered
// during development is named the same as in the React source.
// ─────────────────────────────────────────────────────────────────────────────
import VERT_SRC from "./vert.glsl?raw";
import FRAG_SRC from "./frag.glsl?raw";

const VERTEX_SHADER = VERT_SRC;
const FRAGMENT_SHADER = FRAG_SRC;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;

function nearestTab(px, py, geos) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < geos.length; i++) {
    const cx = geos[i].x + geos[i].width / 2;
    const cy = geos[i].y + geos[i].height / 2;
    const dx = px - cx, dy = py - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const mqCache = new Map();
const mq = (q) => { let l = mqCache.get(q); if (!l) { l = matchMedia(q); mqCache.set(q, l); } return l; };
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function parseColor(color) {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return [0.4, 0.85, 1];
  c.fillStyle = '#67d8ff'; c.fillStyle = color || '#67d8ff';
  const n = c.fillStyle;
  if (n.startsWith('#')) {
    const hex = n.slice(1);
    const v = parseInt(hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex.slice(0, 6), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  const ch = (n.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  return ch.length < 3 ? [0.4, 0.85, 1] : [ch[0] / 255, ch[1] / 255, ch[2] / 255];
}

function roundRect(c, x, y, w, h, r) {
  const s = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + s, y);
  c.arcTo(x + w, y, x + w, y + h, s); c.arcTo(x + w, y + h, x, y + h, s);
  c.arcTo(x, y + h, x, y, s); c.arcTo(x, y, x + w, y, s); c.closePath();
}

// Rasterise whatever sits under the lens so the shader has something to refract.
function railTexture(root, dpr) {
  const w = Math.max(root.offsetWidth, 1), h = Math.max(root.offsetHeight, 1);
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'); if (!c) return null;
  c.scale(dpr, dpr);
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(32,52,72,0.34)'); g.addColorStop(0.48, 'rgba(13,25,39,0.22)');
  g.addColorStop(1, 'rgba(25,43,62,0.30)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const rr = root.getBoundingClientRect();
  const sx = rr.width / w || 1, sy = rr.height / h || 1;
  const tabs = [...root.querySelectorAll(':scope > button[role="tab"]')];
  const cells = tabs.length ? tabs : [root];
  const standalone = tabs.length === 0;
  for (const cell of cells) {
    const r = cell.getBoundingClientRect();
    const x = (r.left - rr.left) / sx, y = (r.top - rr.top) / sy;
    const cw = r.width / sx, chh = r.height / sy;
    const active = standalone || cell.getAttribute('aria-selected') === 'true';
    roundRect(c, x, y, cw, chh, Math.min(cw, chh) * 0.5);
    c.fillStyle = active ? 'rgba(213,239,255,0.095)' : 'rgba(255,255,255,0.018)';
    c.fill();
    c.strokeStyle = active ? 'rgba(219,243,255,0.19)' : 'rgba(210,235,250,0.065)';
    c.lineWidth = 1; c.stroke();
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const raw = n.textContent || ''; if (!raw.trim()) continue;
      const p = n.parentElement; if (!p) continue;
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const tr = range.getBoundingClientRect(); range.detach();
      if (tr.width <= 0 || tr.height <= 0) continue;
      const fs = parseFloat(st.fontSize) || 12;
      c.save();
      c.globalAlpha = clamp(parseFloat(st.opacity) || 1, 0, 1);
      c.fillStyle = st.color;
      c.font = st.fontStyle + ' ' + st.fontWeight + ' ' + fs + 'px ' + st.fontFamily;
      c.textBaseline = 'alphabetic';
      if ('letterSpacing' in c) c.letterSpacing = st.letterSpacing;
      c.shadowColor = 'rgba(0,0,0,0.34)'; c.shadowBlur = 2;
      let t = raw;
      if (st.textTransform === 'uppercase') t = t.toLocaleUpperCase();
      else if (st.textTransform === 'lowercase') t = t.toLocaleLowerCase();
      c.fillText(t, (tr.left - rr.left) / sx, (tr.top - rr.top) / sy + (tr.height / sy) * 0.79);
      c.restore();
    }
  }
  return cv;
}

class GlassRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'liquid-refraction-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.gl = null; this.program = null; this.buffer = null; this.texture = null;
    this.loc = -1; this.uniforms = new Map();
    this.activeRoot = null; this.source = null; this.frame = null; this.lastTime = 0;
    this.phase = 0; this.targetPhase = 0; this.phaseVelocity = 0; this.releasing = false;
    this.geometry = null; this.targetGeometry = null;
    this.pointer = { x: 0, y: 0 }; this.targetPointer = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.accent = [0.4, 0.85, 1];
    this.dpr = 1;
    this.overscan = 44;               // canvas margin around the rail
    this.rootWidth = 1; this.rootHeight = 1; this.cornerRadius = 18;
    // One shared expansion profile for every surface.
    this.pressExpansion = { x: 0.022, y: 0.034 };
    this.heldExpansion  = { x: 0.075, y: 0.15 };
    this.dragExpansion  = { x: 0.05,  y: 0.075 };
    this.dead = false;
    // Bound here rather than declared as a class field: class fields are a
    // syntax error in older WebKit, and one syntax error kills the entire
    // script — including the code that makes the lens visible at all.
    this.draw = this.draw.bind(this);
  }
  compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  ensure() {
    if (this.dead) return false;
    if (this.gl && this.program) return true;
    try {
      const gl = this.canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: 'low-power',
      });
      if (!gl) throw new Error('no webgl');
      const p = gl.createProgram();
      gl.attachShader(p, this.compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(p, this.compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const b = gl.createBuffer(), t = gl.createTexture();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.disable(gl.BLEND);
      this.gl = gl; this.program = p; this.buffer = b; this.texture = t;
      this.loc = gl.getAttribLocation(p, 'a_position');
      return true;
    } catch (e) { console.warn('[glass] webgl unavailable:', e.message); this.dead = true; return false; }
  }
  uniform(n) {
    if (!this.uniforms.has(n)) this.uniforms.set(n, this.gl.getUniformLocation(this.program, n));
    return this.uniforms.get(n);
  }
  resize(root) {
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.rootWidth = Math.max(root.offsetWidth, 1);
    this.rootHeight = Math.max(root.offsetHeight, 1);
    const w = Math.round((this.rootWidth + this.overscan * 2) * this.dpr);
    const h = Math.round((this.rootHeight + this.overscan * 2) * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.setProperty('--liquid-canvas-overscan', this.overscan + 'px');
  }
  activate(root) {
    if (!this.ensure()) { root.dataset.liquidWebgl = 'fallback'; return false; }
    if (this.activeRoot !== root) {
      this.stop();
      if (this.activeRoot) { this.activeRoot.dataset.liquidWebgl = 'false'; this.activeRoot.dataset.liquidWebglActive = 'false'; }
      this.activeRoot = root; root.appendChild(this.canvas);
      this.phase = 0; this.targetPhase = 0; this.phaseVelocity = 0; this.releasing = false;
      this.geometry = null; this.targetGeometry = null; this.lastTime = 0;
    }
    const lens = root.querySelector(':scope > .liquid-selection-lens');
    const r = lens ? parseFloat(getComputedStyle(lens).borderTopLeftRadius) : 18;
    this.cornerRadius = isFinite(r) ? Math.max(r, 0) : 18;
    this.resize(root);
    const src = railTexture(root, this.dpr);
    if (!src) { root.dataset.liquidWebgl = 'fallback'; return false; }
    this.source = src;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    root.dataset.liquidWebgl = 'true'; root.dataset.liquidWebglActive = 'false';
    return true;
  }
  isActive(root) { return this.activeRoot === root; }
  detach(root) {
    if (this.activeRoot !== root) return;
    this.stop(); this.canvas.remove();
    root.dataset.liquidWebgl = 'false'; root.dataset.liquidWebglActive = 'false';
    this.activeRoot = null; this.geometry = null; this.targetGeometry = null;
  }
  setAccent(c) { this.accent = parseColor(c); this.schedule(); }
  setGeometry(g) { this.targetGeometry = g; if (!this.geometry) this.geometry = g; this.schedule(); }
  setContact(p, v) { this.pointer = p; this.velocity = v; this.schedule(); }
  setPhase(phase) {
    this.targetPhase = phase === 'pressed' ? 0.33 : phase === 'held' ? 0.72 : phase === 'dragging' ? 1 : 0;
    this.releasing = phase === 'rest';
    if (this.releasing && this.activeRoot) this.activeRoot.dataset.liquidWebglActive = 'false';
    this.schedule();
  }
  schedule() {
    if (this.frame !== null || !this.activeRoot || !this.geometry || !this.source) return;
    this.frame = requestAnimationFrame(this.draw);
  }
  stop() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; }
  applyScissor(gl, g) {
    const ex = g.width * (this.pressExpansion.x + this.heldExpansion.x + this.dragExpansion.x + 0.24);
    const ey = g.height * (this.pressExpansion.y + this.heldExpansion.y + this.dragExpansion.y);
    const halo = 30, ratio = this.dpr;
    const left = g.x - ex - halo + this.overscan, top = g.y - ey - halo + this.overscan;
    const w = g.width + ex * 2 + halo * 2, h = g.height + ey * 2 + halo * 2;
    const pl = Math.max(0, Math.floor(left * ratio));
    const pb = Math.max(0, Math.floor(this.canvas.height - (top + h) * ratio));
    const pr = Math.min(this.canvas.width, Math.ceil((left + w) * ratio));
    const pt = Math.min(this.canvas.height, Math.ceil(this.canvas.height - top * ratio));
    if (pr - pl <= 0 || pt - pb <= 0) return;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(pl, pb, pr - pl, pt - pb);
  }
  draw(time) {
    this.frame = null;
    const root = this.activeRoot, gl = this.gl, g0 = this.geometry;
    if (!root || !gl || !g0) return;
    const elapsed = this.lastTime === 0 ? 16 : Math.min(48, time - this.lastTime);
    this.lastTime = time;

    // Droplet lag: chase the requested geometry instead of snapping to it.
    let settling = false;
    const target = this.targetGeometry;
    if (target) {
      const follow = 1 - Math.exp(-elapsed / 52);
      const d = Math.abs(target.x - g0.x) + Math.abs(target.y - g0.y)
              + Math.abs(target.width - g0.width) + Math.abs(target.height - g0.height);
      if (d < 0.12) this.geometry = target;
      else {
        this.geometry = {
          x: g0.x + (target.x - g0.x) * follow, y: g0.y + (target.y - g0.y) * follow,
          width: g0.width + (target.width - g0.width) * follow,
          height: g0.height + (target.height - g0.height) * follow,
        };
        settling = true;
      }
    }

    if (this.releasing) {
      // Exponential release: ~150ms to the shader's transparent cutoff.
      const fade = Math.exp(-elapsed / 42);
      this.phase *= fade; this.phaseVelocity = 0;
      this.velocity.x *= fade; this.velocity.y *= fade;
      const glide = 1 - fade, s = this.targetGeometry || this.geometry;
      const tx = s.x + s.width / 2, ty = s.y + s.height / 2;
      this.pointer = { x: this.pointer.x + (tx - this.pointer.x) * glide, y: this.pointer.y + (ty - this.pointer.y) * glide };
      if (this.phase <= 0.025) { this.phase = 0; this.velocity = { x: 0, y: 0 }; }
    } else {
      const steps = Math.max(1, Math.ceil(elapsed / 12)), ss = elapsed / steps / 1000;
      for (let i = 0; i < steps; i++) {
        const k = this.targetPhase > this.phase ? 245 : 210;
        const c = this.targetPhase > this.phase ? 27 : 29;
        this.phaseVelocity += ((this.targetPhase - this.phase) * k - this.phaseVelocity * c) * ss;
        this.phase += this.phaseVelocity * ss;
      }
      this.phase = clamp(this.phase, -0.018, 1.035);
      if (Math.abs(this.targetPhase - this.phase) < 0.001 && Math.abs(this.phaseVelocity) < 0.008) {
        this.phase = this.targetPhase; this.phaseVelocity = 0;
      }
      const decay = Math.exp(-elapsed / 72);
      this.velocity.x *= decay; this.velocity.y *= decay;
    }

    const g = this.geometry;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.applyScissor(gl, g);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.loc);
    gl.vertexAttribPointer(this.loc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniform('u_texture'), 0);
    gl.uniform2f(this.uniform('u_canvas_size'), this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniform('u_root_size'), this.rootWidth, this.rootHeight);
    gl.uniform4f(this.uniform('u_lens'), g.x + g.width / 2, g.y + g.height / 2, g.width / 2, g.height / 2);
    gl.uniform2f(this.uniform('u_pointer'), this.pointer.x, this.pointer.y);
    gl.uniform2f(this.uniform('u_velocity'), this.velocity.x, this.velocity.y);
    gl.uniform3f(this.uniform('u_accent'), this.accent[0], this.accent[1], this.accent[2]);
    gl.uniform1f(this.uniform('u_dpr'), this.dpr);
    gl.uniform1f(this.uniform('u_overscan'), this.overscan);
    gl.uniform1f(this.uniform('u_phase'), this.phase);
    gl.uniform1f(this.uniform('u_corner_radius'), this.cornerRadius);
    gl.uniform2f(this.uniform('u_press_expansion'), this.pressExpansion.x, this.pressExpansion.y);
    gl.uniform2f(this.uniform('u_held_expansion'), this.heldExpansion.x, this.heldExpansion.y);
    gl.uniform2f(this.uniform('u_drag_expansion'), this.dragExpansion.x, this.dragExpansion.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    if (!this.releasing && this.phase > 0.001) root.dataset.liquidWebglActive = 'true';

    const moving = this.targetPhase > 0 && Math.hypot(this.velocity.x, this.velocity.y) > 0.012;
    if (this.phase !== this.targetPhase || moving || settling) { this.schedule(); return; }
    if (this.phase === 0) { root.dataset.liquidWebglActive = 'false'; this.releasing = false; this.lastTime = 0; }
  }
}

let renderer = null;
function getRenderer() {
  if (!renderer) renderer = new GlassRenderer();
  return renderer;
}

// ── Swipe rail ───────────────────────────────────────────────────────────────
function initRail(root) {
  if (!root || root.dataset.liquidBound === "true") return;
  root.dataset.liquidBound = "true";
  const lens = root.querySelector(':scope > .liquid-selection-lens');
  const glow = root.querySelector('.liquid-contact-glow');
  const reflection = root.querySelector('.liquid-contact-reflection');
  const lensReflection = root.querySelector('.liquid-lens-reflection');
  const tabs = () => [...root.querySelectorAll(':scope > button[role="tab"]')];
  let gesture = null, holdTimer = null, moveFrame = null, pending = null;
  let lensGeometry = null;
  let active = tabs().findIndex(t => t.getAttribute('aria-selected') === 'true');
  if (active < 0) active = 0;

  const syncTabState = (i) => {
    tabs().forEach((tab, index) => {
      const selected = index === i;
      tab.setAttribute('aria-selected', String(selected));
      tab.classList.toggle('is-active', selected);
      tab.tabIndex = selected ? 0 : -1;
    });
  };
  syncTabState(active);

  const reduce = () => mq(REDUCED_MOTION).matches;
  const measure = () => {
    const rr = root.getBoundingClientRect();
    const sx = rr.width / Math.max(root.offsetWidth, 1) || 1;
    const sy = rr.height / Math.max(root.offsetHeight, 1) || 1;
    return tabs().map(t => {
      const r = t.getBoundingClientRect();
      return { x: (r.left - rr.left) / sx, y: (r.top - rr.top) / sy, width: r.width / sx, height: r.height / sy };
    });
  };
  const settle = (i) => {
    const g = measure()[i]; if (!g || !lens) return;
    lensGeometry = g;
    lens.style.width = g.width.toFixed(2) + 'px';
    lens.style.height = g.height.toFixed(2) + 'px';
    lens.style.transform = 'translate3d(' + g.x.toFixed(2) + 'px,' + g.y.toFixed(2) + 'px,0)';
    lens.style.removeProperty('scale');
    root.dataset.liquidInitialized = 'true';
    if (getRenderer().isActive(root)) getRenderer().setGeometry(g);
  };
  const select = (i, focus = false) => {
    const list = tabs();
    if (!list.length) return;
    const next = clamp(i, 0, list.length - 1);
    const changed = next !== active;
    active = next;
    syncTabState(active);
    if (changed) root.dispatchEvent(new CustomEvent('railselect', { detail: { index: active } }));
    if (focus) list[active].focus({ preventScroll: true });
  };
  const setContact = (i) => {
    tabs().forEach((t, k) => {
      if (k === i) t.setAttribute('data-liquid-contact', 'true');
      else t.removeAttribute('data-liquid-contact');
    });
  };
  const contact = (cx, cy) => {
    if (!gesture) return;
    const r = gesture.rect;
    const sx = r.width / Math.max(root.offsetWidth, 1) || 1;
    const sy = r.height / Math.max(root.offsetHeight, 1) || 1;
    const lx = (cx - r.left) / sx, ly = (cy - r.top) / sy;
    if (getRenderer().isActive(root)) getRenderer().setContact({ x: lx, y: ly }, { x: gesture.vx, y: gesture.vy });
    if (root.dataset.liquidWebglActive === 'true' || !glow) return;
    glow.style.transform = 'translate3d(' + (lx - 66).toFixed(1) + 'px,' + (ly - 66).toFixed(1) + 'px,0)';
    if (reflection) {
      const tilt = clamp(gesture.vx * 7, -9, 9);
      reflection.style.transform = 'translate3d(' + (lx - 38).toFixed(1) + 'px,' + (ly - 14).toFixed(1) + 'px,0) rotate(' + tilt.toFixed(1) + 'deg)';
    }
    if (lensReflection && lensGeometry) {
      lensReflection.style.transform = 'translate3d(' + (lx - lensGeometry.x - 34).toFixed(1) + 'px,' + (ly - lensGeometry.y - 11).toFixed(1) + 'px,0)';
    }
  };
  const reset = () => {
    root.dataset.liquidDragging = 'false';
    root.dataset.liquidPressed = 'false';
    root.dataset.liquidHeld = 'false';
    setContact(null);
    if (getRenderer().isActive(root)) getRenderer().setPhase('rest');
    clearTimeout(holdTimer);
  };
  const lockScroll = root.classList.contains('liquid-swipe-tabs') || root.classList.contains('rider-tabs');
  let pageLocked = false;
  const blockPageScroll = (e) => { e.preventDefault(); };
  const lockPage = () => {
    if (!lockScroll || pageLocked) return;
    pageLocked = true;
    document.documentElement.dataset.railLock = 'true';
    window.addEventListener('touchmove', blockPageScroll, { passive: false, capture: true });
  };
  const unlockPage = () => {
    if (!pageLocked) return;
    pageLocked = false;
    delete document.documentElement.dataset.railLock;
    window.removeEventListener('touchmove', blockPageScroll, { capture: true });
  };
  const cancel = () => { if (!gesture) return; gesture = null; reset(); unlockPage(); settle(active); };

  const process = () => {
    moveFrame = null;
    if (!gesture || !pending) return;
    const m = pending; pending = null;
    const dt = Math.max(1, m.t - gesture.lastT);
    const ivx = (m.x - gesture.lastX) / dt, ivy = (m.y - gesture.lastY) / dt;
    const blend = 1 - Math.exp(-dt / 24);
    gesture.vx = Math.sign(ivx) !== Math.sign(gesture.vx) ? ivx : mix(gesture.vx, ivx, blend);
    gesture.vy = Math.sign(ivy) !== Math.sign(gesture.vy) ? ivy : mix(gesture.vy, ivy, blend);
    gesture.lastX = m.x; gesture.lastY = m.y; gesture.lastT = m.t;
    if (gesture.axis === 'pending') { contact(m.x, m.y); return; }

    if (lockScroll) {
      const px = (m.x - gesture.rect.left) / gesture.sx;
      const py = (m.y - gesture.rect.top) / (gesture.sy || 1);
      const geos = measure();
      gesture.geos = geos;
      const preview = nearestTab(px, py, geos);
      gesture.raw = preview;
      setContact(preview);
      const g = geos[preview];
      const tab = tabs()[preview];
      if (tab && getRenderer().isActive(root)) getRenderer().setAccent(getComputedStyle(tab).getPropertyValue('--liquid-accent').trim());
      const lw = g.width, lh = g.height;
      const geo = {
        x: clamp(px - lw / 2, 0, Math.max(0, root.offsetWidth - lw)),
        y: clamp(py - lh / 2, 0, Math.max(0, root.offsetHeight - lh)),
        width: lw,
        height: lh,
      };
      lensGeometry = geo;
      if (lens) {
        lens.style.width = geo.width.toFixed(2) + 'px';
        lens.style.height = geo.height.toFixed(2) + 'px';
        lens.style.transform = 'translate3d(' + geo.x.toFixed(2) + 'px,' + geo.y.toFixed(2) + 'px,0)';
      }
      if (getRenderer().isActive(root)) getRenderer().setGeometry(geo);
      contact(m.x, m.y);
      return;
    }

    const px = (m.x - gesture.rect.left) / gesture.sx;
    const geos = gesture.geos, last = geos.length - 1;
    let raw = 0;
    for (let i = 0; i <= last; i++) {
      const c = geos[i].x + geos[i].width / 2;
      if (px <= c) { raw = i === 0 ? 0 : i - 1 + (px - (geos[i - 1].x + geos[i - 1].width / 2)) / (c - (geos[i - 1].x + geos[i - 1].width / 2)); break; }
      raw = i;
    }
    raw = clamp(raw, 0, last);
    const lo = Math.floor(raw), hi = Math.min(last, Math.ceil(raw)), t = raw - lo;
    const from = geos[lo], to = geos[hi];
    const g = {
      x: mix(from.x, to.x, t), y: mix(from.y, to.y, t),
      width: mix(from.width, to.width, t), height: mix(from.height, to.height, t),
    };
    lensGeometry = g;
    gesture.raw = raw;
    const preview = clamp(Math.round(raw), 0, last);
    setContact(preview);
    const tab = tabs()[preview];
    if (tab && getRenderer().isActive(root)) getRenderer().setAccent(getComputedStyle(tab).getPropertyValue('--liquid-accent').trim());
    if (lens) {
      lens.style.width = g.width.toFixed(2) + 'px';
      lens.style.height = g.height.toFixed(2) + 'px';
      lens.style.transform = 'translate3d(' + g.x.toFixed(2) + 'px,' + g.y.toFixed(2) + 'px,0)';
    }
    if (getRenderer().isActive(root)) getRenderer().setGeometry(g);
    contact(m.x, m.y);
  };

  root.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || gesture) return;
    const list = tabs();
    let target = e.target.closest('button[role="tab"]');
    let start = target ? list.indexOf(target) : -1;
    if (start < 0) {
      if (!lockScroll) return;
      const rect0 = root.getBoundingClientRect();
      const sx0 = rect0.width / Math.max(root.offsetWidth, 1) || 1;
      const sy0 = rect0.height / Math.max(root.offsetHeight, 1) || 1;
      start = nearestTab((e.clientX - rect0.left) / sx0, (e.clientY - rect0.top) / sy0, measure());
      target = list[start];
    }
    if (start < 0 || !target) return;
    const rect = root.getBoundingClientRect();
    gesture = {
      axis: 'pending', start, raw: start, held: false, pointerId: e.pointerId, pointerType: e.pointerType,
      startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp,
      vx: 0, vy: 0, geos: measure(), rect,
      sx: rect.width / Math.max(root.offsetWidth, 1) || 1,
      sy: rect.height / Math.max(root.offsetHeight, 1) || 1,
    };
    root.dataset.liquidPressed = 'true'; root.dataset.liquidHeld = 'false';
    setContact(start);
    if (!reduce() && getRenderer().activate(root)) {
      getRenderer().setAccent(getComputedStyle(target).getPropertyValue('--liquid-accent').trim());
      getRenderer().setGeometry(gesture.geos[start]);
      getRenderer().setPhase('pressed');
    }
    settle(start);
    contact(e.clientX, e.clientY);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (!gesture) return;
      gesture.held = true; root.dataset.liquidHeld = 'true';
      lockPage();
      try { root.setPointerCapture(gesture.pointerId); } catch (err) { /* Native gesture takeover is safe. */ }
      if (getRenderer().isActive(root)) getRenderer().setPhase('held');
    }, 105);
  });

  root.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.axis === 'pending') {
      const dx = e.clientX - gesture.startX, dy = e.clientY - gesture.startY;
      const threshold = (gesture.pointerType === 'mouse' ? 7 : 11) + (gesture.held ? 6 : 0);
      if (Math.hypot(dx, dy) < threshold) {
        pending = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        if (moveFrame === null) moveFrame = requestAnimationFrame(process);
        return;
      }
      clearTimeout(holdTimer);
      if (gesture.pointerType !== 'mouse' && !gesture.held && Math.abs(dy) > Math.abs(dx) * 1.12) {
        cancel(); return;
      }
      if (lockScroll) {
        gesture.axis = 'free';
      } else {
        gesture.axis = 'horizontal';
      }
      lockPage();
      root.dataset.liquidDragging = 'true'; root.dataset.liquidHeld = 'true';
      if (getRenderer().isActive(root)) getRenderer().setPhase('dragging');
      try { root.setPointerCapture(gesture.pointerId); } catch (err) { /* Native gesture takeover is safe. */ }
    }
    e.preventDefault();
    pending = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (moveFrame === null) moveFrame = requestAnimationFrame(process);
  });

  const finish = (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const g = gesture;
    if (g.axis === 'pending') {
      const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
      const threshold = (g.pointerType === 'mouse' ? 7 : 11) + (g.held ? 6 : 0);
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const over = hit ? hit.closest('button[role="tab"]') : null;
      // A sloppy tap still counts when the finger lifts over the same tab.
      if (moved >= threshold && over !== tabs()[g.start]) { cancel(); return; }
      gesture = null; reset(); unlockPage(); select(g.start); settle(g.start); return;
    }
    if (g.axis === 'free') {
      const px = (e.clientX - g.rect.left) / g.sx;
      const py = (e.clientY - g.rect.top) / (g.sy || 1);
      const idx = nearestTab(px, py, measure());
      swallowClick = true;
      gesture = null; reset(); unlockPage(); select(idx);
      requestAnimationFrame(() => settle(idx));
      return;
    }
    let idx = Math.round(g.raw);
    if (Math.abs(g.vx) > 0.42) idx = g.vx > 0 ? Math.max(idx, g.start + 1) : Math.min(idx, g.start - 1);
    idx = clamp(idx, 0, tabs().length - 1);
    gesture = null; reset(); unlockPage(); select(idx);
    requestAnimationFrame(() => settle(idx));
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', () => cancel());
  root.addEventListener('lostpointercapture', (e) => {
    // Touch pointers are implicitly captured by the pressed tab on Android.
    // Moving capture to the rail emits a bubbling lostpointercapture from that
    // child; only cancel when the rail itself actually loses capture.
    if (e.target === root && gesture) cancel();
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  let swallowClick = false;
  tabs().forEach((t, i) => t.addEventListener('click', (ev) => {
    if (swallowClick) { swallowClick = false; ev.preventDefault(); ev.stopPropagation(); return; }
    select(i); settle(i);
  }));

  root.addEventListener('keydown', (e) => {
    const tab = e.target.closest('button[role="tab"]');
    if (!tab || !root.contains(tab)) return;
    const list = tabs();
    const current = list.indexOf(tab);
    if (current < 0 || !list.length) return;
    let next = current;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'ArrowRight') next = (current + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + list.length) % list.length;
    else return;
    e.preventDefault();
    select(next, true);
    settle(next);
  });

  const relayout = () => {
    if (gesture) return;
    const i = tabs().findIndex((t) => t.getAttribute('aria-selected') === 'true');
    if (i >= 0) active = i;
    syncTabState(active);
    settle(active);
  };
  let ro = 0;
  new ResizeObserver(() => {
    if (ro) return;
    ro = requestAnimationFrame(() => { ro = 0; relayout(); });
  }).observe(root);
  root.addEventListener('liquidrelayout', relayout);
  requestAnimationFrame(() => settle(active));
}

// ── Standalone glass pressable ───────────────────────────────────────────────
function initAction(root) {
  if (!root || root.dataset.liquidBound === "true") return;
  root.dataset.liquidBound = "true";
  const lens = root.querySelector(':scope > .liquid-selection-lens');
  let pid = null, holdTimer = null, start = null, rect = null;
  const layout = () => {
    const g = { x: 0, y: 0, width: Math.max(root.offsetWidth, 1), height: Math.max(root.offsetHeight, 1) };
    if (lens) {
      lens.style.width = g.width.toFixed(2) + 'px';
      lens.style.height = g.height.toFixed(2) + 'px';
      lens.style.transform = 'translate3d(0,0,0)';
    }
    return g;
  };
  const release = () => {
    if (pid === null) return;
    pid = null; clearTimeout(holdTimer);
    root.dataset.liquidPressed = 'false'; root.dataset.liquidHeld = 'false';
    if (getRenderer().isActive(root)) getRenderer().setPhase('rest');
  };
  root.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || pid !== null) return;
    pid = e.pointerId; start = { x: e.clientX, y: e.clientY };
    rect = root.getBoundingClientRect();
    const g = layout();
    root.dataset.liquidPressed = 'true'; root.dataset.liquidHeld = 'false';
    root.dataset.liquidInitialized = 'true';
    if (!mq(REDUCED_MOTION).matches && getRenderer().activate(root)) {
      getRenderer().setAccent(getComputedStyle(root).getPropertyValue('--liquid-current-accent').trim());
      getRenderer().setGeometry(g); getRenderer().setPhase('pressed');
    }
    if (getRenderer().isActive(root)) getRenderer().setContact({ x: e.clientX - rect.left, y: e.clientY - rect.top }, { x: 0, y: 0 });
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (pid === null) return;
      root.dataset.liquidHeld = 'true';
      if (getRenderer().isActive(root)) getRenderer().setPhase('held');
    }, 105);
  });
  root.addEventListener('pointermove', (e) => {
    if (pid !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 11) { release(); return; }
    if (getRenderer().isActive(root)) getRenderer().setContact({ x: e.clientX - rect.left, y: e.clientY - rect.top }, { x: 0, y: 0 });
  });
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerleave', release);
}

// ── Side panel ───────────────────────────────────────────────────────────────
function initPanel() {
  const trigger = document.querySelector('.side-panel-trigger');
  const panel = document.querySelector('.side-panel');
  const scrim = document.querySelector('.side-panel-scrim');
  if (!trigger || !panel || !scrim) return;
  if (panel.dataset.liquidBound === 'true') return;
  panel.dataset.liquidBound = 'true';
  const closeBtn = panel.querySelector('.side-panel-close');
  const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let isOpen = panel.dataset.open === 'true';
  let previousBodyOverflow = '';

  const focusables = () => [...panel.querySelectorAll(focusableSelector)]
    .filter((element) => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true');
  const set = (open) => {
    if (open === isOpen) return;
    isOpen = open;
    if (open) previousBodyOverflow = document.body.style.overflow;
    else trigger.focus({ preventScroll: true });
    panel.dataset.open = String(open);
    scrim.dataset.open = String(open);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    trigger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : previousBodyOverflow;
    if (open) (closeBtn || panel).focus({ preventScroll: true });
  };
  panel.setAttribute('aria-hidden', String(!isOpen));
  panel.inert = !isOpen;
  trigger.addEventListener('click', () => set(true));
  scrim.addEventListener('click', () => set(false));
  if (closeBtn) closeBtn.addEventListener('click', function () { set(false); });
  panel.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
  panel.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      set(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) {
      e.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  });
}

// Each surface is initialised independently: a failure in one must not strand
// the others, and a WebGL failure must never stop the DOM lens from working.
function safely(label, fn) {
  try { fn(); return true; }
  catch (err) { console.error('[glass] ' + label + ' failed:', err); return false; }
}

export function bootLiquidGlass(scope) {
  if (typeof document === "undefined") return;
  const root = scope || document;
  let railsOk = 0;
  root.querySelectorAll('.liquid-swipe-tabs:not(.liquid-glass-action)').forEach(function (el) {
    if (safely('rail', function () { initRail(el); })) railsOk++;
  });
  root.querySelectorAll('.liquid-glass-action').forEach(function (el) {
    safely('action', function () { initAction(el); });
  });
  safely('panel', initPanel);
  document.documentElement.setAttribute('data-scroll-motion-ready', 'true');
  root.querySelectorAll('[data-reveal]').forEach(function (el) {
    el.setAttribute('data-visible', 'true');
  });
  const status = document.getElementById('glass-status');
  const webglOk = status ? safely('webgl', function () { if (!getRenderer().ensure()) throw new Error('unavailable'); }) : true;
  if (status) {
    status.textContent = 'JS: OK / rails: ' + railsOk + ' / WebGL: ' + (webglOk ? 'ON' : 'OFF (CSSフォールバック)');
    status.dataset.state = railsOk > 0 ? 'ok' : 'bad';
  }
}

export { initRail, initAction };
