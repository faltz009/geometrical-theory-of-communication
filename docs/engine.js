/* Stage engine: one particle field behind a snap-scrolling deck.
 *
 * Adapted from closure-verification/docs/horizon-webgl.js. Every step of the
 * deck names a scene (scenes.js); when the step changes, the particles burst
 * and spring into the new figure, and the ones the figure does not use drift
 * as dust. Figure labels are HTML placed in the same coordinates.
 *
 * ?still, or a reduced-motion preference, snaps every figure into place and
 * freezes animated scenes at their stillT frame.
 */
(function () {
  "use strict";
  const { SCENES, DEFS, clearText } = window.GTC;
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const labelLayer = document.getElementById("labels");
  const deck = document.getElementById("deck");
  const steps = [...document.querySelectorAll(".step")];
  const rail = document.getElementById("rail");
  const ring = document.getElementById("ring");
  const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("still");
  if (STILL) document.documentElement.classList.add("still");

  const NP = 1800;                                // particles
  const SPRING = 0.07, DAMP = 0.84, BURST = 4.2;  // pull to target, velocity kept per frame, kick on step change
  const NARROW = 880;                             // below this width, figure on top and words below
  const COLORS = {
    cyan: [69, 220, 255], ice: [184, 234, 244], brass: [227, 179, 110], dim: [96, 132, 138], paper: [238, 241, 234],
    violet: [178, 152, 255], mint: [122, 224, 176], coral: [255, 150, 118], gold: [255, 222, 110]
  };

  /* Particle state. mode: 0 dust, 1 fixed point, 2 flow. pk: index into the
     scene's points; order: a fixed shuffle so figures draw from mixed particles. */
  const px = new Float32Array(NP), py = new Float32Array(NP), vx = new Float32Array(NP), vy = new Float32Array(NP);
  const tx = new Float32Array(NP), ty = new Float32Array(NP);
  const cr = new Float32Array(NP), cg = new Float32Array(NP), cb = new Float32Array(NP);
  const tr = new Float32Array(NP), tg = new Float32Array(NP), tb = new Float32Array(NP);
  const al = new Float32Array(NP), tal = new Float32Array(NP), sz = new Float32Array(NP), tsz = new Float32Array(NP);
  const ph = new Float32Array(NP), hx = new Float32Array(NP), hy = new Float32Array(NP);
  const mode = new Uint8Array(NP), grp = new Int8Array(NP).fill(-1), pk = new Int32Array(NP);
  const flowOf = new Int16Array(NP), flowU = new Float32Array(NP);
  const order = [...Array(NP).keys()];
  for (let i = NP - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let i = 0; i < NP; i++) {
    ph[i] = Math.random() * Math.PI * 2; hx[i] = Math.random(); hy[i] = Math.random();
    px[i] = hx[i] * window.innerWidth; py[i] = hy[i] * window.innerHeight;
    [cr[i], cg[i], cb[i]] = [tr[i], tg[i], tb[i]] = COLORS.dim;
    tal[i] = 0.14; sz[i] = tsz[i] = 0.75;
  }

  let W = 0, H = 0, frame = null, spec = null, sceneT = 0, activeIndex = -1, wasNarrow = null;
  const cache = new Map();

  /* ---------- geometry: where the figure sits for each layout ---------- */

  function computeFrame(step) {
    const compact = step.dataset.fig === "compact", layout = step.dataset.layout;
    let fx, fy, fw, fh;
    if (W < NARROW) { fx = 12; fw = W - 24; fy = compact ? 58 : 64; fh = H * (compact ? 0.28 : 0.44); }
    else if (layout === "center") { fx = W * 0.1; fw = W * 0.8; fy = H * 0.1; fh = H * 0.54; }
    else if (layout === "full") { fx = W * 0.08; fw = W * 0.84; fy = H * 0.1; fh = H * 0.8; }
    else { fx = W * 0.4; fw = W * 0.54; fy = H * 0.12; fh = H * 0.76; }
    return { cx: fx + fw / 2, cy: fy + fh / 2, u: Math.min(fw / (W < NARROW ? 3.9 : 3.4), fh / 2.3) };
  }
  const toX = x => frame.cx + x * frame.u, toY = y => frame.cy - y * frame.u;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const isNarrow = W < NARROW;
    if (activeIndex < 0) { wasNarrow = isNarrow; return; }
    frame = computeFrame(steps[activeIndex]);
    if (isNarrow !== wasNarrow) {           // some scenes lay out differently on phones
      wasNarrow = isNarrow; cache.clear(); setScene(steps[activeIndex].dataset.scene, false);
    } else { placeLabels(); retarget(); }
  }

  /* ---------- scenes ---------- */

  function build(name) {
    if (!cache.has(name)) cache.set(name, (SCENES[name] || SCENES.dust)());
    return cache.get(name);
  }
  function setColor(i, c) { [tr[i], tg[i], tb[i]] = COLORS[c] || COLORS.ice; }

  /* Hand the particles to a scene: fixed points first, then flows, the rest dust. */
  function setScene(name, burst) {
    spec = build(name || "dust"); sceneT = 0;
    const pts = spec.points || [], flows = spec.flows || [];
    let k = 0, f = 0, fk = 0;
    for (let j = 0; j < NP; j++) {
      const i = order[j];
      if (k < pts.length) {
        const p = pts[k]; pk[i] = k++; mode[i] = 1;
        setColor(i, p.c); tal[i] = p.a ?? 0.85; tsz[i] = p.s ?? 1; grp[i] = p.g ?? -1;
      } else if (f < flows.length) {
        const fl = flows[f]; mode[i] = 2; flowOf[i] = f; flowU[i] = fk / fl.n + Math.random() * 0.01;
        setColor(i, fl.c); tal[i] = fl.a ?? 1; tsz[i] = fl.s ?? 1.3; grp[i] = fl.g ?? -1;
        if (++fk >= fl.n) { f++; fk = 0; }
      } else {
        mode[i] = 0; setColor(i, "dim"); tal[i] = 0.14; tsz[i] = 0.75; grp[i] = -1;
      }
    }
    retarget();
    if (burst && !STILL) for (let i = 0; i < NP; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * BURST;
      vx[i] += Math.cos(a) * s; vy[i] += Math.sin(a) * s;
    }
    renderLabels(spec.labels || []);
    if (STILL) render(performance.now() / 1000, 0.016, true);
  }

  /* Pixel targets for fixed points; moving scenes compute theirs each frame. */
  function retarget() {
    const pts = (spec && spec.points) || [];
    for (let i = 0; i < NP; i++) if (mode[i] === 1) { tx[i] = toX(pts[pk[i]].x); ty[i] = toY(pts[pk[i]].y); }
  }

  /* ---------- labels and the definition floater ---------- */

  const floater = document.createElement("div");
  floater.id = "floater"; floater.hidden = true; floater.setAttribute("role", "tooltip");
  document.body.appendChild(floater);

  function showFloat(el, def) {
    floater.innerHTML = `<span class="f-word">${def.w}</span><p class="f-title">${def.t}</p><p class="f-body">${def.d}</p><p class="f-src">${def.s}</p>`;
    floater.dataset.for = def.w; floater.hidden = false;
    const r = el.getBoundingClientRect(), fw = floater.offsetWidth, fh = floater.offsetHeight;
    let left = r.right + 18, top = r.top + r.height / 2 - fh / 2;
    if (left + fw > W - 16) left = r.left - fw - 18;                       // no room on the right: go left
    if (left < 16) { left = Math.max(16, Math.min(W - fw - 16, r.left + r.width / 2 - fw / 2)); top = r.bottom + 12; } // nor left: go below
    floater.style.left = left + "px";
    floater.style.top = Math.max(70, Math.min(H - fh - 16, top)) + "px";
  }
  function hideFloat() { floater.hidden = true; }
  function bindFloat(el, def) {
    el.addEventListener("mouseenter", () => showFloat(el, def));
    el.addEventListener("mouseleave", hideFloat);
    el.addEventListener("focus", () => showFloat(el, def));
    el.addEventListener("blur", hideFloat);
    el.addEventListener("click", () => (floater.dataset.for === def.w && !floater.hidden ? hideFloat() : showFloat(el, def)));
  }
  /* phrases in the text that carry a definition */
  document.querySelectorAll(".copy [data-def]").forEach(el => { if (DEFS[el.dataset.def]) bindFloat(el, DEFS[el.dataset.def]); });
  /* labels sit above the deck, so pass their wheel events on to it */
  labelLayer.addEventListener("wheel", e => deck.scrollBy({ top: e.deltaY }), { passive: true });

  let labelEls = [];
  function renderLabels(list) {
    labelEls.forEach(el => { el.classList.remove("in"); setTimeout(() => el.remove(), 500); });
    labelEls = list.map(l => {
      const el = document.createElement("div");
      el.className = "lbl " + (l.cls || "");
      el.innerHTML = l.html;
      el.dataset.x = l.x; el.dataset.y = l.y;
      if (l.w) el.dataset.w = l.w;
      if (l.g !== undefined) el.dataset.g = l.g;
      if (l.live) el._live = l.live;                         // text recomputed each frame from the scene's time
      if (l.at) el._at = l.at;                               // position recomputed each frame, for labels riding a moving figure
      if (l.def) {
        el.classList.add("hot"); el.tabIndex = 0; el.setAttribute("role", "button");
        el.setAttribute("aria-label", l.def.w + ": " + l.def.t);
        bindFloat(el, l.def);
      }
      labelLayer.appendChild(el);
      return el;
    });
    placeLabels();
    const show = () => labelEls.forEach(el => el.classList.add("in"));
    if (STILL) show(); else requestAnimationFrame(() => requestAnimationFrame(show));
  }
  function placeLabels() {
    labelEls.forEach(el => {
      el.style.left = toX(+el.dataset.x) + "px"; el.style.top = toY(+el.dataset.y) + "px";
      if (el.dataset.w) el.style.width = (+el.dataset.w * frame.u) + "px";
    });
  }

  /* ---------- animation ---------- */

  let last = performance.now(), running = true;
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    render(now / 1000, dt, STILL);
    requestAnimationFrame(tick);
  }

  /* One frame: move every particle toward its target, then draw it. snap places it there directly. */
  function render(T, dt, snap) {
    sceneT += dt;
    const k = dt * 60, damp = Math.pow(DAMP, k);
    const flows = spec.flows || [], spin = spec.spin, pulse = spec.pulse;
    const lit = pulse ? Math.floor(sceneT / pulse.period) % pulse.count : -1;
    const tc = STILL && spec.stillT !== undefined ? spec.stillT : spec.period ? sceneT % spec.period : sceneT;
    const dyn = spec.dynamic ? spec.dynamic(tc) : null;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < NP; i++) {
      let gx, gy, depth = 1;
      if (mode[i] === 2) {                                   // flows: move along their path
        const fl = flows[flowOf[i]];
        if (!STILL) flowU[i] = (flowU[i] + dt * fl.speed) % 1;
        const p = fl.path(flowU[i]); gx = toX(p[0]); gy = toY(p[1]);
      } else if (mode[i] === 1 && spin) {                    // 3D points: turn and tilt, fade with depth
        const p = spec.points[pk[i]], yaw = T * spin.speed, c = Math.cos(yaw), s = Math.sin(yaw);
        const x1 = p.x * c - p.z * s, z1 = p.x * s + p.z * c;
        const y1 = p.y * Math.cos(spin.tilt) - z1 * Math.sin(spin.tilt), z2 = p.y * Math.sin(spin.tilt) + z1 * Math.cos(spin.tilt);
        gx = toX(x1); gy = toY(y1 + Math.sin(T * 0.45) * (spin.bob || 0));
        depth = 0.25 + 0.75 * (z2 + 1) / 2;
      } else if (mode[i] === 1 && dyn) {                     // moving figures: the scene gives every target
        const d = dyn[pk[i]]; gx = toX(d.x); gy = toY(d.y); tal[i] = d.a;
        if (d.c) setColor(i, d.c);
      } else if (mode[i] === 1) { gx = tx[i]; gy = ty[i]; }  // still figures
      else {                                                 // dust
        const drift = STILL ? 0 : 22;
        gx = hx[i] * W + Math.sin(T * 0.11 + ph[i]) * drift; gy = hy[i] * H + Math.cos(T * 0.09 + ph[i] * 1.3) * drift;
      }
      if (snap) { px[i] = gx; py[i] = gy; vx[i] = vy[i] = 0; }
      else {
        vx[i] = (vx[i] + (gx - px[i]) * SPRING * k) * damp;
        vy[i] = (vy[i] + (gy - py[i]) * SPRING * k) * damp;
        px[i] += vx[i] * k; py[i] += vy[i] * k;
      }
      const e = snap ? 1 : Math.min(1, 0.08 * k);
      cr[i] += (tr[i] - cr[i]) * e; cg[i] += (tg[i] - cg[i]) * e; cb[i] += (tb[i] - cb[i]) * e;
      al[i] += (tal[i] - al[i]) * e; sz[i] += (tsz[i] - sz[i]) * e;

      let a = al[i] * (snap ? 1 : 0.82 + 0.18 * Math.sin(T * 1.6 + ph[i])) * depth;
      if (a < 0.015) continue;                               // invisible: skip drawing
      if (lit >= 0 && grp[i] >= 0) a *= grp[i] === lit ? 1.15 : 0.38;
      const r = (0.75 + sz[i] * 0.85) * (W < 600 ? 0.85 : 1);
      const col = `${cr[i] | 0},${cg[i] | 0},${cb[i] | 0}`;
      if (a > 0.5 && mode[i] !== 0) {                        // soft halo on bright figure points
        ctx.fillStyle = `rgba(${col},${(a * 0.09).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px[i], py[i], r * 3.4, 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px[i], py[i], r, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    if (pulse) labelEls.forEach(el => { if (el.dataset.g !== undefined) el.classList.toggle("pulse-lit", +el.dataset.g === lit); });
    labelEls.forEach(el => {
      if (el._live) { const h = el._live(tc); if (h !== el._html) el.innerHTML = el._html = h; }
      if (el._at) { const [x, y] = el._at(tc); el.style.left = toX(x) + "px"; el.style.top = toY(y) + "px"; }
    });
  }

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(tick); }
  });

  /* ---------- deck: the chapter rail, the active step, the ring ---------- */

  const parts = [];
  steps.forEach((s, i) => {
    if (!parts.length || parts[parts.length - 1].id !== s.dataset.part) parts.push({ id: s.dataset.part, label: s.dataset.partLabel, num: s.dataset.partNum, first: i });
  });
  rail.innerHTML = parts.map(p => `<button type="button" data-first="${p.first}"><span>${p.num} ${p.label}</span><i></i></button>`).join("");
  rail.querySelectorAll("button").forEach(b => b.addEventListener("click", () => goTo(+b.dataset.first)));

  function activate(i) {
    if (i === activeIndex) return;
    hideFloat();
    const burst = activeIndex >= 0;
    activeIndex = i;
    steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
    frame = computeFrame(steps[i]);
    setScene(steps[i].dataset.scene, burst);
    const part = steps[i].dataset.part;
    rail.querySelectorAll("button").forEach(b => b.setAttribute("aria-current", steps[+b.dataset.first].dataset.part === part));
  }
  function goTo(i) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    deck.scrollTo({ top: steps[i].offsetTop, behavior: STILL ? "auto" : "smooth" });
  }
  /* The step under the middle of the screen is active; the ring shows how far through the deck we are. */
  function onScroll() {
    const middle = deck.scrollTop + deck.clientHeight / 2;
    let idx = 0;
    for (let i = 0; i < steps.length; i++) if (steps[i].offsetTop <= middle) idx = i;
    activate(idx);
    const max = deck.scrollHeight - deck.clientHeight;
    ring.style.setProperty("--p", max > 0 ? (deck.scrollTop / max).toFixed(4) : 0);
  }
  deck.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("keydown", e => {
    if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); goTo(activeIndex + 1); }
    else if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); goTo(activeIndex - 1); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(steps.length - 1); }
  });
  window.addEventListener("resize", () => { resize(); onScroll(); });

  /* ---------- start ---------- */

  resize();
  const start = steps.findIndex(s => s.id === location.hash.slice(1));
  if (start > 0) deck.scrollTop = steps[start].offsetTop;
  onScroll();
  requestAnimationFrame(tick);

  /* Text-shaped figures need the web font; rebuild them once it has loaded. */
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('500 240px "EB Garamond"'), document.fonts.ready]).then(() => {
      clearText(); cache.clear();
      if (activeIndex >= 0) setScene(steps[activeIndex].dataset.scene, false);
    }).catch(() => {});
  }
})();
