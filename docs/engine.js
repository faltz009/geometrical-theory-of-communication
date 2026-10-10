/* Stage engine: one particle field behind a snap-scrolling deck.
 *
 * Adapted from closure-verification/docs/horizon-webgl.js. Every step of the
 * deck names a scene (scenes.js); when the step changes, the particles glide
 * into the new figure and settle there on a soft spring, and the ones the
 * figure does not use drift as dust. Figure labels are HTML placed in the same coordinates.
 *
 * ?still, or a reduced-motion preference, snaps every figure into place and
 * freezes animated scenes at their stillT frame. One wheel or trackpad gesture
 * moves one step. Phrases with data-def open a definition floater, phrases with
 * data-recall show a picture of an earlier card and go back to it on a click.
 * The Light/Dark button swaps both the page palette and the particle palette.
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
  const SPRING = 0.07, DAMP = 0.84;               // pull to target, velocity kept per frame: a springy, floating settle
  /* for the first ARRIVE seconds after a step change the motion starts overdamped (pull 0.04, 68% kept,
     both rates real) and eases into the spring above, so particles glide into the new figure without
     the first overshoot, then keep the spring's floating feel */
  const ARRIVE = 1.2;
  const NARROW = 880;                             // below this width, figure on top and words below
  const small = () => W < NARROW && !document.documentElement.classList.contains("phone-mode");   // phone mode keeps the desktop arrangement
  /* Two palettes under the same names. Night draws light on black and adds light where
     particles overlap; the light theme draws ink and gold on paper and lays them over each other. */
  const PALETTES = {
    dark: { cyan: [69, 220, 255], ice: [184, 234, 244], brass: [227, 179, 110], dim: [96, 132, 138], paper: [238, 241, 234],
            violet: [178, 152, 255], mint: [122, 224, 176], coral: [255, 150, 118], gold: [255, 222, 110] },
    light: { cyan: [168, 120, 27], ice: [58, 56, 52], brass: [122, 90, 30], dim: [150, 144, 130], paper: [22, 22, 20],
             violet: [93, 79, 147], mint: [58, 115, 89], coral: [169, 75, 54], gold: [196, 150, 40] }
  };
  const root = document.documentElement;
  let theme = "dark";
  try { if (localStorage.getItem("gtc-theme") === "light") theme = "light"; } catch (e) {}
  root.dataset.theme = theme;
  let COLORS = PALETTES[theme];

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
    const layout = step.dataset.layout;
    let fx, fy, fw, fh;
    if (small() && W > H) { fx = 12; fw = W * 0.46; fy = 60; fh = H - 76; }   // a phone on its side: figure left, words right
    else if (small()) { fx = 12; fw = W - 24; fy = 64; fh = figH(); }
    else if (layout === "center") { fx = W * 0.1; fw = W * 0.8; fy = H * 0.1; fh = H * 0.54; }
    else if (layout === "full") { fx = W * 0.08; fw = W * 0.84; fy = H * 0.1; fh = H * 0.8; }
    else { fx = W * 0.4; fw = W * 0.54; fy = H * 0.12; fh = H * 0.76; }
    return { cx: fx + fw / 2, cy: fy + fh / 2, u: Math.min(fw / (small() ? 3.9 : 3.4), fh / 2.3) };
  }
  /* phones: one band at the top holds every figure, and the words scroll beneath it; on its side, the
     figure holds the left half and the words scroll on the right, so only the top bar covers them */
  const figH = () => Math.min(Math.max(H * 0.36, 160), 300);
  const figBottom = () => W > H ? 64 : 64 + figH();
  /* where a step sits when it is the one being read: at the top of the screen, or on phones with its
     words just below the figure; and the line a step's top must pass to become the active one */
  const stepTop = i => small() ? Math.max(0, steps[i].offsetTop - figBottom() - 12) : steps[i].offsetTop;
  const readLine = () => small() ? figBottom() + (H - figBottom()) * (W > H ? 0.3 : 0.45) : deck.clientHeight / 2;
  const toX = x => frame.cx + x * frame.u, toY = y => frame.cy - y * frame.u;
  /* screen pixels to stage units, for scenes that sit their figures inside the page's own boxes */
  window.GTC.toStage = (px, py) => [(px - frame.cx) / frame.u, (frame.cy - py) / frame.u];
  window.GTC.unit = () => frame.u;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const isNarrow = small();
    root.style.setProperty("--fig-bottom", figBottom() + "px");
    if (activeIndex < 0) { wasNarrow = isNarrow; return; }
    frame = computeFrame(steps[activeIndex]);
    if (isNarrow !== wasNarrow) {           // some scenes lay out differently on phones
      wasNarrow = isNarrow; cache.clear(); setScene(steps[activeIndex].dataset.scene);
    } else { placeLabels(); retarget(); }
  }

  /* ---------- scenes ---------- */

  function build(name) {
    if (!cache.has(name)) cache.set(name, (SCENES[name] || SCENES.dust)());
    return cache.get(name);
  }
  function setColor(i, c) { [tr[i], tg[i], tb[i]] = COLORS[c] || COLORS.ice; }

  /* Hand the particles to a scene: fixed points first, then flows, the rest dust. */
  function setScene(name) {
    spec = build(name || "dust"); sceneT = 0;
    root.classList.toggle("anchored", !!spec.anchored);
    root.classList.toggle("bare", !name || name === "dust");
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
    floater.innerHTML = `<span class="f-word">${def.w}</span><p class="f-title">${def.t}</p>` +
      (def.img ? `<img class="f-img" src="${def.img}" alt="">` : `<p class="f-body">${def.d}</p>`) + `<p class="f-src">${def.s}</p>`;
    floater.classList.toggle("wide", !!def.img);
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
  /* phrases that refer back to an earlier screen: the floater shows a picture of that screen's
     figure (docs/recall/<id>.jpg, captured from ?still) with its chapter and title, and a click
     goes back to it */
  document.querySelectorAll(".copy [data-recall]").forEach(el => {
    const target = document.getElementById(el.dataset.recall);
    if (!target) return;
    const kicker = target.querySelector(".kicker"), title = target.querySelector("h2");
    bindFloat(el, { w: kicker ? kicker.textContent : "earlier", t: title ? title.textContent : "", img: `recall/${target.id}.jpg`, s: "Click to go back to it" });
    el.addEventListener("click", e => { e.preventDefault(); hideFloat(); goTo(steps.indexOf(target)); });
  });

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
      if (l.on) {                                            // labels that act as buttons: hover and click handlers from the scene
        el.classList.add("act"); el.tabIndex = 0; el.setAttribute("role", "button");
        if (l.on.enter) { el.addEventListener("mouseenter", l.on.enter); el.addEventListener("focus", l.on.enter); }
        if (l.on.leave) { el.addEventListener("mouseleave", l.on.leave); el.addEventListener("blur", l.on.leave); }
        if (l.on.click) { el.addEventListener("click", l.on.click); el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); l.on.click(); } }); }
      }
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
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // the first frame can stamp slightly before start
    render(now / 1000, dt, STILL);
    requestAnimationFrame(tick);
  }

  /* One frame: move every particle toward its target, then draw it. snap places it there directly. */
  function render(T, dt, snap) {
    sceneT += dt;
    const k = dt * 60, ease = Math.min(1, sceneT / ARRIVE);
    const spring = 0.04 + (SPRING - 0.04) * ease, damp = Math.pow(0.68 + (DAMP - 0.68) * ease, k);
    const flows = spec.flows || [], spin = spec.spin, pulse = spec.pulse;
    const lit = pulse ? Math.floor(sceneT / pulse.period) % pulse.count : -1;
    const tc = STILL && spec.stillT !== undefined ? spec.stillT : spec.period ? sceneT % spec.period : sceneT;
    const dyn = spec.dynamic ? spec.dynamic(tc) : null;
    /* a scene drawn against the page's own boxes follows its step as the page scrolls */
    const ay = spec.anchored && activeIndex >= 0 ? steps[activeIndex].getBoundingClientRect().top : 0;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = theme === "light" ? "source-over" : "lighter";
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
      if (ay && mode[i] !== 0) gy += ay;
      if (snap) { px[i] = gx; py[i] = gy; vx[i] = vy[i] = 0; }
      else {
        vx[i] = (vx[i] + (gx - px[i]) * spring * k) * damp;
        vy[i] = (vy[i] + (gy - py[i]) * spring * k) * damp;
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
    const lt = ay ? `translateY(${ay.toFixed(1)}px)` : "";
    if (labelLayer.style.transform !== lt) labelLayer.style.transform = lt;
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

  /* one rail button per section */
  const parts = [];
  steps.forEach((s, i) => {
    if (!parts.length || parts[parts.length - 1].id !== s.dataset.part) parts.push({ id: s.dataset.part, label: s.dataset.partLabel, num: s.dataset.partNum, first: i });
  });
  /* a section's rail button lands on its opener (the screen with the big title) when it has one */
  parts.forEach(p => {
    const k = steps.findIndex((s, j) => j >= p.first && s.dataset.part === p.id && s.querySelector(".intro-title"));
    if (k >= 0) p.first = k;
  });
  rail.innerHTML = parts.map(p => `<button type="button" data-first="${p.first}"><span>${p.num} ${p.label}</span><i></i></button>`).join("");
  rail.querySelectorAll("button").forEach(b => b.addEventListener("click", () => goTo(+b.dataset.first)));

  function activate(i) {
    if (i === activeIndex) return;
    hideFloat();
    activeIndex = i;
    steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
    /* embedded animations run only while their step is active; they stop themselves when it is not, and this wakes them */
    steps[i].querySelectorAll("iframe").forEach(f => { try { f.contentWindow && f.contentWindow.postMessage({ deck: "play" }, "*"); } catch (e) {} });
    frame = computeFrame(steps[i]);
    setScene(steps[i].dataset.scene);
    const part = steps[i].dataset.part;
    rail.querySelectorAll("button").forEach(b => b.setAttribute("aria-current", steps[+b.dataset.first].dataset.part === part));
  }
  function goTo(i) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    deck.scrollTo({ top: stepTop(i), behavior: STILL ? "auto" : "smooth" });
  }
  /* one step up or down the deck */
  const step = dir => goTo(activeIndex + dir);
  /* in-page links (the index tables) move the deck to their step */
  document.addEventListener("click", ev => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1), j = steps.findIndex(s => s.id === id);
    if (j < 0) return;
    ev.preventDefault();
    goTo(j);
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  });

  /* the light and dark themes: recolour the particles by re-handing them the current scene */
  const themeButton = document.getElementById("theme");
  function setTheme(t) {
    theme = t; root.dataset.theme = t; COLORS = PALETTES[t];
    themeButton.textContent = t === "light" ? "Dark" : "Light";
    themeButton.setAttribute("aria-label", t === "light" ? "Switch to the dark theme" : "Switch to the light theme");
    try { localStorage.setItem("gtc-theme", t); } catch (e) {}
    for (let i = 0; i < NP; i++) if (mode[i] === 0) setColor(i, "dim");
    if (activeIndex >= 0) setScene(steps[activeIndex].dataset.scene);
  }
  themeButton.addEventListener("click", () => setTheme(theme === "light" ? "dark" : "light"));
  themeButton.textContent = theme === "light" ? "Dark" : "Light";

  /* The step under the middle of the screen is active; the ring shows how far through the deck we are. */
  function onScroll() {
    const middle = deck.scrollTop + readLine();
    let idx = 0;
    for (let i = 0; i < steps.length; i++) if (steps[i].offsetTop <= middle) idx = i;
    activate(idx);
    const max = deck.scrollHeight - deck.clientHeight;
    ring.style.setProperty("--p", max > 0 ? (deck.scrollTop / max).toFixed(4) : 0);
  }
  deck.addEventListener("scroll", onScroll, { passive: true });

  /* One wheel or trackpad gesture moves exactly one step. Deltas add up until they pass a
     threshold; then the deck moves and further events are absorbed until the gesture ends
     (no events for a moment) and the smooth scroll has had time to land. Touch and keys
     keep the native snap. Labels sit above the deck, so they route their wheel here too. */
  let wheelSum = 0, wheelLock = false, lastWheel = 0, lastStep = 0;
  function onWheel(e) {
    if (e.ctrlKey) return;                                     // pinch zoom
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel > 220) { wheelSum = 0; if (now - lastStep > 650) wheelLock = false; }
    lastWheel = now;
    if (wheelLock) return;
    const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    wheelSum += d;
    if (Math.abs(wheelSum) >= 40) {
      step(wheelSum > 0 ? 1 : -1);
      wheelSum = 0; wheelLock = true; lastStep = now;
    }
  }
  deck.addEventListener("wheel", onWheel, { passive: false });
  labelLayer.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("a, button, [role=button]") && [" ", "Enter"].includes(e.key)) return;
    if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); step(1); }
    else if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); step(-1); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(steps.length - 1); }
  });
  /* A resize that changes the layout (turning the phone, entering phone mode, crossing the phone width)
     keeps the step being read; turns and mode changes hold it while their resizes settle. */
  let holdIdx = -1, holdUntil = 0;
  function holdStep() { holdIdx = activeIndex; holdUntil = performance.now() + 1500; }
  window.addEventListener("orientationchange", holdStep);
  window.addEventListener("resize", () => {
    const held = performance.now() < holdUntil, keep = held ? holdIdx : activeIndex, wasN = wasNarrow;
    resize();
    if (keep >= 0 && (held || wasN !== small() || small())) {
      deck.scrollTop = stepTop(keep);
      if (held) holdUntil = performance.now() + 800;
    }
    onScroll(); markOverflow();
  });

  /* Phone mode: the desktop arrangement, full screen and on its side, which is how the deck reads best on
     a phone, with the words set smaller to fit; turning back upright shows a prompt to turn the phone again.
     (A desktop-width viewport would be simpler, but browsers ignore it in full screen.) */
  const phoneButton = document.getElementById("phone");
  let phoneMode = false, wentFull = false;
  function setPhoneMode(on) {
    if (on === phoneMode) return;
    phoneMode = on; holdStep();
    root.classList.toggle("phone-mode", on);
    phoneButton.textContent = on ? "Exit phone mode" : "Phone mode";
    phoneButton.setAttribute("aria-pressed", String(on));
    const el = document.documentElement;
    if (on) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(el)).then(() => {
        wentFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (screen.orientation && screen.orientation.lock) return screen.orientation.lock("landscape");
      }).catch(() => {});
    } else {
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if ((document.fullscreenElement || document.webkitFullscreenElement) && exit) Promise.resolve(exit.call(document)).catch(() => {});
      wentFull = false;
    }
    window.dispatchEvent(new Event("resize"));                   // re-lay the deck in the other arrangement
  }
  phoneButton.addEventListener("click", () => setPhoneMode(!phoneMode));
  document.getElementById("turn-exit").addEventListener("click", () => setPhoneMode(false));
  ["fullscreenchange", "webkitfullscreenchange"].forEach(t => document.addEventListener(t, () => {
    if (wentFull && !(document.fullscreenElement || document.webkitFullscreenElement)) setPhoneMode(false);   // left full screen with the back gesture
  }));
  /* a card taller than the screen in phone mode scrolls inside itself, fading at the bottom while there is more */
  const copies = [...document.querySelectorAll(".copy")];
  const more = c => c.classList.toggle("more", phoneMode && c.scrollHeight - c.scrollTop - c.clientHeight > 4);
  function markOverflow() { copies.forEach(more); }
  copies.forEach(c => c.addEventListener("scroll", () => more(c), { passive: true }));

  /* ---------- start ---------- */

  resize();
  const start = steps.findIndex(s => s.id === location.hash.slice(1));
  if (start > 0) deck.scrollTop = stepTop(start);
  onScroll();
  requestAnimationFrame(tick);
  /* Unlocked on phones, nothing snaps the page back when the web font changes the text's height, so a
     linked step is held in place until the font has loaded or the reader moves. */
  let hold = start > 0 ? start : -1;
  const release = () => { hold = -1; };
  ["touchstart", "wheel", "keydown", "pointerdown"].forEach(t => window.addEventListener(t, release, { passive: true, once: true }));
  const reHold = () => { if (hold > 0) { deck.scrollTop = stepTop(hold); onScroll(); } };

  /* Text-shaped figures need the web font; rebuild them once it has loaded. */
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('500 240px "EB Garamond"'), document.fonts.ready]).then(() => {
      reHold(); markOverflow();
      clearText(); cache.clear();
      if (activeIndex >= 0) setScene(steps[activeIndex].dataset.scene);
    }).catch(() => {});
  }
  window.addEventListener("load", reHold);
})();
