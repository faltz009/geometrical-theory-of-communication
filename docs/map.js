/* The map of the thesis: draws the Hopf fibration at the top, the heaviest claims, how the
 * theory evolved and one gallery per question from map-data.js, and filters it all by field. */
(function () {
  "use strict";
  const { FIELDS, PAPERS, CORE, EVOLUTION, BREAKS, HUBS } = window.MAP;
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const HUES = { psychology: 0, neuroscience: 33, information: 58, epistemology: 110, biology: 143, chemistry: 175, computing: 205, physics: 238, mathematics: 272, linguistics: 305, music: 335 };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = s => esc(s).replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>");     // e^{2πi} written as a superscript
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- cards ---------- */
  const fieldTags = fields => `<div class="fields">${fields.map(f => `<span class="f-${f}">${FIELDS[f]}</span>`).join("")}</div>`;
  const sources = (papers, topic) => {
    const links = papers.map(k => {
      const [label, href, kind] = PAPERS[k];
      if (href) return `<a href="${href}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
      return `<span class="${kind === "ref" ? "cite" : "pending"}">${esc(label)}</span>`;
    });
    if (topic) links.push(`<a class="watch" href="index.html#${topic}">See it explained →</a>`);
    return `<div class="sources">${links.join("")}</div>`;
  };
  const tint = it => `--tint: oklch(var(--L) var(--C) ${HUES[it.fields[0]]})`;
  const card = (it, cls, head = "") => `
    <article class="card ${cls}" data-fields="${it.fields.join(" ")}" style="${tint(it)}">
      ${head}${fieldTags(it.fields)}
      <h3>${esc(it.title)}</h3>
      <p>${fmt(it.text)}</p>
      ${sources(it.papers, it.topic)}
    </article>`;

  /* what the thesis does, ranked: the first leads at full width with the circle it describes */
  const SHAPE = `<svg class="shape-fig" viewBox="-130 -130 260 260" aria-hidden="true">
      <circle class="ring" r="92"/><line class="ax" x1="-104" y1="0" x2="104" y2="0"/><line class="ax" x1="0" y1="-104" x2="0" y2="104"/>
      <path class="corner" d="M 14 0 L 14 -14 L 0 -14"/>
      <circle class="p sym" cx="92" cy="0" r="4.5"/><circle class="p sym" cx="-92" cy="0" r="4.5"/><circle class="p" cx="0" cy="-92" r="4.5"/><circle class="p" cx="0" cy="92" r="4.5"/>
      <g class="spin"><circle class="arc" r="104" pathLength="100"/><circle class="m" cx="92" cy="0" r="6.5"/></g>
      <text x="0" y="-112" class="t">perpendicularity · difference</text><text x="0" y="124" class="t">symmetry · sameness</text>
    </svg>`;
  const [lead, ...rest] = CORE;
  document.getElementById("core-lead").innerHTML = card(lead, "rank first", `<p class="rank-no">1</p>`).replace("</article>", `${SHAPE}</article>`);
  document.getElementById("core").innerHTML = rest.map((it, k) => card(it, "rank", `<p class="rank-no">${k + 2}</p>`)).join("");

  /* how the theory evolved: then, now, and what would break it */
  const STATUS = { corrected: "Corrected", sharpened: "Sharpened", kept: "Kept" };
  const evo = it => `
    <article class="card evo ${it.status}" data-fields="${it.fields.join(" ")}">
      <span class="status">${STATUS[it.status]}</span>
      ${fieldTags(it.fields)}
      <h3>${esc(it.title)}</h3>
      <div class="then"><small>Then · ${esc(it.when)}</small><q>${esc(it.then)}</q></div>
      <div class="now"><small>Now</small><span>${fmt(it.now)}</span></div>
      ${sources(it.papers, it.topic)}
    </article>`;
  const breaks = `
    <article class="card evo breaks" data-fields="${BREAKS.fields.join(" ")}">
      <span class="status">The chain holds</span>
      <h3>${esc(BREAKS.title)}</h3>
      <p>${esc(BREAKS.text)}</p>
      <ul>${BREAKS.items.map(([k, v]) => `<li><b>${esc(k)}</b>, ${esc(v)}</li>`).join("")}</ul>
      ${sources(BREAKS.papers)}
    </article>`;
  document.getElementById("evolution").innerHTML = EVOLUTION.map(evo).join("") + breaks;

  /* one gallery per question, each with its glyph */
  const GLYPHS = {
    exists: '<circle class="dot" cx="29" cy="29" r="4"/><circle cx="29" cy="29" r="15"/><path d="M29 6v7M29 45v7M6 29h7M45 29h7"/>',
    proved: '<rect x="15" y="40" width="28" height="9" rx="2"/><rect x="15" y="26" width="28" height="9" rx="2"/><rect x="15" y="12" width="28" height="9" rx="2"/><path d="M9 44v-26M6 21l3-4 3 4"/>',
    matter: '<circle cx="22" cy="29" r="13"/><circle cx="36" cy="29" r="13"/><circle class="dot" cx="29" cy="19.5" r="2"/>',
    measure: '<circle cx="29" cy="22" r="13"/><path d="M16 46h26M16 22v24M42 22v24"/><circle class="dot" cx="29" cy="46" r="2.2"/>',
    number: '<path d="M29 29m0 0a2 2 0 0 1 4 0a6 6 0 0 1-10 2a10 10 0 0 1 15-9a14 14 0 0 1-5 20a18 18 0 0 1-22-7a22 22 0 0 1 9-26"/>',
    life: '<path d="M18 6c0 12 22 14 22 23s-22 11-22 23M40 6c0 12-22 14-22 23s22 11 22 23M21 14h16M21 44h16M24 29h10"/>',
    minds: '<circle cx="29" cy="12" r="5"/><circle cx="13" cy="42" r="5"/><circle cx="45" cy="42" r="5"/><path d="M26 16l-10 21M32 16l10 21M18 42h22"/>',
    running: '<circle cx="15" cy="29" r="9"/><path d="M24 29c3-9 7-9 10 0s7 9 10 0s5-7 8-3"/><circle class="dot" cx="15" cy="20" r="2"/>',
    build: '<path d="M10 20l14-8 14 8v16l-14 8-14-8z M10 20l14 8 14-8 M24 28v16"/><circle cx="46" cy="36" r="8"/>'
  };
  document.getElementById("hubs").innerHTML = HUBS.map((hub, k) => `
    <section class="hub" id="q${k}" data-hub="${k}">
      <header class="hub-head">
        <svg class="glyph" viewBox="0 0 58 58" aria-hidden="true">${GLYPHS[hub.glyph] || ""}</svg>
        <span class="num">${ROMAN[k]}</span>
        <h2>${esc(hub.q)}</h2>
        <p>${esc(hub.line)}</p>
        <span class="n">${hub.items.length} insights</span>
      </header>
      <div class="gallery">${[...hub.items].sort((a, b) => a.weight - b.weight).map(it => card(it, it.weight === 2 ? "major" : "support")).join("")}</div>
    </section>`).join("");

  /* ---------- the landing: the questions placed around the centre ---------- */
  const atlas = document.getElementById("atlas"), spokes = document.getElementById("spokes");
  const hueOf = hub => {                                          // the hub's most frequent field
    const n = {}; hub.items.forEach(it => it.fields.forEach(f => { n[f] = (n[f] || 0) + 1; }));
    return HUES[Object.keys(n).sort((a, b) => n[b] - n[a])[0]];
  };
  HUBS.forEach((hub, k) => {
    const a = -Math.PI / 2 + (k / HUBS.length) * Math.PI * 2;
    const x = 50 + 40 * Math.cos(a), y = 50 + 40 * Math.sin(a);
    const node = document.createElement("a");
    node.className = "hubnode"; node.href = `#q${k}`;
    node.style.cssText = `left:${x}%;top:${y}%;--nh:${hueOf(hub)}`;
    node.innerHTML = `<svg class="glyph" viewBox="0 0 58 58" aria-hidden="true">${GLYPHS[hub.glyph] || ""}</svg><span class="n-name">${esc(hub.q)}</span><span class="n-count">${hub.items.length}</span>`;
    atlas.appendChild(node);
    spokes.insertAdjacentHTML("beforeend", `<line x1="50" y1="50" x2="${x}" y2="${y}" style="--nh:${hueOf(hub)}" data-k="${k}"/>`);
  });
  spokes.setAttribute("viewBox", "0 0 100 100"); spokes.setAttribute("preserveAspectRatio", "none");
  spokes.insertAdjacentHTML("afterbegin", '<circle cx="50" cy="50" r="40" class="orbit-ring"/>');
  atlas.addEventListener("pointerover", e => {
    const n = e.target.closest(".hubnode:not(.centre)");
    spokes.querySelectorAll("line").forEach((l, k) => l.classList.toggle("lit", !!n && atlas.querySelectorAll(".hubnode:not(.centre)")[k] === n));
  });

  /* ---------- how the theory evolved: collapsed until asked for ---------- */
  const evoToggle = document.getElementById("evo-toggle"), evoBody = document.getElementById("evo-body");
  document.getElementById("evo-count").textContent = `${EVOLUTION.length} entries`;
  evoToggle.addEventListener("click", () => {
    const open = evoToggle.getAttribute("aria-expanded") !== "true";
    evoToggle.setAttribute("aria-expanded", open); evoBody.hidden = !open;
  });

  /* ---------- filters: one field at a time, with how many entries carry it ---------- */
  const all = [...CORE, ...EVOLUTION, ...HUBS.flatMap(h => h.items)];
  const count = f => all.filter(it => it.fields.includes(f)).length;
  const filters = document.getElementById("filters");
  filters.innerHTML = `<button type="button" class="chip on" data-f="all">All <i>${all.length}</i></button>` +
    Object.keys(FIELDS).filter(f => count(f)).map(f => `<button type="button" class="chip f-${f}" data-f="${f}">${FIELDS[f]} <i>${count(f)}</i></button>`).join("");
  filters.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const f = chip.dataset.f;
    filters.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === chip));
    document.querySelectorAll(".card").forEach(c => { c.hidden = f !== "all" && !c.dataset.fields.split(" ").includes(f); });
    document.querySelectorAll(".hub, .core, .evolution").forEach(s => { s.hidden = !s.querySelector(".card:not([hidden])"); });
    const top = document.querySelector(".filters").offsetTop;
    if (window.scrollY > top) window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  });

  /* ---------- effects: a soft light follows the cursor across a card (the arrival is pure CSS) ---------- */
  document.addEventListener("pointermove", e => {
    const c = e.target.closest && e.target.closest(".card");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ---------- the Hopf fibration: linked circles, one colour per field, turning slowly ---------- */
  const canvas = document.getElementById("hopf"), ctx = canvas.getContext("2d");
  const fieldOrder = Object.keys(HUES), fibres = [];
  [[0.66, 11, 0], [0.34, 11, 0.29]].forEach(([eta, n, shift]) => {
    for (let f = 0; f < n; f++) {
      const phi = (f / n) * Math.PI * 2 + shift, pts = [];
      for (let k = 0; k <= 96; k++) {
        const psi = (k / 96) * Math.PI * 2;
        const x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi);
        const x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi), d = 1 - x4;
        pts.push([x1 / d, x3 / d, x2 / d]);
      }
      fibres.push({ pts, hue: HUES[fieldOrder[f % fieldOrder.length]], inner: eta < 0.5 });
    }
  });
  let W = 0, H = 0, running = true, visible = true;
  function size() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw(t) {
    const light = root.dataset.theme === "light", yaw = t * 0.00006, tilt = 1.05, s = W * 0.1;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    ctx.lineWidth = 1.25; ctx.lineJoin = "round";
    fibres.forEach(fb => {
      ctx.beginPath();
      let depth = 0;
      fb.pts.forEach(([x, y, z], k) => {
        const x1 = x * cy - z * sy, z1 = x * sy + z * cy, Y = y * ct - z1 * st;
        depth += y * st + z1 * ct;
        const px = W / 2 + x1 * s, py = H / 2 - Y * s;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      const a = Math.max(0.25, Math.min(0.85, 0.55 + depth / fb.pts.length * 0.25));
      ctx.strokeStyle = light ? `oklch(0.55 0.1 ${fb.hue} / ${a * 0.45})` : `oklch(0.78 0.1 ${fb.hue} / ${a * 0.42})`;
      ctx.stroke();
    });
    ctx.globalCompositeOperation = "source-over";
  }
  function loop(t) { if (!running) return; if (visible) draw(t); requestAnimationFrame(loop); }
  size(); draw(0);
  window.addEventListener("resize", () => { size(); draw(performance.now()); });
  if (!reduced) {
    addEventListener("scroll", () => { visible = canvas.getBoundingClientRect().bottom > 0; }, { passive: true });
    document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) requestAnimationFrame(loop); });
    requestAnimationFrame(loop);
  }

  /* ---------- the theme, shared with the presentation ---------- */
  const btn = document.getElementById("theme");
  const label = () => { btn.textContent = root.dataset.theme === "light" ? "Dark" : "Light"; };
  label();
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("gtc-theme", root.dataset.theme); } catch (e) {}
    label(); draw(performance.now());
  });
})();
