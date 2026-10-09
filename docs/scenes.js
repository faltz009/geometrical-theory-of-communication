/* Scenes for the particle stage, in deck order.
 *
 * A scene is a function returning the figure for one step, in stage units:
 * x runs from about -1.6 to 1.6 and y from about -1.1 to 1.1, with y up.
 * engine.js maps those units onto the screen for the step's layout.
 *
 * A scene may return:
 *   points   fixed targets {x, y, c, a, s, g}: colour, alpha, size, pulse group
 *   flows    moving targets {n, path(u) -> [x, y], speed, c, a, s, g}
 *   dynamic  t -> targets for every point, for figures that move as a whole;
 *            used with period (seconds per loop) and stillT (frame shown in ?still)
 *   spin     {speed, tilt, bob}: turns 3D points (with z) about the vertical
 *   labels   HTML placed in the figure {x, y, html, cls, g, w, def, live}:
 *            w = width in stage units, def = {w, t, d, s} opens the definition floater,
 *            live = t -> html recomputes the text every frame (readouts),
 *            at = t -> [x, y] moves the label with a turning figure
 *            on = {enter, leave, click}: the label becomes a button with these handlers
 *   pulse    {count, period}: cycles emphasis through groups 0..count-1
 * Colours: cyan, ice, brass, dim, paper, violet, mint, coral, gold (see PALETTES in engine.js,
 *          one set of values for the dark theme and one for the light).
 */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  const narrow = () => window.innerWidth < 880;

  /* ---------------- shape helpers: each returns a list of points ---------------- */

  const S = {
    line(x1, y1, x2, y2, n, o = {}) {
      const out = [];
      for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, ...o }); }
      return out;
    },
    arc(cx, cy, r, a0, a1, n, o = {}) {
      const out = [];
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), ...o }); }
      return out;
    },
    /* rectangle outline, evenly spaced along the perimeter */
    rect(cx, cy, w, h, n, o = {}) {
      const path = S.rectPath(cx, cy, w, h), out = [];
      for (let i = 0; i < n; i++) { const [x, y] = path(i / n); out.push({ x, y, ...o }); }
      return out;
    },
    /* a point travelling round a rectangle, u in [0, 1) */
    rectPath(cx, cy, w, h) {
      const per = 2 * (w + h);
      return u => {
        let d = (((u % 1) + 1) % 1) * per;
        if (d < w) return [cx - w / 2 + d, cy + h / 2];
        if ((d -= w) < h) return [cx + w / 2, cy + h / 2 - d];
        if ((d -= h) < w) return [cx + w / 2 - d, cy - h / 2];
        d -= w; return [cx - w / 2, cy - h / 2 + d];
      };
    },
    /* a filled rectangle: a jittered grid */
    fill(cx, cy, w, h, n, o = {}) {
      const out = [], cols = Math.max(1, Math.round(Math.sqrt(n * w / h))), rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        out.push({ x: cx - w / 2 + (c + 0.5 + (Math.random() - 0.5) * 0.7) * w / cols, y: cy - h / 2 + (r + 0.5 + (Math.random() - 0.5) * 0.7) * h / rows, ...o });
      }
      return out;
    },
    /* a soft gaussian cloud */
    blob(cx, cy, rx, ry, n, o = {}) {
      const out = [];
      for (let i = 0; i < n; i++) out.push({ x: cx + gauss() * rx * 0.5, y: cy + gauss() * ry * 0.5, ...o });
      return out;
    },
    bezierAt(p0, p1, p2, p3, t) {
      const m = 1 - t;
      return [m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
              m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]];
    },
    bezier(p0, p1, p2, p3, n, o = {}) {
      const out = [];
      for (let i = 0; i < n; i++) { const [x, y] = S.bezierAt(p0, p1, p2, p3, n === 1 ? 0.5 : i / (n - 1)); out.push({ x, y, ...o }); }
      return out;
    },
    /* an arrowhead at (x, y) pointing along angle ang */
    head(x, y, ang, size, n, o = {}) {
      return [...S.line(x, y, x - size * Math.cos(ang - 0.5), y - size * Math.sin(ang - 0.5), n, o),
              ...S.line(x, y, x - size * Math.cos(ang + 0.5), y - size * Math.sin(ang + 0.5), n, o)];
    },
    /* particles in the shape of text */
    text(str, cx, cy, height, n, o = {}, font = '500 {px}px "EB Garamond", Georgia, serif') {
      const pts = sampleText(str, font), out = [];
      for (let i = 0; i < n; i++) { const p = pts[i % pts.length]; out.push({ x: cx + p[0] * height, y: cy + p[1] * height, ...o }); }
      return out;
    }
  };

  /* Renders text offscreen and returns its filled pixels, centred, glyph height 1.
     Cached; engine.js clears the cache once the web font has loaded. */
  const textCache = new Map();
  function sampleText(str, font) {
    const key = str + "|" + font;
    if (textCache.has(key)) return textCache.get(key);
    const px = 240, c = document.createElement("canvas"), g = c.getContext("2d");
    g.font = font.replace("{px}", px);
    const w = Math.ceil(g.measureText(str).width) + 40, h = Math.ceil(px * 1.5);
    c.width = w; c.height = h;
    g.font = font.replace("{px}", px); g.fillStyle = "#fff"; g.textBaseline = "alphabetic";
    g.fillText(str, 20, px * 1.1);
    const data = g.getImageData(0, 0, w, h).data, raw = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
      if (data[(y * w + x) * 4 + 3] > 140) { raw.push([x, y]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    const bh = Math.max(1, maxY - minY), mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const pts = raw.map(([x, y]) => [(x - mx) / bh, -(y - my) / bh]);
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    textCache.set(key, pts);
    return pts;
  }

  const SCENES = {};

  /* No figure: every particle drifts as dust (placeholder chapters). */
  SCENES.dust = () => ({ points: [] });

  /* ================= 01 · The question ================= */

  /* A soft sphere turning behind the opening question. */
  SCENES.sphere = () => {
    const n = 900, g = Math.PI * (3 - Math.sqrt(5)), points = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), t = g * i;
      points.push({ x: 0.98 * r * Math.cos(t), y: 0.98 * y, z: 0.98 * r * Math.sin(t), c: i % 5 ? "ice" : "cyan", a: 0.42, s: 0.8 });
    }
    return { points, spin: { speed: 0.07, tilt: 0.38, bob: 0.025 } };
  };

  /* Everyday and technical answers to the question; each word opens its definition. */
  const ANSWERS = [
    { w: "change", x: -1.15, y: 0.66, r: 0.2, t: "A difference which makes a difference.",
      d: "Information as a change that registers somewhere: a difference that some system responds to.", s: "Gregory Bateson, <i>Steps to an Ecology of Mind</i>, 1972" },
    { w: "data", x: 0.95, y: 0.72, r: 0.16, t: "Information is well-formed, meaningful data.",
      d: "The General Definition of Information: data that follow the rules of a system and carry meaning within it.", s: "Luciano Floridi, <i>The Philosophy of Information</i>, 2011" },
    { w: "knowledge", x: -0.3, y: 0.28, r: 0.26, t: "What is capable of yielding knowledge.",
      d: "A signal carries the information that <i>s</i> is <i>F</i> when, given the signal, the probability that <i>s</i> is <i>F</i> is 1.", s: "Fred Dretske, <i>Knowledge and the Flow of Information</i>, 1981" },
    { w: "bits", x: 1.2, y: 0.12, r: 0.14, t: "The uncertainty a choice resolves.",
      d: "Choosing among <i>N</i> equally likely alternatives gives log₂ <i>N</i> bits; with probabilities <i>p</i>, the average is <i>H</i> = −Σ <i>p</i> log₂ <i>p</i>.", s: "Claude Shannon, <i>A Mathematical Theory of Communication</i>, 1948; after Hartley, 1928" },
    { w: "order", x: -1.25, y: -0.3, r: 0.17, t: "A measure of organization.",
      d: "“Just as the amount of information in a system is a measure of its degree of organization, so the entropy of a system is a measure of its degree of disorganization.”", s: "Norbert Wiener, <i>Cybernetics</i>, 1948" },
    { w: "meaning", x: 0.45, y: -0.28, r: 0.22, t: "What a sign is about.",
      d: "Frege split it in two: the sense, the way a sign presents its object, and the reference, the object itself. “The morning star” and “the evening star” share a reference and differ in sense.", s: "Gottlob Frege, “On Sense and Reference”, 1892" },
    { w: "pattern", x: -0.4, y: -0.78, r: 0.2, t: "The length of the shortest description.",
      d: "The information in a string is the length of the shortest program that produces it: a pattern is what lets a description be shorter than the thing.", s: "Andrey Kolmogorov, 1965; Solomonoff, 1964; Chaitin, 1966" },
    { w: "physical", x: 1.0, y: -0.82, r: 0.22, t: "Information is physical.",
      d: "Every record has a physical realization, and erasing one bit costs at least <i>kT</i> ln 2 of heat.", s: "Rolf Landauer, 1961 and 1991" }
  ];
  const defOf = a => ({ w: a.w, t: a.t, d: a.d, s: a.s });

  /* An eye drawn in particles, its pupil turned toward (lx, ly): the observer in the opening cards. */
  function eyeAt(x, y, lx, ly, sc = 1, o = {}) {
    const w = 0.17 * sc, h = 0.075 * sc, d = Math.hypot(lx - x, ly - y) || 1, ox = (lx - x) / d * 0.04 * sc, oy = (ly - y) / d * 0.025 * sc;
    const lid = sgn => Array.from({ length: 26 }, (_, k) => { const u = k / 25 * 2 - 1; return { x: x + w * u, y: y + sgn * h * (1 - u * u), c: "ice", a: 0.8, s: 0.8, ...o }; });
    return [...lid(1), ...lid(-1), ...S.blob(x + ox, y + oy, 0.06 * sc, 0.06 * sc, 18, { c: "paper", a: 0.95, s: 1, ...o })];
  }

  /* Two things kept apart. On the left, what happens: a tree falls, cause and effect, complete whether
     anyone is there or not. On the right, what someone knows: a head looking at the tree holds a small copy
     of it that follows what it sees, standing and then fallen. The look between them is the only link: the
     information is the event's copy in someone who observed it. The fall repeats every P seconds. */
  SCENES.answers = () => {
    const GY = -0.42, TX = -0.95, TH = 0.7, HX = 1.1, HY = -0.02, HS = 0.95, P = 7, T0 = 1.4, T1 = 2.5, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    for (let q = 0; q < 50; q++) add({ kind: "ground", x: -1.5 + 1.6 * q / 49 }, { x: 0, y: GY, c: "dim", a: 0.45, s: 0.7 });
    const TREE = [];
    for (let q = 0; q < 36; q++) TREE.push({ dx: ((q % 2) - 0.5) * 0.03, dy: TH * 0.62 * Math.floor(q / 2) / 17, c: "brass" });
    for (let q = 0; q < 100; q++) { const r = Math.sqrt(Math.random()), a = Math.random() * TAU; TREE.push({ dx: 0.15 * r * Math.cos(a), dy: TH * 0.8 + 0.19 * r * Math.sin(a), c: "mint" }); }
    TREE.forEach(p => add({ kind: "tree", ...p }, { x: TX, y: GY, c: p.c, a: 0.85, s: 0.9 }));
    profileAt(0, 0, HS, 130).forEach(p => add({ kind: "head", x: HX - p.x, y: HY + p.y }, { x: HX - p.x, y: HY + p.y, c: "ice", a: 0.75, s: 0.8 }));   // facing the tree
    const EX = HX - 0.36 * HS, EY = HY + 0.03 * HS, TOP = [TX + 0.25, GY + TH + 0.22], BOT = [TX + 0.25, GY + 0.02];
    for (const end of [TOP, BOT]) for (let q = 0; q < 40; q++) { const u = q / 39; add({ kind: "look", x: EX + (end[0] - EX) * u, y: EY + (end[1] - EY) * u }, { x: EX, y: EY, c: "mint", a: 0.35, s: 0.6 }); }
    TREE.filter((_, k) => k % 2 === 0).forEach(p => add({ kind: "copy", ...p }, { x: HX, y: HY, c: p.c === "mint" ? "gold" : "brass", a: 0.85, s: 0.7 }));
    const fallAt = (dx, dy, f) => [dx * Math.cos(f) + dy * Math.sin(f), -dx * Math.sin(f) + dy * Math.cos(f)];
    return tScene({
      stillT: 4.5,
      labels: [
        { x: 0, y: 0.92, html: "If a tree falls in the forest and no one sees it, did it fall?", cls: "example" },
        { x: TX + 0.2, y: 0.62, html: "what happens", cls: "role" },
        { x: HX, y: 0.62, html: "what someone knows", cls: "role" },
        { x: TX + 0.25, y: GY - 0.17, html: "cause → effect", cls: "example" },
        { x: HX, y: GY - 0.35, html: "information", cls: "example c-math" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = ((t % P) + P) % P, fall = c < T0 ? 0 : 80 / 180 * Math.PI * Math.min(1, ((c - T0) / (T1 - T0)) ** 2);
          const fade = c > P - 0.6 ? (P - c) / 0.6 : Math.min(1, c / 0.4);
          meta.forEach((m, i) => {
            let v;
            if (m.kind === "ground") v = { x: m.x, y: GY, a: 0.45 };
            else if (m.kind === "tree") { const [x, y] = fallAt(m.dx, m.dy, fall); v = { x: TX + x, y: Math.max(GY + 0.01, GY + y), a: 0.85 * fade }; }
            else if (m.kind === "head") v = { x: m.x, y: m.y, a: 0.75 };
            else if (m.kind === "look") v = { x: m.x, y: m.y, a: 0.32 };
            else { const [x, y] = fallAt(m.dx, m.dy, fall); v = { x: HX - 0.06 + x * 0.32, y: HY - 0.02 + y * 0.32, a: 0.9 * fade }; }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* The answers people give to "what is information?", each a cloud placed under the field it comes
     from, with its definition in a floater. */
  const FIELDS = {
    physics: { name: "physics", c: "cyan", x: -1.2, top: 0.82, ex: [-1.2, 0.04, "a thermometer, a gas cooling"] },
    computing: { name: "computing", c: "brass", x: -0.02, top: 0.82, ex: [-0.02, -0.21, "the storage in your phone"] },
    biology: { name: "biology", c: "coral", x: 1.2, top: 0.82, ex: [1.2, 0.29, "genes, nerve signals"] },
    linguistics: { name: "linguistics", c: "violet", x: -0.62, top: -0.36, ex: [-0.62, -0.9, "what a word means"] },
    philosophy: { name: "philosophy", c: "mint", x: 0.72, top: -0.36, ex: [0.72, -0.9, "how you know the stove is hot"] }
  };
  const HOME = {
    physical: ["physics", -1.2, 0.55], order: ["physics", -1.2, 0.3],
    bits: ["computing", -0.02, 0.55], data: ["computing", -0.02, 0.3], pattern: ["computing", -0.02, 0.05],
    change: ["biology", 1.2, 0.55], meaning: ["linguistics", -0.62, -0.62], knowledge: ["philosophy", 0.72, -0.62]
  };
  SCENES.disciplines = () => {
    const points = [], labels = [];
    ANSWERS.forEach(a => {
      const [f, x, y] = HOME[a.w], F = FIELDS[f];
      points.push(...S.blob(x, y, a.r * 1.7, 0.16, 110, { c: F.c, a: 0.32, s: 0.8 }));
      labels.push({ x, y, html: a.w, cls: "word c-" + F.c, def: defOf(a) });
    });
    Object.values(FIELDS).forEach(F => {
      labels.push({ x: F.x, y: F.top, html: F.name, cls: "role c-" + F.c });
      labels.push({ x: F.ex[0], y: F.ex[1], html: F.ex[2], cls: "example" });
    });
    return { points, labels };
  };

  /* ================= 02 · One relation ================= */

  /* A lighter drawn in particles: body, cap, flame. */
  function lighterAt(x, y, sc = 1, o = {}) {
    return [
      ...S.fill(x, y - 0.08 * sc, 0.12 * sc, 0.22 * sc, 60, { c: "ice", a: 0.9, s: 0.9, ...o }),
      ...S.fill(x, y + 0.065 * sc, 0.11 * sc, 0.05 * sc, 18, { c: "dim", a: 0.9, s: 0.9, ...o }),
      ...S.blob(x, y + 0.165 * sc, 0.05 * sc, 0.1 * sc, 34, { c: "brass", a: 0.95, s: 1, ...o })
    ];
  }

  /* One lighter seen by three observers from different sides. Light travels from the lighter to each eye,
     and behind each eye is a head holding that observer's own lighter, turned the way they saw it: the
     thing, the observations and the images in each head are three parts of one relation. */
  SCENES.relation = () => {
    const LX = 0, LY = -0.08, EYES = [[-1.0, 0.1, -0.35], [0.82, 0.55, 0.25], [0.88, -0.58, 0.6]];
    const points = [...lighterAt(LX, LY, 1.5)], flows = [];
    EYES.forEach(([x, y, turn]) => {
      points.push(...eyeAt(x, y, LX, LY + 0.05));
      const x0 = LX + (x - LX) * 0.17, y0 = LY + 0.05 + (y - LY - 0.05) * 0.17, x1 = x - (x - LX) * 0.14, y1 = y - (y - LY - 0.05) * 0.14;
      points.push(...S.line(x0, y0, x1, y1, 40, { c: "dim", a: 0.35, s: 0.6 }));
      flows.push({ n: 7, path: u => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u], speed: 0.3, c: "cyan", a: 1, s: 1.2 });
      const d = Math.hypot(x - LX, y - LY), hx = x + (x - LX) / d * 0.36, hy = y + (y - LY) / d * 0.36;   // the head, behind the eye
      points.push(...S.arc(hx, hy, 0.2, 0, TAU, 46, { c: "dim", a: 0.5, s: 0.7 }));
      lighterAt(0, 0, 0.55).forEach(p => points.push({ ...p, x: hx + p.x * Math.cos(turn) - p.y * Math.sin(turn), y: hy + p.x * Math.sin(turn) + p.y * Math.cos(turn), a: (p.a ?? 0.9) * 0.85 }));
    });
    const labels = [
      { x: LX, y: LY - 0.42, html: "the lighter", cls: "tag" },
      { x: -0.5, y: 0.2, html: "an observation", cls: "tag" },
      { x: -1.36, y: 0.47, html: "a lighter in each head", cls: "tag" }
    ];
    return { points, flows, labels };
  };
  /* Above, the three parts of looking: the observer (a head), the observed (the lighter) and the observation,
     drawn as what it is, the look connecting them. Below, three signals: all 0s is one 0, all 1s is one 1, and
     the mixed string carries its 0s, its 1s and the relations between them, arcs where they differ. */
  SCENES.roles = () => {
    const rows = [["000000", -0.22, "= 0"], ["111111", -0.52, "= 1"], ["011010", -0.84, ""]];
    const X = k => -0.72 + k * 0.24;
    const mixed = rows[2][0], diffs = [];
    for (let k = 0; k < 5; k++) if (mixed[k] !== mixed[k + 1]) diffs.push(k);
    const HX = -1.0, HY = 0.5, HS = 0.62, EX = HX + 0.34 * HS + 0.03, EY = HY + 0.03 * HS, LX = 1.05, LY = 0.48;
    const top = [LX - 0.12, LY + 0.2], bot = [LX - 0.12, LY - 0.2];
    const points = [
      ...profileAt(HX, HY, HS, 110, { c: "ice", a: 0.75, s: 0.8 }),
      ...lighterAt(LX, LY, 0.95),
      ...S.line(EX, EY, top[0], top[1], 44, { c: "mint", a: 0.45, s: 0.65 }),
      ...S.line(EX, EY, bot[0], bot[1], 44, { c: "mint", a: 0.45, s: 0.65 }),
      ...diffs.flatMap(k => S.arc((X(k) + X(k + 1)) / 2, rows[2][1] - 0.1, 0.11, Math.PI + 0.25, TAU - 0.25, 18, { c: "cyan", a: 0.95, s: 1 }))
    ];
    for (let q = 0; q < 60; q++) { const u = Math.sqrt(Math.random()), v = Math.random(); points.push({ x: EX + (top[0] - EX) * u, y: EY + ((top[1] + (bot[1] - top[1]) * v) - EY) * u, c: "mint", a: 0.14, s: 0.6 }); }
    return {
      points,
      flows: [{ n: 8, path: u => [EX + 0.02 + (LX - 0.14 - EX - 0.02) * u, EY + (LY - EY) * u], speed: 0.28, c: "mint", a: 1, s: 1.15 }],
      labels: [
        { x: (EX + LX) / 2, y: LY + 0.36, html: "observation", cls: "role c-mint", def: DEFS["peirce-relation"] },
        { x: HX, y: HY - 0.46, html: "observer", cls: "tag" },
        { x: LX, y: HY - 0.46, html: "observed", cls: "tag" },
        ...rows.flatMap(([str, y], r) => [...str].map((ch, k) => ({ x: X(k), y, html: ch, cls: "math" + (r === 2 ? "" : " dimmed") }))),
        ...rows.filter(r => r[2]).map(([, y, eq]) => ({ x: 0.82, y, html: eq, cls: "math left dimmed" })),
        { x: 0.82, y: rows[2][1], html: "0s, 1s and<br>their relations", cls: "example left c-cyan" }
      ]
    };
  };
  /* A head in profile facing right, sampled evenly along a smooth curve through its outline. */
  function profileAt(cx, cy, sc, n, o = {}) {
    const K = [[-0.3, -0.56], [-0.28, -0.3], [-0.38, -0.05], [-0.36, 0.2], [-0.22, 0.38], [0, 0.45], [0.18, 0.4], [0.3, 0.25], [0.33, 0.1],
      [0.34, 0.02], [0.43, -0.08], [0.35, -0.12], [0.36, -0.18], [0.33, -0.21], [0.35, -0.25], [0.3, -0.33], [0.2, -0.36], [0.12, -0.39], [0.12, -0.56]];
    const cr = (p0, p1, p2, p3, t) => p1.map((_, i) => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t * t * t));
    const dense = [];
    for (let k = 0; k < K.length - 1; k++) for (let q = 0; q < 20; q++) dense.push(cr(K[Math.max(0, k - 1)], K[k], K[k + 1], K[Math.min(K.length - 1, k + 2)], q / 20));
    dense.push(K[K.length - 1]);
    const len = [0]; for (let i = 1; i < dense.length; i++) len.push(len[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const out = [];
    for (let j = 0, i = 0; j < n; j++) {
      const d = len[len.length - 1] * j / (n - 1); while (i < len.length - 2 && len[i + 1] < d) i++;
      const f = (d - len[i]) / ((len[i + 1] - len[i]) || 1), x = dense[i][0] + (dense[i + 1][0] - dense[i][0]) * f, y = dense[i][1] + (dense[i + 1][1] - dense[i][1]) * f;
      out.push({ x: cx + x * sc, y: cy + y * sc, ...o });
    }
    return out;
  }

  /* Three places on one relation, as one loop: a head with the word for the lighter in it (the sign), the
     look from its eye to the lighter (the observation) and the lighter itself (the thing). The look goes out
     from the eye to the thing, which is the measurement; what the thing gives back comes in through the same
     eye to the word, which is the check. Each part carries its field and, below, its name. */
  SCENES.fields = () => {
    const HX = -1.0, HY = 0.0, HS = 1.15, LX = 1.08, LY = -0.04, EX = HX + 0.34 * HS, EY = HY + 0.03 * HS;
    const points = [
      ...profileAt(HX, HY, HS, 150, { c: "ice", a: 0.75, s: 0.8 }),
      ...S.blob(HX - 0.04 * HS, HY + 0.17 * HS, 0.42, 0.28, 80, { c: "brass", a: 0.28, s: 0.9 }),
      ...lighterAt(LX, LY, 1.5)
    ];
    const top = [LX - 0.12, LY + 0.32], bot = [LX - 0.12, LY - 0.3];
    points.push(...S.line(EX + 0.04, EY, top[0], top[1], 44, { c: "mint", a: 0.4, s: 0.65 }), ...S.line(EX + 0.04, EY, bot[0], bot[1], 44, { c: "mint", a: 0.4, s: 0.65 }));
    for (let q = 0; q < 70; q++) { const u = Math.sqrt(Math.random()), v = Math.random(); points.push({ x: EX + 0.04 + (top[0] - EX - 0.04) * u, y: EY + ((top[1] + (bot[1] - top[1]) * v) - EY) * u, c: "mint", a: 0.14, s: 0.6 }); }
    const W = [HX + 0.16, HY + 0.08], C = [[EX + 0.06, EY - 0.03], [EX + 0.36, EY - 0.33], [LX - 0.58, -0.75], [LX - 0.13, LY - 0.36]];
    const check = [...S.line(W[0], W[1], C[0][0], C[0][1], 12), ...S.bezier(...C, 60)], len = [0];
    for (let i = 1; i < check.length; i++) len.push(len[i - 1] + Math.hypot(check[i].x - check[i - 1].x, check[i].y - check[i - 1].y));
    const along = u => { const d = u * len[len.length - 1]; let i = 1; while (i < len.length - 1 && len[i] < d) i++; const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1); return [check[i - 1].x + (check[i].x - check[i - 1].x) * f, check[i - 1].y + (check[i].y - check[i - 1].y) * f]; };
    points.push(...check.map(p => ({ ...p, c: "brass", a: 0.5, s: 0.7 })),
      ...S.head(W[0], W[1], Math.atan2(W[1] - C[0][1], W[0] - C[0][0]), 0.07, 8, { c: "brass", a: 0.85, s: 0.85 }));
    const flows = [
      { n: 9, path: u => [EX + 0.06 + (LX - 0.14 - EX - 0.06) * u, EY + (LY + 0.02 - EY) * u], speed: 0.28, c: "mint", a: 1, s: 1.2 },
      { n: 8, path: u => along(1 - u), speed: 0.2, c: "brass", a: 1, s: 1.1 }
    ];
    const mid = S.bezierAt(...C, 0.55), nar = narrow(), ty = nar ? -1.12 : -0.86;
    const labels = [
      { x: HX - 0.04 * HS, y: HY + 0.17 * HS, html: "“lighter”", cls: "word" },
      { x: (EX + LX) / 2, y: EY + 0.12, html: "where you look", cls: "example" },
      { x: mid[0] + (nar ? 0.08 : 0.16), y: mid[1] + (nar ? -0.15 : 0.13), html: "what you can check", cls: "example" },
      { x: HX, y: 0.82, html: "linguistics", cls: "field c-violet" },
      { x: (EX + LX) / 2 - 0.1, y: 0.5, html: "measurement", cls: "field c-mint" },
      { x: mid[0], y: mid[1] - (nar ? 0.33 : 0.12), html: "epistemology", cls: "field c-brass" },
      { x: LX + (nar ? -0.25 : 0.05), y: 0.68, html: "physics · metaphysics", cls: "field c-cyan" },
      { x: HX - (nar ? 0.2 : 0), y: ty, html: "the sign", cls: "tag" },
      { x: (EX + LX) / 2 - (nar ? 0.12 : 0), y: ty, html: "the observation", cls: "tag" },
      { x: LX + (nar ? 0.3 : 0), y: ty, html: "the thing", cls: "tag" }
    ];
    return { points, flows, labels };
  };
  /* The answer, from both ends of one relation. Left: the change Shannon counts, a mixed string
     with its differences marked against a fixed reference. Right: the invariance Level B needs,
     two signs arriving at the same lighter. */
  SCENES.summary = () => {
    const X = k => -1.36 + k * 0.21, sy = 0.08, str = "011010", diffs = [];
    for (let k = 0; k < 5; k++) if (str[k] !== str[k + 1]) diffs.push(k);
    const L = [1.2, 0.08], W = [[0.46, 0.36], [0.46, -0.2]];
    return {
      points: [
        ...S.line(-1.46, sy - 0.2, -0.2, sy - 0.2, 50, { c: "dim", a: 0.4, s: 0.75 }),
        ...diffs.flatMap(k => S.arc((X(k) + X(k + 1)) / 2, sy - 0.07, 0.1, Math.PI + 0.25, TAU - 0.25, 16, { c: "cyan", a: 0.95, s: 1 })),
        ...S.line(0, -0.42, 0, 0.62, 40, { c: "dim", a: 0.25, s: 0.7 }),
        ...lighterAt(L[0], L[1], 1.25),
        ...W.flatMap(([x, y]) => S.line(x + 0.28, y, L[0] - 0.16, L[1] + (y > 0 ? 0.05 : -0.02), 28, { c: "mint", a: 0.6, s: 0.85 }))
      ],
      flows: W.map(([x, y]) => ({ n: 5, path: u => [x + 0.28 + (L[0] - 0.44 - x) * u, y + (L[1] + (y > 0 ? 0.05 : -0.02) - y) * u], speed: 0.25, c: "mint", a: 1, s: 1.2 })),
      labels: [
        { x: -0.78, y: 0.7, html: "change", cls: "role" },
        { x: -0.78, y: 0.54, html: "what Shannon counts", cls: "example" },
        { x: 0.82, y: 0.7, html: "invariance", cls: "role c-mint" },
        { x: 0.82, y: 0.54, html: "what meaning keeps", cls: "example" },
        ...[...str].map((b, k) => ({ x: X(k), y: sy + 0.06, html: b, cls: "math" })),
        { x: -0.78, y: sy - 0.34, html: "measured against a fixed reference", cls: "tag" },
        { x: W[0][0], y: W[0][1], html: "“lighter”", cls: "word" },
        { x: W[1][0], y: W[1][1], html: "“igniter”", cls: "word" },
        { x: 0, y: -0.74, html: "<i>A</i> = <i>A</i>", cls: "math c-math" },
        { x: 0, y: -0.93, html: "one relation, read from its two ends", cls: "example" }
      ]
    };
  };

  /* ================= 03 · A communication problem ================= */

  /* The word arrives intact while its two possible referents remain visible. */
  SCENES.communicate = () => {
    const I = [-1.12, -0.5], U = [1.12, -0.5];
    const river = { c: "mint", a: 0.8, s: 0.95 };
    const bank = { c: "ice", a: 0.85, s: 0.95 };
    return {
      points: [
        // A sloping shore and three ripples on the river.
        ...S.bezier([-1.06, 0.77], [-0.79, 0.81], [-0.84, 0.48], [-0.31, 0.46], 55, river),
        ...[0.37, 0.47, 0.57].flatMap(y => S.bezier([-1.05, y], [-0.89, y + 0.08], [-0.73, y - 0.08], [-0.58, y], 28, river)),
        ...S.line(-0.51, 0.58, -0.51, 0.72, 12, river),
        ...S.line(-0.51, 0.58, -0.58, 0.68, 10, river),
        ...S.line(-0.51, 0.58, -0.43, 0.67, 10, river),
        // A bank's pediment, columns and steps.
        ...S.line(0.34, 0.7, 0.69, 0.91, 26, bank),
        ...S.line(0.69, 0.91, 1.04, 0.7, 26, bank),
        ...S.line(0.34, 0.7, 1.04, 0.7, 40, bank),
        ...[0.43, 0.69, 0.95].flatMap(x => S.rect(x, 0.51, 0.075, 0.3, 30, bank)),
        ...S.line(0.34, 0.33, 1.04, 0.33, 40, bank),
        ...S.line(0.28, 0.27, 1.1, 0.27, 44, bank),
        ...S.arc(I[0], I[1], 0.17, 0, TAU * 0.98, 56, { c: "ice", a: 0.85 }),
        ...S.arc(U[0], U[1], 0.17, 0, TAU * 0.98, 56, { c: "ice", a: 0.85 }),
        ...S.line(-0.9, -0.5, 0.88, -0.5, 70, { c: "paper", a: 0.45, s: 0.85 }),
        ...S.head(0.9, -0.5, 0, 0.08, 9, { c: "paper", a: 0.7 }),
        ...S.line(-1.0, -0.33, -0.06, 0.02, 34, { c: "cyan", a: 0.4, s: 0.85 }),
        ...S.line(1.0, -0.33, 0.06, 0.02, 34, { c: "cyan", a: 0.4, s: 0.85 }),
        ...S.line(-0.08, 0.13, -0.33, 0.29, 16, { c: "mint", a: 0.5 }),
        ...S.line(0.08, 0.13, 0.33, 0.29, 16, { c: "ice", a: 0.5 })
      ],
      flows: [{ n: 26, path: u => [-0.9 + 1.78 * u, -0.5], speed: 0.3, c: "cyan", a: 1, s: 1.5 }],
      labels: [
        { x: I[0], y: I[1], html: "I", cls: "word" },
        { x: U[0], y: U[1], html: "you", cls: "word" },
        { x: 0, y: -0.36, html: "“bank”", cls: "word" },
        { x: 0, y: -0.66, html: "the sign", cls: "tag" },
        { x: 0, y: 0.08, html: "?", cls: "word" },
        { x: -0.7, y: 0.13, html: "riverbank", cls: "example c-mint" },
        { x: 0.7, y: 0.13, html: "financial bank", cls: "example" },
        { x: 0, y: 1.08, html: "which bank?", cls: "tag" }
      ]
    };
  };

  /* Weaver's three levels, his questions quoted inside the boxes. */
  SCENES.levels0 = () => {
    const gap = narrow() ? 0.78 : 0.64, bh = narrow() ? 0.72 : 0.54;
    const L = [
      ["A", "the technical problem", "How accurately can the symbols of communication be transmitted?", gap, "ice"],
      ["B", "the semantic problem", "How precisely do the transmitted symbols convey the desired meaning?", 0, "cyan"],
      ["C", "the effectiveness problem", "How effectively does the received meaning affect conduct in the desired way?", -gap, "ice"]
    ];
    const points = [], labels = [];
    L.forEach(([k, name, q, y, c]) => {
      points.push(...S.rect(0, y, 3.0, bh, 140, { c, a: k === "B" ? 0.9 : 0.6 }));
      labels.push({ x: -1.4, y, w: 2.8, cls: "level left" + (k === "B" ? " lit" : ""),
        html: `<span class="lv-head"><b>Level ${k}</b><span>${name}</span></span><span class="lv-q">${q}</span>` });
    });
    return { points, labels };
  };

  /* A = A as a process. A scanning window reads a letter on a 16×16 retina,
     then reads a second A in another typeface, tilted; the equals sign breathes. */
  function rasterGlyph(str, font, rot, scale, N, cell) {
    const pts = sampleText(str, font), on = new Set(), half = (N * cell) / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    pts.forEach(([x, y]) => {
      const X = (x * c - y * s) * scale, Y = (x * s + y * c) * scale;
      const col = Math.floor((X + half) / cell), row = Math.floor((half - Y) / cell);
      if (col >= 0 && col < N && row >= 0 && row < N) on.add(row * N + col);
    });
    return on;
  }
  SCENES.recognize = () => {
    const N = 16, cell = 0.056, half = (N * cell) / 2, cyG = 0.1;
    const grids = [
      { cx: -0.8, glyph: rasterGlyph("A", '600 {px}px "EB Garamond", Georgia, serif', 0, 0.95, N, cell), t0: 0, t1: 3.2, c: "ice" },
      { cx: 0.8, glyph: rasterGlyph("A", '700 {px}px "Segoe UI", Ubuntu, Arial, sans-serif', -0.15, 0.84, N, cell), t0: 3.6, t1: 6.8, c: "cyan" }
    ];
    const points = [], meta = [];
    grids.forEach((g, gi) => {
      for (let k = 0; k < N * N; k++) {
        const row = Math.floor(k / N), col = k % N, on = g.glyph.has(k);
        const x = g.cx - half + (col + 0.5) * cell, y = cyG + half - (row + 0.5) * cell;
        meta.push({ kind: "cell", gi, k, on, x, y });
        points.push({ x, y, c: g.c, a: on ? 0.85 : 0.08, s: on ? 1.1 : 0.65 });
      }
      for (let k = 0; k < 24; k++) { meta.push({ kind: "win", gi, k }); points.push({ x: g.cx, y: cyG, c: "brass", a: 0, s: 1 }); }
    });
    for (let k = 0; k < 70; k++) {
      const u = (k % 35) / 34, y = cyG + (k < 35 ? 0.055 : -0.055);
      meta.push({ kind: "eq", x: -0.14 + 0.28 * u, y });
      points.push({ x: -0.14 + 0.28 * u, y, c: "cyan", a: 1, s: 1.2 });
    }
    const winPath = S.rectPath(0, 0, 3 * cell, 3 * cell), out = new Array(points.length);
    const dynamic = t => {
      const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * TAU / 2.4));
      const scan = grids.map(g => (t >= g.t0 && t < g.t1) ? (t - g.t0) / (g.t1 - g.t0) * N * N : -1);
      meta.forEach((m, i) => {
        if (m.kind === "cell") {
          const since = scan[m.gi] >= 0 ? scan[m.gi] - m.k : 1e9;
          const glow = since >= 0 && since < 40 ? 1 - since / 40 : 0;
          out[i] = { x: m.x, y: m.y, a: m.on ? 0.72 + 0.28 * glow : 0.07 + 0.3 * glow };
        } else if (m.kind === "win") {
          const at = scan[m.gi];
          if (at < 0) { out[i] = { x: grids[m.gi].cx, y: cyG, a: 0 }; return; }
          const idx = Math.min(N * N - 1, Math.floor(at)), row = Math.floor(idx / N), col = idx % N;
          const [wx, wy] = winPath(m.k / 24);
          out[i] = { x: grids[m.gi].cx - half + (col + 0.5) * cell + wx, y: cyG + half - (row + 0.5) * cell + wy, a: 0.9 };
        } else {
          out[i] = { x: m.x, y: m.y, a: pulse };
        }
      });
      return out;
    };
    return {
      points, dynamic, period: 7.2, stillT: 7.1,
      labels: [
        { x: -0.8, y: cyG + half + 0.12, html: "read: A", cls: "role" },
        { x: 0.8, y: cyG + half + 0.12, html: "read: A", cls: "role" },
        { x: -0.8, y: cyG - half - 0.12, html: "tell it apart", cls: "tag" },
        { x: 0.8, y: cyG - half - 0.12, html: "recognize it again", cls: "tag" },
        { x: 0, y: cyG - half - 0.32, html: "the form changed, the identity held", cls: "example" }
      ]
    };
  };

  /* Frege: the morning star and the evening star, two routes to one Venus. */
  SCENES.frege = () => {
    const left = [[-1.35, -0.7], [-1.25, 0.1], [-0.55, 0.5], [-0.08, 0.43]];
    const right = [[1.35, -0.7], [1.25, 0.1], [0.55, 0.5], [0.08, 0.43]];
    return {
      points: [
        ...S.blob(0, 0.42, 0.07, 0.07, 70, { c: "paper", a: 1, s: 1.2 }),
        ...S.bezier(...left, 110, { c: "cyan", a: 0.75 }),
        ...S.bezier(...right, 110, { c: "cyan", a: 0.75 }),
        ...S.line(-1.58, -0.72, 1.58, -0.72, 110, { c: "dim", a: 0.6, s: 0.8 })
      ],
      flows: [
        { n: 16, path: u => S.bezierAt(...left, u), speed: 0.22, c: "cyan", a: 1, s: 1.5 },
        { n: 16, path: u => S.bezierAt(...right, u), speed: 0.22, c: "cyan", a: 1, s: 1.5 }
      ],
      labels: [
        { x: 0, y: 0.66, html: "Venus", cls: "word" },
        { x: -1.25, y: -0.88, html: "morning star", cls: "word" },
        { x: 1.25, y: -0.88, html: "evening star", cls: "word" },
        { x: 0, y: -0.2, html: "<i>a</i> = <i>b</i>", cls: "math" }
      ]
    };
  };

  /* Univocity: each word I say decodes to one meaning; love and gravity arrive blurred. */
  SCENES.univocity = () => {
    const words = ["lighter", "three", "water", "love", "north", "gravity", "cup"];
    const fuzzy = new Set(["love", "gravity"]);
    const points = [], labels = [
      { x: -0.95, y: 1.0, html: "I say", cls: "tag" }, { x: 0.95, y: 1.0, html: "you decode", cls: "tag" },
      { x: 0, y: -1.02, html: "decoding: each word, one meaning", cls: "example c-math" }
    ];
    words.forEach((w, k) => {
      const y = 0.72 - k * 0.25, f = fuzzy.has(w), c = f ? "mint" : "cyan";
      points.push(...S.line(-0.6, y, 0.58, y, 34, { c, a: f ? 0.45 : 0.75, s: 0.8 }));
      points.push(...S.head(0.62, y, 0, 0.05, 5, { c, a: f ? 0.45 : 0.8 }));
      if (f) points.push(...S.blob(0.98, y, 0.5, 0.14, 44, { c: "mint", a: 0.4, s: 0.85 }));
      labels.push({ x: -0.95, y, html: w, cls: "slot" });
      labels.push({ x: 0.98, y, html: w, cls: f ? "slot fuzzy" : "slot lit" });
    });
    return { points, labels };
  };

  /* ================= 04 · Shannon's bit ================= */

  /* Sixteen possible messages; the selection moves among them. */
  SCENES.choice = () => {
    const points = [], meta = [];
    for (let m = 0; m < 16; m++) {
      const x = -0.66 + (m % 4) * 0.44, y = 0.62 - Math.floor(m / 4) * 0.44;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        meta.push({ m, a, x, y }); points.push({ x: x + 0.1 * Math.cos(a), y: y + 0.1 * Math.sin(a), c: "ice", a: 0.5, s: 0.85 });
      }
    }
    const order = [5, 10, 3, 12, 7, 0, 14, 9, 2, 11, 6, 15, 1, 8, 13, 4], out = new Array(points.length);
    return {
      points, period: 16 * 1.3, stillT: 0.5,
      dynamic: t => {
        const sel = order[Math.floor(t / 1.3) % 16];
        meta.forEach((q, i) => {
          const on = q.m === sel, r = on ? 0.13 : 0.1;
          out[i] = { x: q.x + r * Math.cos(q.a), y: q.y + r * Math.sin(q.a), a: on ? 1 : 0.32, c: on ? "brass" : "ice" };
        });
        return out;
      },
      labels: [
        { x: 0, y: 0.98, html: "sixteen possible messages", cls: "tag" },
        { x: 0, y: -1.0, html: "one of them is selected", cls: "example" },
        { x: 1.02, y: 0.12, html: "<i>H</i> = −Σ <i>p</i> log<sub>2</sub> <i>p</i>", cls: "slot left c-math" },
        { x: 1.02, y: -0.08, html: "sixteen equal choices: 4 bits", cls: "example left" }
      ]
    };
  };

  /* Weaver's example: the whole Bible against one word. */
  SCENES.bible = () => ({
    points: [
      ...S.fill(-0.75, 0, 0.8, 1.16, 620, { c: "brass", a: 0.55, s: 0.85 }),
      ...S.rect(-0.75, 0, 0.8, 1.16, 130, { c: "brass", a: 1 }),
      ...S.line(-1.07, -0.58, -1.07, 0.58, 40, { c: "brass", a: 0.9 }),
      ...S.text("Yes.", 1.0, 0.04, 0.2, 110, { c: "paper", a: 1, s: 0.95 })
    ],
    labels: [
      { x: -0.75, y: -0.78, html: "the King James Bible", cls: "word" },
      { x: -0.75, y: -0.92, html: "about 783 000 words", cls: "tag" },
      { x: 1.0, y: -0.22, html: "one word", cls: "tag" }
    ]
  });

  /* The agreement: sender, wire, and the receiver's list of what each signal selects. */
  SCENES.send = () => {
    const path = u => u < 0.72
      ? [-1.22 + (1.52 * u) / 0.72, 0]
      : S.bezierAt([0.3, 0], [0.42, 0], [0.42, 0.3], [0.53, 0.3], (u - 0.72) / 0.28);
    return {
      points: [
        ...S.blob(-1.36, 0, 0.12, 0.12, 60, { c: "brass", a: 0.9 }),
        ...S.line(-1.22, 0, 0.3, 0, 80, { c: "dim", a: 0.7, s: 0.85 }),
        ...S.rect(1.0, 0.3, 0.95, 0.3, 96, { c: "cyan", a: 0.95 }),
        ...S.rect(1.0, -0.3, 0.95, 0.3, 96, { c: "ice", a: 0.55 })
      ],
      flows: [{ n: 30, path, speed: 0.28, c: "cyan", a: 1, s: 1.5 }],
      labels: [
        { x: -1.36, y: 0.24, html: "sender", cls: "tag" },
        { x: -0.45, y: 0.15, html: "the bit: 0", cls: "tag" },
        { x: 1.0, y: 0.6, html: "receiver’s list", cls: "tag" },
        { x: 1.0, y: 0.3, html: "0 → the Bible", cls: "slot lit" },
        { x: 1.0, y: -0.3, html: "1 → “Yes”", cls: "slot" },
        { x: 1.0, y: -0.64, html: "the Bible opens", cls: "word" }
      ]
    };
  };

  /* One bit: 0 the fixed reference, 1 the alternative, the circle of every point a
     unit from 0, and its tangent at 1, along which the reading holds. */
  SCENES.onebit = () => {
    const x0 = -0.62, x1 = 0.4, r = x1 - x0, h = 0.92, ty = narrow() ? 0.46 : 0;
    return {
      points: [
        ...S.arc(x0, 0, r, 0, TAU * 0.995, 170, { c: "cyan", a: 0.28, s: 0.75 }),
        ...S.line(-1.55, 0, 1.3, 0, 110, { c: "paper", a: 0.5, s: 0.85 }),
        ...S.head(1.35, 0, 0, 0.08, 8, { c: "paper", a: 0.7 }),
        ...S.blob(x0, 0, 0.06, 0.06, 40, { c: "ice", a: 0.9, s: 1 }),
        ...S.blob(x1, 0, 0.06, 0.06, 40, { c: "brass", a: 1, s: 1.1 }),
        ...S.line(x1, -h, x1, h, 70, { c: "cyan", a: 0.6, s: 0.85 }),
        ...S.line(x1 - 0.11, 0, x1 - 0.11, 0.11, 8, { c: "paper", a: 0.6, s: 0.7 }),
        ...S.line(x1 - 0.11, 0.11, x1, 0.11, 8, { c: "paper", a: 0.6, s: 0.7 })
      ],
      flows: [{ n: 1, path: u => [x1, 0.72 * Math.sin(u * TAU)], speed: 0.14, c: "cyan", a: 1, s: 2.4 }],
      labels: [
        { x: x0, y: -0.17, html: "0", cls: "math" }, { x: x0, y: -0.33 - ty, html: "reference, held fixed", cls: "tag" },
        { x: x1 + 0.09, y: -0.15, html: "1", cls: "math left" }, { x: x1 + 0.09, y: -0.3 - ty, html: "the alternative", cls: "tag left" },
        { x: x1 + 0.1, y: 0.62, html: narrow() ? "the reading holds" : "the tangent at 1: the reading holds", cls: "example left" },
        ...(narrow() ? [] : [{ x: x0, y: -1.1, html: "every point a unit from 0", cls: "tag" }])
      ]
    };
  };

  /* The n-cube: vertices as ±1 coordinates, edges between vertices one bit apart. */
  function cubeVerts(n) {
    const v = [];
    for (let k = 0; k < 1 << n; k++) v.push(Array.from({ length: n }, (_, j) => (k >> (n - 1 - j)) & 1 ? 1 : -1));
    return v;
  }
  function cubeEdges(v) {
    const e = [];
    for (let a = 0; a < v.length; a++) for (let b = a + 1; b < v.length; b++) {
      let d = 0; for (let j = 0; j < v[a].length; j++) if (v[a][j] !== v[b][j]) d++;
      if (d === 1) e.push([a, b]);
    }
    return e;
  }
  /* 4D turns in the x–w plane with a perspective in w; 3D turns about the vertical and tilts. */
  function projectCube(p, n, t) {
    let x = p[0], y = n > 1 ? p[1] : 0, z = n > 2 ? p[2] : 0, w = n > 3 ? p[3] : 0, k = 1;
    if (n > 3) {
      const a = t * 0.42, c = Math.cos(a), s = Math.sin(a);
      [x, w] = [x * c - w * s, x * s + w * c];
      k = 2.6 / (2.6 - w * 0.9);
    }
    if (n > 2) {
      const b = 0.55 + t * 0.3, cb = Math.cos(b), sb = Math.sin(b);
      [x, z] = [x * cb + z * sb, -x * sb + z * cb];
      y = y * Math.cos(0.42) - z * Math.sin(0.42);
    }
    return [x * k, y * k];
  }
  /* A row: one bit a line, two a square, three a cube, four a tesseract. */
  function bitShapes(cy, k0) {
    const figs = [
      { n: 1, cx: -1.3, size: 0.25 * k0 }, { n: 2, cx: -0.48, size: 0.23 * k0 },
      { n: 3, cx: 0.4, size: 0.21 * k0 }, { n: 4, cx: 1.28, size: 0.18 * k0 }
    ];
    const points = [], meta = [];
    figs.forEach(f => {
      f.v = cubeVerts(f.n); f.e = cubeEdges(f.v);
      f.v.forEach((p, vi) => { meta.push({ f, vi }); points.push({ x: f.cx, y: cy, c: "brass", a: 1, s: 1.45 }); });
      f.e.forEach(([a, b]) => { for (let k = 1; k <= 7; k++) { meta.push({ f, a, b, u: k / 8 }); points.push({ x: f.cx, y: cy, c: "brass", a: 0.5, s: 0.8 }); } });
    });
    const out = new Array(points.length);
    const dynamic = t => {
      const cache = new Map();
      const pos = (f, vi) => { const key = f.n * 100 + vi; if (!cache.has(key)) cache.set(key, projectCube(f.v[vi], f.n, t)); return cache.get(key); };
      meta.forEach((m, i) => {
        const f = m.f;
        if (m.vi !== undefined) { const [x, y] = pos(f, m.vi); out[i] = { x: f.cx + x * f.size, y: cy + y * f.size, a: 1 }; }
        else {
          const [x1, y1] = pos(f, m.a), [x2, y2] = pos(f, m.b);
          out[i] = { x: f.cx + (x1 + (x2 - x1) * m.u) * f.size, y: cy + (y1 + (y2 - y1) * m.u) * f.size, a: 0.5 };
        }
      });
      return out;
    };
    const labels = figs.map(f => ({ x: f.cx, y: cy - 0.52 * k0, html: `${f.n} bit${f.n > 1 ? "s" : ""}`, cls: "role c-brass" }));
    return { points, dynamic, labels };
  }
  /* Gates as surfaces over the square, turning: AND = xy, XOR = x + y − 2xy.
     The bright corners are the truth table. */
  function gateSurfaces(cy, size, cxs, ly) {
    const G = 12, surfaces = [
      { f: (x, y) => x * y, cx: cxs[0], name: "AND = <i>xy</i>" },
      { f: (x, y) => x + y - 2 * x * y, cx: cxs[1], name: "XOR = <i>x</i> + <i>y</i> − 2<i>xy</i>" }
    ];
    const points = [], meta = [];
    surfaces.forEach(sf => {
      for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
        const x = i / G, y = j / G, corner = (i === 0 || i === G) && (j === 0 || j === G);
        meta.push({ sf, x, y, z: sf.f(x, y), corner });
        points.push({ x: sf.cx, y: cy, c: corner ? "paper" : "brass", a: corner ? 1 : 0.55, s: corner ? 1.6 : 0.85 });
      }
      for (let k = 0; k < 48; k++) {
        const side = Math.floor(k / 12), u = (k % 12) / 12;
        meta.push({ sf, x: [u, 1, 1 - u, 0][side], y: [0, u, 1, 1 - u][side], z: 0, base: true });
        points.push({ x: sf.cx, y: cy, c: "dim", a: 0.5, s: 0.7 });
      }
    });
    const out = new Array(points.length);
    const dynamic = t => {
      const th = 0.75 + t * 0.22, c = Math.cos(th), s = Math.sin(th), ph = 0.6;
      meta.forEach((m, i) => {
        const X = m.x - 0.5, Y = m.y - 0.5, Z = (m.z - 0.5) * 0.75;
        const Xr = X * c - Y * s, Yr = X * s + Y * c;
        out[i] = { x: m.sf.cx + Xr * size * 1.25, y: cy + (Z * Math.cos(ph) + Yr * Math.sin(ph)) * size * 1.25, a: m.corner ? 1 : m.base ? 0.4 : 0.55 };
      });
      return out;
    };
    const labels = surfaces.map(sf => ({ x: sf.cx, y: ly, html: narrow() ? sf.name.split(" =")[0] : sf.name, cls: "math c-math" }));
    return { points, dynamic, labels };
  }
  /* Computers already compute like this: the cubes above, the gates below. */
  SCENES.computers = () => {
    const A = bitShapes(0.62, 0.8), B = gateSurfaces(-0.3, 0.44, [-0.78, 0.82], -0.84);
    const nA = A.points.length, out = new Array(nA + B.points.length);
    return {
      points: [...A.points, ...B.points],
      period: 60, stillT: 1.5,
      dynamic: t => {
        const a = A.dynamic(t), b = B.dynamic(t);
        for (let i = 0; i < nA; i++) out[i] = a[i];
        for (let i = 0; i < b.length; i++) out[nA + i] = b[i];
        return out;
      },
      labels: [...A.labels, ...B.labels]
    };
  };

  /* Entropy as what we do not know: 40 molecules bounce around a box, so any one of them could be anywhere.
     About a quarter sit in the shaded quarter at any moment, and all 40 there at once has odds of one in 4⁴⁰. */
  SCENES.ggas = () => {
    const BX = -0.42, BY = 0.02, BW = 0.5, N = 40, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const rnd = k => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const tri = u => { const f = ((u % 2) + 2) % 2; return f < 1 ? f : 2 - f; };       // bounce between the walls
    for (let k = 0; k < 4; k++) for (let q = 0; q < 50; q++) { const u = q / 49, sx = [-1, 1, 1, -1][k], sy = [-1, -1, 1, 1][k], ex = [1, 1, -1, -1][k], ey = [-1, 1, 1, -1][k];
      const x = BX + BW * (sx + (ex - sx) * u), y = BY + BW * (sy + (ey - sy) * u); add({ kind: "fixed", x, y, a: 0.5 }, { x, y, c: "dim", a: 0.5, s: 0.7 }); }
    for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) { const x = BX + BW * (a / 8), y = BY + BW * (b / 8); add({ kind: "fixed", x, y, a: 0.16 }, { x, y, c: "gold", a: 0.16, s: 0.6 }); }
    for (let k = 0; k < N; k++) add({ kind: "mol", fx: 0.11 + 0.17 * rnd(k + 1), fy: 0.13 + 0.17 * rnd(k + 51), px: rnd(k + 101) * 2, py: rnd(k + 151) * 2 }, { x: BX, y: BY, c: "cyan", a: 1, s: 1.1 });
    const pos = (m, t) => [BX - BW * 0.94 + 2 * BW * 0.94 * tri(m.px + m.fx * t), BY - BW * 0.94 + 2 * BW * 0.94 * tri(m.py + m.fy * t)];
    const inCorner = ([x, y]) => x > BX && y > BY;
    const out = new Array(points.length);
    return {
      points, stillT: 3,
      dynamic: t => { meta.forEach((m, i) => { if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: m.a }; return; } const p = pos(m, t); out[i] = { x: p[0], y: p[1], a: 1, c: inCorner(p) ? "gold" : "cyan" }; }); return out; },
      labels: [
        { x: BX, y: 0.72, html: "40 molecules in a box", cls: "example" },
        { x: 0.48, y: 0.42, html: "in the shaded quarter now", cls: "tag left" },
        { x: 0.48, y: 0.28, html: "", cls: "slot left", live: t => `${meta.filter(m => m.kind === "mol" && inCorner(pos(m, t))).length} of 40` },
        { x: 0.48, y: 0.02, html: "all 40 there at once", cls: "tag left" },
        { x: 0.48, y: -0.12, html: "one chance in 10<sup>24</sup>", cls: "slot left c-math" },
        { x: BX, y: -0.68, html: "each one could be anywhere, so the gas is almost always spread out", cls: "example" }
      ]
    };
  };

  /* Entropy across fields: Shannon's bit at the centre, five fields around it, each
     counting its own arrangements and streaming into the same unit, one yes-or-no
     question, one bit. The fields light in turn. */
  const ENTROPY_FIELDS = [
    { name: "thermodynamics", mean: "how molecules are arranged", c: "cyan", x: -1.12, y: 0.34 },
    { name: "biology", mean: "order kept, disorder given away", c: "coral", x: 0, y: 0.8 },
    { name: "cosmology", mean: "the area of a black hole’s horizon", c: "brass", x: 1.12, y: 0.34 },
    { name: "ecology", mean: "how evenly species spread", c: "mint", x: 0.74, y: -0.64 },
    { name: "machine learning", mean: "which word comes next", c: "violet", x: -0.74, y: -0.64 }
  ];
  function entropyIcon(k, x, y, c) {
    const o = { c, a: 0.9, s: 0.9, g: k };
    if (k === 0) return [...S.rect(x, y, 0.34, 0.34, 56, { ...o, a: 0.45 }),               // a box of scattered molecules
      ...Array.from({ length: 34 }, () => ({ x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, ...o }))];
    if (k === 1) return [...S.arc(x, y, 0.17, 0, TAU * 0.99, 60, o), ...S.blob(x + 0.03, y + 0.02, 0.07, 0.07, 22, o)];   // a cell
    if (k === 2) return [...S.arc(x, y, 0.15, 0, TAU * 0.99, 60, { ...o, a: 1 }), ...S.arc(x, y, 0.23, 0, TAU * 0.99, 50, { ...o, a: 0.35 })];   // a horizon
    if (k === 3) return [[-0.14, 0.18], [-0.04, 0.26], [0.06, 0.2], [0.15, 0.14]].flatMap(([dx, h]) => [   // trees of different heights
      ...S.line(x + dx - 0.05, y - 0.1, x + dx, y - 0.1 + h, 10, o), ...S.line(x + dx, y - 0.1 + h, x + dx + 0.05, y - 0.1, 10, o)]);
    return [0.3, 0.22, 0.27].flatMap((w, r) => S.line(x - 0.15, y + 0.08 - r * 0.08, x - 0.15 + w, y + 0.08 - r * 0.08, 16, o));   // lines of text
  }
  SCENES.entropy = () => {
    const points = [
      ...S.line(-0.2, 0, 0.2, 0, 26, { c: "paper", a: 0.6, s: 0.85 }),
      ...S.blob(-0.2, 0, 0.05, 0.05, 26, { c: "ice", a: 1, s: 1 }),
      ...S.blob(0.2, 0, 0.05, 0.05, 26, { c: "brass", a: 1, s: 1.1 })
    ];
    const flows = [];
    ENTROPY_FIELDS.forEach((f, k) => {
      points.push(...entropyIcon(k, f.x, f.y, f.c));
      const len = Math.hypot(f.x, f.y), sx = f.x - (f.x / len) * 0.3, sy = f.y - (f.y / len) * 0.3;
      const ex = (f.x / len) * 0.3, ey = (f.y / len) * 0.3;
      points.push(...S.line(sx, sy, ex, ey, 30, { c: "dim", a: 0.22, s: 0.7 }));
      flows.push({ n: 12, path: u => [sx + (ex - sx) * u, sy + (ey - sy) * u], speed: 0.28, c: f.c, a: 0.9, s: 1, g: k });
    });
    const below = f => f.y > 0.6 ? [0.28, 0.83, 0.7, "left"] : [f.x, f.y - 0.3, f.y - 0.43, ""];
    return {
      points, flows,
      labels: [
        { x: -0.2, y: -0.15, html: "0", cls: "slot" },
        { x: 0.2, y: -0.15, html: "1", cls: "slot" },
        { x: 0, y: 0.17, html: "Shannon’s bit", cls: "role" },
        { x: 0, y: -0.32, html: "one yes-or-no question", cls: "example" },
        ...ENTROPY_FIELDS.flatMap((f, k) => {
          const [x, y1, y2, al] = below(f);
          return [
            { x, y: y1, html: f.name, cls: `role c-${f.c} ${al}`, g: k },
            { x, y: y2, html: f.mean, cls: `example ${al}`, g: k }
          ];
        })
      ]
    };
  };

  /* What the bit gave us: a bit at the centre, streaming out to what digital communication
     built, each drawn in particles, lighting in turn. */
  SCENES.gave = () => {
    const ITEMS = [
      { name: "the internet", x: 0, y: 0.78 },
      { name: "cellphones", x: 1.1, y: 0.3 },
      { name: "links to space", x: 0.72, y: -0.5 },
      { name: "digital sound and video", x: -0.72, y: -0.5 },
      { name: "every computer", x: -1.1, y: 0.3 }
    ];
    const icon = (k, x, y) => {
      const o = { c: "ice", a: 0.85, s: 0.9, g: k };
      if (k === 0) return [...S.arc(x, y, 0.17, 0, TAU * 0.99, 60, o), ...S.line(x - 0.17, y, x + 0.17, y, 16, { ...o, a: 0.5 }),
        ...S.arc(x, y, 0.17, -Math.PI / 2, Math.PI / 2, 20, { ...o, a: 0.001 }),
        ...[-0.08, 0.08].flatMap(dx => S.bezier([x + dx * 0.3, y + 0.17], [x + dx * 1.6, y + 0.08], [x + dx * 1.6, y - 0.08], [x + dx * 0.3, y - 0.17], 18, { ...o, a: 0.5 }))];
      if (k === 1) return [...S.rect(x, y, 0.16, 0.3, 50, o), ...S.fill(x, y + 0.01, 0.1, 0.19, 24, { ...o, c: "cyan", a: 0.45 })];
      if (k === 2) return [...S.fill(x, y, 0.08, 0.08, 14, o), ...S.rect(x - 0.13, y, 0.12, 0.06, 22, o), ...S.rect(x + 0.13, y, 0.12, 0.06, 22, o), ...S.arc(x - 0.02, y + 0.12, 0.05, Math.PI * 0.2, Math.PI * 0.8, 10, o)];
      if (k === 3) return S.line(x - 0.2, y, x + 0.2, y, 44, o).map((p, i) => ({ ...p, y: y + 0.09 * Math.sin(i * 0.55) * Math.sin(i * 0.07) }));
      return [...S.rect(x, y + 0.03, 0.3, 0.19, 50, o), ...S.line(x, y - 0.07, x, y - 0.13, 5, o), ...S.line(x - 0.08, y - 0.13, x + 0.08, y - 0.13, 8, o)];
    };
    const points = [
      ...S.line(-0.16, 0, 0.16, 0, 22, { c: "paper", a: 0.6, s: 0.85 }),
      ...S.blob(-0.16, 0, 0.05, 0.05, 24, { c: "ice", a: 1, s: 1 }),
      ...S.blob(0.16, 0, 0.05, 0.05, 24, { c: "brass", a: 1, s: 1.1 }),
      ...ITEMS.flatMap((it, k) => icon(k, it.x, it.y))
    ];
    const flows = ITEMS.map((it, k) => {
      const len = Math.hypot(it.x, it.y), ex = it.x - (it.x / len) * 0.26, ey = it.y - (it.y / len) * 0.26, sx = (it.x / len) * 0.22, sy = (it.y / len) * 0.22;
      return { n: 10, path: u => [sx + (ex - sx) * u, sy + (ey - sy) * u], speed: 0.3, c: "brass", a: 0.9, s: 1, g: k };
    });
    return {
      points, flows,
      labels: [
        { x: -0.16, y: -0.15, html: "0", cls: "slot" }, { x: 0.16, y: -0.15, html: "1", cls: "slot" },
        { x: 0, y: 0.15, html: "the bit", cls: "role c-brass" },
        ...ITEMS.map((it, k) => ({ x: it.x, y: it.y - (k === 3 ? 0.2 : 0.3), html: it.name, cls: "example", g: k })),
        { x: 0, y: -1.02, html: "any message, any distance, symbol for symbol", cls: "tag" }
      ]
    };
  };

  /* Two ways to read a signal. Left, as a whole: a turning cube where 110 and 011, read from
     000 one bit per axis, end on different corners, each painting the face its 1s span.
     Right, linearly: the same two strings as waves in time, with the reader moving along them
     in step with the paths in the cube. */
  SCENES.gstructure = () => {
    const V = cubeVerts(3), E = cubeEdges(V), sc = 0.36, cx = -0.72, cy = 0.02, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const STR = [["110", "cyan", 0.46], ["011", "brass", -0.36]];
    const wx0 = 0.32, ww = 0.34, wh = 0.26;
    E.forEach(([a, b]) => { for (let k = 0; k < 16; k++) { const u = k / 15; add({ kind: "edge", p: V[a].map((x, j) => x + (V[b][j] - x) * u) }, { x: cx, y: cy, c: "dim", a: 0.3, s: 0.7 }); } });
    V.forEach(p => { for (let k = 0; k < 4; k++) add({ kind: "vert", p: p.map(x => x + gauss() * 0.015) }, { x: cx, y: cy, c: "dim", a: 0.6, s: 0.8 }); });
    const pathAt = (str, u) => {                                  // position after reading u of the string's bits
      const p = [-1, -1, -1], n = u * 3;
      for (let j = 0; j < 3; j++) if (str[j] === "1") p[j] += 2 * Math.max(0, Math.min(1, n - j));
      return p;
    };
    const wave = (str, y0, u) => {                                // the step wave of a string, u along its length
      const x = wx0 + u * 3 * ww, k = Math.min(2, Math.floor(u * 3));
      return [x, y0 + (str[k] === "1" ? wh : 0)];
    };
    STR.forEach(([str, c, y0], si) => {
      const ones = [...str].map((b, j) => (b === "1" ? j : -1)).filter(j => j >= 0);
      for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {     // the face the string's 1s span
        const p = [-1, -1, -1]; p[ones[0]] = -1 + (2 * a) / 15; p[ones[1]] = -1 + (2 * b) / 15;
        add({ kind: "face", si, p }, { x: cx, y: cy, c, a: 0, s: 0.9 });
      }
      for (let w = 0; w < 3; w++) for (let k = 0; k < 60; k++) add({ kind: "path", si, u: k / 59, off: (w - 1) * 0.035 }, { x: cx, y: cy, c, a: 1, s: 1.3 });
      for (let k = 0; k < 26; k++) add({ kind: "end", si, j: [gauss() * 0.05, gauss() * 0.05, gauss() * 0.05] }, { x: cx, y: cy, c, a: 1, s: 1.4 });
      for (let k = 0; k < 90; k++) { const [x, y] = wave(str, y0, (k + 0.5) / 90); add({ kind: "fixed", x, y }, { x, y, c, a: 0.85, s: 0.95 }); }
      for (let e = 1; e < 3; e++) if (str[e] !== str[e - 1]) for (let k = 0; k < 10; k++) { const x = wx0 + e * ww; add({ kind: "fixed", x, y: y0 + (wh * k) / 9 }, { x, y: y0, c, a: 0.85, s: 0.95 }); }
      for (let k = 0; k < 40; k++) { const x = wx0 + (3 * ww * k) / 39; add({ kind: "fixed", x, y: y0 - 0.06, dim: 1 }, { x, y: y0, c: "dim", a: 0.3, s: 0.7 }); }
      for (let k = 0; k < 12; k++) add({ kind: "reader", si, jx: gauss() * 0.018, jy: gauss() * 0.018 }, { x: wx0, y: y0, c: "gold", a: 1, s: 1.25 });
    });
    const P = (p, t) => { const [X, Y, d] = view3(p[0] * sc, p[1] * sc, p[2] * sc, 0.75 + 0.35 * Math.sin(t * 0.25), 0.5); return [cx + X, cy + Y, d]; };
    const read = t => Math.min(1, Math.max(0, ((t % 9) - 1) / 4));
    const out = new Array(points.length);
    return {
      points, stillT: 6,
      dynamic: t => {
        const r = read(t);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: m.dim ? 0.3 : 0.85 }; return; }
          if (m.kind === "reader") { const [str, , y0] = STR[m.si], [x, y] = wave(str, y0, Math.min(0.999, r)); out[i] = { x: x + m.jx, y: y + m.jy, a: r > 0 && r < 1 ? 1 : 0.5 }; return; }
          let p, a;
          if (m.kind === "edge" || m.kind === "vert") { p = m.p; a = m.kind === "edge" ? 0.4 : 0.7; }
          else if (m.kind === "face") { p = m.p; a = r >= 1 ? 0.55 : 0; }
          else if (m.kind === "path") { p = pathAt(STR[m.si][0], Math.min(r, m.u)).map(x => x + m.off); a = m.u <= r ? 1 : 0; }
          else { const q = pathAt(STR[m.si][0], r); p = q.map((x, j) => x + m.j[j]); a = 1; }
          const [x, y, d] = P(p, t);
          out[i] = { x, y, a: a * (0.6 + 0.4 * d) };
        });
        return out;
      },
      labels: [
        { x: cx, y: 0.78, html: "read as a whole", cls: "tag" },
        { x: wx0 + 1.5 * ww, y: 0.9, html: "read linearly", cls: "tag" },
        ...STR.flatMap(([str, c, y0]) => [
          { x: wx0 - 0.1, y: y0 + wh / 2, html: str, cls: `math right c-${c === "cyan" ? "cyan" : "brass"}` },
          ...[...str].map((b, k) => ({ x: wx0 + (k + 0.5) * ww, y: y0 - 0.16, html: b, cls: "slot" }))
        ]),
        { x: cx, y: -0.72, html: "read over space", cls: "example" },
        { x: wx0 + 1.5 * ww, y: -0.86, html: "read over time", cls: "example" }
      ]
    };
  };

  /* Two Shannon bits against two geometric bits: the four corners of a square, and the
     three-sphere drawn as its Hopf circles, one over every reading, all linked. */
  SCENES.gpair = () => {
    const sq = { x: -0.95, y: 0.02, s: 0.5 }, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    S.rect(sq.x, sq.y, sq.s, sq.s, 80, {}).forEach(p => add({ kind: "fixed", x: p.x, y: p.y, a: 0.4 }, { x: p.x, y: p.y, c: "dim", a: 0.4, s: 0.8 }));
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => S.blob(sq.x - sq.s / 2 + a * sq.s, sq.y - sq.s / 2 + b * sq.s, 0.035, 0.035, 14, {}).forEach(p => add({ kind: "fixed", x: p.x, y: p.y, a: 0.95 }, { x: p.x, y: p.y, c: "brass", a: 0.95, s: 1 })));
    const COLS = ["cyan", "violet", "mint", "brass", "coral", "ice", "gold"];
    [[0.62, 9], [0.3, 6]].forEach(([eta, nf], si) => {
      for (let f = 0; f < nf; f++) {
        const phi = (f / nf) * TAU + si * 0.3, c = COLS[(f + si * 3) % COLS.length];
        for (let k = 0; k < 56; k++) {
          const psi = (k / 56) * TAU, x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi), x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi), d = 1 - x4;
          add({ kind: "fib", p: [x1 / d, x3 / d, x2 / d] }, { x: 0.7, y: 0, c, a: 0.7, s: 0.85 });
        }
      }
    });
    const out = new Array(points.length);
    return {
      points, stillT: 2.5,
      dynamic: t => {
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: m.a }; return; }
          const [X, Y, d] = view3(m.p[0], m.p[1], m.p[2], t * 0.1, 1.05); out[i] = { x: 0.7 + X * 0.32, y: 0.02 + Y * 0.32, a: 0.2 + 0.7 * d };
        });
        return out;
      },
      labels: [
        { x: sq.x, y: 0.62, html: "two Shannon bits", cls: "tag" }, { x: 0.7, y: 0.62, html: "two geometric bits", cls: "tag" },
        ...[["00", 0, 0], ["10", 1, 0], ["01", 0, 1], ["11", 1, 1]].map(([l, a, b]) => ({ x: sq.x - sq.s / 2 + a * sq.s + (a ? 0.11 : -0.11), y: sq.y - sq.s / 2 + b * sq.s + (b ? 0.07 : -0.07), html: l, cls: "slot" })),
        { x: sq.x, y: -0.62, html: "four corners", cls: "example" },
        { x: 0.7, y: -0.62, html: "a sphere of circles, all linked", cls: "example" }
      ]
    };
  };

  /* A qubit: the Bloch sphere as a shaded globe turning slowly. The state is a bright arrow sweeping a
     cone as Schrödinger's equation runs, its tip leaving a trail, a dashed drop to the equator showing
     where it sits, and at the tip the circle of phase, a dot going round it, that the reading sets aside. */
  SCENES.gbloch = () => {
    const R = 0.7, cy = 0.04, pts3 = [];
    const ring = (n, f, a, s = 0.8) => { for (let k = 0; k < n; k++) { const u = (k / n) * TAU; pts3.push([...f(u), a, s]); } };
    ring(150, u => [Math.cos(u), 0, Math.sin(u)], 0.7, 0.85);
    [0, Math.PI / 3, (2 * Math.PI) / 3].forEach(m => ring(96, u => [Math.cos(m) * Math.sin(u), Math.cos(u), Math.sin(m) * Math.sin(u)], 0.32));
    [-0.7, 0.7].forEach(y => { const r = Math.sqrt(1 - y * y); ring(76, u => [r * Math.cos(u), y, r * Math.sin(u)], 0.28); });
    for (let k = 0; k < 420; k++) {                                   // a shaded shell, evenly spread
      const y = 1 - (2 * (k + 0.5)) / 420, r = Math.sqrt(1 - y * y), u = k * 2.39996;
      pts3.push([r * Math.cos(u), y, r * Math.sin(u), 0.3, 0.6]);
    }
    const points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    pts3.forEach(p => add({ kind: "sph", p }, { x: 0, y: cy, c: "ice", a: p[3], s: p[4] }));
    [1, -1].forEach(py => { for (let k = 0; k < 12; k++) add({ kind: "pole", py, j: [gauss() * 0.03, gauss() * 0.03] }, { x: 0, y: cy, c: "paper", a: 1, s: 1.2 }); });
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]].forEach((ax, j) => { for (let k = 0; k < 24; k++) add({ kind: "axis", ax, u: -1.22 + (2.44 * k) / 23 }, { x: 0, y: cy, c: "dim", a: j ? 0.25 : 0.45, s: 0.7 }); });
    for (let k = 0; k < 8; k++) for (let q = 0; q < 12; q++) add({ kind: "cone", spoke: k, u: (q + 1) / 12 }, { x: 0, y: cy, c: "cyan", a: 0.18, s: 0.6 });
    for (let k = 0; k < 16; k++) add({ kind: "drop", u: k / 15 }, { x: 0, y: cy, c: "paper", a: 0.45, s: 0.6 });
    for (let k = 0; k < 16; k++) add({ kind: "foot", u: k / 15 }, { x: 0, y: cy, c: "paper", a: 0.3, s: 0.6 });
    for (let k = 0; k < 36; k++) add({ kind: "vec", u: k / 35 }, { x: 0, y: cy, c: "cyan", a: 1, s: 1.3 });
    for (let k = 0; k < 12; k++) add({ kind: "head", side: k < 6 ? -1 : 1, u: (k % 6) / 5 }, { x: 0, y: cy, c: "cyan", a: 1, s: 1.1 });
    for (let k = 0; k < 14; k++) add({ kind: "tip", j: [gauss() * 0.022, gauss() * 0.022] }, { x: 0, y: cy, c: "ice", a: 1, s: 1.6 });
    for (let k = 0; k < 40; k++) add({ kind: "phase", a: (k / 40) * TAU }, { x: 0, y: cy, c: "gold", a: 0.9, s: 1 });
    for (let k = 0; k < 6; k++) add({ kind: "pdot", k }, { x: 0, y: cy, c: "gold", a: 1, s: 1.9 - k * 0.2 });
    for (let k = 0; k < 130; k++) add({ kind: "trace", u: k / 130 }, { x: 0, y: cy, c: "cyan", a: 0.6, s: 1 - 0.5 * k / 130 });
    const theta = 1.05, spin = t => t * 0.6, tilt = 0.38;
    const out = new Array(points.length);
    return {
      points, stillT: 2,
      dynamic: t => {
        const yaw = 0.5 + t * 0.1, ph = spin(t);
        const P = (x, y, z) => { const [X, Y, d] = view3(x * R, y * R, z * R, yaw, tilt); return [X, cy + Y, d]; };
        const st = q => [Math.sin(theta) * Math.cos(q), Math.cos(theta), Math.sin(theta) * Math.sin(q)];
        const [sx, sy, sz] = st(ph), [tx, ty] = P(sx, sy, sz), [bx, by] = P(0.86 * sx, 0.86 * sy, 0.86 * sz);
        const dx = tx - bx, dy = ty - by, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
        meta.forEach((m, i) => {
          let x, y, d, a;
          if (m.kind === "sph") { [x, y, d] = P(m.p[0], m.p[1], m.p[2]); a = m.p[3] * (0.12 + 0.88 * d * d); }
          else if (m.kind === "pole") { [x, y] = P(0, m.py, 0); x += m.j[0]; y += m.j[1]; a = 1; }
          else if (m.kind === "axis") { [x, y, d] = P(m.ax[0] * m.u, m.ax[1] * m.u, m.ax[2] * m.u); a = points[i].a * (0.4 + 0.6 * d); }
          else if (m.kind === "cone") { const [cx, cyy, cz] = st(ph + (m.spoke / 8) * TAU); [x, y, d] = P(cx * m.u, cyy * m.u, cz * m.u); a = 0.28 * (0.3 + 0.7 * d); }
          else if (m.kind === "drop") { [x, y] = P(sx, sy * (1 - m.u), sz); a = m.u < 0.999 && (m.u * 15) % 2 < 1 ? 0.5 : 0; }
          else if (m.kind === "foot") { [x, y] = P(sx * m.u, 0, sz * m.u); a = (m.u * 15) % 2 < 1 ? 0.35 : 0; }
          else if (m.kind === "vec") { [x, y] = P(sx * m.u * 0.9, sy * m.u * 0.9, sz * m.u * 0.9); a = 1; }
          else if (m.kind === "head") { x = tx - dx / dl * 0.07 * m.u + m.side * nx * 0.035 * m.u; y = ty - dy / dl * 0.07 * m.u + m.side * ny * 0.035 * m.u; a = 1; }
          else if (m.kind === "tip") { x = tx + m.j[0]; y = ty + m.j[1]; a = 1; }
          else if (m.kind === "trace") { const [qx, qy, qz] = st(ph - m.u * TAU * 0.95); [x, y, d] = P(qx, qy, qz); a = (0.08 + 0.75 * Math.pow(1 - m.u, 1.5)) * (0.5 + 0.5 * d); }
          else if (m.kind === "phase") { const r = 0.11; x = tx + r * Math.cos(m.a); y = ty + r * 0.55 * Math.sin(m.a); a = 0.85; }
          else { const r = 0.11, q = t * 2.4 - m.k * 0.12; x = tx + r * Math.cos(q); y = ty + r * 0.55 * Math.sin(q); a = 1 - m.k / 6; }
          out[i] = { x, y, a };
        });
        return out;
      },
      labels: [
        { x: 0, y: cy + R + 0.19, html: "|0⟩", cls: "math" }, { x: 0, y: cy - R - 0.17, html: "|1⟩", cls: "math" },
        { x: 1.02, y: 0.56, html: "a qubit", cls: "role left" }, { x: 1.02, y: 0.41, html: "two geometric bits", cls: "example left" },
        { x: 1.02, y: 0.12, html: "the reading", cls: "tag left" }, { x: 1.02, y: -0.03, html: "a point on the Bloch sphere", cls: "example left" },
        { x: 1.02, y: -0.3, html: "the phase", cls: "tag left c-math" }, { x: 1.02, y: -0.45, html: "a circle, set aside", cls: "example left" },
        { x: 0, y: -1.1, html: "the state rotates, and its length never changes", cls: "example" }
      ]
    };
  };

  /* The transition into the geometric bit: the bit's segment rolls up onto a circle, its
     length wrapping exactly into the circumference, and a mark runs once round and returns. */
  SCENES.gintro = () => {
    const R = 0.98, cy = 0, N = 460, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < N; k++) add({ kind: "line", u: (k + 0.5) / N }, { x: 0, y: -R, c: "cyan", a: 0.6, s: 0.85 });
    for (let k = 0; k < 20; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: 0, y: -R, c: "gold", a: 0, s: 1.3 });
    for (let k = 0; k < 30; k++) add({ kind: "end", e: k < 15 ? 0 : 1, jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: 0, y: -R, c: "ice", a: 0.9, s: 1.05 });
    const PER = 11, wrap = t => ease(Math.max(0, Math.min(1, (t - 1.2) / 3.2)));
    const turn = t => TAU * ease(Math.max(0, Math.min(1, (t - 5) / 3.4)));
    const L = TAU * R;                                              // the line's length, the circumference it becomes
    const pos = (u, f) => {
      const lx = -L / 2 + L * u, ly = -R;                           // flat: centred under the circle
      const a = -Math.PI / 2 + (u - 0.5) * TAU, cx = R * Math.cos(a), cyy = cy + R * Math.sin(a);
      return [lx + (cx - lx) * f, ly + (cyy - ly) * f];
    };
    const out = new Array(points.length);
    return {
      points, period: PER, stillT: 7.2,
      dynamic: t => {
        const f = wrap(t), m = turn(t), fade = t > PER - 0.8 ? (PER - t) / 0.8 : 1;
        meta.forEach((p, i) => {
          if (p.kind === "line") { const [x, y] = pos(p.u, f); out[i] = { x, y, a: (0.22 + 0.16 * f) * fade }; }
          else if (p.kind === "end") { const [x, y] = pos(p.e ? 1 : 0, f); out[i] = { x: x + p.jx, y: y + p.jy, a: (1 - f) * 0.9 * fade }; }
          else { const a = -Math.PI / 2 + m; out[i] = { x: R * Math.cos(a) + p.jx, y: cy + R * Math.sin(a) + p.jy, a: f > 0.98 ? 0.85 * fade : 0 }; }
        });
        return out;
      }
    };
  };

  /* ================= 05 · The geometric bit ================= */

  const DEG = 180 / Math.PI;
  const at = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

  const ease = f => f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);

  /* The overview: Shannon's bit, the perpendicular it implies, the circle it draws, and
     then each relationship the circle holds, lit one at a time as the labels map them.
     π and e carry the continuous rotation; identity is that rotation closing on a whole number. */
  const MAP = [
    { name: "perpendicularity", mean: "difference", c: "cyan", cls: "c-cyan", cap: "two directions, each free of the other" },
    { name: "symmetry", mean: "sameness", c: "coral", cls: "c-coral", cap: "opposite poles, the same after half a rotation" },
    { name: "space", mean: "π, continuous", c: "violet", cls: "c-violet", cap: "π measures the rotation in space, through every angle" },
    { name: "time", mean: "<i>e</i>, continuous", c: "brass", cls: "c-brass", cap: "<i>e</i> measures the rotation as it accumulates in time" },
    { name: "identity", mean: "integers, names, meaning", c: "gold", cls: "c-math", cap: "no whole-number arithmetic reaches π or <i>e</i>, yet the full rotation gives <i>e</i><sup>2<i>πi</i></sup> = 1, and <i>A</i> = <i>A</i>" }
  ];
  SCENES.gmap = () => {
    const nar = narrow(), R = nar ? 0.64 : 0.62, cy = nar ? 0 : 0.02, points = [], meta = [];
    const BUILT = 4.8, PH = 2.8, END = BUILT + 5 * PH, clamp = v => Math.max(0, Math.min(1, v));
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 190; k++) add({ kind: "ring", a: ((k + 0.5) / 190) * TAU, props: [4], base: "ice", ba: 0.45 }, { x: R, y: cy, c: "ice", a: 0, s: 0.8 });
    for (let k = 0; k < 34; k++) add({ kind: "seg", u: k / 33, props: [0, 1], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let k = 0; k < 34; k++) add({ kind: "perp", u: k / 33, props: [0], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 34; k++) add({ kind: "ext", d, u: (k + 1) / 34, props: d ? [] : [1], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let k = 0; k < 14; k++) add({ kind: "corner", k, props: [0], base: "paper", ba: 0.6 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.7 });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 16; k++) add({ kind: "pole", q, jx: gauss() * 0.022, jy: gauss() * 0.022, props: [[0, 1], [0], [1], []][q], base: "paper", ba: 0.9 }, { x: 0, y: cy, c: "paper", a: 0, s: 1.05 });
    for (let k = 0; k < 90; k++) add({ kind: "pi", u: k / 89, props: [2], base: "violet", ba: 0 }, { x: 0, y: cy, c: "violet", a: 0, s: 0.85 });
    for (let k = 0; k < 110; k++) add({ kind: "trail", a: ((k + 0.5) / 110) * TAU, props: [3, 4], base: "brass", ba: 0 }, { x: 0, y: cy, c: "brass", a: 0, s: 0.85 });
    for (let k = 0; k < 30; k++) add({ kind: "centre", jx: gauss() * 0.022, jy: gauss() * 0.022, props: [], base: "ice", ba: 0.9 }, { x: 0, y: cy, c: "ice", a: 0, s: 1 });
    for (let k = 0; k < 18; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02, props: [3, 4], base: "gold", ba: 1 }, { x: R, y: cy, c: "gold", a: 0, s: 1.3 });

    /* the animation plays once and rests; hovering a label previews its property.
       hover: -1 none, 0..4 a property, 6 Shannon's bit (the circle projected onto one line) */
    let offset = 0, last = 0, hover = -1, hoverStart = 0;
    const local = t => { if (t < offset) offset = 0; last = t; return t - offset; };
    const BIT = 6;
    const phase = t => t < BUILT ? -1 : Math.min(4, Math.floor((t - BUILT) / PH));
    const swing = t => (Math.PI / 2) * ease(clamp((t - 1.4) / 1.2));                  // the perpendicular swinging up from the bit
    const sweep = t => TAU * ease(clamp((t - 2.8) / 1.8));                            // the circle drawn from 1 round to 1
    const grow = t => ease(clamp((t - 3.4) / 1.1));                                  // the diameters completed through the centre
    const turn = t => TAU * ease(clamp((t - BUILT - 3 * PH) / (2 * PH - 0.4)));       // the mark's full turn: continuous in time, closing as one
    const P = (r, a) => at(0, cy, r, a);
    const out = new Array(points.length);
    const vis = (on, m, ph) => {
      if (!on) return { a: 0, c: m.base };
      if (ph < 0) return { a: m.ba, c: m.base };
      const lit = m.props.includes(ph);
      return { a: lit ? 1 : m.ba * 0.45, c: lit ? MAP[ph].c : m.base };
    };
    const ended = t => t >= END;
    const focus = t => t >= BUILT && hover >= 0 ? hover : ended(t) ? -1 : phase(t);  // which property is lit
    const enter = k => () => { if (hover !== k) hoverStart = last; hover = k; }, leave = () => { hover = -1; };
    const pill = (k, html) => `<span class="pill${hover === k ? " on" : ""}">${html}</span>`;
    const name = (k, html) => t => { t = local(t); const f = focus(t);
      if (t < BUILT) return "";
      if (ended(t) || hover >= 0) return pill(k, html);
      return `<span style="opacity:${f === k ? 1 : 0.4}">${html}</span>`; };
    const mean = (k, html) => t => { t = local(t); if (t < BUILT) return ""; const f = focus(t);
      return `<span style="opacity:${f === k || (ended(t) && f < 0) ? 1 : 0.4}">${html}</span>`; };
    const BITCAP = "Shannon’s bit: 0 to 1, with its perpendicular";
    return {
      points, stillT: END + 1,
      dynamic: t => {
        t = local(t);
        const done = ended(t), f = focus(t), sw = swing(t), s = sweep(t), g = grow(t);
        const flat = t >= BUILT && hover === BIT;
        const mt = t >= BUILT && hover === 3 ? TAU * ((last - hoverStart) % 4) / 4 : done ? (f === 4 ? TAU : 0) : turn(t);
        const ph = flat ? -1 : f;
        meta.forEach((m, i) => {
          let x, y, v;
          if (m.kind === "ring") { [x, y] = P(R, m.a); v = vis(m.a <= s, m, ph); }
          else if (m.kind === "seg") { [x, y] = P(R * m.u, 0); v = vis(true, m, ph); }
          else if (m.kind === "perp") { [x, y] = P(R * m.u, sw); v = vis(t > 1.4, m, ph); }
          else if (m.kind === "ext") { [x, y] = P(R * m.u, m.d ? -Math.PI / 2 : Math.PI); v = vis(m.u <= g, m, ph); }
          else if (m.kind === "corner") {
            const u = (m.k % 7) / 6 * 0.11, side = m.k < 7;
            x = side ? 0.11 : u; y = cy + (side ? u : 0.11); v = vis(t > 2.6, m, ph);
          }
          else if (m.kind === "pole") {
            [x, y] = P(R, m.q * Math.PI / 2); x += m.jx; y += m.jy;
            const on = m.q === 0 || (m.q === 1 ? t > 2.6 : g > 0.9);
            v = vis(on, m, ph); if (m.q === 0 && t < BUILT) v.c = "brass";
          }
          else if (m.kind === "pi") { [x, y] = P(R + 0.1, Math.PI * m.u); v = vis(ph === 2, m, ph); }
          else if (m.kind === "trail") { [x, y] = P(R + 0.08, m.a); v = vis(m.a <= mt && ph >= 3 && ph <= 4, m, ph); if (v.a) v.a = Math.max(v.a, 0.5); }
          else if (m.kind === "centre") { x = m.jx; y = cy + m.jy; v = vis(true, m, ph); }
          else { [x, y] = P(R, mt); x += m.jx; y += m.jy; v = vis(t >= BUILT, m, ph); }
          if (flat) {                                                            // retain only the positive radius and its right angle
            const keep = m.kind === "seg" || m.kind === "perp" || m.kind === "corner" || m.kind === "centre" || (m.kind === "pole" && m.q === 0);
            v = { a: keep ? 1 : 0, c: m.kind === "pole" ? "brass" : m.kind === "centre" ? "ice" : "paper" };
          }
          out[i] = { x, y, a: v.a, c: v.c };
        });
        return out;
      },
      labels: [
        { x: 0, y: cy - 0.15, html: "0", cls: "math", live: t => { t = local(t); return t < BUILT || hover === BIT ? "0" : ""; } },
        { x: R + 0.1, y: cy - 0.15, html: "1", cls: "math left", live: t => { t = local(t); return t < BUILT || hover === BIT ? "1" : ""; } },
        { x: 0, y: nar ? -1.48 : -0.98, html: "", cls: "example", ...(nar ? { w: 3.7 } : {}),
          live: t => { t = local(t);
            if (t < 1.4) return "Shannon’s bit, 0 and 1"; if (t < 2.8) return "the perpendicular it implies"; if (t < BUILT) return "the circle it draws";
            if (hover < 0 && !ended(t)) return MAP[phase(t)].cap;
            return hover === BIT ? BITCAP : hover >= 0 ? MAP[hover].cap : "hover a property to see it in the circle"; } },
        { x: 0, y: nar ? 1.5 : 1.02, html: "", cls: "role", on: { enter: enter(BIT), leave },
          live: t => local(t) >= BUILT ? pill(BIT, "Shannon’s bit") : "" },
        { x: 0, y: nar ? -1.94 : -1.14, html: "", cls: "tag", on: { click: () => { offset = last; hover = -1; } },
          live: t => ended(local(t)) ? `<span class="pill">↻ replay</span>` : "" },
        ...MAP.flatMap((p, k) => {
          if (nar) {
            const x = (k % 3 - 1) * 1.26, y = k < 3 ? 1.06 : -1.06;
            return [{ x, y, html: "", cls: "example " + p.cls, live: name(k, p.name), on: { enter: enter(k), leave } }];
          }
          const left = k < 3, x = left ? -1.0 : 1.0, y = left ? 0.58 - k * 0.58 : 0.29 - (k - 3) * 0.58;
          return [
            { x, y, html: "", cls: "role " + p.cls + (left ? " right" : " left"), live: name(k, p.name), on: { enter: enter(k), leave } },
            { x: x + (left ? -0.04 : 0.04), y: y - 0.16, html: "", cls: "example" + (left ? " right" : " left"), live: mean(k, p.mean) }
          ];
        })
      ]
    };
  };

  /* The bit's 1 swept round 0: every point a unit away, each with the perpendicular
     the bit left undrawn. Once the circle is drawn, the mark keeps turning and returning. */
  SCENES.gcircle = () => {
    const R = 0.8, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 200; k++) add({ kind: "ring", a: ((k + 0.5) / 200) * TAU }, { x: R, y: 0, c: "ice", a: 0.45, s: 0.8 });
    for (let k = 0; k < 30; k++) add({ kind: "hand", u: k / 29 }, { x: 0, y: 0, c: "cyan", a: 0.5, s: 0.8 });
    for (let k = 0; k < 44; k++) add({ kind: "tan", u: -1 + (2 * k) / 43 }, { x: R, y: 0, c: "cyan", a: 0.7, s: 0.85 });
    for (let k = 0; k < 14; k++) add({ kind: "corner", k }, { x: R, y: 0, c: "paper", a: 0.6, s: 0.7 });
    for (let k = 0; k < 40; k++) add({ kind: "centre", jx: gauss() * 0.024, jy: gauss() * 0.024 }, { x: 0, y: 0, c: "ice", a: 0.9, s: 1 });
    for (let k = 0; k < 10; k++) add({ kind: "start", x: R + 0.05 + k * 0.014 }, { x: R, y: 0, c: "brass", a: 0.9, s: 0.85 });
    for (let k = 0; k < 20; k++) add({ kind: "mark", jx: gauss() * 0.022, jy: gauss() * 0.022 }, { x: R, y: 0, c: "gold", a: 1, s: 1.3 });
    const DRAW = 5, angle = t => t < DRAW ? TAU * ease(t / DRAW) : TAU + (t - DRAW) * 0.4;
    const out = new Array(points.length);
    return {
      points, stillT: 7.2,
      dynamic: t => {
        const a = angle(t), swept = Math.min(a, TAU), c = Math.cos(a), sn = Math.sin(a);
        const hx = R * c, hy = R * sn;
        meta.forEach((m, i) => {
          if (m.kind === "ring") { const on = m.a <= swept; out[i] = on ? { x: R * Math.cos(m.a), y: R * Math.sin(m.a), a: 0.45 } : { x: hx, y: hy, a: 0 }; }
          else if (m.kind === "hand") out[i] = { x: hx * m.u, y: hy * m.u, a: 0.5 };
          else if (m.kind === "tan") out[i] = { x: hx - sn * 0.34 * m.u, y: hy + c * 0.34 * m.u, a: 0.7 };
          else if (m.kind === "corner") {                   // right-angle mark between radius and tangent
            const u = (m.k % 7) / 6 * 0.1, side = m.k < 7;
            const r = side ? R - 0.1 : R - u, v = side ? u : 0.1;
            out[i] = { x: r * c - v * sn, y: r * sn + v * c, a: 0.6 };
          }
          else if (m.kind === "centre") out[i] = { x: m.jx, y: m.jy, a: 0.9 };
          else if (m.kind === "start") out[i] = { x: m.x, y: 0, a: 0.9 };
          else out[i] = { x: hx + m.jx, y: hy + m.jy, a: 1 };
        });
        return out;
      },
      labels: [
        { x: 0, y: -0.16, html: "0", cls: "math" },
        { x: R + 0.26, y: 0.02, html: "1", cls: "math left" },
        { x: R + 0.26, y: -0.18, html: "start", cls: "tag left" },
        { x: 0, y: -1.06, html: narrow() ? "every point a unit from 0" : "every point a unit from 0, each with its perpendicular", cls: "example" }
      ]
    };
  };

  /* The alphabet of space: 1 and −1 symmetric across the centre, 1 and i perpendicular.
     The whole arrangement turns, and both relationships turn with it. */
  SCENES.galphabet = () => {
    const nar = narrow(), R = nar ? 0.5 : 0.72, cx = 0, cy = nar ? 0.02 : 0.02, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 180; k++) add({ kind: "ring", a: (k / 180) * TAU }, { x: cx, y: cy, c: "ice", a: 0.4, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 50; k++) add({ kind: "dia", d, u: -1 + (2 * k) / 49 }, { x: cx, y: cy, c: d ? "dim" : "coral", a: d ? 0.4 : 0.55, s: 0.8 });
    for (let k = 0; k < 40; k++) add({ kind: "quarter", u: k / 39 }, { x: cx, y: cy, c: "cyan", a: 0.75, s: 0.85 });
    for (let k = 0; k < 80; k++) add({ kind: "half", u: k / 79 }, { x: cx, y: cy, c: "coral", a: 0.6, s: 0.85 });
    for (let k = 0; k < 14; k++) add({ kind: "corner", k }, { x: cx, y: cy, c: "cyan", a: 0.8, s: 0.75 });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 18; k++) add({ kind: "pole", q, jx: gauss() * 0.022, jy: gauss() * 0.022 }, { x: cx, y: cy, c: q % 2 ? "paper" : "coral", a: 1, s: 1.1 });
    const th = t => t * 0.16, P = (r, a) => at(cx, cy, r, a);
    const out = new Array(points.length);
    return {
      points, stillT: 0.9,
      dynamic: t => {
        const o = th(t);
        meta.forEach((m, i) => {
          let x, y, a;
          if (m.kind === "ring") { [x, y] = P(R, m.a); a = 0.4; }
          else if (m.kind === "dia") { [x, y] = P(R * m.u, o + m.d * Math.PI / 2); a = m.d ? 0.4 : 0.55; }
          else if (m.kind === "quarter") { [x, y] = P(R + 0.13, o + m.u * Math.PI / 2); a = 0.75; }
          else if (m.kind === "half") { [x, y] = P(R + 0.13, o - m.u * Math.PI); a = 0.6; }
          else if (m.kind === "corner") {                   // right angle between the 1 and i directions
            const u = (m.k % 7) / 6 * 0.13, side = m.k < 7, px = side ? 0.13 : u, py = side ? u : 0.13;
            x = cx + px * Math.cos(o) - py * Math.sin(o); y = cy + px * Math.sin(o) + py * Math.cos(o); a = 0.8;
          }
          else { [x, y] = P(R, o + m.q * Math.PI / 2); x += m.jx; y += m.jy; a = 1; }
          out[i] = { x, y, a };
        });
        return out;
      },
      labels: [
        ...["1", "<i>i</i>", "−1", "−<i>i</i>"].map((n, q) => ({ x: cx, y: cy, html: n, cls: "math" + (q % 2 ? "" : " c-coral"), at: t => P(R * 0.72, th(t) + q * Math.PI / 2 + 0.24) })),
        { x: cx, y: cy, html: "perpendicular", cls: "role", at: t => P(R + (nar ? 0.52 : 0.42), th(t) + Math.PI / 4) },
        { x: cx, y: cy, html: "symmetric", cls: "role c-coral", at: t => P(R + (nar ? 0.4 : 0.38), th(t) - Math.PI / 2) },
        ...(nar ? [] : [
          { x: cx, y: cy, html: "difference", cls: "example", at: t => { const [x, y] = P(R + 0.42, th(t) + Math.PI / 4); return [x, y - 0.13]; } },
          { x: cx, y: cy, html: "sameness", cls: "example", at: t => { const [x, y] = P(R + 0.38, th(t) - Math.PI / 2); return [x, y - 0.13]; } }
        ])
      ]
    };
  };

  /* A = A twice. On top, the letter-reading scene of chapter 01: tell it apart, recognize
     it again. Below, the circle performs the same checks in step with it: difference, the
     right angle between 1 and i; sameness, a half turn that leaves the circle as it was;
     identity, a second half turn that brings the marked point A back to itself. */
  const CHECKS = [
    { name: "difference", mean: "this, not that", c: "cyan", cls: "c-cyan" },
    { name: "sameness", mean: "this here equals this there", c: "coral", cls: "c-coral" },
    { name: "identity", mean: "invariance over change", c: "gold", cls: "c-math" }
  ];
  SCENES.gchecks = () => {
    const S0 = 3.5, S1 = 7, S2 = 11, END = 12.2, clamp = v => Math.max(0, Math.min(1, v));
    const points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };

    /* the letters: two small retinas and the equals sign between them */
    const N = 16, cell = 0.03, half = (N * cell) / 2, ly = 0.74;
    const grids = [
      { cx: -0.62, glyph: rasterGlyph("A", '600 {px}px "EB Garamond", Georgia, serif', 0, 1.06 * N * cell, N, cell), t0: 0, t1: S0 - 0.3, c: "ice" },
      { cx: 0.62, glyph: rasterGlyph("A", '700 {px}px "Segoe UI", Ubuntu, Arial, sans-serif', -0.15, 0.94 * N * cell, N, cell), t0: S0, t1: S1 - 0.3, c: "cyan" }
    ];
    grids.forEach((g, gi) => {
      for (let k = 0; k < N * N; k++) {
        const row = Math.floor(k / N), col = k % N, on = g.glyph.has(k);
        add({ kind: "cell", gi, k, on, x: g.cx - half + (col + 0.5) * cell, y: ly + half - (row + 0.5) * cell }, { x: g.cx, y: ly, c: g.c, a: on ? 0.85 : 0.08, s: on ? 0.9 : 0.55 });
      }
    });
    grids.forEach((g, gi) => { for (let k = 0; k < 20; k++) add({ kind: "win", gi, k }, { x: g.cx, y: ly, c: "brass", a: 0, s: 0.95 }); });
    const winPath = S.rectPath(0, 0, 3 * cell, 3 * cell);
    for (let k = 0; k < 40; k++) {
      const u = (k % 20) / 19, y = ly + (k < 20 ? 0.035 : -0.035);
      add({ kind: "eq", x: -0.09 + 0.18 * u, y }, { x: 0, y, c: "cyan", a: 1, s: 1 });
    }

    /* the circle */
    const cx = -0.36, cy = -0.42, R = 0.46;
    for (let k = 0; k < 160; k++) add({ kind: "ring", a: (k / 160) * TAU, props: [2] }, { x: cx, y: cy, c: "ice", a: 0.4, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 40; k++) add({ kind: "dia", d, u: -1 + (2 * k) / 39, props: d ? (k >= 20 ? [0] : []) : (k >= 20 ? [0, 1] : [1]) }, { x: cx, y: cy, c: "paper", a: 0.4, s: 0.8 });
    for (let k = 0; k < 12; k++) add({ kind: "corner", k, props: [0] }, { x: cx, y: cy, c: "paper", a: 0.6, s: 0.75 });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 14; k++) add({ kind: "pole", q, jx: gauss() * 0.018, jy: gauss() * 0.018, props: [[0, 1], [0], [1], []][q] }, { x: cx, y: cy, c: "paper", a: 0.9, s: 1 });
    for (let k = 0; k < 80; k++) add({ kind: "trail", u: k / 79, props: [2] }, { x: cx, y: cy, c: "gold", a: 0, s: 0.85 });
    for (let k = 0; k < 16; k++) add({ kind: "mark", jx: gauss() * 0.018, jy: gauss() * 0.018, props: [2] }, { x: cx + R, y: cy, c: "gold", a: 1, s: 1.25 });

    const phase = t => t < S0 ? 0 : t < S1 ? 1 : 2;
    const rot = t => Math.PI * ease(clamp((t - S0) / (S1 - S0 - 0.6))) + Math.PI * ease(clamp((t - S1) / (S2 - S1 - 0.6)));
    const P = (r, a) => at(cx, cy, r, a);
    const BASE = { ring: ["ice", 0.4], dia: ["paper", 0.35], corner: ["paper", 0.5], pole: ["paper", 0.85], trail: ["gold", 0], mark: ["gold", 1] };
    const lit = (k, html) => t => `<span style="opacity:${phase(t) === k ? 1 : 0.35}">${html}</span>`;
    const out = new Array(points.length);
    return {
      points, period: END, stillT: 5.2,
      dynamic: t => {
        const ph = phase(t), o = rot(t), turned = Math.max(0, o - Math.PI);
        const scan = grids.map(g => (t >= g.t0 && t < g.t1) ? (t - g.t0) / (g.t1 - g.t0) * N * N : -1);
        const eqA = ph === 2 ? 1 : 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * TAU / 2.4));
        meta.forEach((m, i) => {
          if (m.kind === "win") {                                    // the reading window moving over the letter
            const at0 = scan[m.gi];
            if (at0 < 0) { out[i] = { x: grids[m.gi].cx, y: ly, a: 0 }; return; }
            const idx = Math.min(N * N - 1, Math.floor(at0)), row = Math.floor(idx / N), col = idx % N, [wx, wy] = winPath(m.k / 20);
            out[i] = { x: grids[m.gi].cx - half + (col + 0.5) * cell + wx, y: ly + half - (row + 0.5) * cell + wy, a: 0.95 };
            return;
          }
          if (m.kind === "cell") {
            const since = scan[m.gi] >= 0 ? scan[m.gi] - m.k : 1e9;
            const glow = since >= 0 && since < 40 ? 1 - since / 40 : 0;
            out[i] = { x: m.x, y: m.y, a: m.on ? 0.72 + 0.28 * glow : 0.07 + 0.3 * glow };
            return;
          }
          if (m.kind === "eq") { out[i] = { x: m.x, y: m.y, a: eqA }; return; }
          let x, y;
          if (m.kind === "ring") [x, y] = P(R, m.a);
          else if (m.kind === "dia") [x, y] = P(R * m.u, o + m.d * Math.PI / 2);
          else if (m.kind === "corner") {
            const u = (m.k % 6) / 5 * 0.1, side = m.k < 6, px = side ? 0.1 : u, py = side ? u : 0.1;
            x = cx + px * Math.cos(o) - py * Math.sin(o); y = cy + px * Math.sin(o) + py * Math.cos(o);
          }
          else if (m.kind === "pole") { [x, y] = P(R, o + m.q * Math.PI / 2); x += m.jx; y += m.jy; }
          else if (m.kind === "trail") [x, y] = P(R + 0.08, Math.PI + turned * m.u);
          else { [x, y] = P(R, o); x += m.jx; y += m.jy; }
          const [bc, ba] = BASE[m.kind], on = m.props.includes(ph);
          let a = on ? 1 : ba * 0.55, c = on ? CHECKS[ph].c : bc;
          if (m.kind === "trail") a = ph === 2 && turned > 0.02 ? 0.8 : 0;
          if (m.kind === "mark") { a = 1; c = "gold"; }
          out[i] = { x, y, a, c };
        });
        return out;
      },
      labels: [
        { x: grids[0].cx, y: ly - half - 0.1, html: "tell it apart", cls: "tag" },
        { x: grids[1].cx, y: ly - half - 0.1, html: "recognize it again", cls: "tag" },
        { x: cx, y: cy, html: "<i>A</i>", cls: "slot c-math", at: t => P(R - 0.15, rot(t)) },
        ...CHECKS.flatMap((c, k) => {
          const y = cy + 0.34 - k * 0.34;
          return [
            { x: 0.46, y, html: "", cls: "role left " + c.cls, live: lit(k, c.name) },
            { x: 0.46, y: y - 0.13, html: "", cls: "example left", live: lit(k, c.mean) }
          ];
        }),
        { x: cx, y: -1.06, html: "", cls: "example", live: t => t < S0 ? "the right angle between 1 and <i>i</i>" : t < S1 ? "half a rotation, and the circle is as it was" : t < S2 ? "a full rotation, and <i>A</i> is back" : "the form changed, the identity held" }
      ]
    };
  };

  /* Continuous and discrete, both ways. Left: Shannon's bits approach a continuous curve by
     composing discreteness, each added bit doubling the levels. Right: the circle turns
     continuously, measured by π and e, and every full turn lands on a whole number. */
  SCENES.gbridge = () => {
    const bx = -0.9, bw = 1.1, bh = 0.8, by = 0.02, f = u => Math.sin(Math.PI * u);
    const cx = 0.86, cy = 0.02, R = 0.42, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 90; k++) { const u = k / 89; add({ kind: "fixed", x: bx - bw / 2 + bw * u, y: by - bh / 2 + bh * f(u), a: 0.3 }, { x: 0, y: 0, c: "paper", a: 0.3, s: 0.7 }); }
    for (let k = 0; k < 40; k++) add({ kind: "fixed", x: bx - bw / 2 + (bw * k) / 39, y: by - bh / 2, a: 0.3 }, { x: 0, y: 0, c: "dim", a: 0.3, s: 0.7 });
    for (let k = 0; k < 150; k++) add({ kind: "step", u: (k + 0.5) / 150 }, { x: bx, y: by, c: "cyan", a: 0.9, s: 0.95 });
    for (let k = 0; k < 150; k++) { const [x, y] = at(cx, cy, R, (k / 150) * TAU); add({ kind: "fixed", x, y, a: 0.4 }, { x, y, c: "ice", a: 0.4, s: 0.8 }); }
    for (let k = 0; k < 10; k++) add({ kind: "fixed", x: cx + R + 0.04 + k * 0.012, y: cy, a: 0.8 }, { x: 0, y: 0, c: "paper", a: 0.8, s: 0.8 });
    for (let k = 0; k < 26; k++) add({ kind: "hand", u: k / 25 }, { x: cx, y: cy, c: "cyan", a: 0.8, s: 0.9 });
    for (let k = 0; k < 90; k++) add({ kind: "trail", u: k / 89 }, { x: cx, y: cy, c: "violet", a: 0.7, s: 0.85 });
    for (let k = 0; k < 18; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: cx + R, y: cy, c: "gold", a: 1, s: 1.3 });
    const bits = t => 1 + (Math.floor(t / 1.8) % 5), theta = t => t * 1.15;
    const out = new Array(points.length);
    return {
      points, stillT: 6.6,
      dynamic: t => {
        const L = 2 ** bits(t), th = theta(t), part = th % TAU;
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "step") { const q = Math.round(f(m.u) * (L - 1)) / (L - 1); out[i] = { x: bx - bw / 2 + bw * m.u, y: by - bh / 2 + bh * q, a: 0.9 }; }
          else if (m.kind === "hand") { const [x, y] = at(cx, cy, R * m.u, th); out[i] = { x, y, a: 0.8 }; }
          else if (m.kind === "trail") { const [x, y] = at(cx, cy, R + 0.08, part * m.u); out[i] = { x, y, a: part > 0.05 ? 0.7 : 0 }; }
          else { const [x, y] = at(cx, cy, R, th); out[i] = { x: x + m.jx, y: y + m.jy, a: 1 }; }
        });
        return out;
      },
      labels: [
        { x: bx, y: 0.72, html: "Shannon’s bit", cls: "role" },
        { x: cx, y: 0.72, html: "the circle", cls: "role" },
        { x: bx, y: -0.58, html: "", cls: "slot", live: t => `${bits(t)} bit${bits(t) > 1 ? "s" : ""}, ${2 ** bits(t)} levels` },
        { x: cx, y: -0.58, html: "", cls: "slot c-math", live: t => { const n = Math.floor(theta(t) / TAU); return `${((theta(t) % TAU) / Math.PI).toFixed(2)}<i>π</i> · ${n} whole rotation${n === 1 ? "" : "s"}`; } },
        { x: bx, y: -0.78, html: "discreteness composed toward the continuous", cls: "example" },
        { x: cx, y: -0.78, html: "the continuous closing on whole numbers", cls: "example" }
      ]
    };
  };

  /* The three parts of Shannon's theory, side by side: the bit (two marks, 0 and 1), entropy (the tree of
     yes-or-no questions that finds one of eight messages) and noise (a row of bits with one flipped on the way). */
  SCENES.gshannon3 = () => {
    const XB = -0.86, XE = 0.04, XN = 0.94, shapes = [];
    shapes.push({ pts: segPts(XB - 0.2, 0.02, XB + 0.2, 0.02, 24), c: "dim", a: 0.5, s: 0.7, at: 0 });
    shapes.push({ pts: blobPts(XB - 0.2, 0.02, 0.03, 10), c: "ice", a: 1, s: 1.1, at: 0 }, { pts: blobPts(XB + 0.2, 0.02, 0.03, 10), c: "cyan", a: 1, s: 1.1, at: 0.2 });
    [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(([a, b, c, d]) => shapes.push({ pts: segPts(XE + 0.22 * a, 0.03 + 0.22 * b, XE + 0.22 * c, 0.03 + 0.22 * d, 18), c: "dim", a: 0.5, s: 0.6, at: 0.3 }));
    for (let k = 0; k < 18; k++) { const r1 = Math.sin(k * 12.9898) * 43758.5453, r2 = Math.sin(k * 78.233) * 12345.678; shapes.push({ pts: blobPts(XE - 0.19 + 0.38 * (r1 - Math.floor(r1)), -0.16 + 0.38 * (r2 - Math.floor(r2)), 0.014, 5), c: "gold", a: 0.9, s: 0.9, at: 0.4 + k * 0.03 }); }
    const bits = [0, 1, 1, 0, 1];
    bits.forEach((b, k) => { const x = XN + (k - 2) * 0.1; shapes.push({ pts: blobPts(x, 0.16, 0.022, 7), c: b ? "cyan" : "ice", a: 0.95, s: 1, at: 0.5 }); shapes.push({ pts: blobPts(x, -0.12, 0.022, 7), c: k === 2 ? "coral" : b ? "cyan" : "ice", a: 0.95, s: 1, at: 1.0 }); });
    shapes.push({ pts: Array.from({ length: 30 }, (_, k) => [XN - 0.24 + 0.48 * k / 29, 0.02 + 0.03 * Math.sin(k * 2.3) * Math.cos(k * 1.1)]), c: "coral", a: 0.5, s: 0.6, at: 0.8 });
    return tScene({
      shapes, stillT: 2,
      labels: [
        { x: XB, y: 0.52, html: "the bit", cls: "role" }, { x: XE, y: 0.52, html: "entropy", cls: "role" }, { x: XN, y: 0.52, html: "noise", cls: "role" },
        { x: XB - 0.2, y: -0.1, html: "0", cls: "slot" }, { x: XB + 0.2, y: -0.1, html: "1", cls: "slot" },
        { x: XN - 0.36, y: 0.16, html: "sent", cls: "fword right" }, { x: XN - 0.36, y: -0.12, html: "received", cls: "fword right" },
        { x: XB, y: -0.48, html: "a choice between two", cls: "example" }, { x: XE, y: -0.48, html: "how much we do not know", cls: "example" }, { x: XN, y: -0.48, html: "a change on the way", cls: "example" }
      ]
    });
  };

  /* Wave or particle: one turning point and its two sides. To the left, its height over time drawn out as a
     continuous wave (the side seen as it moves: symmetry); to the right, each completed return counted as a separate
     mark (the side seen as it is counted: perpendicularity). Underneath, the names each field gives the two sides,
     aligned with them. */
  SCENES.gharmony = () => {
    const CX = 0.02, CY = 0.42, R = 0.17, T = 2.4, WL = -1.12, MX = 0.36, MD = 0.12, NM = 7, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let q = 0; q < 80; q++) add({ kind: "fixed" }, { x: CX + R * Math.cos(q / 80 * TAU), y: CY + R * Math.sin(q / 80 * TAU), c: "dim", a: 0.45, s: 0.65 });
    for (let q = 0; q < 8; q++) add({ kind: "pt", j: [gauss() * 0.01, gauss() * 0.01] }, { x: CX, y: CY, c: "gold", a: 1, s: 1.2 });
    for (let q = 0; q < 12; q++) add({ kind: "arm", u: q / 11 }, { x: CX, y: CY, c: "ice", a: 0.6, s: 0.6 });
    for (let q = 0; q < 150; q++) add({ kind: "wave", u: q / 149 }, { x: CX, y: CY, c: "cyan", a: 0.9, s: 0.8 });
    for (let q = 0; q < 12; q++) add({ kind: "link", u: q / 11 }, { x: CX, y: CY, c: "dim", a: 0.4, s: 0.55 });
    for (let k = 0; k < NM; k++) for (let q = 0; q < 6; q++) add({ kind: "mark", k, j: [gauss() * 0.01, gauss() * 0.01] }, { x: MX + k * MD, y: CY, c: "gold", a: 0, s: 1.1 });
    for (let q = 0; q < 70; q++) add({ kind: "fixed" }, { x: -1.08 + 2.3 * q / 69, y: 0.13, c: "dim", a: 0.3, s: 0.5 });
    const ang = t => Math.PI / 2 - TAU * t / T;
    const out = new Array(points.length);
    return {
      points, stillT: 3 * T + 0.6,
      dynamic: t => {
        const a = ang(t), px = CX + R * Math.cos(a), py = CY + R * Math.sin(a), done = Math.floor(t / T) % (NM + 1);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: points[i].a }; return; }
          if (m.kind === "pt") { out[i] = { x: px + m.j[0], y: py + m.j[1], a: 1 }; return; }
          if (m.kind === "arm") { out[i] = { x: CX + (px - CX) * m.u, y: CY + (py - CY) * m.u, a: 0.6 }; return; }
          if (m.kind === "wave") { const x = CX - R - 0.06 - (CX - R - 0.06 - WL) * m.u, tt = t - 1.4 * T * m.u; out[i] = { x, y: CY + R * Math.sin(ang(tt)), a: 0.9 * (1 - 0.6 * m.u) }; return; }
          if (m.kind === "link") { const x0 = CX - R - 0.06; out[i] = { x: px + (x0 - px) * m.u, y: py, a: 0.35 }; return; }
          out[i] = { x: MX + m.k * MD + m.j[0], y: CY + m.j[1], a: m.k < done ? 1 : 0.08 };
        });
        return out;
      },
      labels: [
        { x: (WL + CX - R) / 2, y: 0.74, html: "as it moves", cls: "role" }, { x: MX + 3 * MD, y: 0.74, html: "as it is counted", cls: "role" },
        { x: MX + 3 * MD, y: CY - 0.12, html: "", cls: "fword", live: t => { const n = Math.floor(t / T) % (NM + 1); return n === 1 ? "1 return" : `${n} returns`; } },
        ...[["physics", "wave", "particle"], ["mathematics", "continuous", "discrete"], ["music", "the vibration", "its notes"], ["information", "closure", "entropy"], ["space", "symmetry", "perpendicularity"]].flatMap(([f, l, r], k) => [
          { x: CX, y: -0.02 - k * 0.17, html: f, cls: "role" },
          { x: (WL + CX - R) / 2, y: -0.02 - k * 0.17, html: l, cls: "slot" },
          { x: MX + 3 * MD, y: -0.02 - k * 0.17, html: r, cls: "slot" }])
      ]
    };
  };

  /* Physics is already harmony: the waves that fit a space. Left, a circle with a wave going around it three times.
     Middle, the sphere's waves as the real orbital shapes, in rows of 1 (s), 3 (p), 5 (d) and 7 (f), each drawn from
     its angular function and turning slowly. Right, hydrogen's energy levels on the three-sphere, each level the
     sphere's rows added up, drawn as dots in the same colours: 1, 1 + 3, 1 + 3 + 5, 1 + 3 + 5 + 7. */
  SCENES.gphysharm = () => {
    const XA = -1.05, XB = -0.12, XC = 1.0, Y0 = 0.1, RY = l => 0.44 - l * 0.22, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const COL = ["gold", "cyan", "mint", "violet"];
    for (let q = 0; q < 120; q++) add({ kind: "ring", b: q / 120 * TAU }, { x: XA, y: Y0, c: "cyan", a: 0.95, s: 0.85 });
    for (let q = 0; q < 80; q++) add({ kind: "fixed" }, { x: XA + 0.22 * Math.cos(q / 80 * TAU), y: Y0 + 0.22 * Math.sin(q / 80 * TAU), c: "dim", a: 0.3, s: 0.55 });
    const ORB = [[() => 1],                                                   // the real orbital shapes, by row
      [(x, y, z) => x, (x, y, z) => y, (x, y, z) => z],
      [(x, y, z) => x * y, (x, y, z) => y * z, (x, y, z) => x * z, (x, y, z) => x * x - y * y, (x, y, z) => 2 * z * z - x * x - y * y],
      [(x, y, z) => x * (x * x - 3 * y * y), (x, y, z) => y * (3 * x * x - y * y), (x, y, z) => z * (x * x - y * y), (x, y, z) => x * y * z,
       (x, y, z) => x * (5 * z * z - 1), (x, y, z) => y * (5 * z * z - 1), (x, y, z) => z * (5 * z * z - 3)]];
    const fib = n => Array.from({ length: n }, (_, k) => { const y = 1 - 2 * (k + 0.5) / n, r = Math.sqrt(1 - y * y), a = k * 2.39996; return [r * Math.cos(a), y, r * Math.sin(a)]; });
    const dirs = fib(70);
    ORB.forEach((row, l) => row.forEach((f, k) => { const v = dirs.map(([x, y, z]) => Math.abs(f(x, y, z))), mx = Math.max(...v);
      dirs.forEach((d, q) => add({ kind: "orb", l, cx: XB + (k - l) * 0.125, cy: RY(l), p: d, r: v[q] / mx }, { x: XB, y: RY(l), c: COL[l], a: 0.8, s: 0.65 })); }));
    for (let n = 1; n <= 4; n++) { let x = 0; const cells = []; for (let l = 0; l < n; l++) { for (let k = 0; k < 2 * l + 1; k++) { cells.push([x, l]); x += 0.034; } x += 0.02; }
      const w = x - 0.054; cells.forEach(([cx, l]) => add({ kind: "fixed" }, { x: XC - w / 2 + cx, y: RY(n - 1), c: COL[l], a: 0.95, s: 1.0 })); }
    const out = new Array(points.length);
    return {
      points, stillT: 1.5,
      dynamic: t => {
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: points[i].a }; return; }
          if (m.kind === "ring") { const r = 0.22 + 0.05 * Math.sin(3 * m.b) * Math.cos(t * 1.6); out[i] = { x: XA + r * Math.cos(m.b), y: Y0 + r * Math.sin(m.b), a: 0.95 }; return; }
          const R = 0.06 * m.r, [x, y, d] = view3(m.p[0] * R, m.p[1] * R, m.p[2] * R, 0.5 + t * 0.25, 0.45);
          out[i] = { x: m.cx + x, y: m.cy + y, a: (0.35 + 0.6 * d) * Math.min(1, m.r * 1.6) };
        });
        return out;
      },
      labels: [
        { x: XA, y: 0.7, html: "a circle", cls: "role" }, { x: XB, y: 0.7, html: "a sphere", cls: "role" }, { x: XC, y: 0.7, html: "the three-sphere", cls: "role" },
        ...["s", "p", "d", "f"].map((h, l) => ({ x: XB - 0.5, y: RY(l), html: `${h}, ${2 * l + 1}`, cls: "slot right" })),
        ...["1", "4", "9", "16"].map((h, n) => ({ x: XC + 0.34, y: RY(n), html: h, cls: "slot left" })),
        { x: XA, y: -0.36, html: "whole numbers of waves around", cls: "fword" }, { x: XA, y: -0.46, html: "the notes of a string", cls: "fword" },
        { x: XB, y: -0.5, html: "orbital shapes", cls: "fword" }, { x: XB, y: -0.6, html: "around a nucleus", cls: "fword" },
        { x: XC, y: -0.5, html: "hydrogen's levels", cls: "fword" }, { x: XC, y: -0.6, html: "with spin: 2, 8, 18, 32", cls: "fword" },
        { x: -0.08, y: -0.82, html: "the shape of the space decides which waves fit", cls: "example" }
      ]
    };
  };

  /* The four rungs as one object: the layers drawn together, each inside the next. The bit's two points sit on
     the circle; the circle is the core of the three-sphere, drawn by stereographic projection as nested tori
     covered in linked circles (its Hopf fibres); the seven-sphere, which holds the three-sphere as one of its
     fibres, is drawn as the outer shell. The whole turns slowly. */
  SCENES.gonion = () => {
    const CX = -0.42, CY = 0.0, S = 0.2, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const st = (eta, t1, t2) => { const x1 = Math.cos(eta) * Math.cos(t1), y1 = Math.cos(eta) * Math.sin(t1), x2 = Math.sin(eta) * Math.cos(t2), y2 = Math.sin(eta) * Math.sin(t2), d = 1 - y2; return [S * x1 / d, S * x2 / d, S * y1 / d]; };
    for (let q = 0; q < 70; q++) add({ kind: "p3", p: st(0, q / 70 * TAU, 0), c: "cyan" }, { x: CX, y: CY, c: "cyan", a: 1, s: 0.95 });
    [0, Math.PI].forEach(a => { for (let q = 0; q < 8; q++) add({ kind: "p3", p: st(0, a, 0).map(v => v + gauss() * 0.006), c: "gold", bright: 1 }, { x: CX, y: CY, c: "gold", a: 1, s: 1.2 }); });
    for (let f = 0; f < 8; f++) for (let q = 0; q < 44; q++) { const th = q / 44 * TAU; add({ kind: "p3", p: st(0.8, th, th + f / 8 * TAU), c: "mint", cut: 1 }, { x: CX, y: CY, c: "mint", a: 0.7, s: 0.7 }); }   // one layer of the three-sphere: a torus of linked circles
    const fib = n => Array.from({ length: n }, (_, k) => { const y = 1 - 2 * (k + 0.5) / n, r = Math.sqrt(1 - y * y), a = k * 2.39996; return [r * Math.cos(a) * 0.74, y * 0.74, r * Math.sin(a) * 0.74]; });
    fib(340).forEach(p => add({ kind: "p3", p, c: "violet", shell: 1, cut: 1 }, { x: CX, y: CY, c: "violet", a: 0.3, s: 0.65 }));
    const out = new Array(points.length);
    return {
      points, stillT: 2,
      dynamic: t => { const yaw = 0.5 + t * 0.12; meta.forEach((m, i) => { const [x, y, d] = view3(m.p[0], m.p[1], m.p[2], yaw, 0.38);
        const cut = m.cut && x > 0.02 && d > 0.42;                         // the front-right part is cut away, like a sliced onion
        out[i] = { x: CX + x, y: CY + y, a: cut ? 0 : m.shell ? 0.25 + 0.5 * d : m.bright ? 1 : m.c === "cyan" ? 1 : 0.22 + 0.7 * d }; }); return out; },
      labels: [
        ...[["ℝ", "two points", "the bit", "c-math"], ["ℂ", "the circle", "numbers, phase, electromagnetism", "c-cyan"], ["ℍ", "the three-sphere", "spacetime, spin, the weak force", "c-mint"], ["𝕆", "the seven-sphere", "the strong force, and the eight directions a superstring vibrates in", "c-violet"]].flatMap(([sym, nm, ph, c], k) => [
          { x: 0.42, y: 0.6 - k * 0.36, html: sym, cls: `math upright ${c}` },
          { x: 0.56, y: 0.64 - k * 0.36, html: nm, cls: "slot left" },
          { x: 0.56, y: 0.53 - k * 0.36, html: ph, cls: "fword left", w: 0.8 }]),
        { x: CX, y: -0.86, html: "each layer is filled with copies of the one inside it", cls: "example" }
      ]
    };
  };

  /* Where are the particles and forces: the symmetry of each force is a layer. The unit circle of ℂ (U(1),
     electromagnetism), the unit three-sphere of ℍ drawn as linked circles (SU(2), the weak force), and the Fano plane,
     the multiplication diagram of the octonions, whose symmetries fixing one direction are SU(3), the strong force. */
  SCENES.gfurey = () => {
    const XA = -0.95, XB = -0.05, XC = 0.88, Y = 0.12, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let q = 0; q < 90; q++) add({ kind: "fixed" }, { x: XA + 0.24 * Math.cos(q / 90 * TAU), y: Y + 0.24 * Math.sin(q / 90 * TAU), c: "cyan", a: 0.8, s: 0.8 });
    for (let q = 0; q < 8; q++) add({ kind: "pt", j: [gauss() * 0.01, gauss() * 0.01] }, { x: XA, y: Y, c: "gold", a: 1, s: 1.15 });
    const st = (eta, t1, t2) => { const x1 = Math.cos(eta) * Math.cos(t1), y1 = Math.cos(eta) * Math.sin(t1), x2 = Math.sin(eta) * Math.cos(t2), y2 = Math.sin(eta) * Math.sin(t2), d = 1 - y2; return [0.1 * x1 / d, 0.1 * x2 / d, 0.1 * y1 / d]; };
    for (let f = 0; f < 7; f++) for (let q = 0; q < 40; q++) { const th = q / 40 * TAU; add({ kind: "hopf", p: st(0.75, th, th + f / 7 * TAU) }, { x: XB, y: Y, c: "mint", a: 0.7, s: 0.7 }); }
    const R = 0.28, V = [90, 210, 330].map(d => [Math.cos(d / DEG) * R, Math.sin(d / DEG) * R]);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], M = [mid(V[1], V[2]), mid(V[2], V[0]), mid(V[0], V[1])];
    const line = (a, b, n) => { for (let q = 0; q < n; q++) { const u = q / (n - 1); add({ kind: "fixed" }, { x: XC + a[0] + (b[0] - a[0]) * u, y: Y + a[1] + (b[1] - a[1]) * u, c: "violet", a: 0.55, s: 0.65 }); } };
    line(V[0], V[1], 30); line(V[1], V[2], 30); line(V[2], V[0], 30); V.forEach((v, k) => line(v, M[k], 26));
    for (let q = 0; q < 60; q++) add({ kind: "fixed" }, { x: XC + 0.14 * Math.cos(q / 60 * TAU), y: Y + 0.14 * Math.sin(q / 60 * TAU), c: "violet", a: 0.55, s: 0.65 });
    [...V, ...M, [0, 0]].forEach(([x, y]) => { for (let q = 0; q < 6; q++) add({ kind: "fixed" }, { x: XC + x + gauss() * 0.008, y: Y + y + gauss() * 0.008, c: "gold", a: 1, s: 1.05 }); });
    const out = new Array(points.length);
    return {
      points, stillT: 1,
      dynamic: t => { meta.forEach((m, i) => {
        if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: points[i].a }; return; }
        if (m.kind === "pt") { const a = t * 0.8; out[i] = { x: XA + 0.24 * Math.cos(a) + m.j[0], y: Y + 0.24 * Math.sin(a) + m.j[1], a: 1 }; return; }
        const [x, y, d] = view3(m.p[0], m.p[1], m.p[2], 0.5 + t * 0.25, 0.5); out[i] = { x: XB + x, y: Y + y, a: 0.25 + 0.7 * d }; }); return out; },
      labels: [
        { x: XA, y: 0.6, html: "ℂ", cls: "math upright c-cyan" }, { x: XB, y: 0.6, html: "ℍ", cls: "math upright c-mint" }, { x: XC, y: 0.6, html: "𝕆", cls: "math upright c-violet" },
        { x: XA, y: -0.32, html: "the unit circle", cls: "slot" }, { x: XA, y: -0.43, html: "U(1): electromagnetism", cls: "fword" },
        { x: XB, y: -0.32, html: "the unit three-sphere", cls: "slot" }, { x: XB, y: -0.43, html: "SU(2): the weak force", cls: "fword" },
        { x: XC, y: -0.32, html: "the octonions' symmetries", cls: "slot" }, { x: XC, y: -0.43, html: "holding SU(3): the strong force", cls: "fword" },
        { x: -0.05, y: -0.74, html: "and from ℝ ⊗ ℂ ⊗ ℍ ⊗ 𝕆, one generation of quarks and leptons with their charges", cls: "example" }
      ]
    };
  };

  /* The Ruliad, in three pictures. Left, a network grown by one rewriting rule, every edge x→y gaining an edge y→z,
     so it branches out into space. Middle, the branching and merging of every possible history, the multiway graph,
     with time flowing down it. Right, the space of those branches, which Gorard showed has the geometry of quantum
     states, the sphere of one qubit. */
  SCENES.gruliad = () => {
    const XA = -0.95, XB = -0.05, XC = 0.88, Y = 0.1, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const nodes = [{ a: 0, r: 0, d: 0 }], edges = [];                       // grown by {x,y} -> {x,y},{y,z}, laid out by angle
    let frontier = [0];
    for (let step = 1; step <= 5; step++) { const next = []; frontier.forEach((n, k) => { for (let c = 0; c < 2; c++) { const span = TAU / Math.pow(2, step), a = nodes[n].a + (c - 0.5) * span; nodes.push({ a, r: step * 0.062, d: step }); edges.push([n, nodes.length - 1, step]); next.push(nodes.length - 1); } }); frontier = next; }
    const pos = n => [XA + nodes[n].r * Math.cos(nodes[n].a + 1.2), Y + nodes[n].r * Math.sin(nodes[n].a + 1.2)];
    edges.forEach(([a, b, d]) => { for (let q = 0; q < 6; q++) add({ kind: "net", d, a, b, u: q / 5 }, { x: XA, y: Y, c: "cyan", a: 0, s: 0.7 }); });
    nodes.forEach((n, k) => add({ kind: "node", d: n.d, k }, { x: XA, y: Y, c: "ice", a: 0, s: 1.0 }));
    const LV = [1, 2, 3, 4, 5], MY = l => Y + 0.3 - l * 0.15, MX = (l, i) => XB + (i - (LV[l] - 1) / 2) * 0.12;
    for (let l = 0; l < 4; l++) for (let i = 0; i < LV[l]; i++) [i, i + 1].forEach(j => { for (let q = 0; q < 10; q++) { const u = q / 9; add({ kind: "fixed" }, { x: MX(l, i) + (MX(l + 1, j) - MX(l, i)) * u, y: MY(l) + (MY(l + 1) - MY(l)) * u, c: "dim", a: 0.45, s: 0.6 }); }
      add({ kind: "flow", x0: MX(l, i), y0: MY(l), x1: MX(l + 1, j), y1: MY(l + 1), ph: (i * 0.37 + j * 0.19 + l * 0.23) % 1 }, { x: XB, y: Y, c: "gold", a: 0.9, s: 0.95 }); });
    for (let l = 0; l < 5; l++) for (let i = 0; i < LV[l]; i++) for (let q = 0; q < 4; q++) add({ kind: "fixed" }, { x: MX(l, i) + gauss() * 0.006, y: MY(l) + gauss() * 0.006, c: "ice", a: 1, s: 1.0 });
    const fib = n => Array.from({ length: n }, (_, k) => { const y = 1 - 2 * (k + 0.5) / n, r = Math.sqrt(1 - y * y), a = k * 2.39996; return [r * Math.cos(a), y, r * Math.sin(a)]; });
    fib(220).forEach(p => add({ kind: "sph", p }, { x: XC, y: Y, c: "violet", a: 0.5, s: 0.65 }));
    for (let q = 0; q < 8; q++) add({ kind: "state", j: [gauss() * 0.01, gauss() * 0.01] }, { x: XC, y: Y, c: "gold", a: 1, s: 1.15 });
    const out = new Array(points.length), P = 12;
    return {
      points, stillT: 6.5,
      dynamic: t => { const c = t % P, grown = Math.min(5, c / 1.3);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: points[i].a }; return; }
          if (m.kind === "net") { const [x0, y0] = pos(m.a), [x1, y1] = pos(m.b), show = Math.max(0, Math.min(1, grown - m.d + 1)); out[i] = { x: x0 + (x1 - x0) * m.u * show, y: y0 + (y1 - y0) * m.u * show, a: show > 0 ? 0.7 : 0 }; return; }
          if (m.kind === "node") { const [x, y] = pos(m.k); out[i] = { x, y, a: grown >= m.d ? 0.95 : 0 }; return; }
          if (m.kind === "flow") { const u = (m.ph + t * 0.35) % 1; out[i] = { x: m.x0 + (m.x1 - m.x0) * u, y: m.y0 + (m.y1 - m.y0) * u, a: 0.9 * Math.sin(Math.PI * u) }; return; }
          if (m.kind === "sph") { const [x, y, d] = view3(m.p[0] * 0.25, m.p[1] * 0.25, m.p[2] * 0.25, t * 0.2, 0.35); out[i] = { x: XC + x, y: Y + y, a: 0.12 + 0.5 * d }; return; }
          const [x, y] = view3(0.25 * Math.cos(t * 0.6) * 0.8, 0.25 * 0.6, 0.25 * Math.sin(t * 0.6) * 0.8, t * 0.2, 0.35); out[i] = { x: XC + x + m.j[0], y: Y + y + m.j[1], a: 1 };
        }); return out; },
      labels: [
        { x: XA, y: 0.62, html: "a rule rewrites a network", cls: "slot" }, { x: XB, y: 0.62, html: "every possible history", cls: "slot" }, { x: XC, y: 0.62, html: "the space of branches", cls: "slot" },
        { x: XA, y: -0.36, html: "seen from far away, space", cls: "fword" }, { x: XB, y: -0.36, html: "all of them together, the Ruliad", cls: "fword" }, { x: XC, y: -0.36, html: "the sphere of quantum states", cls: "fword" }
      ]
    };
  };

  /* Shannon's noisy channel on the cube: only 000 and 111 are used as messages, three flips apart. A message
     is sent, noise flips one bit on the way, and the corner that arrives is still closest to the one sent. */
  SCENES.gnoisecube = () => {
    const V = cubeVerts(3), E = cubeEdges(V), sc = 0.4, cx = -0.36, cy = 0.02, P = 12, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const name = k => k.toString(2).padStart(3, "0"), idx = str => parseInt(str, 2);
    const EP = [["000", "100"], ["111", "101"], ["000", "001"]];          // sent, received after one flip
    E.forEach(([a, b]) => { for (let k = 0; k < 16; k++) { const u = k / 15; add({ kind: "edge", p: V[a].map((x, j) => x + (V[b][j] - x) * u) }, { x: cx, y: cy, c: "dim", a: 0.35, s: 0.7 }); } });
    V.forEach((p, k) => { const code = k === 0 || k === 7; for (let q = 0; q < (code ? 14 : 4); q++) add({ kind: "vert", p, code, b: q / 14 * TAU }, { x: cx, y: cy, c: code ? "gold" : "dim", a: 0.7, s: code ? 0.9 : 0.8 }); });
    for (let q = 0; q < 12; q++) add({ kind: "msg", j: [gauss() * 0.02, gauss() * 0.02, gauss() * 0.02] }, { x: cx, y: cy, c: "paper", a: 1, s: 1.3 });
    for (let q = 0; q < 14; q++) add({ kind: "back", u: q / 13 }, { x: cx, y: cy, c: "mint", a: 0.9, s: 0.9 });
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    const ep = t => { const c = ((t % P) + P) % P; return { e: Math.floor(c / 4), c: c % 4 }; };
    const Pj = (p, t) => { const [X, Y, d] = view3(p[0] * sc, p[1] * sc, p[2] * sc, 1.75 + 0.35 * Math.sin(t * 0.25), -0.45); return [cx + X, cy + Y, d]; };   // turned so 000 and 111 stay far apart on screen
    const out = new Array(points.length);
    return {
      points, period: P, stillT: 2.6,
      dynamic: t => {
        const { e, c } = ep(t), [sent, recv] = EP[e], A = V[idx(sent)], B = V[idx(recv)], fly = sm((c - 0.9) / 0.8);
        meta.forEach((m, i) => {
          let p, a = 1;
          if (m.kind === "edge") { p = m.p; a = 0.38; }
          else if (m.kind === "vert") { p = m.code ? m.p.map((x, j) => x + 0.09 * [Math.cos(m.b), Math.sin(m.b), 0][j]) : m.p; a = m.code ? 0.85 : 0.6; }
          else if (m.kind === "msg") { p = A.map((x, j) => x + (B[j] - x) * fly + m.j[j]); a = c < 3.7 ? 1 : 0.3; }
          else { const show = sm((c - 1.9) / 0.6); p = B.map((x, j) => x + (A[j] - x) * m.u * show); a = c > 1.9 && c < 3.8 && m.u <= show ? 0.9 : 0; }
          const [x, y, d] = Pj(p, t);
          out[i] = { x, y, a: a * (0.55 + 0.45 * d) };
        });
        return out;
      },
      labels: [
        { x: cx, y: 0.78, html: "every bit sent three times: 000 for 0, 111 for 1", cls: "example" },
        ...[0, 7].map(k => ({ x: 0, y: 0, html: name(k), cls: "slot", at: t => { const [x, y] = Pj(V[k], t); return [x + (k ? -0.11 : 0.11), y + (k ? 0.06 : -0.06)]; } })),
        { x: cx, y: -0.72, html: "one flipped bit still leaves the message that was sent closest", cls: "example" },
        ...[["sent", t => EP[ep(t).e][0]], ["received", t => ep(t).c > 1.7 ? EP[ep(t).e][1] : "…"], ["read as", t => ep(t).c > 2.4 ? EP[ep(t).e][0] : "…"]].flatMap(([tag, v], k) => [
          { x: 0.72, y: 0.42 - k * 0.34, html: tag, cls: "tag left" },
          { x: 0.72, y: 0.28 - k * 0.34, html: "", cls: "slot left", live: v }
        ])
      ]
    };
  };

  /* Level B, the turn preserves identity, as one moving picture. The lighter in the middle is a field of light
     (detail up to 7 waves across; its outline is drawn where the light is half its peak). I stand on the inner
     ring and you on the outer one; each of us reads the field on our own grid of points, turned to face our own
     direction, and each point glows with the light it reads, so both grids show the lighter. As we drift around,
     our grids turn with us and the angle between us changes, while what each of us rebuilds from our samples
     (least squares on the field's 225 parts, solved once for a grid square to the lighter and one turned 41°)
     stays the same lighter. */
  let gsampleCache = null;
  SCENES.gsample = () => {
    const K = 7, G = 64, n = 16, X0 = -0.3, Y0 = 0.0, S = 0.62, RC = 0.31, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const soft = (d, w = 0.018) => 1 / (1 + Math.exp(d / w));
    const mask = (x, y) => Math.max(soft(Math.max(Math.abs(x - 0.5) - 0.12, 0.14 - y, y - 0.56)),            // body
      0.75 * soft(Math.max(Math.abs(x - 0.5) - 0.1, 0.56 - y, y - 0.66)), 0.55 * soft(Math.hypot(x - 0.56, y - 0.61) - 0.035),   // cap, wheel
      Math.exp(-(((x - 0.47) / 0.045) ** 2 + ((y - 0.77) / 0.07) ** 2)));                                     // flame
    const KS = [[0, 0]]; for (let a = -K; a <= K; a++) for (let b = -K; b <= K; b++) if (a > 0 || (a === 0 && b > 0)) KS.push([a, b]);
    const basis = (x, y) => { const v = [1]; for (let q = 1; q < KS.length; q++) { const ph = TAU * (KS[q][0] * x + KS[q][1] * y); v.push(Math.cos(ph), Math.sin(ph)); } return v; };
    const M = 2 * KS.length - 1;
    const evalC = (c, x, y) => { const v = basis(x, y); let s = 0; for (let q = 0; q < M; q++) s += c[q] * v[q]; return s; };
    const solve = (A, bvec) => {                                             // least squares by normal equations and elimination
      const N = Array.from({ length: M }, () => new Array(M + 1).fill(0));
      A.forEach((row, r) => { for (let i = 0; i < M; i++) { N[i][M] += row[i] * bvec[r]; for (let j = 0; j < M; j++) N[i][j] += row[i] * row[j]; } });
      for (let c = 0; c < M; c++) {
        let piv = c; for (let r = c + 1; r < M; r++) if (Math.abs(N[r][c]) > Math.abs(N[piv][c])) piv = r;
        [N[c], N[piv]] = [N[piv], N[c]];
        for (let r = c + 1; r < M; r++) { const f = N[r][c] / N[c][c]; if (f) for (let j = c; j <= M; j++) N[r][j] -= f * N[c][j]; }
      }
      const x = new Array(M).fill(0);
      for (let r = M - 1; r >= 0; r--) { let s = N[r][M]; for (let j = r + 1; j < M; j++) s -= N[r][j] * x[j]; x[r] = s / N[r][r]; }
      return x;
    };
    if (!gsampleCache) {
      const coef = new Array(M).fill(0);                                     // the field's 225 parts, projected from the outline
      for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) { const x = (a + 0.5) / G, y = (b + 0.5) / G, m = mask(x, y), v = basis(x, y); for (let q = 0; q < M; q++) coef[q] += m * v[q] * (q ? 2 : 1) / (G * G); }
      const FG = 96, grid = [];                                              // the field on a fine grid, for reading it anywhere
      for (let a = 0; a < FG; a++) { grid.push([]); for (let b = 0; b < FG; b++) grid[a].push(evalC(coef, a / FG, b / FG)); }
      let fmax = 0; grid.forEach(r => r.forEach(v => { fmax = Math.max(fmax, v); }));
      const samples = turn => { const out = []; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const cx = (a + 0.5) / n - 0.5, cy = (b + 0.5) / n - 0.5, x = 0.5 + cx * Math.cos(turn) - cy * Math.sin(turn), y = 0.5 + cx * Math.sin(turn) + cy * Math.cos(turn); out.push([((x % 1) + 1) % 1, ((y % 1) + 1) % 1]); } return out; };
      const rebuilt = [0, 41 / DEG].map(turn => { const pts = samples(turn); return solve(pts.map(([x, y]) => basis(x, y)), pts.map(([x, y]) => evalC(coef, x, y))); });
      const RG = 64, rgrid = rebuilt.map(c => Array.from({ length: RG + 1 }, (_, a) => Array.from({ length: RG + 1 }, (_, b) => evalC(c, a / RG, b / RG) / fmax)));
      gsampleCache = { coef, grid, FG, fmax, rebuilt, rgrid, RG };
    }
    const { grid, FG, fmax, rebuilt, rgrid, RG } = gsampleCache;
    const read = (u, v) => {                                                 // the light at a point of the field, 0 to 1
      u = ((u % 1) + 1) % 1 * FG; v = ((v % 1) + 1) % 1 * FG;
      const a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b, A = (a + 1) % FG, B = (b + 1) % FG;
      const val = grid[a][b] * (1 - fu) * (1 - fv) + grid[A][b] * fu * (1 - fv) + grid[a][B] * (1 - fu) * fv + grid[A][B] * fu * fv;
      return Math.max(0, Math.min(1, val / fmax));
    };
    const toScene = (u, v) => [X0 + (u - 0.5) * S, Y0 + (v - 0.5) * S];
    // the lighter's outline: where the light crosses half its peak
    for (let a = 0; a < 80; a++) for (let b = 0; b < 80; b++) {
      const u = a / 80, v = b / 80, h = 1 / 80, c = read(u, v) - 0.5;
      [[h, 0], [0, h]].forEach(([du, dv]) => { const d = read(u + du, v + dv) - 0.5; if (c * d < 0) { const f = c / (c - d), [x, y] = toScene(u + du * f, v + dv * f); if (Math.hypot(x - X0, y - Y0) < RC) add({ kind: "fixed", a: 0.55 }, { x, y, c: "gold", a: 0.55, s: 0.7 }); } });
    }
    const h = S / n, L = Math.floor(RC / h);
    const OBS = [{ R: 0.5, a0: -Math.PI / 2, amp: 0.8, w: 0.3, ph: 0, c: "ice", who: "me" }, { R: 0.68, a0: -Math.PI / 2 + 0.72, amp: 1.0, w: 0.22, ph: 1.3, c: "cyan", who: "you" }];
    const ang = (oi, t) => { const o = OBS[oi]; return o.a0 + o.amp * Math.sin(o.w * t + o.ph); };
    OBS.forEach((o, oi) => {
      for (let k = 0; k < 120; k++) { const [x, y] = at(X0, Y0, o.R, k / 120 * TAU); add({ kind: "fixed", a: 0.16 }, { x, y, c: "dim", a: 0.16, s: 0.6 }); }
      for (let i = -L; i <= L; i++) for (let j = -L; j <= L; j++) if (Math.hypot(i, j) * h < RC) add({ kind: "sample", oi, i, j }, { x: X0, y: Y0, c: o.c, a: 0, s: 1.0 });
      for (let k = 0; k < 14; k++) add({ kind: "eye", oi, jx: gauss() * 0.014, jy: gauss() * 0.014 }, { x: X0, y: Y0, c: o.c, a: 1, s: 1.15 });
      for (let k = 0; k < 12; k++) add({ kind: "sight", oi, u: k / 11 }, { x: X0, y: Y0, c: o.c, a: 0.35, s: 0.65 });
    });
    for (let k = 0; k < 30; k++) add({ kind: "arc", u: k / 29 }, { x: X0, y: Y0, c: "gold", a: 0.8, s: 0.85 });
    const PX = 0.92, PY = [0.33, -0.33], PH = 0.24, NR = 14;
    rgrid.forEach((g, oi) => {                                               // each rebuild: its own light, and its outline where it crosses half the peak
      for (let a = 0; a < NR; a++) for (let b = 0; b < NR; b++) { const u = (a + 0.5) / NR, v = (b + 0.5) / NR, val = Math.max(0, Math.min(1, g[Math.round(u * RG)][Math.round(v * RG)]));
        add({ kind: "fixed", a: 0.03 + 0.5 * val }, { x: PX + (u - 0.5) * 2 * PH, y: PY[oi] + (v - 0.5) * 2 * PH, c: OBS[oi].c, a: 0, s: 0.8 }); }
      for (let a = 0; a < RG; a++) for (let b = 0; b < RG; b++) { const c = g[a][b] - 0.5;
        [[1, 0], [0, 1]].forEach(([da, db]) => { const d = g[a + da][b + db] - 0.5; if (c * d < 0 && (a + b) % 2 === 0) { const f = c / (c - d), u = (a + da * f) / RG, v = (b + db * f) / RG;
          add({ kind: "fixed", a: 0.8 }, { x: PX + (u - 0.5) * 2 * PH, y: PY[oi] + (v - 0.5) * 2 * PH, c: OBS[oi].c, a: 0, s: 0.75 }); } }); }
    });
    const between = t => { let d = ang(1, t) - ang(0, t); d = ((d % TAU) + TAU) % TAU; return d > Math.PI ? d - TAU : d; };
    const out = new Array(points.length);
    return {
      points, stillT: 2.4,
      dynamic: t => {
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: m.a }; return; }
          if (m.kind === "arc") { const a = ang(0, t) + between(t) * m.u, [x, y] = at(X0, Y0, RC + 0.06, a); out[i] = { x, y, a: 0.8 }; return; }
          const o = OBS[m.oi], a = ang(m.oi, t), [ex, ey] = at(X0, Y0, o.R, a);
          if (m.kind === "eye") out[i] = { x: ex + m.jx, y: ey + m.jy, a: 1 };
          else if (m.kind === "sight") { const r = o.R - (o.R - RC - 0.1) * m.u, [x, y] = at(X0, Y0, r, a); out[i] = { x, y, a: 0.35 }; }
          else {                                                             // my grid turns with me: its axes face my direction
            const turn = a + Math.PI / 2, c = Math.cos(turn), s2 = Math.sin(turn), gx = m.i * h, gy = m.j * h, x = X0 + gx * c - gy * s2, y = Y0 + gx * s2 + gy * c;
            out[i] = { x, y, a: 0.1 + 0.9 * read((x - X0) / S + 0.5, (y - Y0) / S + 0.5) };
          }
        });
        return out;
      },
      labels: [
        ...OBS.map((o, oi) => ({ x: 0, y: 0, html: o.who, cls: "word small", at: t => { const [x, y] = at(X0, Y0, o.R + 0.1, ang(oi, t)); return [x, y]; } })),
        { x: X0, y: -0.82, html: "", cls: "example", live: t => `the turn between us: ${Math.round(Math.abs(between(t)) * DEG)}°` },
        { x: PX, y: PY[0] + PH + 0.08, html: "what I rebuild", cls: "fword c-ice" },
        { x: PX, y: PY[1] + PH + 0.08, html: "what you rebuild", cls: "fword c-cyan" },
        { x: PX, y: -0.68, html: "the same lighter", cls: "example" }
      ]
    };
  };

  /* Euler: the turn through every angle, resting at the half and full turn, and each symbol's job on hover. */
  const SYMBOLS = [
    { w: "1", t: "The reference we hold.", d: "The starting direction and the unit length: every reading is taken against it, and a full rotation is recognized by coming back to it.", s: "Leonhard Euler, <i>Introductio in analysin infinitorum</i>, 1748" },
    { w: "i", t: "A right angle.", d: "Multiplying by <i>i</i> rotates a direction through a right angle, so two right angles reverse it and <i>i</i>² = −1.", s: "Caspar Wessel, 1799; Jean-Robert Argand, 1806: complex numbers as rotations in the plane" },
    { w: "π", t: "How much: half a rotation.", d: "The distance round a circle divided by the distance across it, the same at every size; measured in radius lengths, half a rotation is π and a full rotation is 2π.", s: "William Jones introduced the symbol, 1706; Euler made it standard" },
    { w: "e", t: "Continuous accumulation.", d: "The factor reached when change proportional to what already exists runs for one unit interval. Acting at right angles to the radius, the same accumulation rotates a direction instead of growing it, giving <i>e</i><sup><i>iθ</i></sup>.", s: "Jacob Bernoulli, 1683, on continuously compounded interest; Euler, 1748" },
    { w: "0", t: "The check.", d: "Half a rotation reaches the exact opposite of 1, and a direction plus its opposite leaves nothing: <i>e</i><sup><i>iπ</i></sup> + 1 = 0.", s: "The half-rotation value of Euler’s formula" }
  ];
  SCENES.geuler = () => {
    const nar = narrow(), cx = nar ? 0 : -0.62, cy = nar ? 0.3 : 0.08, R = nar ? 0.56 : 0.74, points = [], meta = [];
    for (let k = 0; k < 170; k++) { const [x, y] = at(cx, cy, R, (k / 170) * TAU); meta.push({ kind: "fixed", x, y, a: 0.4 }); points.push({ x, y, c: "ice", a: 0.4, s: 0.8 }); }
    for (const [dx, dy] of [[1, 0], [0, 1]]) for (let k = 0; k < 44; k++) {
      const u = -1.12 + (2.24 * k) / 43, x = cx + dx * u * R, y = cy + dy * u * R;
      meta.push({ kind: "fixed", x, y, a: 0.3 }); points.push({ x, y, c: "dim", a: 0.3, s: 0.7 });
    }
    for (let k = 0; k < 34; k++) { meta.push({ kind: "hand", u: k / 33 }); points.push({ x: cx, y: cy, c: "cyan", a: 0.95, s: 1 }); }
    for (let k = 0; k < 40; k++) { meta.push({ kind: "arc", u: k / 39 }); points.push({ x: cx, y: cy, c: "cyan", a: 0.6, s: 0.8 }); }
    /* a continuous turn that rests at the half turn and at the full turn */
    const theta = t => t < 3 ? Math.PI * ease(t / 3) : t < 4.5 ? Math.PI : t < 7.5 ? Math.PI * (1 + ease((t - 4.5) / 3)) : TAU;
    const reading = t => { const f = theta(t) / Math.PI; return f < 0.005 ? "0" : Math.abs(f - 1) < 0.005 ? "π" : f > 1.995 ? "2π" : `${f.toFixed(2)}π`; };
    const out = new Array(points.length);
    const names = ["1", "<i>i</i>", "−1", "−<i>i</i>"];
    return {
      points, period: 9, stillT: 3.8,
      dynamic: t => {
        const a = theta(t);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "hand") { const [x, y] = at(cx, cy, R * m.u, a); out[i] = { x, y, a: 0.95 }; }
          else { const [x, y] = at(cx, cy, R * 0.34, a * m.u); out[i] = { x, y, a: a > 0.05 ? 0.6 : 0 }; }
        });
        return out;
      },
      labels: [
        ...names.map((n, q) => { const [x, y] = at(cx, cy, R + 0.16, (q * Math.PI) / 2); return { x, y, html: n, cls: "math" }; }),
        { x: cx, y: cy, html: "", cls: "slot", live: t => `<i>θ</i> = ${reading(t)}`, at: t => at(cx, cy, R * 0.34 + 0.2, theta(t) / 2) },
        { x: nar ? -0.62 : 0.82, y: nar ? -0.62 : 0.52, html: "<i>e</i><sup><i>iπ</i></sup> + 1 = 0", cls: "math c-math" },
        { x: nar ? 0.62 : 0.82, y: nar ? -0.62 : 0.2, html: "<i>e</i><sup>2<i>πi</i></sup> = 1", cls: "math c-math" },
        ...SYMBOLS.map((sy, k) => ({ x: nar ? -1.0 + k * 0.5 : 0.34 + k * 0.24, y: nar ? -0.98 : -0.34, html: sy.w === "i" || sy.w === "e" ? `<i>${sy.w}</i>` : sy.w, cls: "word", def: sy })),
        ...(nar ? [] : [{ x: 0.82, y: -0.56, html: "choose a symbol", cls: "tag" }])
      ]
    };
  };

  /* Shannon's bit read off the circle: one side of a diameter is one bit, the
     quadrants are two bits, labelled in turning order so neighbours differ by one. */
  SCENES.greading = () => {
    const cx = 0, cy = 0.05, R = 0.78, points = [], meta = [];
    const QL = ["00", "10", "11", "01"];                    // quadrants I, II, III, IV: [x < 0, y < 0]
    for (let q = 0; q < 4; q++) for (let k = 0; k < 46; k++) {
      const a = (q + (k + 0.5) / 46) * Math.PI / 2, [x, y] = at(cx, cy, R, a);
      meta.push({ kind: "quad", q, x, y }); points.push({ x, y, c: "brass", a: 0.4, s: 0.9 });
    }
    for (const [dx, dy] of [[1, 0], [0, 1]]) for (let k = 0; k < 50; k++) {
      const u = -1 + (2 * k) / 49; meta.push({ kind: "fixed", x: cx + dx * u * R, y: cy + dy * u * R }); points.push({ x: 0, y: 0, c: "dim", a: 0.55, s: 0.75 });
    }
    for (let k = 0; k < 18; k++) { meta.push({ kind: "mark", jx: gauss() * 0.022, jy: gauss() * 0.022 }); points.push({ x: 0, y: 0, c: "cyan", a: 1, s: 1.3 }); }
    const angle = t => 0.35 + t * 0.42, quad = t => Math.floor(((angle(t) % TAU) / (Math.PI / 2))) % 4;
    const out = new Array(points.length);
    return {
      points, period: TAU / 0.42, stillT: 5.6,
      dynamic: t => {
        const q = quad(t), a = angle(t);
        meta.forEach((m, i) => {
          if (m.kind === "quad") out[i] = { x: m.x, y: m.y, a: m.q === q ? 1 : 0.3 };
          else if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: 0.55 };
          else { const [x, y] = at(cx, cy, R, a); out[i] = { x: x + m.jx, y: y + m.jy, a: 1 }; }
        });
        return out;
      },
      labels: [
        ...QL.map((l, q) => { const [x, y] = at(cx, cy, R * 0.5, (q + 0.5) * Math.PI / 2); return { x, y, html: l, cls: "slot" }; }),
        { x: 0, y: -1.02, live: t => `reading: ${QL[quad(t)]}`, html: "reading: 00", cls: "math c-brass" }
      ]
    };
  };

  /* Physics on the circle: a point turning at steady speed, and its height traced to the
     right as time passes. A turn seen from the side is a wave. */
  SCENES.phasor = () => {
    const cx = -0.98, cy = 0.05, R = 0.42, x0 = -0.3, x1 = 1.45, K = 2.4, W = 1.1, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 130; k++) { const [x, y] = at(cx, cy, R, (k / 130) * TAU); add({ kind: "fixed", x, y, a: 0.4 }, { x, y, c: "ice", a: 0.4, s: 0.8 }); }
    for (let k = 0; k < 60; k++) { const x = x0 + ((x1 - x0) * k) / 59; add({ kind: "fixed", x, y: cy, a: 0.22 }, { x, y: cy, c: "dim", a: 0.22, s: 0.7 }); }
    for (let k = 0; k < 24; k++) add({ kind: "hand", u: k / 23 }, { x: cx, y: cy, c: "cyan", a: 0.8, s: 0.85 });
    for (let k = 0; k < 22; k++) add({ kind: "link", u: k / 21 }, { x: cx, y: cy, c: "dim", a: 0.5, s: 0.7 });
    for (let k = 0; k < 200; k++) add({ kind: "wave", u: k / 199 }, { x: x0, y: cy, c: "cyan", a: 0.85, s: 0.9 });
    for (let k = 0; k < 18; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: cx + R, y: cy, c: "gold", a: 1, s: 1.3 });
    const out = new Array(points.length);
    return {
      points, stillT: 1.3,
      dynamic: t => {
        const th = t * W, [mx, my] = at(cx, cy, R, th);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "hand") out[i] = { x: cx + (mx - cx) * m.u, y: cy + (my - cy) * m.u, a: 0.8 };
          else if (m.kind === "link") out[i] = { x: mx + (x0 - mx) * m.u, y: my, a: 0.5 };
          else if (m.kind === "wave") { const x = x0 + (x1 - x0) * m.u; out[i] = { x, y: cy + R * Math.sin(th - K * (x - x0)), a: 0.85 }; }
          else out[i] = { x: mx + m.jx, y: my + m.jy, a: 1 };
        });
        return out;
      },
      labels: [
        { x: cx, y: cy - R - 0.2, html: "a rotation", cls: "tag" },
        { x: (x0 + x1) / 2, y: cy - R - 0.2, html: "seen from the side, a wave", cls: "tag" },
        { x: cx, y: cy + R + 0.2, html: "<i>e</i><sup><i>iωt</i></sup>", cls: "slot c-math" }
      ]
    };
  };

  /* How the tower is built, as the pizza: four slices are two perpendicular cuts, one system;
     eight are two perpendicular pairs, each a system only relative to the other; at sixteen the
     cuts no longer hold together as perpendicular systems, and the figure will not stay still. */
  SCENES.gpizza = () => {
    const P = [{ x: -1.0, n: 2 }, { x: 0, n: 4 }, { x: 1.0, n: 8 }], R = 0.36, cy = 0.08, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    P.forEach((pz, pi) => {
      for (let k = 0; k < 110; k++) { const [x, y] = at(pz.x, cy, R, (k / 110) * TAU); add({ kind: "fixed", x, y }, { x, y, c: "ice", a: 0.45, s: 0.8 }); }
      for (let c = 0; c < pz.n; c++) {
        const a = (c * Math.PI) / pz.n, col = pi === 0 ? "cyan" : pi === 1 ? (c % 2 ? "violet" : "cyan") : "coral";
        for (let k = 0; k < 26; k++) add({ kind: "cut", pi, c, a, u: -1 + (2 * k) / 25 }, { x: pz.x, y: cy, c: col, a: 0.85, s: 0.85 });
      }
    });
    const out = new Array(points.length);
    return {
      points, stillT: 1.5,
      dynamic: t => {
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: 0.45 }; return; }
          const wob = m.pi === 2 ? 0.07 * Math.sin(t * 1.7 + m.c * 2.3) : 0, a = m.a + wob, pz = P[m.pi];
          out[i] = { x: pz.x + m.u * R * Math.cos(a), y: cy + m.u * R * Math.sin(a), a: m.pi === 2 ? 0.7 : 0.85 };
        });
        return out;
      },
      labels: [
        { x: P[0].x, y: 0.66, html: "4 slices", cls: "tag" }, { x: P[1].x, y: 0.66, html: "8 slices", cls: "tag" }, { x: P[2].x, y: 0.66, html: "16 slices", cls: "tag" },
        { x: P[0].x, y: -0.44, html: "one cross of right angles", cls: "example" },
        { x: P[1].x, y: -0.44, html: "two crosses: which is the reference?", cls: "example" },
        { x: P[2].x, y: -0.44, html: "cannot all be kept", cls: "example c-coral" }
      ]
    };
  };

  /* ================= 06–10 · What exists, the tower, what we measure, how we convey it ================= */

  /* A point in space turned about the vertical (yaw) and tipped toward us (tilt): [x, y, depth 0..1]. */
  const view3 = (x, y, z, yaw, tilt) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), x1 = x * c - z * s, z1 = x * s + z * c;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    return [x1, y * ct - z1 * st, Math.max(0, Math.min(1, (y * st + z1 * ct + 1) / 2))];
  };

  /* To exist is to interact: light reflecting off the lighter, heat rising from it, a hand
     pressing against it and stopping where the lighter resists. */
  SCENES.interact = () => {
    const LX = -0.2, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    lighterAt(LX, -0.05, 1.5).forEach(p => add({ kind: "fixed", x: p.x, y: p.y, a: p.a }, p));
    for (let k = 0; k < 80; k++) add({ kind: "hand", dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.16 }, { x: 1, y: -0.1, c: "paper", a: 0.5, s: 0.8 });
    const hand = t => { const f = 0.5 + 0.5 * Math.cos(t * 0.7); return LX + 0.3 + 1.0 * f * f; };
    const inP = [-1.5, 0.8], hit = [LX - 0.11, 0.02], outP = [1.4, 1.02];
    const out = new Array(points.length);
    return {
      points, stillT: 4.2,
      flows: [
        { n: 16, path: u => u < 0.5 ? [inP[0] + (hit[0] - inP[0]) * 2 * u, inP[1] + (hit[1] - inP[1]) * 2 * u] : [hit[0] + (outP[0] - hit[0]) * (2 * u - 1), hit[1] + (outP[1] - hit[1]) * (2 * u - 1)], speed: 0.22, c: "cyan", a: 0.95, s: 1.2 },
        { n: 14, path: u => [LX + 0.07 * Math.sin(u * 13), 0.34 + 0.62 * u], speed: 0.3, c: "coral", a: 0.8, s: 1 }
      ],
      dynamic: t => {
        const hx = hand(t);
        meta.forEach((m, i) => { out[i] = m.kind === "fixed" ? { x: m.x, y: m.y, a: m.a } : { x: hx + 0.15 + m.dx, y: -0.1 + m.dy, a: 0.5 }; });
        return out;
      },
      labels: [
        { x: -1.05, y: 0.82, html: "reflects light", cls: "example" },
        { x: LX + 0.02, y: 1.06, html: "exchanges heat", cls: "example" },
        { x: 0.95, y: -0.36, html: "resists a hand", cls: "example" }
      ]
    };
  };

  /* Gödel's proof with its checker: the sentence G inside the formal system, and Gödel outside
     it holding the coding that reads G as being about itself. Then the checker is removed and
     G is left alone in the system, a sentence it cannot prove. */
  SCENES.coding = () => {
    const bx = -0.56, by = 0.08, gx = 0.98, gy = 0.08, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const c1 = [[bx + 0.62, by + 0.14], [bx + 0.95, by + 0.62], [gx - 0.35, gy + 0.62], [gx - 0.12, gy + 0.1]];
    const c2 = [[gx - 0.12, gy - 0.1], [gx - 0.35, gy - 0.62], [bx + 0.95, by - 0.62], [bx + 0.62, by - 0.14]];
    S.rect(bx, by, 1.24, 0.62, 150, {}).forEach(p => add({ kind: "box", x: p.x, y: p.y }, { x: p.x, y: p.y, c: "ice", a: 0.6, s: 0.85 }));
    S.blob(gx, gy, 0.09, 0.09, 40, {}).forEach(p => add({ kind: "checker", x: p.x, y: p.y }, { x: p.x, y: p.y, c: "gold", a: 1, s: 1.1 }));
    [c1, c2].forEach((c, ci) => { for (let k = 0; k < 70; k++) { const [x, y] = S.bezierAt(...c, k / 69); add({ kind: "arc", ci, u: k / 69, x, y }, { x, y, c: ci ? "cyan" : "brass", a: 0.7, s: 0.85 }); } });
    const [hx, hy] = c2[3], hang = Math.atan2(c2[3][1] - c2[2][1], c2[3][0] - c2[2][0]);
    S.head(hx, hy, hang, 0.08, 10, {}).forEach(p => add({ kind: "arc", ci: 1, u: 1, x: p.x, y: p.y }, { x: p.x, y: p.y, c: "cyan", a: 0.7, s: 0.85 }));
    const loop = u => { const a = -0.4 + u * 1.7 * Math.PI; return [bx + 0.5 + 0.2 * Math.cos(a), by + 0.52 + 0.2 * Math.sin(a)]; };
    for (let k = 0; k < 44; k++) { const [x, y] = loop(k / 43); add({ kind: "loop", x, y }, { x, y, c: "dim", a: 0, s: 0.8 }); }
    const PER = 10, alone = t => t > 5.2;
    const out = new Array(points.length);
    const fadeIn = (t, t0) => Math.max(0, Math.min(1, (t - t0) / 0.8));
    return {
      points, period: PER, stillT: 3.4,
      dynamic: t => {
        const gone = fadeIn(t, 5.2), pulse = (t * 0.45) % 1;
        meta.forEach((m, i) => {
          let a;
          if (m.kind === "box") a = 0.6;
          else if (m.kind === "checker") a = 1 - 0.9 * gone;
          else if (m.kind === "arc") { const near = Math.abs(((m.u - pulse) % 1 + 1) % 1 - 0.5) > 0.42 ? 1 : 0.55; a = (0.7 * near + 0.1) * (1 - 0.92 * gone); }
          else a = 0.55 * gone;
          out[i] = { x: m.x, y: m.y, a };
        });
        return out;
      },
      labels: [
        { x: bx, y: by + 0.44, html: "the formal system", cls: "tag" },
        { x: bx, y: by, html: "G: no number has the property P", cls: "example" },
        { x: gx, y: gy - 0.2, html: "", cls: "role c-math", live: t => `<span style="opacity:${alone(t) ? 0.15 : 1}">Gödel</span>` },
        { x: (bx + gx) / 2 + 0.18, y: by + 0.64, html: "", cls: "example", live: t => `<span style="opacity:${alone(t) ? 0.15 : 1}">the coding: sentences as numbers</span>` },
        { x: (bx + gx) / 2 + 0.18, y: by - 0.64, html: "", cls: "example", live: t => `<span style="opacity:${alone(t) ? 0.15 : 1}">reads G as about itself, and sees it is true</span>` },
        { x: 0.2, y: -0.98, html: "", cls: "slot", live: t => alone(t) ? "without the checker: a sentence the system cannot prove" : "with the checker: G is true" }
      ]
    };
  };

  /* Closure and entropy: a mark that keeps coming back, and a drop of ink that keeps spreading. */
  SCENES.closure = () => {
    const cx = -0.86, R = 0.42, bx = 0.82, B = 0.46, N = 6, cell = (2 * B) / N, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 140; k++) { const [x, y] = at(cx, 0, R, (k / 140) * TAU); add({ kind: "fixed", x, y, a: 0.4 }, { x, y, c: "ice", a: 0.4, s: 0.8 }); }
    for (let k = 0; k < 8; k++) add({ kind: "fixed", x: cx + R + 0.04 + k * 0.012, y: 0, a: 0.8 }, { x: cx + R, y: 0, c: "paper", a: 0.8, s: 0.8 });
    for (let k = 0; k < 80; k++) add({ kind: "trail", u: k / 79 }, { x: cx, y: 0, c: "cyan", a: 0.7, s: 0.85 });
    for (let k = 0; k < 18; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: cx + R, y: 0, c: "gold", a: 1, s: 1.3 });
    for (let g = 0; g <= N; g++) for (let k = 0; k < 16; k++) {
      const u = -B + (2 * B * k) / 15, v = -B + g * cell;
      add({ kind: "fixed", x: bx + u, y: v, a: g % N ? 0.1 : 0.35 }, { x: bx + u, y: v, c: "dim", a: 0.2, s: 0.7 });
      add({ kind: "fixed", x: bx + v, y: u, a: g % N ? 0.1 : 0.35 }, { x: bx + v, y: u, c: "dim", a: 0.2, s: 0.7 });
    }
    const x0 = bx - B + cell * 1.5, y0 = B - cell * 1.5;
    for (let k = 0; k < 300; k++) add({
      kind: "ink", gx: x0 + gauss() * 0.03, gy: y0 + gauss() * 0.03,
      tx: bx - B + 0.02 + Math.random() * (2 * B - 0.04), ty: -B + 0.02 + Math.random() * (2 * B - 0.04), ph: Math.random() * TAU, w: 0.6 + Math.random() * 0.8
    }, { x: x0, y: y0, c: "violet", a: 0.85, s: 0.9 });
    const spread = t => t < 0.8 ? 0 : 1 - Math.exp(-(t - 0.8) / 2.6);
    const out = new Array(points.length);
    return {
      points, stillT: 3.4,
      dynamic: t => {
        const th = t * 1.05, part = th % TAU, f = spread(t);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "trail") { const [x, y] = at(cx, 0, R + 0.08, part * m.u); out[i] = { x, y, a: part > 0.05 ? 0.7 : 0 }; }
          else if (m.kind === "mark") { const [x, y] = at(cx, 0, R, th); out[i] = { x: x + m.jx, y: y + m.jy, a: 1 }; }
          else {
            const wob = 0.01 + 0.016 * f;
            out[i] = { x: Math.max(bx - B + 0.01, Math.min(bx + B - 0.01, m.gx + (m.tx - m.gx) * f + wob * Math.sin(t * m.w + m.ph))),
                       y: Math.max(-B + 0.01, Math.min(B - 0.01, m.gy + (m.ty - m.gy) * f + wob * Math.cos(t * m.w * 1.3 + m.ph))), a: 0.85 };
          }
        });
        return out;
      },
      labels: [
        { x: cx, y: 0.72, html: "closure", cls: "role" },
        { x: cx, y: -0.66, html: "it comes back", cls: "example" },
        { x: bx, y: 0.72, html: "entropy", cls: "role c-violet" },
        { x: bx, y: -0.66, html: "it spreads", cls: "example" },
        { x: -0.02, y: 0.02, html: "information", cls: "slot" }
      ]
    };
  };

  /* Hopf fibres of the three-sphere, seen through stereographic projection: circles, every
     one linked with every other, each the set of states one reading cannot tell apart. */
  SCENES.hopf = () => {
    const COLS = ["cyan", "violet", "mint", "brass", "coral", "ice", "gold"], fib = [];
    const sets = [[0.62, 11], [0.3, 7]];
    sets.forEach(([eta, nf], si) => {
      for (let f = 0; f < nf; f++) {
        const phi = (f / nf) * TAU + si * 0.3, c = COLS[(f + si * 3) % COLS.length];
        for (let k = 0; k < 62; k++) {
          const psi = (k / 62) * TAU;
          const x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi), x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi);
          const d = 1 - x4;
          fib.push([x1 / d, x3 / d, x2 / d, c]);
        }
      }
    });
    const sc = 0.42, out = new Array(fib.length);
    return {
      points: fib.map(([x, y, z, c]) => ({ x: x * sc, y: y * sc, c, a: 0.7, s: 0.85 })),
      stillT: 2.5,
      dynamic: t => {
        fib.forEach(([x, y, z], i) => { const [X, Y, d] = view3(x, y, z, t * 0.1, 1.05); out[i] = { x: X * sc, y: Y * sc, a: 0.2 + 0.7 * d }; });
        return out;
      },
      labels: [
        { x: 0, y: -1.02, html: "each circle is a fibre; every fibre is linked with every other", cls: "example" }
      ]
    };
  };

  /* Everything: the question alone first, then circles at every scale appear around the answer, each
     with a point going round, from the universe to spin and from heartbeats to music. */
  SCENES.gscales = () => {
    const T0 = 2.3, NAMES = [
      ["the universe", 0.2, 0.15, "violet"], ["galaxies", 0.19, 0.25, "ice"], ["seasons", 0.17, 0.35, "mint"],
      ["planets", 0.17, 0.45, "brass"], ["tides", 0.15, 0.55, "cyan"], ["heartbeats", 0.13, 1.1, "coral"],
      ["pendulums", 0.13, 0.9, "mint"], ["music", 0.12, 1.3, "gold"], ["sound", 0.12, 1.5, "coral"],
      ["light", 0.1, 1.8, "gold"], ["atoms", 0.09, 2.1, "cyan"], ["DNA", 0.11, 0.7, "mint"],
      ["sleep", 0.13, 0.5, "violet"], ["the brain", 0.12, 0.8, "coral"], ["spin", 0.08, 2.5, "violet"]
    ];
    const items = NAMES.map(([n, r, w, c], k) => {
      const a = Math.PI / 2 - (k / NAMES.length) * TAU;
      return { n, r: r * 0.85, w, c, x: 1.95 * Math.cos(a), y: 0.84 * Math.sin(a), k, up: Math.sin(a) > 0.3 };
    });
    const points = [], meta = [], TR = 7;
    items.forEach(it => {
      const n = Math.round(28 + it.r * 150);
      for (let q = 0; q < n; q++) { points.push({ x: it.x, y: it.y, c: it.c, a: 0, s: 0.7 }); meta.push({ it, ring: q / n }); }
      for (let q = 0; q < TR; q++) { points.push({ x: it.x, y: it.y, c: it.c, a: 0, s: 1.5 - q * 0.12 }); meta.push({ it, q }); }
    });
    const seen = (it, t) => Math.max(0, Math.min(1, (t - T0 - it.k * 0.09) / 0.6));
    const out = new Array(points.length);
    return {
      points, stillT: 6,
      dynamic: t => {
        meta.forEach((m, i) => {
          const it = m.it, v = seen(it, t);
          if (m.ring !== undefined) { const a = m.ring * TAU; out[i] = { x: it.x + it.r * Math.cos(a), y: it.y + it.r * Math.sin(a), a: 0.35 * v }; }
          else { const a = it.k * 1.3 + (t - m.q * 0.06) * it.w * 1.4; out[i] = { x: it.x + it.r * Math.cos(a), y: it.y + it.r * Math.sin(a), a: (1 - m.q / TR) * v }; }
        });
        return out;
      },
      labels: items.map(it => ({ x: it.x, y: it.up ? it.y + it.r + 0.09 : it.y - it.r - 0.09, html: it.n, cls: "example reveal" }))
    };
  };

  /* Fourier: five turns chained, at 1, 3, 5, 7 and 9 times the speed, whose tip draws a square wave. */
  SCENES.fourier = () => {
    const K = [1, 3, 5, 7, 9], R = 0.3, cx = -0.95, cy = 0.05, w = 1.1, x0 = -0.2, NT = 130, dx = 1.55 / NT;
    const rad = K.map(k => (4 / Math.PI) * R / k);
    const points = [], meta = [];
    K.forEach((k, j) => {
      const n = Math.max(24, Math.round(rad[j] * 160));
      for (let q = 0; q < n; q++) { points.push({ x: cx, y: cy, c: "cyan", a: 0.28, s: 0.6 }); meta.push({ ring: j, u: q / n }); }
      for (let q = 0; q < 6; q++) { points.push({ x: cx, y: cy, c: "ice", a: 0.7, s: 0.8 }); meta.push({ arm: j, u: q / 6 }); }
    });
    for (let q = 0; q < 12; q++) { points.push({ x: cx, y: cy, c: "dim", a: 0.5, s: 0.6 }); meta.push({ link: q / 12 }); }
    for (let q = 0; q < NT; q++) { points.push({ x: x0 + q * dx, y: cy, c: "gold", a: 0.95, s: 1.05 }); meta.push({ trace: q }); }
    const tip = th => { let x = cx, y = cy; const cs = [[x, y]]; K.forEach((k, j) => { x += rad[j] * Math.cos(k * th); y += rad[j] * Math.sin(k * th); cs.push([x, y]); }); return cs; };
    const out = new Array(points.length);
    return {
      points, stillT: 2.2,
      dynamic: t => {
        const th = t * w, cs = tip(th), [tx, ty] = cs[cs.length - 1];
        meta.forEach((m, i) => {
          if (m.ring !== undefined) { const [ox, oy] = cs[m.ring], a = m.u * TAU; out[i] = { x: ox + rad[m.ring] * Math.cos(a), y: oy + rad[m.ring] * Math.sin(a), a: 0.28 }; }
          else if (m.arm !== undefined) { const [ax, ay] = cs[m.arm], [bx, by] = cs[m.arm + 1]; out[i] = { x: ax + (bx - ax) * m.u, y: ay + (by - ay) * m.u, a: 0.7 }; }
          else if (m.link !== undefined) out[i] = { x: tx + (x0 - tx) * m.link, y: ty, a: 0.45 };
          else { const tt = th - m.trace * (4 * Math.PI / NT); let y = cy; K.forEach((k, j) => { y += rad[j] * Math.sin(k * tt); }); out[i] = { x: x0 + m.trace * dx, y, a: 0.95 }; }
        });
        return out;
      },
      labels: [{ x: 0.1, y: -0.78, html: "five rotations at 1, 3, 5, 7 and 9 times the speed add up to a square wave", cls: "example" }]
    };
  };

  /* A phone's constellation: eight points on the circle, three bits each, and the transmitted turn
     stepping from one to the next as the bits go out. */
  SCENES.constellation = () => {
    const R = 0.66, cy = 0.08, GRAY = ["000", "001", "011", "010", "110", "111", "101", "100"], SEQ = [0, 3, 5, 6, 1, 7, 2, 4], HOLD = 1.3;
    const points = [], meta = [];
    for (let q = 0; q < 110; q++) { const a = q / 110 * TAU; points.push({ x: R * Math.cos(a), y: cy + R * Math.sin(a), c: "cyan", a: 0.3, s: 0.65 }); meta.push(null); }
    for (let q = 0; q < 40; q++) { const u = q / 39 * 2 - 1; points.push({ x: u * (R + 0.14), y: cy, c: "dim", a: 0.35, s: 0.55 }); meta.push(null); points.push({ x: 0, y: cy + u * (R + 0.14), c: "dim", a: 0.35, s: 0.55 }); meta.push(null); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + TAU / 16; points.push({ x: R * Math.cos(a), y: cy + R * Math.sin(a), c: "paper", a: 0.95, s: 1.8 }); meta.push(null); }
    for (let q = 0; q < 22; q++) { points.push({ x: 0, y: cy, c: "gold", a: 1, s: 1.2 }); meta.push({ arm: q / 21 }); }
    const angle = t => {
      const n = Math.floor(t / HOLD), f = t / HOLD - n, from = SEQ[n % 8], to = SEQ[(n + 1) % 8];
      let d = (to - from + 8) % 8; if (d > 4) d -= 8;
      const e = f < 0.7 ? 0 : (1 - Math.cos((f - 0.7) / 0.3 * Math.PI)) / 2;
      return { a: (from + d * e) / 8 * TAU + TAU / 16, sym: e > 0.5 ? to : from };
    };
    const out = points.map(p => ({ x: p.x, y: p.y, a: p.a }));
    return {
      points, stillT: 0.4,
      dynamic: t => {
        const { a } = angle(t);
        meta.forEach((m, i) => { if (m) out[i] = { x: R * m.arm * Math.cos(a), y: cy + R * m.arm * Math.sin(a), a: 1 }; });
        return out;
      },
      labels: [
        ...GRAY.map((g, k) => { const a = k / 8 * TAU + TAU / 16; return { x: (R + 0.2) * Math.cos(a), y: cy + (R + 0.14) * Math.sin(a), html: g, cls: "slot" }; }),
        { x: 0, y: -0.86, html: "", cls: "example", live: t => `sending ${GRAY[angle(t).sym]}, three bits in one position on the circle` }
      ]
    };
  };

  /* e in the lab and in the turn: a sample decaying by the same fraction every second, and a point
     whose every step is a quarter turn from where it is, so it goes around. */
  SCENES.egrow = () => {
    const X0 = -1.45, X1 = -0.15, Y0 = -0.42, H = 0.95, N = 70, P = 5, cx = 0.8, cy = 0.05, R = 0.46;
    const points = [], meta = [];
    for (let q = 0; q < 34; q++) { points.push({ x: X0 + (X1 - X0) * q / 33, y: Y0, c: "dim", a: 0.45, s: 0.6 }); meta.push(null); }
    for (let q = 0; q < 24; q++) { points.push({ x: X0, y: Y0 + H * q / 23, c: "dim", a: 0.45, s: 0.6 }); meta.push(null); }
    for (let q = 0; q < N; q++) { points.push({ x: X0 + (X1 - X0) * q / (N - 1), y: Y0, c: "brass", a: 0, s: 1 }); meta.push({ decay: q / (N - 1) }); }
    for (let q = 0; q < 90; q++) { const a = q / 90 * TAU; points.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), c: "cyan", a: 0.3, s: 0.65 }); meta.push(null); }
    for (let q = 0; q < 12; q++) { points.push({ x: cx, y: cy, c: "ice", a: 0.6, s: 0.8 }); meta.push({ radius: q / 11 }); }
    for (let q = 0; q < 12; q++) { points.push({ x: cx, y: cy, c: "gold", a: 1, s: 1 }); meta.push({ step: q / 11 }); }
    for (let q = 0; q < 3; q++) { points.push({ x: cx, y: cy, c: "gold", a: 1, s: 1.6 - q * 0.3 }); meta.push({ dot: q }); }
    const out = points.map(p => ({ x: p.x, y: p.y, a: p.a }));
    return {
      points, stillT: 3.6,
      dynamic: t => {
        const shown = (t % P) / P * 1.25, a = t * 0.9 + 0.6, px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
        meta.forEach((m, i) => {
          if (!m) return;
          if (m.decay !== undefined) out[i] = { x: X0 + (X1 - X0) * m.decay, y: Y0 + H * Math.exp(-3 * m.decay), a: m.decay <= shown ? 0.95 : 0 };
          else if (m.radius !== undefined) out[i] = { x: cx + (px - cx) * m.radius, y: cy + (py - cy) * m.radius, a: 0.6 };
          else if (m.step !== undefined) out[i] = { x: px - Math.sin(a) * 0.32 * m.step, y: py + Math.cos(a) * 0.32 * m.step, a: 1 };
          else out[i] = { x: px, y: py, a: 1 };
        });
        return out;
      },
      labels: [
        { x: (X0 + X1) / 2, y: -0.72, html: "a sample decays by the same fraction every second", cls: "example" },
        { x: cx, y: -0.72, html: "each step at a right angle goes around", cls: "example" }
      ]
    };
  };

  /* The quarter turn in space: plumb lines and still water around the curve of the Earth, a right
     angle at every station. */
  SCENES.gplumb = () => {
    const C = [0, -3.05], RE = 3, stations = [66, 78, 90, 102, 114].map(d => d * Math.PI / 180), points = [];
    for (let q = 0; q < 130; q++) { const a = (52 + q / 129 * 76) * Math.PI / 180; points.push({ x: C[0] + RE * Math.cos(a), y: C[1] + RE * Math.sin(a), c: "mint", a: 0.45, s: 0.75 }); }
    stations.forEach(a => {
      const n = [Math.cos(a), Math.sin(a)], tg = [-Math.sin(a), Math.cos(a)], p = [C[0] + RE * n[0], C[1] + RE * n[1]];
      for (let q = 0; q < 16; q++) { const u = 0.04 + q / 15 * 0.66; points.push({ x: p[0] + n[0] * u, y: p[1] + n[1] * u, c: "brass", a: 0.85, s: 0.85 }); }
      points.push({ x: p[0] + n[0] * 0.08, y: p[1] + n[1] * 0.08, c: "brass", a: 1, s: 2 });
      for (let q = 0; q < 14; q++) { const u = -0.22 + q / 13 * 0.44; points.push({ x: p[0] + tg[0] * u, y: p[1] + tg[1] * u, c: "cyan", a: 0.95, s: 0.9 }); }
      for (let q = 0; q < 5; q++) { const u = q / 4 * 0.07; points.push({ x: p[0] + tg[0] * 0.07 + n[0] * u, y: p[1] + tg[1] * 0.07 + n[1] * u, c: "paper", a: 0.8, s: 0.6 }); points.push({ x: p[0] + n[0] * 0.07 + tg[0] * u, y: p[1] + n[1] * 0.07 + tg[1] * u, c: "paper", a: 0.8, s: 0.6 }); }
      for (let q = 0; q < 8; q++) { const u = 0.12 + q * 0.14; points.push({ x: p[0] - n[0] * u, y: p[1] - n[1] * u, c: "dim", a: 0.3, s: 0.5 }); }
    });
    return {
      points,
      labels: [
        { x: 0, y: 0.78, html: "plumb line", cls: "example" },
        { x: 0, y: -0.2, html: "still water", cls: "example" },
        { x: 0, y: -0.86, html: "a right angle at every point on Earth", cls: "example" }
      ]
    };
  };

  /* Closure across the sciences: the geometric bit's circle at the centre with a mark coming back
     round, and around it five fields, each drawn as its own closed loop with a point returning to where
     it started: a cell, an engine's cycle, a circuit, a reaction cycle, a feedback loop. */
  SCENES.closureloops = () => {
    const F = [
      { name: "life", mean: "order kept by feeding on it", c: "coral", x: -1.12, y: 0.34 },
      { name: "heat", mean: "back to the same state each cycle", c: "cyan", x: 0, y: 0.8 },
      { name: "circuits", mean: "voltages round a loop sum to zero", c: "brass", x: 1.12, y: 0.34 },
      { name: "chemistry", mean: "the same heat by any path", c: "mint", x: 0.74, y: -0.64 },
      { name: "control", mean: "back to the set point", c: "violet", x: -0.74, y: -0.64 }
    ];
    const paths = [
      (x, y) => u => [x + 0.16 * Math.cos(u * TAU), y + 0.14 * Math.sin(u * TAU)],
      (x, y) => u => { const a = u * TAU; return [x + 0.2 * Math.cos(a), y + 0.11 * Math.sin(a) + 0.04 * Math.sin(2 * a)]; },
      (x, y) => S.rectPath(x, y, 0.34, 0.22),
      (x, y) => { const V = [[x, y + 0.14], [x + 0.17, y - 0.1], [x - 0.17, y - 0.1]]; return u => { const w = ((u % 1) + 1) % 1 * 3, k = Math.floor(w), f = w - k, A = V[k], B = V[(k + 1) % 3]; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; }; },
      (x, y) => u => [x + 0.15 * Math.cos(-u * TAU), y + 0.15 * Math.sin(-u * TAU)]
    ];
    const R = 0.24, points = [...S.arc(0, 0, R, 0, TAU * 0.995, 80, { c: "mint", a: 0.6, s: 0.85 })], flows = [
      { n: 1, path: u => [R * Math.cos(u * TAU), R * Math.sin(u * TAU)], speed: 0.14, c: "gold", a: 1, s: 2.2 }
    ];
    F.forEach((f, k) => {
      const p = paths[k](f.x, f.y);
      for (let q = 0; q < 56; q++) points.push({ x: p(q / 56)[0], y: p(q / 56)[1], c: f.c, a: 0.45, s: 0.8, g: k });
      if (k === 3) [[f.x, f.y + 0.14], [f.x + 0.17, f.y - 0.1], [f.x - 0.17, f.y - 0.1]].forEach(([vx, vy]) => points.push(...S.blob(vx, vy, 0.02, 0.02, 5, { c: f.c, a: 1, s: 1.2, g: k })));
      if (k === 4) points.push(...S.blob(f.x + 0.15, f.y, 0.018, 0.018, 6, { c: "paper", a: 1, s: 1.2, g: k }));
      const len = Math.hypot(f.x, f.y), sx = (f.x / len) * (R + 0.07), sy = (f.y / len) * (R + 0.07), ex = f.x - (f.x / len) * 0.27, ey = f.y - (f.y / len) * 0.27;
      points.push(...S.line(sx, sy, ex, ey, 22, { c: "dim", a: 0.2, s: 0.65 }));
      flows.push({ n: 3, path: p, speed: 0.2, c: f.c, a: 1, s: 1.5, g: k });
    });
    const below = f => f.y > 0.6 ? [0.28, 0.83, 0.7, "left"] : [f.x, f.y - 0.3, f.y - 0.43, ""];
    return {
      points, flows,
      labels: [
        { x: 0, y: 0.05, html: "closure", cls: "role c-mint" },
        { x: 0, y: -0.09, html: "back to the reference", cls: "example" },
        ...F.flatMap((f, k) => { const [x, y1, y2, al] = below(f); return [
          { x, y: y1, html: f.name, cls: `role c-${f.c} ${al}`, g: k },
          { x, y: y2, html: f.mean, cls: `example ${al}`, g: k }]; })
      ]
    };
  };

  /* Section openers. The question shows alone, the title arrives at 1.8 s, and the figure after it:
     tScene fades each shape in at its own time `at` and runs particles along paths, `ends` fading
     them in and out at the ends of an open path so they never visibly jump back. */
  const fadeIn = (t, at) => Math.max(0, Math.min(1, (t - at) / 0.7));
  function tScene({ shapes = [], streams = [], labels = [], custom, stillT = 7 }) {
    const points = [], meta = [];
    shapes.forEach(sh => sh.pts.forEach(([x, y]) => { points.push({ x, y, c: sh.c, a: 0, s: sh.s ?? 0.8 }); meta.push({ sh, x, y }); }));
    streams.forEach(st => { for (let k = 0; k < st.n; k++) { const [x, y] = st.path(0); points.push({ x, y, c: st.c, a: 0, s: st.s ?? 1.1 }); meta.push({ st, u0: k / st.n }); } });
    const nBase = points.length;
    if (custom) custom.points.forEach(p => points.push(p));
    const out = new Array(points.length);
    return {
      points, stillT,
      dynamic: t => {
        meta.forEach((m, i) => {
          if (m.sh) { out[i] = { x: m.x, y: m.y, a: (m.sh.a ?? 0.5) * fadeIn(t, m.sh.at) }; return; }
          const st = m.st, u = (m.u0 + t * st.speed) % 1, [x, y] = st.path(u);
          const e = st.ends ? Math.sin(Math.PI * u) : 1;
          out[i] = { x, y, a: (st.a ?? 0.9) * e * fadeIn(t, st.at), ...(st.color ? { c: st.color(u) } : {}) };
        });
        if (custom) custom.update(t, out, nBase);
        return out;
      },
      labels
    };
  }
  const segPts = (x1, y1, x2, y2, n) => Array.from({ length: n }, (_, k) => [x1 + (x2 - x1) * k / (n - 1), y1 + (y2 - y1) * k / (n - 1)]);
  const ringPts = (cx, cy, r, n, ry = r) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos(k / n * TAU), cy + ry * Math.sin(k / n * TAU)]);
  const blobPts = (cx, cy, r, n) => Array.from({ length: n }, () => [cx + gauss() * r, cy + gauss() * r]);

  /* 03: a sign crossing from me to you, changing its form on the way */
  SCENES.tcomm = () => {
    const y0 = -0.7, x0 = -1.9, x1 = 1.9, wave = u => [x0 + (x1 - x0) * u, y0 + 0.09 * Math.sin(u * TAU * 5)];
    return tScene({
      shapes: [
        { pts: blobPts(x0, y0, 0.03, 14), c: "brass", a: 1, s: 1.3, at: 0 },
        { pts: blobPts(x1, y0, 0.03, 14), c: "cyan", a: 1, s: 1.3, at: 0.1 },
        { pts: Array.from({ length: 120 }, (_, k) => wave(k / 119)), c: "dim", a: 0.22, at: 0.2 }
      ],
      streams: [{ path: wave, n: 26, speed: 0.1, c: "brass", ends: true, at: 0.3, color: u => u < 0.5 ? "brass" : "cyan" }],
      labels: [
        { x: x0, y: y0 - 0.16, html: "what I know", cls: "example" }, { x: x1, y: y0 - 0.16, html: "what you receive", cls: "example" },
        { x: 0, y: y0 + 0.2, html: "a sign", cls: "example" }
      ]
    });
  };

  /* 04: a stream of bits, each one a choice between two levels */
  SCENES.tbits = () => {
    const BITS = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1], W = 0.28, lo = -0.78, hi = -0.5, N = 170, X0 = -2.1, X1 = 2.1;
    const pts = Array.from({ length: N }, () => ({ x: 0, y: lo, c: "brass", a: 0, s: 1 }));
    return tScene({
      shapes: [{ pts: segPts(X0, lo, X1, lo, 80), c: "dim", a: 0.18, at: 0 }, { pts: segPts(X0, hi, X1, hi, 80), c: "dim", a: 0.18, at: 0 }],
      labels: [{ x: X0 - 0.12, y: lo, html: "0", cls: "slot" }, { x: X0 - 0.12, y: hi, html: "1", cls: "slot" }],
      custom: {
        points: pts,
        update: (t, out, o) => {
          for (let k = 0; k < N; k++) {
            const x = X0 + (X1 - X0) * k / (N - 1), p = (x - X0) / W + t * 1.6, j = Math.floor(p), f = p - j;
            const b0 = BITS[((j % 16) + 16) % 16], b1 = BITS[(((j + 1) % 16) + 16) % 16];
            const v = f < 0.85 ? b0 : b0 + (b1 - b0) * (f - 0.85) / 0.15;
            out[o + k] = { x, y: lo + (hi - lo) * v, a: 0.9 * fadeIn(t, 0.2) };
          }
        }
      }
    });
  };

  /* 07: one mark going once around and closing on where it started */
  SCENES.tclose = () => {
    const R = 0.98, n = 200, P = 7, pts = [];
    for (let k = 0; k < n; k++) pts.push({ x: 0, y: 0, c: "mint", a: 0, s: 0.8 });
    for (let k = 0; k < 16; k++) pts.push({ x: 0, y: R, c: "gold", a: 0, s: 1.4 });
    return tScene({
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = Math.max(0, t - 0.3) % P, prog = Math.min(1, c / 4.5), glow = c > 4.5 ? Math.max(0, 1 - (c - 4.5) / 2) : 0;
          for (let k = 0; k < n; k++) {
            const u = k / n, a = Math.PI / 2 - u * TAU;
            out[o + k] = { x: R * Math.cos(a), y: R * Math.sin(a) * 0.72, a: (u <= prog ? 0.6 : 0.08) * fadeIn(t, 0) };
          }
          const a = Math.PI / 2 - prog * TAU;
          for (let k = 0; k < 16; k++) {
            const r = k < 6 ? 0 : 0.05 + glow * 0.18, q = k / 10 * TAU;
            out[o + n + k] = { x: R * Math.cos(a) + r * Math.cos(q), y: R * Math.sin(a) * 0.72 + r * Math.sin(q), a: (k < 6 ? 1 : glow) * fadeIn(t, 0.1) };
          }
        }
      }
    });
  };

  /* Every measurement agrees: π from a string round a circle, e from a decay timed by a clock and the
     right angle from a plumb line, three separate measurements flowing into one circle whose mark
     returns exactly where it began. */
  SCENES.gconsist = () => {
    const C = [0.62, 0.02], RC = 0.46, SRC = [[-1.2, 0.62], [-1.2, 0.0], [-1.2, -0.62]], COL = ["cyan", "brass", "mint"];
    const icon = [
      [...ringPts(SRC[0][0], SRC[0][1], 0.15, 44), ...segPts(SRC[0][0] - 0.15, SRC[0][1], SRC[0][0] + 0.15, SRC[0][1], 12)],
      [...segPts(SRC[1][0] - 0.18, SRC[1][1] - 0.13, SRC[1][0] + 0.18, SRC[1][1] - 0.13, 14), ...Array.from({ length: 30 }, (_, k) => { const u = k / 29; return [SRC[1][0] - 0.18 + 0.36 * u, SRC[1][1] - 0.13 + 0.28 * Math.exp(-3 * u)]; })],
      [...segPts(SRC[2][0], SRC[2][1] - 0.12, SRC[2][0], SRC[2][1] + 0.16, 14), ...segPts(SRC[2][0] - 0.16, SRC[2][1] - 0.12, SRC[2][0] + 0.16, SRC[2][1] - 0.12, 16), ...segPts(SRC[2][0] + 0.04, SRC[2][1] - 0.12, SRC[2][0] + 0.04, SRC[2][1] - 0.08, 3), ...segPts(SRC[2][0], SRC[2][1] - 0.08, SRC[2][0] + 0.04, SRC[2][1] - 0.08, 3)]
    ];
    const route = ([x, y]) => u => { const ex = C[0] - RC * 1.25, P = S.bezierAt([x + 0.24, y], [x + 0.8, y], [ex - 0.4, C[1]], [ex, C[1]], u); return P; };
    const mark = Array.from({ length: 8 }, () => ({ x: C[0], y: C[1] + RC, c: "gold", a: 0, s: 1.5 }));
    return tScene({
      shapes: [
        ...icon.map((pts, k) => ({ pts, c: COL[k], a: 0.85, s: 0.9, at: 0.2 + k * 0.3 })),
        { pts: ringPts(C[0], C[1], RC, 110), c: "ice", a: 0.4, s: 0.8, at: 0.9 },
        ...SRC.map(p => ({ pts: Array.from({ length: 40 }, (_, k) => route(p)(k / 39)), c: "dim", a: 0.18, s: 0.6, at: 0.6 }))
      ],
      streams: SRC.map((p, k) => ({ path: route(p), n: 7, speed: 0.22, c: COL[k], ends: true, at: 1 + k * 0.2 })),
      labels: [
        { x: SRC[0][0], y: SRC[0][1] - 0.26, html: "π, with a string", cls: "example" },
        { x: SRC[1][0], y: SRC[1][1] - 0.26, html: "<i>e</i>, with a clock", cls: "example" },
        { x: SRC[2][0], y: SRC[2][1] - 0.26, html: "the right angle, with a plumb line", cls: "example" },
        { x: C[0], y: C[1] - RC - 0.2, html: "e<sup>2πi</sup> = 1", cls: "math c-math" }
      ],
      custom: {
        points: mark,
        update: (t, out, o) => {
          const a = Math.PI / 2 - t * 0.9;
          for (let k = 0; k < 8; k++) { const q = a + k * 0.035; out[o + k] = { x: C[0] + RC * Math.cos(q), y: C[1] + RC * Math.sin(q), a: (1 - k / 8) * fadeIn(t, 1.2) }; }
        }
      }
    });
  };

  /* The law, revealed: circles at every scale, each with a mark going round at the same rate, all
     returning to the top together, the same relation at every size. */
  SCENES.tlaw = () => {
    const RS = [1.0, 1.18, 1.36], n = 120, P = 4, pts = [];
    RS.forEach(() => { for (let k = 0; k < n; k++) pts.push({ x: 0, y: 0, c: "ice", a: 0, s: 0.7 }); for (let k = 0; k < 10; k++) pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 1.4 }); });
    return tScene({
      stillT: 4.25,
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = Math.max(0, t - 0.3) % P, a0 = Math.PI / 2 - (c / P) * TAU, flash = Math.max(0, 1 - Math.min(c, P - c) / 0.35);
          let i = o;
          RS.forEach((r, j) => {
            const v = fadeIn(t, j * 0.1), ry = r * 0.62;
            for (let k = 0; k < n; k++) { const a = k / n * TAU; out[i++] = { x: r * 1.55 * Math.cos(a), y: ry * Math.sin(a), a: (0.3 + 0.4 * flash) * v }; }
            for (let k = 0; k < 10; k++) { const q = a0 + k * 0.05; out[i++] = { x: r * 1.55 * Math.cos(q), y: ry * Math.sin(q), a: (1 - k / 10) * v }; }
          });
        }
      }
    });
  };

  /* Where it isn't: Euler's identity at the centre, the descriptions that rest on it lit around it
     with the relation flowing out to each, and the two not yet written with it, natural language and
     the humanities, left dim. */
  SCENES.gwhere = () => {
    const F = [
      ["quantum states", 1], ["chemistry", 1], ["light", 1], ["natural language", 0], ["orbits", 1], ["computing", 1], ["relativity", 1],
      ["waves and sound", 1], ["number theory", 1], ["the humanities", 0], ["signals", 1], ["engineering", 1], ["gravity", 1], ["language models", 1]
    ];
    const COL = ["cyan", "violet", "mint", "coral", "gold", "ice"], R0 = 0.3;
    const pos = F.map((f, k) => { const a = Math.PI / 2 - (k / F.length) * TAU; return [1.32 * Math.cos(a), 0.86 * Math.sin(a)]; });
    let lit = 0;
    const shapes = [{ pts: ringPts(0, 0, R0, 90), c: "gold", a: 0.7, s: 0.85, at: 0 }], streams = [], labels = [{ x: 0, y: 0, html: "e<sup>iπ</sup> + 1 = 0", cls: "math c-math" }];
    F.forEach(([name, on], k) => {
      const [x, y] = pos[k], c = on ? COL[lit++ % COL.length] : "dim", len = Math.hypot(x, y);
      shapes.push({ pts: blobPts(x, y, 0.018, on ? 8 : 5), c, a: on ? 1 : 0.5, s: on ? 1.3 : 0.9, at: 0.1 + k * 0.04 });
      if (on) {
        const sx = (x / len) * (R0 + 0.05), sy = (y / len) * (R0 + 0.05), ex = x * 0.9, ey = y * 0.9;
        shapes.push({ pts: segPts(sx, sy, ex, ey, 26), c: "dim", a: 0.2, s: 0.6, at: 0.2 });
        streams.push({ path: u => [sx + (ex - sx) * u, sy + (ey - sy) * u], n: 4, speed: 0.3, c, ends: true, at: 0.4 + k * 0.04 });
      }
      labels.push({ x, y: y >= 0 ? y + 0.12 : y - 0.12, html: on ? name : `${name}, not yet`, cls: on ? "example" : "tag" });
    });
    return tScene({ shapes, streams, labels, stillT: 3 });
  };

  /* So what: Shannon's bit at the centre and the people around it taking it up one by one, each link
     lighting as they adopt it, until everyone speaks it, and then the cycle starts again. */
  SCENES.tadopt = () => {
    const N = 14, P = 10, nodes = Array.from({ length: N }, (_, k) => { const a = Math.PI / 2 - (k / N) * TAU; return [1.15 * Math.cos(a), 0.78 * Math.sin(a)]; });
    const order = [0, 7, 3, 10, 12, 5, 1, 8, 13, 4, 9, 2, 11, 6], when = [];
    order.forEach((k, j) => { when[k] = 0.6 + j * 0.45; });
    const pts = [];
    nodes.forEach(() => { for (let q = 0; q < 22; q++) pts.push({ x: 0, y: 0, c: "dim", a: 0, s: 0.8 }); for (let q = 0; q < 24; q++) pts.push({ x: 0, y: 0, c: "brass", a: 0, s: 0.7 }); });
    return tScene({
      shapes: [{ pts: [...blobPts(-0.08, 0, 0.018, 8), ...blobPts(0.08, 0, 0.018, 8)], c: "brass", a: 1, s: 1.4, at: 0 },
               { pts: segPts(-0.08, 0, 0.08, 0, 10), c: "paper", a: 0.5, s: 0.7, at: 0 }],
      labels: [{ x: 0, y: -0.14, html: "0 1", cls: "slot" }, { x: 0, y: -1.02, html: "a protocol works once everyone speaks it", cls: "example" }],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P; let i = o;
          nodes.forEach(([x, y], k) => {
            const on = Math.max(0, Math.min(1, (c - when[k]) / 0.5)) * (c > P - 0.8 ? (P - c) / 0.8 : 1);
            for (let q = 0; q < 22; q++) { const a = q / 22 * TAU; out[i++] = { x: x + 0.07 * Math.cos(a), y: y + 0.07 * Math.sin(a), a: 0.35 + 0.6 * on, c: on > 0.5 ? "brass" : "dim" }; }
            const len = Math.hypot(x, y);
            for (let q = 0; q < 24; q++) { const u = q / 23, r0 = 0.16, r1 = len - 0.1; out[i++] = { x: x / len * (r0 + (r1 - r0) * u), y: y / len * (r0 + (r1 - r0) * u), a: 0.45 * on }; }
          });
        }
      }
    });
  };

  /* One language: one root, the geometric bit's circle, and a tree grown from it whose branches end in small
     circles of their own, grouped as the fields that read it; a brightness runs from the root to every tip. */
  SCENES.glanguage = () => {
    const branches = [], DEPTH = 6;
    const grow = (x, y, ang, len, d) => {
      const x2 = x + len * Math.cos(ang), y2 = y + len * Math.sin(ang);
      branches.push({ x, y, x2, y2, d });
      if (d < DEPTH) { grow(x2, y2, ang + 0.56, len * 0.72, d + 1); grow(x2, y2, ang - 0.5, len * 0.7, d + 1); }
    };
    grow(0, -0.6, Math.PI / 2, 0.38, 1);
    const pts = [], meta = [];
    branches.forEach(b => {
      const n = Math.max(4, Math.round(Math.hypot(b.x2 - b.x, b.y2 - b.y) * 60));
      for (let q = 0; q < n; q++) { const u = q / (n - 1); const x = b.x + (b.x2 - b.x) * u, y = b.y + (b.y2 - b.y) * u; pts.push({ x, y, c: b.d < 3 ? "mint" : "cyan", a: 0.5, s: 0.75 }); meta.push({ x, y, s: (b.d - 1 + u) / DEPTH }); }
      if (b.d === DEPTH) for (let q = 0; q < 12; q++) { const a = q / 12 * TAU, x = b.x2 + 0.03 * Math.cos(a), y = b.y2 + 0.03 * Math.sin(a); pts.push({ x, y, c: "gold", a: 0.8, s: 0.7 }); meta.push({ x, y, s: 1 }); }
    });
    const tips = branches.filter(b => b.d === DEPTH).map(b => [b.x2, b.y2]);
    const xs = tips.map(p => p[0]), ys = tips.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2 - 0.04;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.26, ry = Math.max(...ys) - cy + 0.13;   // labels on an ellipse just outside the crown
    const FIELDS = ["physics", "mathematics", "computation", "life", "mind", "language"];
    const fieldLabels = FIELDS.map((h, k) => { const a = (172 - k * 32.8) * Math.PI / 180; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), html: h, cls: "example" }; });
    return tScene({
      shapes: [{ pts: ringPts(0, -0.72, 0.12, 44), c: "gold", a: 0.95, s: 0.9, at: 0 }],
      labels: [{ x: 0, y: -0.95, html: "the geometric bit", cls: "example" }, ...fieldLabels],
      stillT: 4,
      custom: {
        points: pts,
        update: (t, out, o) => { meta.forEach((m, i) => { const w = Math.max(0, Math.cos(TAU * (m.s - t * 0.18))) ** 6; out[o + i] = { x: m.x, y: m.y, a: (m.s >= 1 ? 0.55 : 0.4) + 0.5 * w }; }); }
      }
    });
  };

  /* Information exists in spacetime: a spacetime diagram, time running up. Three worldlines, me, the
     lighter and you, each a wave climbing through time. A word leaves my worldline along a light ray,
     crosses the lighter's worldline (what it is about) and arrives at yours, which lights up. */
  SCENES.tthought = () => {
    const XS = [-1.0, 0, 1.0], COL = ["brass", "gold", "cyan"], Y0 = -0.82, Y1 = 0.78, N = 70, P = 4.4, pts = [];
    XS.forEach((x, w) => { for (let k = 0; k < N; k++) pts.push({ x, y: Y0, c: COL[w], a: 0, s: 0.95 }); });
    for (let k = 0; k < 12; k++) pts.push({ x: 0, y: 0, c: "paper", a: 0, s: 1.5 - k * 0.07 });
    for (let k = 0; k < 30; k++) pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 0.9 });
    for (let k = 0; k < 30; k++) pts.push({ x: 0, y: 0, c: "cyan", a: 0, s: 0.9 });
    const e0 = [-1.0, -0.62], e1 = [1.0, 0.58];                        // emission and arrival events
    const ray = u => [e0[0] + (e1[0] - e0[0]) * u, e0[1] + (e1[1] - e0[1]) * u];
    const prog = t => Math.min(1, ((t % P) / P) * 1.35);
    return tScene({
      stillT: 2.05,
      shapes: [
        { pts: segPts(-1.35, Y0 - 0.08, 1.35, Y0 - 0.08, 60), c: "dim", a: 0.4, s: 0.6, at: 0 },
        { pts: segPts(-1.35, Y0 - 0.08, -1.35, Y1 + 0.1, 50), c: "dim", a: 0.4, s: 0.6, at: 0 },
        { pts: Array.from({ length: 50 }, (_, k) => ray(k / 49)), c: "dim", a: 0.28, s: 0.6, at: 0 },
        { pts: segPts(e0[0], e0[1], e0[0] - 0.33, e0[1] + 0.3, 12), c: "dim", a: 0.18, s: 0.5, at: 0 }
      ],
      labels: [
        { x: -1.0, y: Y1 + 0.13, html: "me", cls: "example" }, { x: 0, y: Y1 + 0.13, html: "the lighter", cls: "example" }, { x: 1.0, y: Y1 + 0.13, html: "you", cls: "example" },
        { x: 1.38, y: Y0 - 0.08, html: "space", cls: "tag left" }, { x: -1.35, y: Y1 + 0.13, html: "time", cls: "tag" },
        { x: 0, y: 0, html: "“lighter”", cls: "example c-math", at: t => { const [x, y] = ray(prog(t)); return [x - 0.08, y + 0.13]; } },
        { x: 0, y: -1.04, html: "the thought, the word and what it is about are all events in spacetime", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const u = prog(t); let i = o;
          const hitL = Math.max(0, 1 - Math.abs(u - 0.5) / 0.12), hitY = u >= 1 ? Math.max(0, 1 - ((t % P) - P / 1.35) / 1.2) : 0;
          XS.forEach((x, w) => { for (let k = 0; k < N; k++) {
            const y = Y0 + (Y1 - Y0) * k / (N - 1), amp = 0.045 + (w === 1 ? 0.04 * hitL : w === 2 ? 0.05 * hitY : 0);
            out[i++] = { x: x + amp * Math.sin(9 * y - t * 2.6 + w), y, a: 0.55 + (w === 2 ? 0.4 * hitY : w === 1 ? 0.4 * hitL : 0) }; } });
          for (let k = 0; k < 12; k++) { const [x, y] = ray(Math.max(0, u - k * 0.012)); out[i++] = { x, y, a: u < 1 ? 1 - k / 12 : 0 }; }
          for (let k = 0; k < 30; k++) { const q = k / 30 * TAU, r = 0.05 + 0.12 * (1 - hitL); out[i++] = { x: r * Math.cos(q), y: ray(0.5)[1] + r * Math.sin(q), a: 0.9 * hitL }; }
          for (let k = 0; k < 30; k++) { const q = k / 30 * TAU, r = 0.05 + 0.14 * (1 - hitY); out[i++] = { x: e1[0] + r * Math.cos(q), y: e1[1] + r * Math.sin(q), a: 0.9 * hitY }; }
        }
      }
    });
  };

  /* What changes and what stays: particles spreading and mixing inside a circle, which is the part
     entropy counts, while the circle holds and a mark goes round and comes back, the part closure checks. */
  SCENES.clog = () => {
    const R = 0.62, cy = 0.02, N = 90, pts = [], seeds = [];
    for (let k = 0; k < N; k++) { seeds.push([Math.random() * TAU, Math.random() * TAU, 0.6 + Math.random() * 1.1, 0.5 + Math.random() * 1.2]); pts.push({ x: 0, y: cy, c: k % 2 ? "coral" : "violet", a: 0, s: 1 }); }
    for (let k = 0; k < 10; k++) pts.push({ x: 0, y: cy, c: "gold", a: 0, s: 1.6 - k * 0.1 });
    const spread = t => Math.min(1, (t % 10) / 6);
    return tScene({
      stillT: 7,
      shapes: [{ pts: ringPts(0, cy, R, 140), c: "cyan", a: 0.55, s: 0.85, at: 0 }],
      labels: [
        { x: 0.95, y: 0.3, html: "what changes", cls: "tag left c-coral" }, { x: 0.95, y: 0.16, html: "entropy counts it", cls: "example left" },
        { x: 0.95, y: -0.2, html: "what stays", cls: "tag left" }, { x: 0.95, y: -0.34, html: "closure checks it", cls: "example left" },
        { x: 0, y: -0.96, html: "the change is measured against what stays", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const sp = spread(t), rr = 0.12 + (R - 0.08 - 0.12) * sp;
          for (let k = 0; k < N; k++) {
            const [a0, b0, wa, wb] = seeds[k], r = rr * Math.sqrt(0.5 + 0.5 * Math.sin(b0 + t * wb)), a = a0 + t * wa * 0.5;
            out[o + k] = { x: r * Math.cos(a), y: cy + r * Math.sin(a), a: 0.85 };
          }
          const m = Math.PI / 2 - t * 0.9;
          for (let k = 0; k < 10; k++) { const q = m + k * 0.045; out[o + N + k] = { x: R * Math.cos(q), y: cy + R * Math.sin(q), a: 1 - k / 10 }; }
        }
      }
    });
  };

  /* The rest is residue, as sizes you can see. Words: one small gold cube is what a child learns a language from
     (under 100 million words); the big block is what a large model reads (over 10 trillion), built of 46 × 46 × 46,
     about 100,000, cubes that size. Energy: one gold square is a brain over a whole 80-year life; all 92 squares
     are one training of GPT-3. The block turns slowly so it reads as solid. */
  SCENES.gstrain = () => {
    const CX = -0.66, CY = -0.02, SC = 0.34, D = 46, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const corners = [-1, 1];
    const edges = []; corners.forEach(a => corners.forEach(b => { edges.push([[-1, a, b], [1, a, b]], [[a, -1, b], [a, 1, b]], [[a, b, -1], [a, b, 1]]); }));
    edges.forEach(([p0, p1]) => { for (let q = 0; q < 28; q++) { const u = q / 27; add({ kind: "cube", p: p0.map((v, j) => v + (p1[j] - v) * u), a: 0.55 }, { x: CX, y: CY, c: "dim", a: 0.5, s: 0.7 }); } });
    [[0, 1], [1, 1], [2, 1]].forEach(([ax, sg]) => { for (let a = 0; a < 11; a++) for (let b = 0; b < 11; b++) { const p = [0, 0, 0], o = [0, 1, 2].filter(j => j !== ax); p[ax] = sg; p[o[0]] = -1 + 2 * (a + 0.5) / 11; p[o[1]] = -1 + 2 * (b + 0.5) / 11; add({ kind: "cube", p, a: 0.22 }, { x: CX, y: CY, c: "dim", a: 0.22, s: 0.6 }); } });
    [0, 1, 2].forEach(ax => [[1, 1], [1, -1], [-1, 1]].forEach(([u, v]) => { for (let q = 1; q < D; q++) { const p = [0, 0, 0], o = [0, 1, 2].filter(j => j !== ax); p[ax] = 1 - 2 * q / D; p[o[0]] = u; p[o[1]] = v; add({ kind: "cube", p, a: 0.75 }, { x: CX, y: CY, c: "ice", a: 0.75, s: 0.6 }); } }));   // the 46 divisions along the near edges   // the divisions along three edges
    for (let q = 0; q < 14; q++) add({ kind: "cube", p: [1 - 2 / D * Math.random(), 1 - 2 / D * Math.random(), 1 - 2 / D * Math.random()], a: 1, gold: 1 }, { x: CX, y: CY, c: "gold", a: 1, s: 1.15 });
    const GX = 0.42, GY = 0.42, PITCH = 0.088;
    for (let n = 0; n < 92; n++) { const col = n % 10, row = Math.floor(n / 10); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) add({ kind: "fixed", a: n ? 0.45 : 1 }, { x: GX + col * PITCH + (a - 1) * 0.022, y: GY - row * PITCH + (b - 1) * 0.022, c: n ? "dim" : "gold", a: n ? 0.45 : 1, s: n ? 0.85 : 1.1 }); }
    const P = (p, t) => { const [X, Y, d] = view3(p[0] * SC, p[1] * SC, p[2] * SC, 0.6 + 0.15 * Math.sin(t * 0.25), 0.45); return [CX + X, CY + Y, d]; };
    const out = new Array(points.length);
    return {
      points, stillT: 2,
      dynamic: t => { meta.forEach((m, i) => { if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: m.a }; return; } const [x, y, d] = P(m.p, t); out[i] = { x, y, a: m.gold ? 1 : m.a * (0.45 + 0.55 * d) }; }); return out; },
      labels: [
        { x: CX, y: 0.78, html: "words read to learn a language", cls: "role" },
        { x: 0, y: 0, html: "a child", cls: "fword left c-math", at: t => { const [x, y] = P([1, 1, 1], t); return [x + 0.05, y + 0.05]; } },
        { x: 0, y: 0, html: "Llama 3", cls: "fword left", at: t => { const [x, y] = P([1, -1, -1], t); return [x + 0.05, y - 0.04]; } },
        { x: CX, y: -0.62, html: "gold cube: a child, under 100 million words", cls: "example" },
        { x: CX, y: -0.74, html: "whole block: Llama 3, over 10 trillion words", cls: "example" },
        { x: GX + 4.5 * PITCH, y: 0.78, html: "energy", cls: "role" },
        { x: GX + 4.5 * PITCH, y: -0.62, html: "gold square: a brain for a whole life, 14 MWh", cls: "example" },
        { x: GX + 4.5 * PITCH, y: -0.74, html: "all squares: training GPT-3 once, 1,300 MWh", cls: "example" }
      ]
    };
  };

  /* The symbols and what they carry: above, the word crosses and arrives letter for letter (Level A);
     below, the lighter it was about stays lit on the sender's side and arrives only as an empty outline (Level B). */
  SCENES.parrot = () => {
    const xa = -0.95, xb = 0.95, ya = 0.42, yb = -0.38;
    const lighter = (x, y) => [...segPts(x - 0.07, y - 0.16, x + 0.07, y - 0.16, 8), ...segPts(x - 0.07, y - 0.16, x - 0.07, y + 0.08, 12), ...segPts(x + 0.07, y - 0.16, x + 0.07, y + 0.08, 12), ...segPts(x - 0.07, y + 0.08, x + 0.07, y + 0.08, 8)];
    return tScene({
      stillT: 2,
      shapes: [
        { pts: segPts(xa + 0.28, ya, xb - 0.28, ya, 40), c: "dim", a: 0.25, s: 0.6, at: 0 },
        { pts: lighter(xa, yb), c: "brass", a: 0.95, s: 1, at: 0 },
        { pts: blobPts(xa, yb + 0.16, 0.025, 14), c: "gold", a: 1, s: 1.2, at: 0 },
        { pts: lighter(xb, yb), c: "dim", a: 0.3, s: 0.8, at: 0 },
        { pts: segPts(xa + 0.28, yb, xb - 0.28, yb, 40), c: "dim", a: 0.12, s: 0.5, at: 0 }
      ],
      streams: [{ path: u => [xa + 0.28 + (xb - xa - 0.56) * u, ya], n: 8, speed: 0.35, c: "cyan", ends: true, at: 0 }],
      labels: [
        { x: xa, y: ya, html: "“lighter”", cls: "example c-math" }, { x: xb, y: ya, html: "“lighter”", cls: "example c-math" },
        { x: 0, y: ya + 0.2, html: "Level A: the symbols arrive", cls: "tag" },
        { x: 0, y: yb + 0.2, html: "Level B: what they carry", cls: "tag" },
        { x: xa, y: yb - 0.32, html: "what I meant", cls: "example" }, { x: xb, y: yb - 0.32, html: "what a parrot gets", cls: "example" }
      ]
    });
  };

  /* How bits become complete: one bit, two messages; two bits, four; three bits, eight, each place worth
     twice the next, so two symbols and position reach every whole number. */
  SCENES.bitcount = () => {
    const rows = [[1, 0.62], [2, 0.18], [3, -0.34]], shapes = [], labels = [];
    rows.forEach(([n, y], r) => {
      const m = 1 << n, w = 0.3, x0 = -((m - 1) * w) / 2 - 0.1;
      for (let k = 0; k < m; k++) {
        const x = x0 + k * w;
        shapes.push({ pts: ringPts(x, y, 0.1, 30), c: "brass", a: 0.75, s: 0.8, at: r * 0.6 + k * 0.05 });
        labels.push({ x, y: y - 0.2, html: k.toString(2).padStart(n, "0"), cls: "slot" });
      }
      labels.push({ x: -1.62, y, html: `${n} bit${n > 1 ? "s" : ""}`, cls: "tag left" });
      labels.push({ x: 1.62, y, html: `${m} messages`, cls: "example left-of" });
    });
    labels.push({ x: 0, y: -0.86, html: "each bit added doubles the messages", cls: "example" });
    return tScene({ shapes, labels, stillT: 3 });
  };

  /* Every bit is somewhere: four physical bits, a voltage, a magnet, a pit on a disc, a punched hole. */
  SCENES.bitforms = () => {
    const X = [-1.05, -0.35, 0.35, 1.05], y = 0.1, shapes = [], streams = [];
    shapes.push({ pts: [...segPts(X[0] - 0.22, y - 0.15, X[0] - 0.05, y - 0.15, 10), ...segPts(X[0] - 0.05, y - 0.15, X[0] - 0.05, y + 0.15, 14), ...segPts(X[0] - 0.05, y + 0.15, X[0] + 0.22, y + 0.15, 14)], c: "cyan", a: 0.9, s: 0.9, at: 0 });
    shapes.push({ pts: [...segPts(X[1], y - 0.18, X[1], y + 0.18, 18), ...segPts(X[1] - 0.06, y + 0.11, X[1], y + 0.18, 4), ...segPts(X[1] + 0.06, y + 0.11, X[1], y + 0.18, 4)], c: "coral", a: 0.95, s: 1, at: 0.15 });
    shapes.push({ pts: [...ringPts(X[2], y, 0.2, 60), ...blobPts(X[2] + 0.1, y + 0.05, 0.012, 6)], c: "violet", a: 0.8, s: 0.85, at: 0.3 });
    shapes.push({ pts: [...segPts(X[3] - 0.16, y - 0.2, X[3] + 0.16, y - 0.2, 12), ...segPts(X[3] - 0.16, y + 0.2, X[3] + 0.16, y + 0.2, 12), ...segPts(X[3] - 0.16, y - 0.2, X[3] - 0.16, y + 0.2, 14), ...segPts(X[3] + 0.16, y - 0.2, X[3] + 0.16, y + 0.2, 14), ...ringPts(X[3], y + 0.05, 0.045, 14)], c: "brass", a: 0.85, s: 0.85, at: 0.45 });
    const names = ["a voltage on a wire", "a magnet on a disk", "a pit on a disc", "a hole in a card"];
    return tScene({
      shapes, stillT: 2,
      labels: [...X.map((x, k) => ({ x, y: y - 0.36, html: names[k], cls: "example" })), { x: 0, y: -0.86, html: "every bit sits somewhere and takes time to travel", cls: "example" }]
    });
  };

  /* What it means for identity to be a physical law, as a mapping: on the left the names for an apple, which
     change from language to language (and the bits a computer stores); an arrow from each into the one apple on
     the right, which is the same shape for everyone. The apple is traced by its own rotations, a turning arm with
     smaller turns at its tip, computed from the outline. Dots travel along the arrows into the apple. */
  SCENES.greturn = () => {
    const NX = -1.0, AX = 0.42, AY = -0.02, SZ = 0.3, N = 128, KEEP = 12, T = 9, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), g = x => Math.exp(-((wrap(x) / 0.42) ** 2));
    const apple = th => 1 - 0.2 * g(th - Math.PI / 2) - 0.06 * g(th + Math.PI / 2);
    const outline = Array.from({ length: N }, (_, n) => { const th = n / N * TAU, r = SZ * apple(th); return [1.06 * r * Math.cos(th), r * Math.sin(th)]; });
    const terms = [];
    for (let kk = -N / 2 + 1; kk <= N / 2; kk++) { let re = 0, im = 0; outline.forEach(([x, y], n) => { const a = -TAU * kk * n / N; re += (x * Math.cos(a) - y * Math.sin(a)) / N; im += (x * Math.sin(a) + y * Math.cos(a)) / N; }); terms.push({ k: kk, re, im, r: Math.hypot(re, im) }); }
    const c0 = terms.find(q => q.k === 0), chain = terms.filter(q => q.k !== 0).sort((a, b) => b.r - a.r).slice(0, KEEP);
    const partial = (s, upto) => { let x = AX + c0.re, y = AY + c0.im; for (let q = 0; q < upto; q++) { const c = chain[q], a = TAU * c.k * s; x += c.re * Math.cos(a) - c.im * Math.sin(a); y += c.re * Math.sin(a) + c.im * Math.cos(a); } return [x, y]; };
    outline.forEach(([x, y]) => add({ kind: "fixed", a: 0.85 }, { x: AX + x, y: AY + y, c: "gold", a: 0.85, s: 0.85 }));
    for (let q = 0; q < 6; q++) add({ kind: "fixed", a: 0.9 }, { x: AX + 0.004 * q, y: AY + SZ * 0.8 + 0.016 * q, c: "gold", a: 0.9, s: 0.85 });   // the stem
    chain.slice(0, 4).forEach((c, q) => { const n = Math.max(12, Math.round(60 * c.r / chain[0].r)); for (let b = 0; b < n; b++) add({ kind: "ring", q, b: b / n * TAU }, { x: AX, y: AY, c: "cyan", a: 0.4, s: 0.6 }); });
    chain.forEach((c, q) => { for (let u = 0; u < 6; u++) add({ kind: "arm", q, u: u / 5 }, { x: AX, y: AY, c: "ice", a: 0.8, s: 0.7 }); });
    for (let q = 0; q < 7; q++) add({ kind: "pen", j: [gauss() * 0.008, gauss() * 0.008] }, { x: AX, y: AY, c: "paper", a: 1, s: 1.2 });
    const NAMES = ["apple", "maçã", "pomme", "Apfel", "яблоко", "01100001…"], NY = k => 0.5 - k * 0.2;
    const tip = k => { const a = Math.PI - (2.5 - k) * 0.3, r = SZ * apple(Math.PI - (2.5 - k) * 0.3) * 1.1; return [AX + 1.06 * r * Math.cos(a), AY + r * Math.sin(a)]; };   // spread along the left side
    NAMES.forEach((w, k) => {
      const sx = NX + 0.36, sy = NY(k), [ex, ey] = tip(k);
      for (let q = 0; q < 30; q++) add({ kind: "fixed", a: 0.5 }, { x: sx + (ex - sx) * q / 29, y: sy + (ey - sy) * q / 29, c: "dim", a: 0.5, s: 0.65 });
      const dx = ex - sx, dy = ey - sy, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      [-1, 1].forEach(sg => { for (let q = 1; q <= 3; q++) add({ kind: "fixed", a: 0.7 }, { x: ex - ux * 0.01 * q + sg * -uy * 0.006 * q, y: ey - uy * 0.01 * q + sg * ux * 0.006 * q, c: "ice", a: 0.7, s: 0.6 }); });
      for (let q = 0; q < 2; q++) add({ kind: "flow", k, sx, sy, ex, ey, ph: q / 2 + k * 0.13 }, { x: sx, y: sy, c: "ice", a: 0.9, s: 0.95 });
    });
    const out = new Array(points.length);
    return {
      points, stillT: 6.5,
      dynamic: t => {
        const s = (t / T) % 1;
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: points[i].x, y: points[i].y, a: m.a }; return; }
          if (m.kind === "flow") { const u = (m.ph + t * 0.18) % 1; out[i] = { x: m.sx + (m.ex - m.sx) * u, y: m.sy + (m.ey - m.sy) * u, a: 0.9 * Math.sin(Math.PI * u) }; return; }
          if (m.kind === "ring") { const [cx, cy] = partial(s, m.q), r = chain[m.q].r; out[i] = { x: cx + r * Math.cos(m.b), y: cy + r * Math.sin(m.b), a: 0.4 }; return; }
          if (m.kind === "arm") { const [x0, y0] = partial(s, m.q), [x1, y1] = partial(s, m.q + 1); out[i] = { x: x0 + (x1 - x0) * m.u, y: y0 + (y1 - y0) * m.u, a: 0.8 }; return; }
          const [x, y] = partial(s, KEEP); out[i] = { x: x + m.j[0], y: y + m.j[1], a: 1 };
        });
        return out;
      },
      labels: [
        { x: NX + 0.1, y: 0.78, html: "names", cls: "role" }, { x: AX, y: 0.78, html: "the thing", cls: "role" },
        ...NAMES.map((w, k) => ({ x: NX + 0.3, y: NY(k), html: w, cls: "slot right" })),
        { x: NX + 0.1, y: -0.78, html: "they change from language to language", cls: "example" },
        { x: AX, y: -0.78, html: "one shape, the same for everyone", cls: "example" }
      ]
    };
  };

  /* Meaning has a shape: the same arrangement of relations held in two frames. The second copy is
     turned and slightly off; a rotation brings it onto the first, and what is left over shows as the gap. */
  SCENES.gshape = () => {
    const base = [[0, 0.32], [0.26, 0.12], [0.18, -0.24], [-0.16, -0.26], [-0.3, 0.06], [0.04, 0.02]].map(([x, y]) => [x * 1.55, y * 1.55]);
    const names = ["love", "care", "loss", "you", "home", "time"];
    const L = [-0.8, 0.12], Rr = [0.8, 0.12], P = 6, tilt = 1.1;
    const jit = base.map(() => [gauss() * 0.035, gauss() * 0.035]);
    const pts = [], meta = [];
    const edges = [[0, 1], [0, 3], [1, 2], [2, 3], [3, 4], [4, 0], [5, 0], [5, 2]];
    [L, Rr].forEach((c, side) => {
      base.forEach((p, i) => { for (let q = 0; q < 8; q++) { pts.push({ x: c[0], y: c[1], c: side ? "cyan" : "brass", a: 0, s: 1.1 }); meta.push({ side, i, j: [gauss() * 0.012, gauss() * 0.012] }); } });
      edges.forEach(([a, b]) => { for (let q = 0; q < 12; q++) { pts.push({ x: c[0], y: c[1], c: side ? "cyan" : "brass", a: 0, s: 0.6 }); meta.push({ side, e: [a, b], u: q / 11 }); } });
    });
    const turnBy = t => { const c = t % P; return c < 1.5 ? tilt : c < 4 ? tilt * (1 - (1 - Math.cos(Math.PI * (c - 1.5) / 2.5)) / 2) : 0; };
    const place = (side, i, t) => {
      const [x, y] = base[i];
      if (!side) return [L[0] + x, L[1] + y];
      const a = turnBy(t), d = jit[i], xx = x + d[0], yy = y + d[1];
      return [Rr[0] + xx * Math.cos(a) - yy * Math.sin(a), Rr[1] + xx * Math.sin(a) + yy * Math.cos(a)];
    };
    return tScene({
      stillT: 4.5,
      labels: [
        ...base.map((p, i) => i === 5 ? { x: L[0] + p[0] + 0.17, y: L[1] + p[1] - 0.1, html: names[i], cls: "example" } : { x: L[0] + p[0] * 1.28, y: L[1] + p[1] * 1.28, html: names[i], cls: "example" }),
        { x: L[0], y: -0.62, html: "my frame", cls: "tag" }, { x: Rr[0], y: -0.62, html: "your frame", cls: "tag" },
        { x: 0, y: -0.86, html: "", cls: "example", live: t => (t % P) < 4 ? "the same shape, turned: a rotation brings it back" : "what is left over is the meaning that was lost" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          meta.forEach((m, k) => {
            if (m.i !== undefined) { const [x, y] = place(m.side, m.i, t); out[o + k] = { x: x + m.j[0], y: y + m.j[1], a: 0.95 }; }
            else { const [x1, y1] = place(m.side, m.e[0], t), [x2, y2] = place(m.side, m.e[1], t); out[o + k] = { x: x1 + (x2 - x1) * m.u, y: y1 + (y2 - y1) * m.u, a: 0.35 }; }
          });
        }
      }
    });
  };

  /* Markov's letters: a stream of vowels and consonants where each depends on the last (his Onegin
     transition rates), and below it the running share of vowels settling all the same, near 0.43. */
  SCENES.markov = () => {
    const N = 26, M = 160, pVV = 0.128, pVC = 0.663, X0 = -1.3, X1 = 1.3, yS = 0.55, gy0 = -0.75, gh = 0.95;
    let st = 0, seq = [];
    const next = () => { st = Math.random() < (st ? pVV : pVC) ? 1 : 0; return st; };
    for (let k = 0; k < 4000; k++) seq.push(next());
    const pts = [];
    for (let k = 0; k < N; k++) pts.push({ x: 0, y: yS, c: "dim", a: 0, s: 1.4 });
    for (let k = 0; k < M; k++) pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 0.95 });
    const rate = 9, gx = n => X0 + (X1 - X0) * Math.log(1 + n) / Math.log(4001), gyv = v => gy0 + gh * v;
    return tScene({
      stillT: 380,
      shapes: [{ pts: segPts(X0, gy0, X1, gy0, 60), c: "dim", a: 0.35, s: 0.6, at: 0 }, { pts: segPts(X0, gyv(0.432), X1, gyv(0.432), 70), c: "cyan", a: 0.35, s: 0.55, at: 0 }],
      labels: [
        { x: X0, y: yS + 0.16, html: "each letter depends on the last", cls: "tag left" },
        { x: X1 + 0.04, y: gyv(0.432), html: "0.43", cls: "example left" },
        { x: X0, y: gy0 + gh + 0.08, html: "share of vowels so far", cls: "tag left" },
        { x: 0, y: -0.98, html: "", cls: "example", live: t => { const n = Math.min(4000, Math.floor(t * rate) + 1); let v = 0; for (let k = 0; k < n; k++) v += seq[k]; return `${n} letters, vowels ${(v / n).toFixed(3)}`; } }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const n = Math.min(4000, Math.floor(t * rate) + 1);
          for (let k = 0; k < N; k++) { const idx = Math.max(0, n - N + k), on = n - N + k >= 0; out[o + k] = { x: X0 + (X1 - X0) * k / (N - 1), y: yS, a: on ? 0.95 : 0, c: seq[idx] ? "cyan" : "brass" }; }
          let v = 0; const cum = []; for (let k = 0; k < n; k++) { v += seq[k]; cum.push(v / (k + 1)); }
          for (let k = 0; k < M; k++) { const m = Math.max(1, Math.round(Math.exp(Math.log(n) * (k + 1) / M))), idx = Math.min(cum.length, m) - 1; out[o + N + k] = { x: gx(idx + 1), y: gyv(cum[idx]), a: 0.85 }; }
        }
      }
    });
  };

  /* Four letters for every living thing: a double helix turning, its rungs the four bases in their two
     pairs, and the same four letters spelling a bacterium, a tree and a person. */
  SCENES.dnahelix = () => {
    const N = 22, X0 = -1.5, X1 = -0.3, R = 0.2, cy = 0.05, S = 120, pts = [], meta = [];
    const BASES = ["A", "T", "C", "G"], COL = { A: "coral", T: "cyan", C: "mint", G: "brass" }, PAIR = { A: "T", T: "A", C: "G", G: "C" };
    const seq = Array.from({ length: N }, () => BASES[Math.floor(Math.random() * 4)]);
    for (let s2 = 0; s2 < 2; s2++) for (let k = 0; k < S; k++) { pts.push({ x: 0, y: cy, c: "ice", a: 0, s: 0.85 }); meta.push({ strand: s2, u: k / (S - 1) }); }
    for (let k = 0; k < N; k++) for (let q = 0; q < 6; q++) { const b = q < 3 ? seq[k] : PAIR[seq[k]]; pts.push({ x: 0, y: cy, c: COL[b], a: 0, s: 0.9 }); meta.push({ k, rung: (q + 0.5) / 6 }); }
    const at3 = (u, side, t) => { const a = u * 3.2 * TAU + t * 0.8 + (side ? Math.PI : 0); return [X0 + (X1 - X0) * u, cy + R * Math.cos(a), Math.sin(a)]; };
    // three living forms written from the same four letters
    const FX = 0.85, forms = [
      { y: 0.56, c: "coral", name: "a bacterium", pts: [...Array.from({ length: 30 }, (_, k) => { const a = Math.PI / 2 + k / 29 * Math.PI; return [FX - 0.12 + 0.07 * Math.cos(a), 0.56 + 0.07 * Math.sin(a)]; }), ...Array.from({ length: 30 }, (_, k) => { const a = -Math.PI / 2 + k / 29 * Math.PI; return [FX + 0.12 + 0.07 * Math.cos(a), 0.56 + 0.07 * Math.sin(a)]; }), ...segPts(FX - 0.12, 0.63, FX + 0.12, 0.63, 12), ...segPts(FX - 0.12, 0.49, FX + 0.12, 0.49, 12), ...Array.from({ length: 10 }, (_, k) => [FX + 0.2 + k * 0.012, 0.56 + 0.025 * Math.sin(k * 1.2)])] },
      { y: 0.04, c: "mint", name: "a tree", pts: [...segPts(FX, -0.12, FX, 0.04, 12), ...ringPts(FX, 0.13, 0.11, 40), ...segPts(FX, 0.0, FX - 0.07, 0.07, 6), ...segPts(FX, 0.02, FX + 0.07, 0.09, 6)] },
      { y: -0.5, c: "cyan", name: "you", pts: [...ringPts(FX, -0.32, 0.045, 18), ...segPts(FX, -0.37, FX, -0.53, 12), ...segPts(FX - 0.09, -0.42, FX + 0.09, -0.42, 12), ...segPts(FX, -0.53, FX - 0.07, -0.66, 9), ...segPts(FX, -0.53, FX + 0.07, -0.66, 9)] }
    ];
    const ex = X1 + 0.08, shapes = [], streams = [];
    forms.forEach(f => {
      shapes.push({ pts: f.pts, c: f.c, a: 0.9, s: 0.85, at: 0 });
      const tx = FX - 0.26, ty = f.y;
      streams.push({ path: u => [ex + (tx - ex) * u, cy + (ty - cy) * u], n: 7, speed: 0.3, c: f.c, ends: true, at: 0 });
    });
    return tScene({
      stillT: 2, shapes, streams,
      labels: [
        { x: (X0 + X1) / 2, y: 0.42, html: "A · T · C · G", cls: "math c-math" },
        { x: (X0 + X1) / 2, y: -0.28, html: "four letters, two pairs", cls: "example" },
        ...forms.map(f => ({ x: FX + 0.4, y: f.y, html: f.name, cls: "example left" })),
        { x: 0, y: -0.92, html: "agree on four letters, and everything alive is written with them", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          meta.forEach((m, i) => {
            if (m.strand !== undefined) { const [x, y, z] = at3(m.u, m.strand, t); out[o + i] = { x, y, a: 0.25 + 0.7 * (z + 1) / 2 }; }
            else { const u = m.k / (N - 1), p1 = at3(u, 0, t), p2 = at3(u, 1, t), y = p1[1] + (p2[1] - p1[1]) * m.rung, z = p1[2] + (p2[2] - p1[2]) * m.rung; out[o + i] = { x: p1[0], y, a: 0.3 + 0.6 * (z + 1) / 2 }; }
          });
        }
      }
    });
  };

  /* Everything we touch is information: three things pass through change and stay themselves. A particle
     (a closed loop) is pushed, lit and turned by a field, and its path bends while the loop stays closed;
     a genome is copied again and again with the same sequence; a word is said in three different voices,
     three different sounds, and stays the same word. */
  SCENES.ginfo = () => {
    const Y = [0.56, 0, -0.56], X0 = -0.82, X1 = 0.86, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const ZX = [-0.42, 0.06, 0.5], ZC = ["coral", "gold", "violet"], SL = [0, 0.22, -0.42, 0.2];
    const pathY = x => { let y = Y[0], xs = [X0, ...ZX, X1]; for (let k = 0; k < 4; k++) { const a = xs[k], b = xs[k + 1]; if (x <= a) break; y += SL[k] * (Math.min(x, b) - a); } return y; };
    for (let q = 0; q < 18; q++) add({ kind: "loop", b: q / 18 * TAU }, { x: X0, y: Y[0], c: "ice", a: 0.9, s: 0.85 });
    for (let q = 0; q < 70; q++) add({ kind: "trail", k: q }, { x: X0, y: Y[0], c: "cyan", a: 0.3, s: 0.55 });
    for (let q = 0; q < 90; q++) add({ kind: "path", x: X0 + (X1 - X0) * q / 89 }, { x: X0, y: Y[0], c: "ice", a: 0.18, s: 0.5 });
    ZX.forEach((zx, z) => { for (let q = 0; q < 12; q++) add({ kind: "zone", z, v: (q / 11 - 0.5) * 0.3 }, { x: zx, y: Y[0], c: ZC[z], a: 0.4, s: 0.7 }); });
    const SEQ = ["mint", "gold", "coral", "cyan", "gold", "mint", "cyan", "coral"], BS = 0.042, NC = 3, RUN = 1.29;
    for (let k = -1; k < NC; k++) SEQ.forEach((c, i) => { for (let q = 0; q < 3; q++) add({ kind: "bead", k, i, j: [gauss() * 0.006, gauss() * 0.006] }, { x: X0, y: Y[1], c, a: 0.9, s: 0.95 }); });
    const VOICES = [[x => Math.sin(TAU * 6 * x), 0.07, "cyan"], [x => Math.sin(TAU * 9 * x) * (0.55 + 0.45 * Math.sin(TAU * 1.6 * x)), 0.085, "mint"], [x => 0.7 * Math.sin(TAU * 3.5 * x) + 0.45 * Math.sin(TAU * 11 * x), 0.06, "violet"]];
    VOICES.forEach((v, n) => { for (let q = 0; q < 80; q++) add({ kind: "voice", n, u: q / 79 }, { x: X0, y: Y[2], c: v[2], a: 0, s: 0.7 }); });
    return tScene({
      stillT: 3.2,
      labels: [
        ...["a particle", "a genome", "a word"].map((h, k) => ({ x: X0 - 0.12, y: Y[k], html: h, cls: "role right" })),
        ...["through its interactions", "through copying", "through being said"].map((h, k) => ({ x: X1 + 0.14, y: Y[k], html: h, cls: "example left" })),
        { x: 0.62, y: Y[2], html: "“lighter”", cls: "slot c-math" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const u = (t / 5.5) % 1, px = X0 + (X1 - X0) * u, py = pathY(px), pe = Math.min(1, u / 0.06, (1 - u) / 0.06);
          const voice = t / 2.6, vn = Math.floor(voice) % 3, vf = voice % 1, vin = Math.min(1, vf / 0.15, (1 - vf) / 0.15);
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "loop": v = { x: px + 0.055 * Math.cos(m.b + t * 2), y: py + 0.055 * Math.sin(m.b + t * 2), a: 0.9 * pe }; break;
              case "trail": { const x = px - m.k * 0.012; v = { x, y: pathY(Math.max(X0, x)), a: x < X0 ? 0 : 0.6 * (1 - m.k / 70) * pe }; break; }
              case "path": v = { x: m.x, y: pathY(m.x), a: 0.2 }; break;
              case "zone": { const near = Math.max(0, 1 - Math.abs(px - ZX[m.z]) / 0.08); v = { x: ZX[m.z], y: pathY(ZX[m.z]) + m.v, a: 0.25 + 0.6 * near }; break; }
              case "bead": {
                const d = m.k < 0 ? 0 : ((t * 0.16 + m.k * RUN / NC) % RUN), x = X0 + 0.02 + d + m.i * BS;
                const a = m.k < 0 ? 0.95 : 0.9 * Math.min(1, d / 0.12, (RUN - d) / 0.2);
                v = { x: x + m.j[0], y: Y[1] + m.j[1], a }; break;
              }
              default: { const x = X0 + m.u * 1.15, [f, amp] = VOICES[m.n]; v = { x, y: Y[2] + amp * f(m.u * 1.15 - t * 0.6) * Math.sin(Math.PI * m.u), a: m.n === vn ? 0.85 * vin : 0 }; }
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* One paradigm: every field starts as its own frame, its own reference axes at its own angle; then
     they glide onto one shared circle and their axes line up with the one reference, and back again. */
  SCENES.gparadigm = () => {
    const F = [["mathematics", "gold"], ["physics", "cyan"], ["biology", "coral"], ["computing", "violet"], ["language", "mint"], ["engineering", "brass"]];
    const R = 0.66, cy = 0.02, r = 0.13, P = 10;
    const start = [[-1.25, 0.55], [-0.35, 0.72], [0.6, 0.6], [1.3, 0.35], [-1.05, -0.45], [1.0, -0.5]];
    const spin = F.map((_, k) => 0.35 + 0.17 * k), a0 = F.map((_, k) => k * 1.7);
    const pts = [], meta = [];
    F.forEach(([n, c], k) => {
      for (let q = 0; q < 26; q++) { pts.push({ x: 0, y: 0, c, a: 0, s: 0.75 }); meta.push({ k, ring: q / 26 * TAU }); }
      for (let ax = 0; ax < 2; ax++) for (let q = 0; q < 9; q++) { pts.push({ x: 0, y: 0, c, a: 0, s: 0.75 }); meta.push({ k, ax, u: -1 + 2 * q / 8 }); }
      for (let q = 0; q < 4; q++) { pts.push({ x: 0, y: 0, c: "paper", a: 0, s: 1.2 }); meta.push({ k, dot: 1 }); }
    });
    for (let q = 0; q < 140; q++) { pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 0.8 }); meta.push({ big: q / 140 * TAU }); }
    for (let ax = 0; ax < 2; ax++) for (let q = 0; q < 40; q++) { pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 0.7 }); meta.push({ bigax: ax, u: -1.15 + 2.3 * q / 39 }); }
    const ease = v => v <= 0 ? 0 : v >= 1 ? 1 : (1 - Math.cos(Math.PI * v)) / 2;
    const mix = t => { const c = t % P; return c < 2.5 ? 0 : c < 5 ? ease((c - 2.5) / 2.5) : c < 8.5 ? 1 : 1 - ease((c - 8.5) / 1.5); };
    const frame = (k, t) => {
      const m = mix(t), ang = Math.PI / 2 - k / F.length * TAU, end = [R * Math.cos(ang), cy + R * Math.sin(ang)];
      const x = start[k][0] + (end[0] - start[k][0]) * m, y = start[k][1] + (end[1] - start[k][1]) * m;
      const own = a0[k] + t * spin[k], rot = own * (1 - m);
      return { x, y, rot };
    };
    return tScene({
      stillT: 6.5,
      labels: [
        ...F.map(([n], k) => ({ x: 0, y: 0, html: n, cls: "tag", at: t => { const f = frame(k, t); return [f.x, f.y - r - 0.1]; } })),
        { x: 0, y: -0.98, html: "", cls: "example", live: t => mix(t) < 0.5 ? "each field checks against a reference of its own" : "one reference, shared by every field" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const m = mix(t);
          meta.forEach((p, i) => {
            if (p.big !== undefined) { out[o + i] = { x: R * Math.cos(p.big), y: cy + R * Math.sin(p.big), a: 0.5 * m }; return; }
            if (p.bigax !== undefined) { out[o + i] = p.bigax ? { x: 0, y: cy + p.u * R, a: 0.35 * m } : { x: p.u * R, y: cy, a: 0.35 * m }; return; }
            const f = frame(p.k, t);
            if (p.ring !== undefined) out[o + i] = { x: f.x + r * Math.cos(p.ring), y: f.y + r * Math.sin(p.ring), a: 0.75 };
            else if (p.ax !== undefined) { const a = f.rot + (p.ax ? Math.PI / 2 : 0); out[o + i] = { x: f.x + r * p.u * Math.cos(a), y: f.y + r * p.u * Math.sin(a), a: 0.8 }; }
            else out[o + i] = { x: f.x + gauss() * 0.01, y: f.y + gauss() * 0.01, a: 1 };
          });
        }
      }
    });
  };

  /* Meaning in a model, in 3D: words as points on a sphere, clustered by meaning, the view slowly
     turning. An English cloud and a Portuguese cloud start in different frames; one rotation brings
     the second onto the first, and each word lands on its translation. */
  SCENES.gembed3d = () => {
    const R = 0.8, cy = 0.02, P = 11, tilt = 0.35;
    const norm = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
    const CL = [
      { d: [0.8, 0.5, 0.3], en: ["apple", "pear"], pt: ["maçã", "pera"] },
      { d: [-0.7, 0.6, 0.2], en: ["love", "care"], pt: ["amor", "carinho"] },
      { d: [0.2, -0.7, 0.7], en: ["dog", "cat"], pt: ["cão", "gato"] },
      { d: [-0.3, -0.4, -0.85], en: ["king", "queen"], pt: ["rei", "rainha"] }
    ].map(c => ({ ...c, d: norm(c.d) }));
    const near = (d, s) => norm([d[0] + gauss() * s, d[1] + gauss() * s, d[2] + gauss() * s]);
    const base = [], words = [];
    CL.forEach((c, ci) => {
      for (let k = 0; k < 34; k++) base.push({ v: near(c.d, 0.2), ci });
      c.en.forEach((w, k) => { const v = near(c.d, 0.2); words.push({ v, en: w, pt: c.pt[k] }); base.push({ v, ci, word: true }); });
    });
    for (let k = 0; k < 60; k++) base.push({ v: near([gauss(), gauss(), gauss()], 0), ci: -1 });
    const axis = norm([1, 1, 0.3]), ANG = 1.7;
    const rot = (v, a) => { const [x, y, z] = v, [u, w, q] = axis, c = Math.cos(a), sn = Math.sin(a), dot = u * x + w * y + q * z;
      return [x * c + (w * z - q * y) * sn + u * dot * (1 - c), y * c + (q * x - u * z) * sn + w * dot * (1 - c), z * c + (u * y - w * x) * sn + q * dot * (1 - c)]; };
    const ease = v => v <= 0 ? 0 : v >= 1 ? 1 : (1 - Math.cos(Math.PI * v)) / 2;
    const mix = t => { const c = t % P; return c < 3 ? 0 : c < 6.5 ? ease((c - 3) / 3.5) : c < 10 ? 1 : 1 - ease(c - 10); };
    const proj = (v, t) => { const [X, Y, d] = view3(v[0] * R, v[1] * R, v[2] * R, 0.4 + t * 0.12, tilt); return [X, cy + Y, d]; };
    const pts = [], meta = [];
    const COL = ["brass", "coral", "mint", "violet"];
    base.forEach(b => { pts.push({ x: 0, y: 0, c: b.ci < 0 ? "dim" : "cyan", a: 0, s: b.word ? 1.6 : 0.85 }); meta.push({ b, side: 0 }); });
    base.forEach(b => { if (b.ci < 0) return; pts.push({ x: 0, y: 0, c: "coral", a: 0, s: b.word ? 1.6 : 0.85 }); meta.push({ b, side: 1 }); });
    const wire = [];
    for (let k = 0; k < 120; k++) { const a = k / 120 * TAU; wire.push([Math.cos(a), 0, Math.sin(a)], [Math.cos(a), Math.sin(a), 0], [0, Math.sin(a), Math.cos(a)]); }
    wire.forEach(v => { pts.push({ x: 0, y: 0, c: "ice", a: 0, s: 0.55 }); meta.push({ wire: v }); });
    const place = (v, side, t) => side ? rot(v, ANG * (1 - mix(t))) : v;
    return tScene({
      stillT: 8,
      labels: [
        ...words.map(w => ({ x: 0, y: 0, html: w.en, cls: "example c-cyan", at: t => { const [x, y] = proj(w.v, t); return [x + 0.09, y + 0.05]; } })),
        ...words.map(w => ({ x: 0, y: 0, html: w.pt, cls: "example c-coral", at: t => { const [x, y] = proj(place(w.v, 1, t), t); return [x + 0.09, y - 0.07]; } })),
        { x: -0.5, y: 1.0, html: "English", cls: "tag c-cyan" }, { x: 0.5, y: 1.0, html: "Portuguese", cls: "tag c-coral" },
        { x: 0, y: -1.02, html: "", cls: "example", live: t => mix(t) < 0.5 ? "each language arranges meanings in its own frame" : "one rotation lines them up: each word lands on its translation" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          meta.forEach((m, i) => {
            if (m.wire) { const [x, y, d] = proj(m.wire, t); out[o + i] = { x, y, a: 0.06 + 0.16 * d }; return; }
            const [x, y, d] = proj(place(m.b.v, m.side, t), t);
            out[o + i] = { x, y, a: (m.b.ci < 0 ? 0.25 : m.b.word ? 1 : 0.55) * (0.25 + 0.75 * d) };
          });
        }
      }
    });
  };

  /* Science almost does it already: Euler's identity at the centre, and every field that already writes
     it into its equations scattered around in rings, coloured by field, each fed by a thread from the centre. */
  SCENES.gconstellation = () => {
    const G = [["Mathematics", "math", "gold", ["complex analysis", "Fourier analysis", "roots of unity", "the zeta function", "groups of rotations", "winding numbers", "differential equations"]], ["Physics", "cyan", "cyan", ["classical mechanics", "quantum mechanics", "relativity", "light", "optics", "holography", "spin", "particle forces", "superconductivity"]], ["Engineering", "brass", "brass", ["alternating current", "control and stability", "signal processing", "radio", "the Smith chart", "vibration analysis", "aircraft attitude"]], ["Computing", "violet", "violet", ["the FFT", "JPEG", "MP3", "quantum computing", "3D graphics", "language models"]], ["Chemistry", "mint", "mint", ["atomic orbitals", "NMR", "infrared spectra", "crystallography"]], ["Biology and medicine", "coral", "coral", ["MRI", "EEG", "ECG", "grid cells", "brain rhythms", "daily clocks", "DNA’s structure"]], ["Earth and space", "ice", "ice", ["tides", "seismology", "orbits", "black hole imaging", "GPS"]], ["Music and economics", "math", "gold", ["pitch", "tuning", "synthesis", "business cycles", "option pricing"]]];
    const cy = -0.12, RINGS = [[0.78, 0.33], [1.25, 0.47], [1.72, 0.6], [2.2, 0.72]];
    const shapes = [{ pts: ringPts(0, cy, 0.3, 90), c: "gold", a: 0.8, s: 0.9, at: 0 }], streams = [];
    const labels = [{ x: 0, y: cy + 0.02, html: "<i>e</i><sup><i>iπ</i></sup> + 1 = 0", cls: "fword c-math eqc" }, { x: 0, y: cy - 0.12, html: "identity", cls: "tag" }];
    const total = G.reduce((a, g) => a + g[3].length, 0);
    let idx = 0; const words = [];
    G.forEach(([name, cls, col, items], gi) => {
      items.forEach((it, k) => {
        const a = Math.PI / 2 - (idx + 0.5) / total * TAU, ring = RINGS[(idx * 3) % RINGS.length];
        const x = ring[0] * Math.cos(a), y = cy + ring[1] * Math.sin(a) * 1.0;
        shapes.push({ pts: blobPts(x, y, 0.008, 3), c: col, a: 0.95, s: 1, at: 0 });
        const ux = Math.cos(a), uy = Math.sin(a), sx = 0.32 * ux, sy = cy + 0.32 * uy * 0.6, ex = x - 0.05 * ux, ey = y - 0.03 * uy;
        streams.push({ path: u => [sx + (ex - sx) * u, sy + (ey - sy) * u], n: 2, speed: 0.22 + 0.04 * (k % 3), c: col, ends: true, at: 0, a: 0.75 });
        words.push({ x, y: y + (uy >= 0 ? 0.07 : -0.07), html: it, cls: "fword c-" + cls });
        idx++;
      });
    });
    // push apart any two words whose boxes overlap, so the cloud stays dense but readable
    const w = t => t.html.replace(/<[^>]+>/g, "").length * 0.031 + 0.05;
    for (let it = 0; it < 80; it++) for (let a = 0; a < words.length; a++) for (let b = a + 1; b < words.length; b++) {
      const A = words[a], B = words[b], ox = (w(A) + w(B)) / 2 - Math.abs(A.x - B.x), oy = 0.085 - Math.abs(A.y - B.y);
      if (ox > 0 && oy > 0) { const d = (oy / 2 + 0.002) * (A.y >= B.y ? 1 : -1); A.y += d; B.y -= d; }
    }
    labels.push(...words);
    labels.push({ x: 0, y: -1.03, html: G.map(([n, cls]) => `<span class="c-${cls}">${n}</span>`).join(""), cls: "tag legend" });
    labels.push({ x: 0, y: -1.15, html: "each field uses it with a reference of its own, and stating it as the one law they share is the step left", cls: "example" });
    return tScene({ shapes, streams, labels, stillT: 2 });
  };

  /* Level C: the word "lighter" goes out across the top, the receiver hands the lighter back along the
     bottom, and the returned lighter lands on the sender's own reference outline, which lights when they match. */
  SCENES.greply = () => {
    const SX = -1.1, RX = 1.1, cy = 0.0, P = 9;
    const person = (x, y) => [...ringPts(x, y + 0.2, 0.06, 20), ...segPts(x, y + 0.14, x, y - 0.08, 10), ...segPts(x - 0.11, y + 0.06, x + 0.11, y + 0.06, 10), ...segPts(x, y - 0.08, x - 0.08, y - 0.24, 8), ...segPts(x, y - 0.08, x + 0.08, y - 0.24, 8)];
    const lighter = (x, y) => [...segPts(x - 0.05, y - 0.1, x + 0.05, y - 0.1, 6), ...segPts(x - 0.05, y - 0.1, x - 0.05, y + 0.06, 9), ...segPts(x + 0.05, y - 0.1, x + 0.05, y + 0.06, 9), ...segPts(x - 0.05, y + 0.06, x + 0.05, y + 0.06, 6)];
    const L = lighter(0, 0), refX = SX + 0.32, refY = cy - 0.02;
    const top = u => [SX + 0.2 + (RX - SX - 0.4) * u, cy + 0.42 * Math.sin(Math.PI * u) + 0.12];
    const bot = u => [RX - 0.2 - (RX - SX - 0.4) * u, cy - 0.42 * Math.sin(Math.PI * u) - 0.12];
    const pts = [];
    L.forEach(() => pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 1 }));
    for (let k = 0; k < 6; k++) pts.push({ x: 0, y: 0, c: "coral", a: 0, s: 1.1 });
    for (let k = 0; k < 36; k++) pts.push({ x: 0, y: 0, c: "mint", a: 0, s: 0.9 });
    const phase = t => t % P;
    return tScene({
      stillT: 7.6,
      shapes: [
        { pts: person(SX, cy), c: "brass", a: 0.9, s: 0.9, at: 0 }, { pts: person(RX, cy), c: "cyan", a: 0.9, s: 0.9, at: 0 },
        { pts: lighter(refX, refY), c: "dim", a: 0.6, s: 0.8, at: 0 },
        { pts: Array.from({ length: 50 }, (_, k) => top(k / 49)), c: "dim", a: 0.2, s: 0.55, at: 0 },
        { pts: Array.from({ length: 50 }, (_, k) => bot(k / 49)), c: "dim", a: 0.2, s: 0.55, at: 0 }
      ],
      labels: [
        { x: SX, y: cy - 0.38, html: "me", cls: "example" }, { x: RX, y: cy - 0.38, html: "you", cls: "example" },
        { x: refX + 0.02, y: refY + 0.26, html: "what I meant", cls: "tag" },
        { x: 0, y: -0.98, html: "", cls: "example", live: t => { const c = phase(t); return c < 3 ? "Level A and B: “lighter” goes out, and you understand it" : c < 6 ? "Level C: your action is a reply" : "it comes back to me and matches what I meant"; } },
        { x: 0, y: 0.75, html: "", cls: "example c-math", live: t => phase(t) < 2.8 ? "“pass me the lighter”" : "", at: t => { const c = phase(t); const [x, y] = top(Math.min(1, c / 3)); return [x, y + 0.1]; } }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = phase(t); let i = o;
          let cx, cyy, a = 1;
          if (c < 3) { cx = RX - 0.32; cyy = cy - 0.02; a = Math.max(0, (c - 2.2) / 0.8); }
          else if (c < 6) { [cx, cyy] = bot((c - 3) / 3); }
          else { cx = refX; cyy = refY; }
          L.forEach(([x, y]) => { out[i++] = { x: cx + x, y: cyy + y, a }; });
          for (let k = 0; k < 6; k++) out[i++] = { x: cx + gauss() * 0.015, y: cyy + 0.1 + Math.abs(gauss()) * 0.03, a };
          const g = c >= 6 ? Math.max(0, 1 - (c - 6) / 3) : 0;
          for (let k = 0; k < 36; k++) { const q = k / 36 * TAU, r = 0.15 + 0.05 * (1 - g); out[i++] = { x: refX + r * Math.cos(q), y: refY + r * Math.sin(q), a: 0.9 * g }; }
        }
      }
    });
  };

  /* Levels A, B and C solved: three lanes completing in turn. A: the symbols arrive identical. B: a
     meaning turns into line with its reference. C: an action loops back to where it began. Each closes green. */
  SCENES.glanes = () => {
    const Y = [0.62, 0.0, -0.62], X0 = -1.2, X1 = 0.9, P = 9, pts = [], meta = [];
    const ease = v => v <= 0 ? 0 : v >= 1 ? 1 : (1 - Math.cos(Math.PI * v)) / 2;
    const prog = (t, k) => ease(((t % P) - k * 2.4) / 2);
    for (let q = 0; q < 6; q++) { pts.push({ x: 0, y: 0, c: "cyan", a: 0, s: 1.3 }); meta.push({ lane: 0, q }); }
    const tri = [[0, 0.13], [0.12, -0.08], [-0.12, -0.08]], shapeP = [];
    for (let e = 0; e < 3; e++) for (let q = 0; q < 8; q++) { const A = tri[e], B = tri[(e + 1) % 3]; shapeP.push([A[0] + (B[0] - A[0]) * q / 8, A[1] + (B[1] - A[1]) * q / 8]); }
    shapeP.forEach(p => { pts.push({ x: 0, y: 0, c: "violet", a: 0, s: 0.95 }); meta.push({ lane: 1, p }); });
    for (let q = 0; q < 60; q++) { pts.push({ x: 0, y: 0, c: "coral", a: 0, s: 0.9 }); meta.push({ lane: 2, u: q / 59 }); }
    for (let k = 0; k < 3; k++) for (let q = 0; q < 30; q++) { pts.push({ x: 0, y: 0, c: "mint", a: 0, s: 0.95 }); meta.push({ check: k, u: q / 30 * TAU }); }
    const shapes = [
      ...Y.map(y => ({ pts: segPts(X0 + 0.25, y, X1 - 0.1, y, 50), c: "dim", a: 0.18, s: 0.55, at: 0 })),
      ...[0, 1, 2, 3, 4, 5].map(q => ({ pts: blobPts(X0 + 0.06 * q, Y[0], 0.008, 3), c: "dim", a: 0.6, s: 1, at: 0 })),
      { pts: shapeP.map(([x, y]) => [X1 - 0.35 + x, Y[1] + y]), c: "dim", a: 0.45, s: 0.8, at: 0 },
      { pts: blobPts(X0 + 0.15, Y[2], 0.015, 6), c: "paper", a: 0.9, s: 1.1, at: 0 }
    ];
    return tScene({
      stillT: 8.5, shapes,
      labels: [
        { x: -1.5, y: Y[0], html: "A", cls: "role c-cyan" }, { x: -1.5, y: Y[1], html: "B", cls: "role c-violet" }, { x: -1.5, y: Y[2], html: "C", cls: "role c-coral" },
        { x: -0.15, y: Y[0] + 0.17, html: "the symbols arrive", cls: "tag" }, { x: -0.15, y: Y[1] + 0.22, html: "the meaning lines up", cls: "tag" }, { x: -0.15, y: Y[2] + 0.3, html: "the action comes back", cls: "tag" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const pa = prog(t, 0), pb = prog(t, 1), pc = prog(t, 2);
          meta.forEach((m, i) => {
            if (m.check !== undefined) { const p = [pa, pb, pc][m.check], on = p >= 0.999 ? 1 : 0; out[o + i] = { x: X1 + 0.28 + 0.1 * Math.cos(m.u), y: Y[m.check] + 0.1 * Math.sin(m.u), a: 0.95 * on }; return; }
            if (m.lane === 0) { const x0 = X0 + 0.06 * m.q, x1 = X1 - 0.35 + 0.06 * m.q; out[o + i] = { x: x0 + (x1 - x0) * pa, y: Y[0], a: 0.95 }; return; }
            if (m.lane === 1) { const a = 1.6 * (1 - pb), x0 = X0 + 0.2, xx = x0 + (X1 - 0.35 - x0) * Math.min(1, pb * 1.6); const [px, py] = m.p; out[o + i] = { x: xx + px * Math.cos(a) - py * Math.sin(a), y: Y[1] + px * Math.sin(a) + py * Math.cos(a), a: 0.9 }; return; }
            const cx = (X0 + 0.15 + X1 - 0.1) / 2, rx = (X1 - 0.1 - X0 - 0.15) / 2, u = m.u * pc, ang = Math.PI - u * TAU;
            out[o + i] = { x: cx + rx * Math.cos(ang), y: Y[2] + 0.2 * Math.sin(ang), a: m.u <= 1 && u > 0 ? 0.8 : 0 };
          });
        }
      }
    });
  };

  /* What a number is: a mark goes round the circle, and each time the circle closes a new whole thing
     appears beside it, one, two, three: discreteness is the circle closing. */
  /* What Shannon did with his bit: bits combine into a message at the source, travel through a channel
     of fixed width, and noise flips some of them on the way; the three questions his paper answers. */
  SCENES.gshannonops = () => {
    const N = 14, X0 = -1.35, X1 = 1.25, CH0 = -0.42, CH1 = 0.62, Y = 0.12, V = 0.16, SP = (X1 - X0) / N;
    const bits = Array.from({ length: N }, (_, k) => (Math.sin(k * 7.3 + 1) > 0 ? 1 : 0)), flip = new Set([3, 8, 11]);
    const pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    for (let w = 0; w < 2; w++) for (let q = 0; q < 70; q++) add({ kind: "wall", w, u: q / 69 }, { x: CH0, y: Y, c: "ice", a: 0.5, s: 0.6 });
    for (let q = 0; q < 26; q++) add({ kind: "zap", q, j: Math.random() * TAU }, { x: 0.2, y: Y, c: "coral", a: 0, s: 0.7 });
    const xOf = (k, t) => X0 + ((k * SP + t * V) % (X1 - X0));
    return tScene({
      stillT: 4.2,
      labels: [
        ...Array.from({ length: N }, (_, k) => ({ x: 0, y: Y, html: "", cls: "slot", at: t => [xOf(k, t), Y - 0.035], live: t => { const x = xOf(k, t), f = flip.has(k) && x > 0.25 && x < X1 - 0.05; const b = f ? 1 - bits[k] : bits[k]; const a = Math.min(1, (x - X0) / 0.15, (X1 - x) / 0.15); return `<span style="opacity:${Math.max(0, a).toFixed(2)};color:${f ? "var(--coral)" : "inherit"}">${b}</span>`; } })),
        { x: (X0 + CH0) / 2 - 0.05, y: 0.48, html: "how bits combine", cls: "example" },
        { x: (CH0 + CH1) / 2, y: 0.48, html: "how much a channel carries", cls: "example" },
        { x: (CH1 + X1) / 2 + 0.05, y: 0.48, html: "what noise does", cls: "example" },
        { x: (X0 + CH0) / 2 - 0.05, y: -0.22, html: "source", cls: "tag" }, { x: (CH0 + CH1) / 2, y: -0.22, html: "channel", cls: "tag" }, { x: (CH1 + X1) / 2 + 0.05, y: -0.22, html: "receiver", cls: "tag" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          meta.forEach((m, i) => {
            let v;
            if (m.kind === "wall") v = { x: CH0 + (CH1 - CH0) * m.u, y: Y + (m.w ? 0.13 : -0.13), a: 0.5 };
            else { const ph = (t * 1.3 + m.q * 0.13) % 1; v = { x: 0.25 + 0.05 * Math.cos(m.j + t * 3), y: Y + (ph - 0.5) * 0.24, a: 0.55 * Math.sin(Math.PI * ph) }; }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* What geometric signals build: the three-sphere drawn in our space, nested layers (Hopf tori at three
     heights), each layer made of circles linked through each other, cut away towards the viewer so the
     layers show one inside the next. */
  SCENES.gnested = () => {
    const LAYERS = [[0.42, "violet"], [Math.PI / 4, "ice"], [1.0, "cyan"]], F = 10, K = 34, MK = 44, WEDGE = 0.8, sc = 0.25, cy = 0.04, pts = [], meta = [];
    const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const un = u => { const l = Math.hypot(...u); return u.map(c => c / l); };
    const hopf = (eta, phi, psi) => { const x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi), x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi), d = 1 - x4; return [x1 / d, x3 / d, x2 / d]; };
    LAYERS.forEach(([eta, col], li) => {
      for (let f = 0; f < F; f++) {
        const phi = (f / F) * TAU + li * 0.3, A = hopf(eta, phi, 0), B = hopf(eta, phi, TAU / 3), C = hopf(eta, phi, 2 * TAU / 3);
        const ab = sub(B, A), ac = sub(C, A), n = cr(ab, ac), nn = dt(n, n), w = cr(n, ab).map(c => c * dt(ac, ac)), v = cr(ac, n).map(c => c * dt(ab, ab));
        const o = A.map((c, i) => c + (w[i] + v[i]) / (2 * nn)), rho = Math.hypot(...sub(A, o)), e1 = un(sub(A, o)), e2 = cr(un(n), e1);
        for (let k = 0; k < K; k++) { const a = k / K * TAU; meta.push({ kind: "fib", li, p: [0, 1, 2].map(i => o[i] + rho * (Math.cos(a) * e1[i] + Math.sin(a) * e2[i])) }); pts.push({ x: 0, y: cy, c: col, a: 0, s: 0.7 }); }
      }
      // the cross-sections at the two faces of the cut: one circle per layer on each face
      for (const side of [-1, 1]) for (let k = 0; k < MK; k++) { meta.push({ kind: "face", li, eta, side, a: k / MK * TAU }); pts.push({ x: 0, y: cy, c: col, a: 0, s: 0.95 }); }
    });
    return tScene({
      stillT: 3,
      labels: [{ x: 0, y: -0.86, html: "the three-sphere in our space: layers of linked circles, cut open to show one inside the next", cls: "example" }],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const yaw = 0.4 + t * 0.12, tilt = 0.95, front = Math.atan2(Math.cos(yaw), Math.sin(yaw));
          meta.forEach((m, k) => {
            let p, a;
            if (m.kind === "fib") {
              p = m.p; let dA = Math.atan2(p[2], p[0]) - front; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
              a = Math.abs(dA) < WEDGE && Math.hypot(p[0], p[2]) > 0.2 ? 0 : 1;
            } else {
              const R = 1 / Math.cos(m.eta), r = Math.tan(m.eta), az = front + m.side * WEDGE, rr = R + r * Math.cos(m.a);
              p = [rr * Math.cos(az), r * Math.sin(m.a), rr * Math.sin(az)]; a = 1.25;
            }
            const [X, Y, d] = view3(p[0], p[1], p[2], yaw, tilt);
            out[o + k] = { x: X * sc, y: cy + Y * sc, a: Math.min(1, a * (0.18 + 0.72 * d) * (m.li === 1 ? 1 : 0.8)) };
          });
        }
      }
    });
  };

  /* Noise is the field: a lattice of small square loops. Each loop carries the comparison around its four
     links; where space is flat it closes, and around a defect it comes back turned. Each loop shows its
     energy (1 - cos of the turn) as brightness and its strength (the position
     channel) as a small arrow, and one traveller carries a direction around the most turned loop. */
  SCENES.glattice = () => {
    const NX = 9, NY = 6, S = 0.23, X0 = -1.035, Y0 = -0.6, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const node = (i, j) => [X0 + i * S, Y0 + j * S];
    for (let j = 0; j <= NY; j++) for (let i = 0; i < NX; i++) for (let q = 0; q < 5; q++) { const [x, y] = node(i, j); add({ kind: "link" }, { x: x + S * (q + 0.5) / 5, y, c: "dim", a: 0.35, s: 0.5 }); }
    for (let i = 0; i <= NX; i++) for (let j = 0; j < NY; j++) for (let q = 0; q < 5; q++) { const [x, y] = node(i, j); add({ kind: "link" }, { x, y: y + S * (q + 0.5) / 5, c: "dim", a: 0.35, s: 0.5 }); }
    const centres = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) centres.push([X0 + (i + 0.5) * S, Y0 + (j + 0.5) * S]);
    centres.forEach((c, pi) => { for (let q = 0; q < 8; q++) add({ kind: "ring", pi, b: q / 8 * TAU }, { x: c[0], y: c[1], c: "coral", a: 0, s: 0.75 }); for (let q = 0; q < 4; q++) add({ kind: "arrow", pi, u: (q + 1) / 4 }, { x: c[0], y: c[1], c: "violet", a: 0, s: q === 3 ? 1 : 0.7 }); });
    for (let q = 0; q < 8; q++) add({ kind: "trav", j: [gauss() * 0.008, gauss() * 0.008] }, { x: 0, y: 0, c: "gold", a: 1, s: 1.15 });
    for (let q = 0; q < 6; q++) add({ kind: "carry", u: (q + 1) / 6 }, { x: 0, y: 0, c: "paper", a: 1, s: 0.8 });
    const defect = t => [0.62 * Math.cos(0.22 * t), 0.09 + 0.3 * Math.sin(0.37 * t)];
    const turn = (c, t) => { const [dx, dy] = defect(t), r2 = (c[0] - dx) ** 2 + (c[1] - dy) ** 2; return 2.6 * Math.exp(-r2 / 0.07); };
    return tScene({
      stillT: 4,
      labels: [
        { x: -0.1, y: -0.8, html: "brightness · the field’s energy", cls: "tag right" },
        { x: 0.1, y: -0.8, html: "arrow · its strength and direction", cls: "tag left" },
        { x: 0, y: -0.95, html: "flat where every loop closes; around the defect, loops come back turned", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          let best = 0, bt = 0; centres.forEach((c, pi) => { const th = turn(c, t); if (th > bt) { bt = th; best = pi; } });
          const bc = centres[best], h = S * 0.5, u = (t * 0.45) % 1;
          const per = v => { const d = v * 4; return d < 1 ? [bc[0] - h + 2 * h * d, bc[1] - h] : d < 2 ? [bc[0] + h, bc[1] - h + 2 * h * (d - 1)] : d < 3 ? [bc[0] + h - 2 * h * (d - 2), bc[1] + h] : [bc[0] - h, bc[1] + h - 2 * h * (d - 3)]; };
          const [tx, ty] = per(u), carried = Math.PI / 2 + bt * u;
          meta.forEach((m, k) => {
            let v;
            if (m.kind === "link") v = { x: pts[k].x, y: pts[k].y, a: 0.35 };
            else if (m.kind === "ring") { const c = centres[m.pi], th = turn(c, t), e = (1 - Math.cos(th)) / 2; v = { x: c[0] + 0.05 * Math.cos(m.b), y: c[1] + 0.05 * Math.sin(m.b), a: 0.08 + 0.9 * e }; }
            else if (m.kind === "arrow") { const c = centres[m.pi], th = turn(c, t), L = 0.075 * Math.min(1, th / 1.2); v = { x: c[0] + L * m.u * Math.cos(Math.PI / 2 + th), y: c[1] + L * m.u * Math.sin(Math.PI / 2 + th), a: th > 0.08 ? 0.9 : 0 }; }
            else if (m.kind === "trav") v = { x: tx + m.j[0], y: ty + m.j[1], a: 1 };
            else v = { x: tx + 0.06 * m.u * Math.cos(carried), y: ty + 0.06 * m.u * Math.sin(carried), a: 0.9 };
            out[o + k] = v;
          });
        }
      }
    });
  };

  /* Isn't this string theory: one closed string vibrating in three dimensions, whole waves around the
     loop, sweeping out a faint tube behind it as it moves through time, the string's own history. */
  SCENES.gstring = () => {
    const N = 170, H = 7, HN = 70, R = 0.34, cy = 0.2, pts = [], meta = [];
    for (let i = 0; i < N; i++) { meta.push({ kind: "loop", u: i / N }); pts.push({ x: 0, y: cy, c: "gold", a: 1, s: 0.95 }); }
    for (let h = 1; h <= H; h++) for (let i = 0; i < HN; i++) { meta.push({ kind: "past", h, u: i / HN }); pts.push({ x: 0, y: cy, c: "cyan", a: 0, s: 0.6 }); }
    const shape = (u, t) => { const th = u * TAU, r = R + 0.06 * Math.cos(2 * th - 1.7 * t) + 0.04 * Math.cos(3 * th + 1.1 * t); return [r * Math.cos(th), 0.07 * Math.sin(3 * th - 1.3 * t) + 0.05 * Math.cos(2 * th + 0.9 * t), r * Math.sin(th)]; };
    return tScene({
      stillT: 2.4,
      labels: [
        { x: 0, y: cy + 0.62, html: "a closed string: whole waves around one loop", cls: "example" },
        { x: 0, y: -0.78, html: "moving through time, it sweeps out a tube", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          meta.forEach((m, i) => {
            const tt = m.kind === "loop" ? t : t - m.h * 0.35, p = shape(m.u, tt), drop = m.kind === "loop" ? 0 : m.h * 0.12;
            const [X, Y, d] = view3(p[0], p[1] - drop, p[2], 0.3 + t * 0.15, 0.78);
            out[o + i] = { x: X * 1.35, y: cy + Y * 1.35, a: m.kind === "loop" ? 0.35 + 0.65 * d : (0.32 - m.h * 0.035) * (0.4 + 0.6 * d) };
          });
        }
      }
    });
  };

  /* What is a thing: one rotation carried through time is Euler's helix, and every turn it completes is
     read at once as a whole number counted (mathematics), a particle's wave closing on its orbit (physics)
     and the geometric bit returning to its reference, checked (computation). */
  SCENES.gthing = () => {
    const X0 = 0.1, HL = 0.85, HY = 0.05, HR = 0.12, TURNS = 3, TT = 2.2, P = TURNS * TT + 1.6, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    for (let k = 0; k < 3; k++) for (let q = 0; q < 24; q++) add({ kind: "ring", k, b: q / 24 }, { x: X0, y: 0.55, c: "gold", a: 0.2, s: 0.75 });
    for (let i = 0; i < 200; i++) add({ kind: "helix", u: i / 199 }, { x: X0, y: HY, c: "cyan", a: 0.3, s: 0.7 });
    for (let q = 0; q < 8; q++) add({ kind: "pt", j: [gauss() * 0.01, gauss() * 0.01] }, { x: X0, y: HY, c: "gold", a: 1, s: 1.2 });
    for (let q = 0; q < 48; q++) add({ kind: "dial", b: q / 48 * TAU }, { x: X0, y: -0.45, c: "violet", a: 0.5, s: 0.65 });
    for (let q = 0; q < 5; q++) add({ kind: "tick", u: (q + 1) / 5 }, { x: X0, y: -0.45, c: "paper", a: 0.9, s: 0.7 });
    for (let q = 0; q < 7; q++) add({ kind: "bit", j: [gauss() * 0.01, gauss() * 0.01] }, { x: X0, y: -0.45, c: "gold", a: 1, s: 1.15 });
    const turnsAt = t => { const c = ((t % P) + P) % P; return Math.min(TURNS, c / TT); };
    const glow = t => { const tu = turnsAt(t), f = tu - Math.floor(tu); return tu >= 1 && f < 0.25 ? 1 - f / 0.25 : tu >= TURNS ? 1 : 0; };
    const YAW = 0.62, TILT = 0.32;
    const hx = u => {                                      // Euler's helix in three dimensions, seen on a diagonal so it recedes
      const a = u * TURNS * TAU, x = HL * (u - 0.5), y = HR * Math.cos(a), z = HR * Math.sin(a);
      const X1 = x * Math.cos(YAW) - z * Math.sin(YAW), Z1 = x * Math.sin(YAW) + z * Math.cos(YAW);
      const Y2 = y * Math.cos(TILT) - Z1 * Math.sin(TILT), D = y * Math.sin(TILT) + Z1 * Math.cos(TILT), f = 1.8 / (1.8 + D);
      return [X0 + X1 * f, HY + Y2 * f, -D];
    };
    return tScene({
      stillT: 2 * TT + 0.25,
      labels: [
        { x: X0 - 0.6, y: 0.55, html: "mathematics", cls: "role right" }, { x: X0 - 0.6, y: 0.05, html: "physics", cls: "role right" }, { x: X0 - 0.6, y: -0.45, html: "computation", cls: "role right" },
        ...[1, 2, 3].map((n, k) => ({ x: X0 - 0.26 + k * 0.26, y: 0.38, html: String(n), cls: "slot" })),
        { x: X0 + 0.52, y: 0.55, html: "integers counted", cls: "example left" },
        { x: X0 + 0.52, y: 0.05, html: "a particle", cls: "example left" },
        { x: X0 + 0.52, y: -0.45, html: "the geometric bit, <i>e</i><sup>2π<i>i</i></sup> = 1", cls: "example left" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const tu = turnsAt(t), th = tu * TAU, gl = glow(t), c = ((t % P) + P) % P, fade = c > P - 0.5 ? (P - c) / 0.5 : Math.min(1, c / 0.3 + 0.3);
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "ring": { const f = Math.max(0, Math.min(1, tu - m.k)), cx = X0 - 0.26 + m.k * 0.26, a = Math.PI / 2 - m.b * TAU; v = { x: cx + 0.075 * Math.cos(a), y: 0.55 + 0.075 * Math.sin(a), a: (m.b <= f ? 0.95 : 0.15) * fade }; break; }
              case "helix": { const [x, y, d] = hx(m.u), near = Math.max(0, Math.min(1, 0.5 + d * 2)); v = { x, y, a: (m.u * TURNS <= tu ? 0.3 + 0.65 * near : 0.06 + 0.1 * near) * fade }; break; }
              case "pt": { const [x, y] = hx(tu / TURNS); v = { x: x + m.j[0], y: y + m.j[1], a: fade }; break; }
              case "dial": v = { x: X0 + 0.13 * Math.cos(m.b), y: -0.45 + 0.13 * Math.sin(m.b), a: (0.35 + 0.6 * gl) * fade, c: gl > 0.3 ? "paper" : "violet" }; break;
              case "tick": v = { x: X0 + 0.13 + 0.06 * m.u, y: -0.45, a: 0.9 * fade }; break;
              default: v = { x: X0 + 0.13 * Math.cos(th) + m.j[0], y: -0.45 + 0.13 * Math.sin(th) + m.j[1], a: fade };
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* Opener of 06: one ring doubles into two, four and eight, keeping its shape each time; at sixteen
     the rings come apart, the way composition stops after the octonions. */
  SCENES.topdouble = () => {
    const cy = -0.8, NL = [1, 2, 4, 8, 16], RA = [0, 0.15, 0.2, 0.23, 0.25], RR = [0.09, 0.064, 0.048, 0.036, 0.027];
    const COL = ["ice", "cyan", "mint", "violet", "coral"], ST = [0.2, 1.7, 3.2, 4.7, 6.2], P = 10, Q = 26, pts = [], meta = [];
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    for (let s = 0; s < 16; s++) for (let q = 0; q < Q; q++) { meta.push({ s, b: q / Q * TAU, d: [gauss(), gauss()] }); pts.push({ x: 0, y: cy, c: "ice", a: 0, s: 0.75 }); }
    const centre = (k, s) => { const n = NL[k], j = Math.floor(s * n / 16), a = Math.PI / 2 - (j + 0.5) / n * TAU; return [RA[k] * Math.cos(a), cy + RA[k] * Math.sin(a)]; };
    return tScene({
      stillT: 8.5,
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t < 2.4 ? -1 : (t - 2.4) % P;
          const k = Math.max(0, ST.filter(x => c >= x).length - 1), u = k ? sm((c - ST[k]) / 1.0) : 1;
          const burst = k === 4 ? sm((c - ST[4] - 1.3) / 1.8) : 0, show = c < 0 ? 0 : Math.min(1, c / 0.5) * (c > P - 0.6 ? (P - c) / 0.6 : 1);
          meta.forEach((m, i) => {
            const [x1, y1] = centre(k, m.s), [x0, y0] = k ? centre(k - 1, m.s) : [x1, y1], r = (k ? RR[k - 1] + (RR[k] - RR[k - 1]) * u : RR[0]);
            const x = x0 + (x1 - x0) * u + r * Math.cos(m.b) + m.d[0] * 0.14 * burst, y = y0 + (y1 - y0) * u + r * Math.sin(m.b) + m.d[1] * 0.14 * burst;
            out[o + i] = { x, y, a: 0.85 * show * (1 - 0.85 * burst), c: COL[u > 0.5 ? k : Math.max(0, k - 1)] };
          });
        }
      }
    });
  };

  /* Side by side: three rotations running on their own add up to one signal, and held to one total length
     the whole signal is one point on a sphere, which moves as the signal plays. */
  SCENES.gpacking = () => {
    const CX = -1.24, CY = [0.5, 0.14, -0.22], RS = 0.1, RATE = [1, 2, 3], AMP = [0.11, 0.07, 0.05], PH = [0, 1.1, 2.3], w = 1.25;
    const TX0 = -1.04, TX1 = -0.2, TY = 0.14, SPAN = 5, BX = 0.74, BY = 0.12, BR = 0.42;
    const sig = t => AMP.reduce((s, A, k) => s + A * Math.sin(RATE[k] * w * t + PH[k]), 0);
    const pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    CY.forEach((y, k) => { for (let q = 0; q < 30; q++) add({ kind: "ring", k, b: q / 30 * TAU }, { x: CX, y, c: "dim", a: 0.5, s: 0.6 }); for (let q = 0; q < 6; q++) add({ kind: "rot", k, j: [gauss() * 0.008, gauss() * 0.008] }, { x: CX, y, c: "gold", a: 1, s: 1.1 }); });
    for (let q = 0; q < 90; q++) add({ kind: "trace", u: q / 89 }, { x: TX0, y: TY, c: "gold", a: 0.6, s: 0.65 });
    const NS = 180; for (let k = 0; k < NS; k++) { const y = 1 - 2 * (k + 0.5) / NS, r = Math.sqrt(1 - y * y), a = k * 2.39996; add({ kind: "sph", p: [r * Math.cos(a), y, r * Math.sin(a)] }, { x: BX, y: BY, c: "ice", a: 0.4, s: 0.6 }); }
    for (let q = 0; q < 70; q++) add({ kind: "path", u: q / 70 }, { x: BX, y: BY, c: "mint", a: 0, s: 0.75 });
    for (let q = 0; q < 10; q++) add({ kind: "state", j: [gauss() * 0.01, gauss() * 0.01] }, { x: BX, y: BY, c: "gold", a: 1, s: 1.25 });
    for (let q = 0; q < 6; q++) add({ kind: "fly", q }, { x: TX1, y: TY, c: "gold", a: 0, s: 0.9 });
    /* the signal's state on the sphere: the three rotations' parts, normalized, shown on a sphere we can draw */
    const state = t => { const v = [0, 1, 2].map(k => AMP[k] * Math.cos(RATE[k] * w * t + PH[k])), u = [AMP[0] * Math.sin(RATE[0] * w * t + PH[0]) + AMP[2] * Math.sin(RATE[2] * w * t + PH[2]), AMP[1] * Math.sin(RATE[1] * w * t + PH[1]), 0]; const p = [v[0] + u[0] * 0.6, v[1] + u[1] * 0.8, v[2] + 0.06 * Math.sin(0.7 * w * t)], n = Math.hypot(...p) || 1; return p.map(c => c / n); };
    const yaw = t => 0.3 + t * 0.2;
    const proj = (p, t) => { const [X, Y, d] = view3(p[0], p[1], p[2], yaw(t), 0.35); return [BX + X * BR, BY + Y * BR, d]; };
    return tScene({
      stillT: 6,
      labels: [
        { x: CX, y: -0.48, html: "rotations side by side", cls: "example" },
        { x: (TX0 + TX1) / 2, y: -0.2, html: "add up to one signal", cls: "example" },
        { x: BX, y: BY - BR - 0.16, html: "held to one length, the whole signal", cls: "example" },
        { x: BX, y: BY - BR - 0.29, html: "is one point on a sphere", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const [sx, sy] = proj(state(t), t);
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "ring": v = { x: CX + RS * Math.cos(m.b), y: CY[m.k] + RS * Math.sin(m.b), a: 0.5 }; break;
              case "rot": { const a = RATE[m.k] * w * t + PH[m.k]; v = { x: CX + RS * Math.cos(a) + m.j[0], y: CY[m.k] + RS * Math.sin(a) + m.j[1], a: 1 }; break; }
              case "trace": { const tau = (1 - m.u) * SPAN; v = { x: TX0 + (TX1 - TX0) * m.u, y: TY + sig(t - tau), a: 0.2 + 0.6 * m.u }; break; }
              case "sph": { const [x, y, d] = proj(m.p, t); v = { x, y, a: 0.12 + 0.45 * d }; break; }
              case "path": { const [x, y, d] = proj(state(t - 4 * (1 - m.u)), t); v = { x, y, a: (0.2 + 0.6 * m.u) * (0.4 + 0.6 * d) }; break; }
              case "state": v = { x: sx + m.j[0], y: sy + m.j[1], a: 1 }; break;
              default: { const u = ((t * 0.6 + m.q / 6) % 1), x0 = TX1, y0 = TY + sig(t); v = { x: x0 + (sx - x0) * u, y: y0 + (sy - y0) * u + Math.sin(Math.PI * u) * 0.1, a: Math.sin(Math.PI * u) * 0.8 }; }
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* One object: a point going round a circle (mathematics), a weight on a spring (physics) and a
     program stepping twelve times a turn (computation), joined by one level line. The spring leaves a
     smooth wave on the left, the program a stepped one on the right, the same wave in both. */
  SCENES.gsame = () => {
    const cy = 0.1, R = 0.38, PER = 6, w = TAU / PER, XM = -0.74, XP = 0.74, V = 0.11, NS = 12;
    const th = t => w * t, lvl = t => cy + R * Math.sin(th(t)), step = t => cy + R * Math.sin(Math.floor(th(t) / (TAU / NS)) * (TAU / NS));
    const pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    for (let k = 0; k < 96; k++) add({ kind: "ring", a: k / 96 * TAU }, { x: R, y: cy, c: "ice", a: 0.4, s: 0.7 });
    for (let k = 0; k < NS; k++) add({ kind: "tick", a: k / NS * TAU }, { x: R, y: cy, c: "brass", a: 0.55, s: 0.9 });
    for (let q = 0; q < 12; q++) add({ kind: "pt", j: [gauss() * 0.012, gauss() * 0.012] }, { x: R, y: cy, c: "gold", a: 1, s: 1.3 });
    for (let k = 0; k < 26; k++) add({ kind: "bar", x: XM - 0.13 + k * 0.01 }, { x: XM, y: 0.68, c: "dim", a: 0.6, s: 0.7 });
    for (let k = 0; k < 64; k++) add({ kind: "spring", u: k / 63 }, { x: XM, y: 0.6, c: "cyan", a: 0.7, s: 0.6 });
    for (let q = 0; q < 16; q++) add({ kind: "mass", j: [gauss() * 0.022, gauss() * 0.022] }, { x: XM, y: cy, c: "cyan", a: 1, s: 1.15 });
    for (let k = 0; k < 70; k++) add({ kind: "wave", u: k / 70 }, { x: XM, y: cy, c: "cyan", a: 0.5, s: 0.65 });
    for (let k = 0; k < 140; k++) add({ kind: "stair", u: k / 140 }, { x: XP, y: cy, c: "brass", a: 0.6, s: 0.65 });
    for (let k = 0; k < 13; k++) for (let q = 0; q < 7; q++) add({ kind: "riser", k, u: q / 6 }, { x: XP, y: cy, c: "brass", a: 0, s: 0.6 });
    for (let k = 0; k < 8; k++) add({ kind: "reg", j: [gauss() * 0.012, gauss() * 0.012] }, { x: XP, y: cy, c: "brass", a: 1, s: 1.25 });
    for (let k = 0; k < 90; k++) add({ kind: "level", u: k / 89 }, { x: 0, y: cy, c: "paper", a: 0.22, s: 0.5 });
    return tScene({
      stillT: 2.1,
      labels: [
        ...[["physics", XM - 0.28], ["mathematics", 0], ["computation", XP + 0.28]].map(([h, x]) => ({ x, y: -0.48, html: h, cls: "role" })),
        { x: XM - 0.28, y: -0.62, html: "a weight on a spring", cls: "example" },
        { x: 0, y: -0.62, html: "a point going round", cls: "example" },
        { x: XP + 0.28, y: -0.62, html: "a program, twelve steps a turn", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const a = th(t), h = lvl(t), hs = step(t), span = V * PER;
          meta.forEach((m, k) => {
            let r;
            switch (m.kind) {
              case "ring": r = { x: R * Math.cos(m.a), y: cy + R * Math.sin(m.a), a: 0.4 }; break;
              case "tick": r = { x: R * Math.cos(m.a), y: cy + R * Math.sin(m.a), a: 0.55 }; break;
              case "pt": r = { x: R * Math.cos(a) + m.j[0], y: cy + R * Math.sin(a) + m.j[1], a: 1 }; break;
              case "bar": r = { x: m.x, y: 0.68, a: 0.6 }; break;
              case "spring": { const top = 0.68, bot = h + 0.05, y = top + (bot - top) * m.u, z = (m.u * 14) % 2, tri = z < 1 ? z : 2 - z; r = { x: XM + (m.u > 0.04 && m.u < 0.96 ? (tri - 0.5) * 0.09 : 0), y, a: 0.7 }; break; }
              case "mass": r = { x: XM + m.j[0], y: h + m.j[1], a: 1 }; break;
              case "wave": { const tau = m.u * PER; r = { x: XM - 0.06 - V * tau, y: lvl(t - tau), a: 0.55 * (1 - m.u * 0.7) }; break; }
              case "stair": { const tau = m.u * PER; r = { x: XP + 0.06 + V * tau, y: step(t - tau), a: 0.65 * (1 - m.u * 0.7) }; break; }
              case "riser": { const d = PER / NS, kb = Math.floor(t / d) - m.k, tau = t - kb * d, y0 = cy + R * Math.sin((kb - 1) * TAU / NS), y1 = cy + R * Math.sin(kb * TAU / NS);
                r = { x: XP + 0.06 + V * tau, y: y0 + (y1 - y0) * m.u, a: tau > 0 && tau < PER ? 0.6 * (1 - tau / PER * 0.7) : 0 }; break; }
              case "reg": r = { x: XP + m.j[0], y: hs + m.j[1], a: 1 }; break;
              default: r = { x: XM + (XP - XM) * m.u, y: h, a: 0.22 };
            }
            out[o + k] = r;
          });
          void span;
        }
      }
    });
  };

  /* One thing, and many: a single identity is one circle (gold). A second forms at a right angle,
     linked through it, and the rest follow until the circles fill a closed space, the fibration. */
  SCENES.gcompose = () => {
    /* Hopf circles on one torus, projected to space. Each projected fibre is an exact circle; it is
       rebuilt from three of its points so its dots are evenly spaced. Fibre 0 is the single identity,
       fibre N/2 is the one at a right angle to it, then the rest fill in. */
    const N = 12, K = 70, eta = Math.PI / 4, sc = 0.34, TILT = 0.5, fib = [];
    const order = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11], rank = [];
    order.forEach((f, r) => { rank[f] = r; });
    const hopf = (phi, psi) => {
      const x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi), x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi);
      const d = 1 - x4;
      return [x1 / d, x3 / d, x2 / d];
    };
    const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const unit = u => { const l = Math.hypot(...u); return u.map(c => c / l); };
    const circle = phi => {
      const A = hopf(phi, 0), B = hopf(phi, TAU / 3), C = hopf(phi, 2 * TAU / 3);
      const ab = sub(B, A), ac = sub(C, A), n = cross(ab, ac), nn = dot(n, n);
      const w = cross(n, ab).map((c, i) => c * dot(ac, ac)), v = cross(ac, n).map((c, i) => c * dot(ab, ab));
      const o = A.map((c, i) => c + (w[i] + v[i]) / (2 * nn)), rho = Math.hypot(...sub(A, o));
      const u = unit(sub(A, o)), e = cross(unit(n), u);
      return { o, rho, u, e, n: unit(n) };
    };
    const circles = [];
    for (let f = 0; f < N; f++) circles.push(circle((f / N) * TAU));
    /* start turned so the single circle faces the viewer */
    const n0 = circles[0].n, sg = n0[1] < 0 ? -1 : 1, yaw0 = Math.atan2(sg * n0[0], sg * n0[2]);
    circles.forEach((c, f) => { for (let k = 0; k < K; k++) { const s = (k / K) * TAU; fib.push({ f, u: k / K, p: [0, 1, 2].map(i => c.o[i] + c.rho * (Math.cos(s) * c.u[i] + Math.sin(s) * c.e[i])) }); } });
    const start = f => [0, 1.9][rank[f]] ?? 3.5 + (rank[f] - 2) * 0.24, dur = f => rank[f] < 2 ? 1.1 : 0.5;
    return tScene({
      stillT: 9,
      labels: [
        { x: 0, y: -1.0, html: "", cls: "example", live: t => t < 1.9 ? "one identity: a single circle" : t < 3.5 ? "a second, at a right angle, linked through the first" : "composed, they fill a closed space: the fibration" }
      ],
      custom: {
        points: fib.map(m => ({ x: 0, y: 0, c: m.f === 0 ? "gold" : m.f === 6 ? "violet" : "cyan", a: 0, s: m.f === 0 ? 1.2 : m.f === 6 ? 1.05 : 0.8 })),
        update: (t, out, o) => {
          const yaw = yaw0 + t * 0.04 + Math.max(0, t - 3.5) * 0.08;
          fib.forEach((m, i) => {
            const u = Math.min(1, Math.max(0, (t - start(m.f)) / dur(m.f)));
            const [X, Y, d] = view3(m.p[0], m.p[1], m.p[2], yaw, TILT);
            const lit = m.u < u ? 1 : 0, depth = rank[m.f] < 2 ? 0.6 + 0.4 * d : 0.3 + 0.7 * d, base = rank[m.f] < 2 ? 0.95 : 0.7;
            out[o + i] = { x: X * sc, y: Y * sc + 0.1, a: lit * base * depth };
          });
        }
      }
    });
  };

  /* The two bits side by side: Shannon's composes into the turning tesseract of "Computers already
     compute like this", the geometric bit into the three-sphere of Hopf circles. Each figure sits in
     its card's slot, measured from the page, so it follows the table wherever the layout puts it. */
  SCENES.mirror = () => {
    const slot = sel => {
      const el = document.querySelector(sel), step = el && el.closest(".step");
      if (!el || !window.GTC.toStage) return { x: 0, y: 0, r: 0.2 };
      const r = el.getBoundingClientRect(), sr = step.getBoundingClientRect();
      const [x, y] = window.GTC.toStage(r.left + r.width / 2, r.top - sr.top + r.height / 2);
      return { x, y, r: Math.min(r.width, r.height) / 2 / window.GTC.unit() };
    };
    const v = cubeVerts(4), e = cubeEdges(v), meta = [], points = [];
    v.forEach((p, vi) => { meta.push({ vi }); points.push({ x: 0, y: 0, c: "brass", a: 1, s: 1.45 }); });
    e.forEach(([a, b]) => { for (let k = 1; k <= 7; k++) { meta.push({ a, b, u: k / 8 }); points.push({ x: 0, y: 0, c: "brass", a: 0.5, s: 0.8 }); } });
    const nC = points.length, COLS = ["cyan", "violet", "mint", "brass", "coral", "ice", "gold"], fib = [];
    [[0.62, 11], [0.3, 7]].forEach(([eta, nf], si) => {
      for (let f = 0; f < nf; f++) {
        const phi = (f / nf) * TAU + si * 0.3, c = COLS[(f + si * 3) % COLS.length];
        for (let k = 0; k < 48; k++) {
          const psi = (k / 48) * TAU;
          const x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi), x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi);
          const d = 1 - x4;
          fib.push([x1 / d, x3 / d, x2 / d]);
          points.push({ x: 0, y: 0, c, a: 0.7, s: 0.85 });
        }
      }
    });
    /* the axis: from each row's name, particles flow out to both bits where both have an answer, and only
       toward the geometric bit for sameness and identity, which Shannon's bit takes as given */
    const nF = points.length, streams = [], PER = 7;
    [[0, 1], [1, 1], [2, 0], [3, 1], [4, 1], [5, 0], [6, 1]].forEach(([row, both]) => {
      const sides = both ? [-1, 1] : [1];
      sides.forEach(dir => { for (let k = 0; k < PER; k++) { streams.push({ row, dir, u0: k / PER }); points.push({ x: 0, y: 0, c: dir < 0 ? "brass" : "cyan", a: 0, s: 0.9 }); } });
    });
    const axis = () => [...document.querySelectorAll("#mirror .M.ax")].map(el => {
      const step = el.closest(".step"), sr = step.getBoundingClientRect(), r = el.getBoundingClientRect(), tr = el.firstElementChild.getBoundingClientRect(), u = window.GTC.unit();
      const [cx, cy] = window.GTC.toStage(r.left + r.width / 2, r.top - sr.top + r.height / 2);
      return { cx, cy, from: (tr.width / 2 + 8) / u, to: (r.width / 2 + 14) / u };
    });
    const out = new Array(points.length);
    return {
      points, stillT: 2.5,
      dynamic: t => {
        if (window.GTC.toStage) {
          const ax = axis();
          streams.forEach((st, i) => {
            const a = ax[st.row]; if (!a) return;
            const u = (st.u0 + t * 0.32 + st.row * 0.09) % 1;
            out[nF + i] = { x: a.cx + st.dir * (a.from + (a.to - a.from) * u), y: a.cy, a: 0.85 * Math.sin(Math.PI * u) };
          });
        }
        const L = slot("#mirror .fig.L .slot"), R = slot("#mirror .fig.R .slot");
        const kc = L.r / 2.3, pos = v.map(p => projectCube(p, 4, t - 1));   // t − 1: the still frame shows the pose of the computers screen
        meta.forEach((m, i) => {
          if (m.vi !== undefined) { const [x, y] = pos[m.vi]; out[i] = { x: L.x + x * kc, y: L.y + y * kc, a: 1 }; }
          else { const [x1, y1] = pos[m.a], [x2, y2] = pos[m.b]; out[i] = { x: L.x + (x1 + (x2 - x1) * m.u) * kc, y: L.y + (y1 + (y2 - y1) * m.u) * kc, a: 0.5 }; }
        });
        const kh = R.r / 1.6;
        fib.forEach(([x, y, z], i) => { const [X, Y, d] = view3(x, y, z, t * 0.1, 1.05); out[nC + i] = { x: R.x + X * kh, y: R.y + Y * kh, a: 0.2 + 0.7 * d }; });
        return out;
      }
    };
  };

  /* One exponential, two compositions: turns add their angles while their exponentials
     multiply, and independent systems add their energies while their weights multiply. */
  SCENES.exps = () => {
    const cx = -0.9, R = 0.4, bx0 = 0.2, bx1 = 1.42, by0 = -0.42, by1 = 0.5, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 120; k++) { const [x, y] = at(cx, 0.05, R, (k / 120) * TAU); add({ kind: "fixed", x, y, a: 0.35 }, { x, y, c: "ice", a: 0.35, s: 0.8 }); }
    for (let k = 0; k < 40; k++) add({ kind: "arcA", u: k / 39 }, { x: cx, y: 0, c: "cyan", a: 0.9, s: 0.9 });
    for (let k = 0; k < 40; k++) add({ kind: "arcB", u: k / 39 }, { x: cx, y: 0, c: "violet", a: 0.9, s: 0.9 });
    for (let k = 0; k < 16; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: cx, y: 0, c: "gold", a: 1, s: 1.25 });
    const X = E => bx0 + ((bx1 - bx0) * E) / 3, Y = w => by0 + (by1 - by0) * w;
    for (let k = 0; k < 110; k++) { const E = (3 * k) / 109; add({ kind: "fixed", x: X(E), y: Y(Math.exp(-E)), a: 0.6 }, { x: 0, y: 0, c: "coral", a: 0.6, s: 0.85 }); }
    for (let k = 0; k < 40; k++) add({ kind: "fixed", x: bx0 + ((bx1 - bx0) * k) / 39, y: by0, a: 0.3 }, { x: 0, y: 0, c: "dim", a: 0.3, s: 0.7 });
    ["e1", "e2", "e12"].forEach(kind => { for (let k = 0; k < 14; k++) add({ kind, u: k / 13 }, { x: 0, y: 0, c: kind === "e12" ? "gold" : "coral", a: 0.8, s: 0.9 }); });
    const ang = t => [0.7 + 0.35 * Math.sin(t * 0.5), 1.1 + 0.4 * Math.sin(t * 0.37 + 1)], en = t => [0.45 + 0.25 * Math.sin(t * 0.4), 0.8 + 0.3 * Math.sin(t * 0.33 + 2)];
    const out = new Array(points.length);
    return {
      points, stillT: 2,
      dynamic: t => {
        const [a, b] = ang(t), [e1, e2] = en(t);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: m.a }; return; }
          if (m.kind === "arcA") { const [x, y] = at(cx, 0.05, R + 0.07, a * m.u); out[i] = { x, y, a: 0.9 }; return; }
          if (m.kind === "arcB") { const [x, y] = at(cx, 0.05, R + 0.13, a + b * m.u); out[i] = { x, y, a: 0.9 }; return; }
          if (m.kind === "mark") { const [x, y] = at(cx, 0.05, R, a + b); out[i] = { x: x + m.jx, y: y + m.jy, a: 1 }; return; }
          const E = m.kind === "e1" ? e1 : m.kind === "e2" ? e2 : e1 + e2;
          out[i] = { x: X(E), y: by0 + (Y(Math.exp(-E)) - by0) * m.u, a: 0.8 };
        });
        return out;
      },
      labels: [
        { x: cx, y: -0.62, html: "<i>e</i><sup><i>iα</i></sup> · <i>e</i><sup><i>iβ</i></sup> = <i>e</i><sup><i>i</i>(<i>α</i>+<i>β</i>)</sup>", cls: "slot c-math" },
        { x: cx, y: -0.8, html: "angles add, rotations multiply", cls: "example" },
        { x: (bx0 + bx1) / 2, y: -0.62, html: "<i>e</i><sup>−<i>E</i>₁/<i>kT</i></sup> · <i>e</i><sup>−<i>E</i>₂/<i>kT</i></sup> = <i>e</i><sup>−(<i>E</i>₁+<i>E</i>₂)/<i>kT</i></sup>", cls: "slot c-math" },
        { x: (bx0 + bx1) / 2, y: -0.8, html: "energies add, weights multiply", cls: "example" },
        { x: bx0, y: by1 + 0.12, html: "weight", cls: "tag" },
        { x: bx1, y: by0 - 0.1, html: "energy", cls: "tag" }
      ]
    };
  };

  /* Relational frames as a loop. Taught: an igniter is a lighter, and a lighter is the thing on the desk;
     derived without teaching: an igniter is the thing on the desk. Going round the three relations comes
     back to where it started when they hold together, A = A; on the right one derived relation misses, and
     the loop comes back short of its start by an amount that can be measured. */
  SCENES.grelations = () => {
    const PAN = [-0.74, 0.74], CY = 0.1, V = [[-0.4, -0.26], [0, 0.4], [0.4, -0.26]], MISS = [0.14, 0.11], P = 4.8;
    const pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const corner = (pn, k) => [PAN[pn] + V[k][0], CY + V[k][1]];
    const end = pn => pn ? [PAN[1] + V[0][0] + MISS[0], CY + V[0][1] + MISS[1]] : corner(0, 0);
    const legs = pn => [[corner(pn, 0), corner(pn, 1)], [corner(pn, 1), corner(pn, 2)], [corner(pn, 2), end(pn)]];
    [0, 1].forEach(pn => {
      legs(pn).forEach(([A, B], k) => { const n = k < 2 ? 34 : 22; for (let q = 0; q < n; q++) { const u = (q + 0.5) / n; { const x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u, a = k < 2 ? 0.7 : 0.85; add({ kind: "still", x, y, a }, { x, y, c: k < 2 ? "cyan" : "gold", a, s: 0.7 }); } } });
      for (let k = 0; k < 3; k++) for (let q = 0; q < 10; q++) { const [x0, y0] = corner(pn, k), x = x0 + gauss() * 0.02, y = y0 + gauss() * 0.02; add({ kind: "still", x, y, a: 0.9 }, { x, y, c: "paper", a: 0.9, s: 0.9 }); }
      for (let q = 0; q < 8; q++) add({ kind: "go", pn, j: [gauss() * 0.01, gauss() * 0.01] }, { x: PAN[pn], y: CY, c: "gold", a: 1, s: 1.2 });
      for (let q = 0; q < 26; q++) add({ kind: "close", pn, b: q / 26 * TAU }, { x: PAN[pn], y: CY, c: pn ? "coral" : "mint", a: 0, s: 0.7 });
    });
    return tScene({
      stillT: 4.5,
      labels: [
        ...[0, 1].flatMap(pn => [
          { x: corner(pn, 0)[0] - 0.02, y: corner(pn, 0)[1] - 0.13, html: "igniter", cls: "example" },
          { x: corner(pn, 1)[0], y: corner(pn, 1)[1] + 0.12, html: "lighter", cls: "example" },
          { x: corner(pn, 2)[0] + 0.02, y: corner(pn, 2)[1] - 0.13, html: "the thing on the desk", cls: "example" }
        ]),
        { x: PAN[0] - 0.33, y: CY + 0.12, html: "taught", cls: "tag right" }, { x: PAN[0] + 0.33, y: CY + 0.12, html: "taught", cls: "tag left" },
        { x: PAN[0], y: CY - 0.18, html: "derived", cls: "tag" },
        { x: PAN[0], y: -0.66, html: "the relations hold: the loop comes back", cls: "example" },
        { x: PAN[1], y: -0.66, html: "one relation misses: it comes back short", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P, u = Math.min(1, c / (P - 1.3)), done = c > P - 1.3 ? Math.min(1, (c - (P - 1.3)) / 0.3) : 0;
          meta.forEach((m, i) => {
            if (m.kind === "still") out[o + i] = { x: m.x, y: m.y, a: m.a };
            else if (m.kind === "go") {
              const L = legs(m.pn), k = Math.min(2, Math.floor(u * 3)), f = u * 3 - k, [A, B] = L[k];
              out[o + i] = { x: A[0] + (B[0] - A[0]) * f + m.j[0], y: A[1] + (B[1] - A[1]) * f + m.j[1], a: 1 };
            } else if (m.kind === "close") {
              if (m.pn === 0) { const [x, y] = corner(0, 0); out[o + i] = { x: x + 0.075 * Math.cos(m.b), y: y + 0.075 * Math.sin(m.b), a: 0.85 * done }; }
              else { const [x0, y0] = corner(1, 0), [x1, y1] = end(1), f = m.b / TAU; out[o + i] = { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, a: 0.9 * done }; }
            }
          });
        }
      }
    });
  };

  /* Life keeps its own reference. Left, a loop of self-reference carried through time becomes a spiral, the
     circle drawn along time, with a point running along it. Right, a flatworm cut in two regrows to the shape
     its cells store, drawn as a faint outline that is there the whole time. */
  SCENES.gliving = () => {
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    const HXc = -0.74, HL = 1.0, HR = 0.19, TURNS = 3, YAW = 0.5, TILT = 0.28, WX = 0.74, WY = 0.04, P = 9, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const hx = (u, r = HR) => {
      const a = u * TURNS * TAU, x = HL * (u - 0.5), y = r * Math.cos(a), z = r * Math.sin(a);
      const X1 = x * Math.cos(YAW) - z * Math.sin(YAW), Z1 = x * Math.sin(YAW) + z * Math.cos(YAW);
      const Y2 = y * Math.cos(TILT) - Z1 * Math.sin(TILT), D = y * Math.sin(TILT) + Z1 * Math.cos(TILT), f = 3 / (3 + D);
      return [HXc + X1 * f, WY + Y2 * f, -D];
    };
    for (let q = 0; q < 240; q++) add({ kind: "helix", u: q / 239 }, { x: HXc, y: WY, c: "cyan", a: 0.5, s: 0.7 });
    for (let q = 0; q < 40; q++) add({ kind: "loop0", b: q / 40 }, { x: HXc, y: WY, c: "gold", a: 0.6, s: 0.7 });
    for (let q = 0; q < 8; q++) add({ kind: "run", j: [gauss() * 0.01, gauss() * 0.01] }, { x: HXc, y: WY, c: "gold", a: 1, s: 1.2 });
    const wid = u => 0.1 * Math.pow(Math.max(0, 1 - (2 * u - 1) ** 2), 0.45) + 0.032 * Math.exp(-(((u - 0.8) / 0.045) ** 2));
    const wx = u => WX + (u - 0.5) * 0.82;
    for (let q = 0; q <= 70; q++) { const u = q / 70; [1, -1].forEach(sg => add({ kind: "target", x: wx(u), y: WY + sg * wid(u) }, { x: wx(u), y: WY + sg * wid(u), c: "gold", a: 0.42, s: 0.6 })); }
    for (let a = 0; a <= 40; a++) { const u = a / 40, w = wid(u); for (let yy = -w + 0.014; yy < w; yy += 0.028) add({ kind: "body", u, yy, j: [gauss() * 0.004, gauss() * 0.004] }, { x: wx(u), y: WY + yy, c: "mint", a: 0.8, s: 0.75 }); }
    [1, -1].forEach(sg => { for (let q = 0; q < 4; q++) add({ kind: "eye", u: 0.86, yy: sg * 0.032, j: [gauss() * 0.004, gauss() * 0.004] }, { x: wx(0.86), y: WY + sg * 0.032, c: "paper", a: 0.95, s: 0.8 }); });
    for (let q = 0; q < 14; q++) add({ kind: "cut", v: (q / 13 - 0.5) * 0.3 }, { x: wx(0.55), y: WY, c: "coral", a: 0, s: 0.7 });
    const CUT = 0.55;
    return tScene({
      stillT: 8,
      labels: [
        { x: HXc, y: 0.6, html: "a loop that refers to itself", cls: "example" },
        { x: HXc, y: -0.5, html: "carried through time, a spiral", cls: "example" },
        { x: WX, y: 0.6, html: "a flatworm and the shape it stores", cls: "example" },
        { x: WX, y: -0.5, html: "cut in two, it regrows that shape", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P, run = (t / 7) % 1;
          const away = c < 1.4 ? 0 : Math.min(1, (c - 1.4) / 1.0), front = c < 2.4 ? 1 : c < 6.6 ? CUT + (1 - CUT) * sm((c - 2.4) / 4.2) : 1;
          const regrowing = c >= 2.4 && c < 6.6, cutFlash = c > 1.3 && c < 2.6 ? Math.sin(Math.PI * (c - 1.3) / 1.3) : 0, match = c > 6.6 && c < 7.6 ? Math.sin(Math.PI * (c - 6.6)) : 0;
          meta.forEach((m, i) => {
            let v = null;
            switch (m.kind) {
              case "helix": { const [x, y, d] = hx(m.u), near = Math.max(0, Math.min(1, 0.5 + d * 2)); v = { x, y, a: 0.25 + 0.55 * near }; break; }
              case "loop0": { const a = m.b * TAU, [x, y] = hx(0, 0), r = HR, X1 = -r * Math.sin(a) * Math.sin(YAW), Y2 = r * Math.cos(a) * Math.cos(TILT) - r * Math.sin(a) * Math.cos(YAW) * Math.sin(TILT); v = { x: x + X1, y: y + Y2, a: 0.55 }; break; }
              case "run": { const [x, y] = hx(run); v = { x: x + m.j[0], y: y + m.j[1], a: 1 }; break; }
              case "target": v = { x: m.x, y: m.y, a: 0.35 + 0.5 * match }; break;
              case "body": {
                if (m.u > CUT && c >= 1.4 && c < 2.4) { v = { x: wx(m.u) + 0.18 * away + m.j[0], y: WY + m.yy + 0.06 * away + m.j[1], a: 0.8 * (1 - away) }; break; }
                const shown = m.u <= front + 1e-6 ? 1 : 0, edge = regrowing && Math.abs(m.u - front) < 0.05;
                v = { x: wx(m.u) + m.j[0], y: WY + m.yy + m.j[1], a: 0.8 * shown, c: edge ? "gold" : "mint" }; break;
              }
              case "eye": { const shown = c < 1.4 || c >= 6.2 ? 1 : 0; v = { x: wx(m.u) + m.j[0], y: WY + m.yy + m.j[1], a: 0.95 * shown }; break; }
              case "cut": v = { x: wx(CUT), y: WY + m.v, a: 0.9 * cutFlash }; break;
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* Any circle, any size, anywhere: the same ratio. */
  SCENES.anysize = () => {
    const C = [[-1.2, 0.12, 0.1], [-0.72, 0.12, 0.24], [0.42, 0.12, 0.72]];
    return {
      points: C.flatMap(([x, y, r]) => S.arc(x, y, r, 0, TAU * 0.995, Math.round(40 + 180 * r), { c: "ice", a: 0.45, s: 0.8 })),
      flows: C.map(([x, y, r]) => ({ n: 1, path: u => at(x, y, r, u * TAU), speed: 0.15, c: "gold", a: 1, s: 2.2 })),
      labels: [
        ...C.map(([x, y, r]) => ({ x, y: y - r - 0.16, html: "π", cls: "slot c-math" })),
        { x: 0, y: -0.98, html: "any circle, any size, any observer: 3.14159…", cls: "example" }
      ]
    };
  };

  /* Coda: the author's most influential references, a plain list: his three closest companions in the work on
     top, then the rest in alphabetical order, read down the columns. */
  SCENES.coda = () => {
    const NAMES = ["Bak and Tang", "Bohr", "Chomsky", "Darwin", "Einstein", "Euler", "Feynman", "Friston", "Gödel", "Gorard", "Hamilton", "Hawking", "Jung",
      "Kuhn", "Lacan", "Landauer", "Mandelbrot", "von Neumann", "Penrose", "Piaget", "Saussure", "Schrödinger", "Skinner", "Turing", "Wheeler",
      "Wittgenstein", "Wolfram", "Zipf"];
    const COLS = 5, ROWS = Math.ceil(NAMES.length / COLS);
    return {
      points: [],
      labels: [
        { x: 0, y: 1.1, html: "Most influential references to this work", cls: "role" },
        { x: 0, y: 0.9, html: "Sam Senchal", cls: "slot c-math" },
        { x: 0, y: 0.77, html: "the one who contributed the most, my research partner", cls: "example" },
        { x: -0.45, y: 0.57, html: "Cohl Furey", cls: "slot c-math" },
        { x: 0.45, y: 0.57, html: "Michael Levin", cls: "slot c-math" },
        ...NAMES.map((h, k) => ({ x: -1.2 + 0.6 * Math.floor(k / ROWS), y: 0.28 - 0.22 * (k % ROWS), html: h, cls: "slot" }))
      ]
    };
  };

  /* A word and a symbol pointing at one object. Left, the word "circle" names the shape and nothing more.
     Right, the equation e^(iθ) = cos θ + i sin θ points at the whole object: the circle carried through
     time, Euler's helix, one full turn along a time axis, with 1, i, −1 and −i at the quarter turns and the
     identity on it, e^(iπ) = −1 at the half turn and e^(2πi) = 1 where it returns. A point runs along the
     turn and glows when it is back at 1. */
  SCENES.gnames = () => {
    const XL = -0.85, RL = 0.3, XR = 0.62, HY = -0.02, HL = 1.15, HR = 0.27, YAW = 0.58, TILT = 0.24, RUN = 5, PER = 6.2, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const hx = (u, r = HR) => {                            // Euler's helix in three dimensions, seen on a diagonal so it recedes
      const a = u * TAU, x = HL * (u - 0.5), y = r * Math.cos(a), z = r * Math.sin(a);
      const X1 = x * Math.cos(YAW) - z * Math.sin(YAW), Z1 = x * Math.sin(YAW) + z * Math.cos(YAW);
      const Y2 = y * Math.cos(TILT) - Z1 * Math.sin(TILT), D = y * Math.sin(TILT) + Z1 * Math.cos(TILT), f = 4 / (4 + D);
      return [XR + X1 * f, HY + Y2 * f, -D];
    };
    for (let q = 0; q < 120; q++) add({ kind: "circle", b: q / 120 * TAU }, { x: XL, y: 0, c: "ice", a: 0.7, s: 0.7 });
    for (let q = 0; q < 240; q++) add({ kind: "helix", u: q / 239 }, { x: XR, y: HY, c: "cyan", a: 0.5, s: 0.7 });
    for (let q = 0; q < 46; q++) add({ kind: "axis", u: -0.08 + q / 45 * 1.2 }, { x: XR, y: HY, c: "dim", a: 0.35, s: 0.5 });
    [0, 1].forEach(e => { for (let q = 0; q < 60; q++) add({ kind: "ring", e, b: q / 60 * TAU }, { x: XR, y: HY, c: "ice", a: 0.3, s: 0.55 }); });
    [0, 0.25, 0.5, 0.75, 1].forEach(u => { for (let q = 0; q < 6; q++) add({ kind: "mark", u, j: [gauss() * 0.008, gauss() * 0.008] }, { x: XR, y: HY, c: "paper", a: 0.9, s: 0.9 }); });
    for (let q = 0; q < 10; q++) add({ kind: "pt", j: [gauss() * 0.01, gauss() * 0.01] }, { x: XR, y: HY, c: "gold", a: 1, s: 1.25 });
    const prog = t => Math.min(1, (((t % PER) + PER) % PER) / RUN);
    const at = (u, dx, dy) => { const [x, y] = hx(u); return { x: x + dx, y: y + dy }; };
    const tail = hx(1.12, 0);
    const ringAt = (e, b) => {                            // the same circle at the start and at the end of the turn
      const x = HL * (e - 0.5), y = HR * Math.cos(b), z = HR * Math.sin(b);
      const X1 = x * Math.cos(YAW) - z * Math.sin(YAW), Z1 = x * Math.sin(YAW) + z * Math.cos(YAW);
      const Y2 = y * Math.cos(TILT) - Z1 * Math.sin(TILT), D = y * Math.sin(TILT) + Z1 * Math.cos(TILT), f = 4 / (4 + D);
      return [XR + X1 * f, HY + Y2 * f];
    };
    return tScene({
      stillT: RUN + 0.3,
      labels: [
        { x: XL, y: 0.8, html: "a word", cls: "role" }, { x: XR, y: 0.8, html: "an equation", cls: "role" },
        { x: XL, y: 0.6, html: "circle", cls: "math upright" },
        { x: XR, y: 0.6, html: "<i>e</i><sup><i>i</i>θ</sup> = cos θ + <i>i</i> sin θ", cls: "math upright" },
        { ...at(0, 0, 0.08), html: "1", cls: "example" },
        { ...at(0.25, 0.07, 0), html: "<i>i</i>", cls: "example left" },
        { ...at(0.5, 0, -0.09), html: "<i>e</i><sup><i>i</i>π</sup> = −1", cls: "example" },
        { ...at(0.75, -0.07, 0), html: "−<i>i</i>", cls: "example right" },
        { ...at(1, 0, 0.08), html: "<i>e</i><sup>2π<i>i</i></sup> = 1", cls: "example" },
        { x: tail[0] + 0.03, y: tail[1], html: "time", cls: "example left" },
        { x: XL, y: -0.6, html: "the shape", cls: "example" }, { x: XR, y: -0.6, html: "the circle over time, back to 1", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const u0 = prog(t), back = u0 >= 1;
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "circle": v = { x: XL + RL * Math.cos(m.b), y: RL * Math.sin(m.b), a: 0.7 }; break;
              case "helix": { const [x, y, d] = hx(m.u), near = Math.max(0, Math.min(1, 0.5 + d * 2)); v = { x, y, a: (m.u <= u0 ? 0.45 + 0.5 * near : 0.18 + 0.2 * near) }; break; }
              case "axis": { const [x, y] = hx(m.u, 0); v = { x, y, a: 0.3 }; break; }
              case "ring": { const [x, y] = ringAt(m.e, m.b); v = { x, y, a: 0.28 }; break; }
              case "mark": { const [x, y] = hx(m.u); v = { x: x + m.j[0], y: y + m.j[1], a: 0.9, c: back && m.u === 1 ? "gold" : "paper" }; break; }
              default: { const [x, y] = hx(u0); v = { x: x + m.j[0] * (back ? 2.2 : 1), y: y + m.j[1] * (back ? 2.2 : 1), a: 1 }; }
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* ---------------- definitions for hoverable phrases in the text ---------------- */

  const DEFS = {
    // Source for Peirce: https://www.unav.es/gep/Welby12.10.04.html
    "peirce-relation": { w: "observer · observed · observation", t: "Two things, and the relation connecting them.",
      d: "This is the paper’s triad of observation. Peirce develops a related account of meaning through a sign, its object and its interpretant: the understanding or effect the sign produces. His point is that the connection itself belongs in the explanation; naming the two ends alone leaves it out.",
      s: "C. S. Peirce, letter to Lady Welby, 12 October 1904" },
    "self-reference": { w: "paradoxes and tautologies", t: "What is the sign being compared with?",
      d: "Saying ‘a lighter is a lighter’ repeats the sign without helping us find the object. Russell’s paradox asks whether a set belongs to itself; Gödel encodes statements about proofs inside arithmetic. They bring the relation between a description and what it describes into focus. Here we keep the thing, the observation and the sign visible so we can ask what checks the statement.",
      s: "Bertrand Russell, 1902; Kurt Gödel, 1931" },
    dof: { w: "independent degrees of freedom", t: "Each independent way to vary is its own axis.",
      d: "The state of a physical system is a point in phase space, one coordinate for each independent position and momentum, and these coordinates are orthogonal axes. Boltzmann’s entropy, <i>S</i> = <i>k</i> log <i>W</i>, counts the states <i>W</i> compatible with what we observe, and for independent parts those counts multiply, so their entropies add, just as independent bits add. At equilibrium each independent quadratic degree of freedom holds the same share of energy, ½<i>kT</i>.",
      s: "Ludwig Boltzmann, 1877; J. Willard Gibbs, <i>Elementary Principles in Statistical Mechanics</i>, 1902" },
    shannon1949: { w: "Communication in the Presence of Noise", t: "Shannon’s geometric proof of a channel’s capacity.",
      d: "Shannon wrote a signal of bandwidth <i>W</i> and duration <i>T</i> as a point in a space of 2<i>WT</i> dimensions. Signals of power <i>P</i> lie on a sphere of radius √(2<i>WTP</i>), and noise of power <i>N</i> moves each one by about √(2<i>WTN</i>), so every point sent arrives somewhere inside a small sphere around it. Counting how many small spheres fit without overlapping gives the capacity, <i>W</i> log₂(1 + <i>P</i>/<i>N</i>) bits per second.",
      s: "Claude E. Shannon, “Communication in the Presence of Noise”, <i>Proceedings of the IRE</i> 37, 1949" },
    whythree: { w: "Why 3 + 1", t: "We see every thing from three directions of space and one of time, the three perpendicular directions and one reference of a quaternion.",
      d: "Every time I look at a lighter I see a 3 + 1 projection of it. I cannot be sure how many dimensions the lighter itself has, only that I always see it from three directions and one of time, the way our eyes read light through three kinds of colour cell, red, green and blue, and one more for brightness. So we may ask why it is 3 + 1. Three is the fewest directions that leave room for something new: in two, every motion that stays bounded and keeps going settles into a repeating cycle, while three allow motion that never repeats. The one is the phase that accumulates, which we read as time, and its direction, the order in which it accumulates, keeps everything that happens coherent.",
      s: "William Rowan Hamilton, 1843; Henri Poincaré, 1881, and Ivar Bendixson, 1901, on motion in the plane" },
    levinbio: { w: "bioelectric pattern memory", t: "A flatworm’s body plan is held as a pattern of voltages across its cells, and rewriting the pattern changes what grows back.",
      d: "Planarian flatworms regrow a whole body from a small fragment. Michael Levin’s group showed that the target anatomy is held in a bioelectric pattern across the tissue: briefly altering it makes fragments regrow two heads, and those two-headed worms keep regenerating two heads when cut again, in plain water and with an unchanged genome. Levin argues more broadly that such patterns are drawn from a Platonic space of forms, from mathematical facts to kinds of bodies and minds, to which living things act as interfaces.",
      s: "Fallon Durant et al., “Long-term, stochastic editing of regenerative anatomy via targeting endogenous bioelectric gradients”, <i>Biophysical Journal</i> 112, 2017; Michael Levin, “Ingressing Minds: Causal Patterns Beyond Genetics and Environment in Natural, Synthetic, and Hybrid Embodiments”, 2025, revised 2026" },
    stepney: { w: "time and self-reference in living systems", t: "Natural time unwinds a living system’s loops of self-reference into developmental spirals.",
      d: "The authors separate natural time, the continuing present of physical processes, from representational time, which living systems bring into being and which makes memory, learning and prediction possible. A loop of self-reference that would be a paradox in logic becomes, carried through natural time, a spiral of development, so self-reference in life is productive rather than contradictory.",
      s: "Samson Abramsky, Wolfgang Banzhaf, Leo S. D. Caves, Michael Levin, Penousal Machado, Charles Ofria, Susan Stepney and Roger White, “Open questions about time and self-reference in living systems”, <i>Royal Society Open Science</i> 13(8), 2026" },
    adams: { w: "Adams’s theorem", t: "Spheres fibre over spheres this way only at the four levels of the tower.",
      d: "A sphere filled with spheres over another sphere, like the Hopf fibration, needs a map of Hopf invariant one. Frank Adams proved that such maps exist only from the 1-, 3-, 7- and 15-spheres, the real numbers, complex numbers, quaternions and octonions, so the same four levels Hurwitz found in algebra appear again in the shapes of spheres.",
      s: "J. F. Adams, “On the Non-Existence of Elements of Hopf Invariant One”, <i>Annals of Mathematics</i> 72, 1960" },
    hurwitz: { w: "Hurwitz’s theorem", t: "Only four number systems multiply while keeping length.",
      d: "A number system whose multiplication keeps lengths, so that the length of a product is the product of the lengths, exists only in dimensions 1, 2, 4 and 8: the real numbers, the complex numbers, the quaternions and the octonions. Doubling once more, to the sedenions, gives numbers that multiply to zero without either being zero.",
      s: "Adolf Hurwitz, 1898" },
    expmap: { w: "the exponential map", t: "It wraps a line onto the circle and turns adding into multiplying.",
      d: "The map θ ↦ e<sup><i>i</i>θ</sup> sends every real number to a point on the circle and sends sums to products: e<sup><i>i</i>(a+b)</sup> = e<sup><i>i</i>a</sup>e<sup><i>i</i>b</sup>. It comes back to 1 exactly when θ is a whole number of full turns, so the whole numbers are where it closes, and the circle is the line with its full turns identified. Dividing the turn into <i>n</i> equal steps, <i>e</i><sup>2π<i>ik</i>/<i>n</i></sup>, puts every whole number <i>k</i> at its remainder mod <i>n</i>, which is counting in base <i>n</i>: the steps are the digits, and each full turn carries one to the next place. With a real part added, e<sup><i>x</i>+<i>iy</i></sup> = e<sup><i>x</i></sup>e<sup><i>iy</i></sup>, the same map gives every nonzero complex number as a scale times a rotation. In more dimensions it is the exponential map of a group of rotations, the way physics writes every continuous symmetry.",
      s: "Leonhard Euler, <i>Introductio in analysin infinitorum</i>, 1748; Sophus Lie, 1870s" },
    curvedspace: { w: "curved space", t: "Mass curves space and time, and the curvature is measured.",
      d: "Einstein’s general relativity describes gravity as the curvature of space and time. Starlight passing the Sun bends by the predicted 1.75 arcseconds, half from the curvature of space and half from that of time, first measured in 1919 and now to a few parts in ten thousand by radio telescopes; clocks lower in a gravitational field run slower, measured by Pound and Rebka in 1959 and corrected for by every GPS satellite; and in 2015 LIGO detected the ripples of curvature sent out by two black holes merging.",
      s: "Albert Einstein, 1915; Frank Dyson, Arthur Eddington and Charles Davidson, 1920; Robert Pound and Glen Rebka, 1960; LIGO Scientific and Virgo Collaborations, 2016" },
    threebody: { w: "the three-body problem", t: "Three bodies pulling on each other cannot be split into independent motions: to exist is to interact, as a theorem of mechanics.",
      d: "Two bodies can be solved because their motion keeps its own directions, the plane and sense of their turning and the axis of the orbit, so the orbit closes. Bruns in 1887 and Poincaré in 1890 proved that three bodies have nothing further to keep, so their motion cannot be separated into independent rotations. The shapes of the triangle they form fill a sphere, and which way it faces is a circle over each shape, the circles over a sphere of the complex Hopf fibration, so no single reference direction works for every shape. What is known exactly are the motions in which all three share one direction of turning: Euler’s line and Lagrange’s equilateral triangle rotating as one, which the Trojan asteroids follow at Jupiter, and the figure-eight. Poincaré called such periodic solutions the only breach into the problem.",
      s: "Heinrich Bruns, 1887; Henri Poincaré, 1890, and <i>Les Méthodes nouvelles de la mécanique céleste</i>, 1892; Richard Montgomery, “The geometric phase of the three-body problem”, <i>Nonlinearity</i> 9, 1996" },
    holonomy: { w: "holonomy", t: "What a closed loop does to whatever is carried around it.",
      d: "Carry an arrow around a closed loop on a curved surface, keeping it as straight as the surface allows, and it comes back turned by the curvature the loop encloses; on a flat surface it comes back unchanged (Gauss and Bonnet). In a field the same holds for anything the field acts on: the product of the field's rotations around the loop. The Aharonov–Bohm effect and Berry's phase are holonomies measured in the laboratory.",
      s: "Carl Friedrich Gauss, 1827; Pierre Ossian Bonnet, 1848; Yakir Aharonov and David Bohm, 1959; Michael Berry, 1984" },
    wilson: { w: "Wilson's lattice action", t: "The energy of a force field is the sum, over small loops, of how far each loop fails to close.",
      d: "Wilson put the forces of particle physics on a lattice: a rotation <i>U</i> on every link, and every small square loop measured by the product of its four links. The energy is β Σ (1 − (1/<i>N</i>) Re tr <i>U</i><sub>loop</sub>): a loop that closes costs nothing, and one that comes back turned costs more the more it turned. For the quaternions, (1/2) Re tr <i>U</i> is the scalar part. As the lattice spacing shrinks the action becomes the Yang–Mills action of the continuum, and lattice computations of the strong force are built on it.",
      s: "Kenneth G. Wilson, “Confinement of quarks”, <i>Physical Review D</i> 10, 1974" },
    hopffib: { w: "the Hopf fibrations", t: "A sphere filled with copies of the sphere below, one copy for each point of another sphere.",
      d: "Hopf found in 1931 that the three-sphere is filled with circles, any two of them linked once, one circle for each point of an ordinary sphere. The same construction fills the seven-sphere with three-spheres over a four-sphere using quaternions, and the fifteen-sphere with seven-spheres over an eight-sphere using octonions, while with real numbers it wraps a circle twice around a circle, two points over each point. Quantum computing already lives on them: one qubit is a point of the three-sphere and its Bloch sphere is the base of the complex fibration, two qubits use the quaternionic one, with their entanglement read on its base, and three qubits use the octonionic one, after which there are no more.",
      s: "Heinz Hopf, 1931 and 1935; Rémy Mosseri and Rossen Dandoloff, “Geometry of entangled states, Bloch spheres and Hopf fibrations”, 2001; B. Andrei Bernevig and Han-Dong Chen, “Geometry of the three-qubit state, entanglement and division algebras”, 2003" },
    rungforces: { w: "the forces on the layers", t: "U(1) is the unit circle of ℂ, SU(2) the unit three-sphere of ℍ, and SU(3) the symmetries of 𝕆 that keep one direction fixed.",
      d: "The symmetry of the Standard Model is U(1) × SU(2) × SU(3). The unit complex numbers are U(1), the phase of electromagnetism; the unit quaternions are SU(2), the group of the weak force and of spin; and the symmetries of the octonions form the group G₂, whose elements that keep one imaginary direction fixed form SU(3), the group of the strong force’s colour. Günaydin and Gürsey read quark colour this way in 1973, and Dixon and Furey have since built one generation of the Standard Model’s particles from ℝ, ℂ, ℍ and 𝕆 together.",
      s: "Murat Günaydin and Feza Gürsey, 1973; Geoffrey Dixon, <i>Division Algebras</i>, 1994; Cohl Furey, 2018" },
    superstrings: { w: "superstrings and the number systems", t: "Classical superstrings exist only in 3, 4, 6 and 10 dimensions.",
      d: "A superstring needs one identity among its spinors to hold, and it holds exactly when the directions transverse to the string form one of the four number systems: the real numbers, the complex numbers, the quaternions or the octonions. That puts the string in 1 + 2, 2 + 2, 4 + 2 or 8 + 2 dimensions, so the ten dimensions of superstring theory are the octonions plus the string’s own two.",
      s: "Taichiro Kugo and Paul Townsend, 1983; Jonathan Evans, 1988; John Baez and John Huerta, 2009" },
    quantumclosure: { w: "particles as closures", t: "A bound particle keeps only the states whose wave comes back to itself, so its quantum numbers count turns.",
      d: "A quantum state turns in phase at a rate set by its energy, and de Broglie gave every massive particle an internal clock at <i>mc</i>²/<i>h</i>. A bound state exists only where the wave closes on itself, which is why an atom keeps only certain orbits; angular momentum comes in whole numbers because the wave must return after a full turn; spin one-half returns only after two turns; and if a magnetic monopole exists, electric charge comes in whole units because the phase around it must close. The quantum numbers are discrete because the space they live in is closed: on an open line momentum is continuous, and on a ring it closes too.",
      s: "Louis de Broglie, 1924; Arnold Sommerfeld, 1916; Paul Dirac, 1931" },
    planewave: { w: "a particle’s wave", t: "A free particle with momentum <i>p</i> and energy <i>E</i> is the wave <i>e</i><sup><i>i</i>(<i>px</i> − <i>Et</i>)/ħ</sup>.",
      d: "De Broglie gave every particle a wave, and Schrödinger’s equation describes a free particle of definite momentum and energy by <i>e</i><sup><i>i</i>(<i>kx</i> − ω<i>t</i>)</sup>, with <i>p</i> = ħ<i>k</i> and <i>E</i> = ħω: Euler’s rotation, turning in time at a rate set by the energy and along space at a rate set by the momentum. Its size is 1 everywhere, so only the phase changes, and the momentum and energy are read from how fast it turns. Every other state of the particle is a sum of such waves.",
      s: "Louis de Broglie, 1924; Erwin Schrödinger, 1926" },
    eulerhelix: { w: "Euler’s helix", t: "A circle carried through time.",
      d: "Plot <i>e</i><sup><i>i</i>ω<i>t</i></sup> with time as a third axis and the point traces a helix: seen along time it is the circle, and seen from the side it is the wave. The rotation this work means is that helix, a circle carried through time, and every turn it completes is one closure.",
      s: "Leonhard Euler, <i>Introductio in analysin infinitorum</i>, 1748" },
    noether: { w: "Noether’s theorem", t: "Every continuous symmetry of a system’s laws has a conserved quantity.",
      d: "If the laws do not change when the whole system is shifted in time, energy is conserved; if they do not change when it is moved in space, momentum is conserved; and if they do not change when it is rotated, angular momentum is conserved. The sameness under the change is the thing that is kept.",
      s: "Emmy Noether, “Invariante Variationsprobleme”, <i>Nachrichten der Gesellschaft der Wissenschaften zu Göttingen</i>, 1918" },
    complexan: { w: "complex analysis", t: "A complex derivative is a derivative that commutes with rotation by a right angle.",
      d: "A function has a complex derivative exactly when its local change rotates an increment by the same right angle whether the rotation comes before or after, the Cauchy–Riemann condition. That single constraint makes such functions so rigid that knowing them on a small region fixes them everywhere, which is what lets the zeta function be continued past its sum and gives the prime number theorem.",
      s: "Augustin-Louis Cauchy, 1814; Bernhard Riemann, 1851 and 1859; Hadamard and de la Vallée Poussin, 1896" },
    light: { w: "light", t: "Light is a rotation travelling through space.",
      d: "Maxwell showed that light is an electric and a magnetic field at right angles to each other and to the direction of travel, and the wave is written as a rotating phase, <i>e</i><sup><i>i</i>(<i>kx</i> − <i>ωt</i>)</sup>. Circular polarization is that rotation made visible, the field rotating as the light moves.",
      s: "James Clerk Maxwell, “A Dynamical Theory of the Electromagnetic Field”, 1865" },
    bloch: { w: "the qubit", t: "A qubit is two complex amplitudes held to length one.",
      d: "A qubit’s state is α|0⟩ + β|1⟩ with |α|² + |β|² = 1, two rotations held to one unit of length, a point on the three-sphere. Multiplying both by the same phase changes no measurement, so what can be read is a point on the ordinary sphere, the Bloch sphere, and the map from one to the other is the Hopf fibration.",
      s: "Felix Bloch, 1946; Heinz Hopf, 1931; Nielsen and Chuang, <i>Quantum Computation and Quantum Information</i>, 2010" },
    unitary: { w: "Schrödinger’s equation", t: "Quantum evolution is a rotation that keeps length.",
      d: "The solution of Schrödinger’s equation is <i>e</i><sup>−<i>iHt</i>/ħ</sup> applied to the state, so each state of definite energy simply rotates at its own rate, <i>e</i><sup>−<i>iEt</i>/ħ</sup>, and the total probability, the length of the state, never changes.",
      s: "Erwin Schrödinger, 1926" },
    actionangle: { w: "action and angle", t: "Bounded motion that conserves enough quantities runs on a torus.",
      d: "The Liouville–Arnold theorem shows that a Hamiltonian system with as many independent conserved quantities as degrees of freedom, moving in a bounded region, lives on a torus, a product of circles, with coordinates that are angles each advancing at a constant rate, which is how planets, pendulums and coupled oscillators are solved.",
      s: "Joseph Liouville, 1855; Vladimir Arnold, 1963" },
    gates: { w: "logic gates", t: "Each gate is a surface over the square.",
      d: "A gate reads bits at a corner and returns a bit. AND returns 1 only at the corner 11, exactly as the polynomial <i>xy</i> does, and XOR returns 1 where the inputs differ, as <i>x</i> + <i>y</i> − 2<i>xy</i> does. Every gate is a polynomial over the cube, read at its corners.",
      s: "Ryan O’Donnell, <i>Analysis of Boolean Functions</i>, 2014, chapter 1" },
    distance: { w: "Hamming distance", t: "Counting differences is measuring distance.",
      d: "The number of positions where two strings differ equals the squared straight-line distance between their corners, because each difference adds one and each match adds nothing.",
      s: "Richard Hamming, “Error Detecting and Error Correcting Codes”, 1950" },
    capacity: { w: "channel capacity", t: "The most bits per second a channel can carry with as few errors as we want.",
      d: "Shannon proved in 1948 that every noisy channel has a capacity: below that rate, codes exist that make errors as rare as we want, and above it, no code can. For a channel of bandwidth <i>W</i> whose signal is <i>P</i> times stronger than its noise, the capacity is <i>W</i> log₂(1 + <i>P</i>) bits per second. The proof uses only how strong the noise is on average, never which symbols it hit, because the noise is taken to be random.",
      s: "Claude Shannon, “A Mathematical Theory of Communication”, 1948, and “Communication in the Presence of Noise”, 1949" },
    codes: { w: "error-correcting codes", t: "Valid messages are spaced out on the cube.",
      d: "A code uses only some of the corners, chosen far enough apart that a few flipped bits still leave the received string closest to the message that was sent.",
      s: "Richard Hamming, 1950; Claude Shannon, 1948" },
    machines: { w: "hypercube computers", t: "The Connection Machine was wired as a 12-dimensional cube.",
      d: "Its 65,536 processors were grouped into 4,096 routing nodes, each linked to its neighbours along twelve perpendicular directions, so a message crossed the machine by flipping one coordinate at a time.",
      s: "W. Daniel Hillis, <i>The Connection Machine</i>, 1985" },
    fieldsampling: { w: "the sampling theorem", t: "A field with limited detail is fixed exactly by its values at enough points.",
      d: "A field that repeats, or lives on a closed space, is a sum of waves, each turning a whole number of times across it, its Fourier series. If its finest detail turns <i>N</i> times in each direction, the field has (2<i>N</i> + 1)² parts on a square, and that many samples, on a grid or on a grid turned against it, fix every part exactly; with fewer, fine detail folds onto coarse detail and different fields give the same samples. This is Shannon’s sampling theorem, 2<i>WT</i> numbers for a band <i>W</i> over a time <i>T</i>, in two dimensions. Turning the grid changes which points are read and not the field, so two observers who sample on grids turned against each other rebuild the same field.",
      s: "Claude Shannon, “Communication in the Presence of Noise”, <i>Proc. IRE</i> 37, 1949; Harry Nyquist, 1928; E. T. Whittaker, 1915; Vladimir Kotelnikov, 1933; Daniel Petersen and David Middleton, 1962" },
    heat: { w: "thermodynamics", t: "Entropy began as a law of heat.",
      d: "Rudolf Clausius named entropy to state that heat flows on its own only from hot to cold, and Ludwig Boltzmann showed that it counts the molecular arrangements behind what we measure, which is why the spread ink never gathers back and why the past differs from the future.",
      s: "Rudolf Clausius, 1865; Ludwig Boltzmann, 1877" },
    life: { w: "life", t: "A living thing keeps its order by exporting entropy.",
      d: "A cell keeps its own arrangement unlikely by taking in ordered energy, food or sunlight, and giving back heat and waste, so the disorder it releases outweighs the order it keeps.",
      s: "Erwin Schrödinger, <i>What Is Life?</i>, 1944" },
    holes: { w: "black holes", t: "A black hole’s entropy grows with the area of its horizon.",
      d: "Jacob Bekenstein argued that a black hole must carry entropy, and Stephen Hawking fixed its value at a quarter of the horizon’s area in Planck units, the most any region of that size can hold.",
      s: "Jacob Bekenstein, 1973; Stephen Hawking, 1975" },
    diversity: { w: "ecology", t: "Diversity is the entropy of species.",
      d: "Ecologists score how evenly individuals spread across species with Shannon’s own measure, so a forest dominated by one tree scores low and one with many species in similar numbers scores high.",
      s: "Robert MacArthur, 1955; the Shannon index" },
    language: { w: "language", t: "Shannon measured the entropy of English.",
      d: "In 1951 Shannon had people guess the next letter of English text and estimated roughly one bit per letter. Language models are trained on the same quantity, learning to be less surprised by the next word.",
      s: "Claude Shannon, “Prediction and Entropy of Printed English”, 1951" },
    osc: { w: "oscillations", t: "An oscillation is the shadow of a rotation.",
      d: "A mass on a spring, a pendulum swinging a little and the current in an alternating circuit all rise and fall as the height of a point rotating at steady speed, so physicists write them as <i>e</i><sup><i>iωt</i></sup> and measure its shadow. Charles Steinmetz made this the working method of electrical engineering.",
      s: "Charles Proteus Steinmetz, 1893; <i>The Feynman Lectures on Physics</i>, I.23" },
    amplitudes: { w: "quantum amplitudes", t: "Every way something can happen carries a rotating arrow.",
      d: "Feynman described each way an event can happen as a small arrow that rotates as time passes. The arrows of all the ways are added, the length of the sum gives the probability, and ways whose arrows point in opposite directions cancel.",
      s: "Richard Feynman, <i>QED: The Strange Theory of Light and Matter</i>, 1985" },
    quantization: { w: "quantization", t: "Only whole returns survive.",
      d: "Louis de Broglie gave the electron a wave and required it to fit around its orbit a whole number of times, coming back in step with itself. The orbits allowed are the ones where the rotation closes, and their energies are the levels of the atom.",
      s: "Louis de Broglie, doctoral thesis, 1924" },
    relativity: { w: "relativity", t: "Changing speed is a rotation in spacetime.",
      d: "Passing from one moving frame to another is a rotation in which the circle’s functions are replaced by their hyperbolic twins. Written as rapidities, speeds combine the way angles add, and the spacetime interval stays fixed the way the radius stays fixed on the circle.",
      s: "Hermann Minkowski, “Space and Time”, 1908" },
    signals: { w: "signals", t: "Every signal is a sum of rotations.",
      d: "Fourier showed that any repeating signal is a sum of rotations at different speeds. A phone sends two bits at a time as one of four points on the circle, 00, 01, 11 and 10, which is the quadrant reading of the geometric bit.",
      s: "Joseph Fourier, 1822; quadrature phase-shift keying" },
    monopole: { w: "Dirac’s monopole", t: "A magnetic charge would be the Hopf fibration.",
      d: "In 1931 Dirac showed that a single magnetic pole would force every electric charge to come in whole units. Wu and Yang later described its field without singularities, as a circle of phases over every direction around the pole, and for the smallest charge that bundle is exactly the Hopf fibration.",
      s: "Paul Dirac, 1931; Tai Tsun Wu and Chen Ning Yang, 1975" },
    hopfion: { w: "knotted light", t: "Maxwell’s equations allow light whose field lines are Hopf circles.",
      d: "Antonio Rañada found solutions of Maxwell’s equations in which every electric and magnetic field line is a closed circle linked once with every other, the pattern of the Hopf fibration. Knotted and linked fields of this kind have since been studied in detail and produced with laser light in the lab.",
      s: "Antonio Rañada, 1989; Kedia et al., <i>Physical Review Letters</i>, 2013; Sugic et al., <i>Nature Communications</i>, 2021" },
    lie: { w: "Lie groups", t: "Continuous symmetries form groups, and physics is written with them.",
      d: "Sophus Lie studied symmetries that can be applied a little at a time. The circle group U(1) is the symmetry of electromagnetism, the rotation of the electron’s phase, and the Standard Model is written with U(1), SU(2) and SU(3), the groups of rotations on one, two and three complex numbers.",
      s: "Sophus Lie, 1870s; Hermann Weyl, 1929; the Standard Model, 1970s" },
    quaternions: { w: "quaternions", t: "Orientation in three dimensions is stored as a quaternion.",
      d: "Hamilton’s quaternions compose rotations in three dimensions without the lock-up that angles suffer, so game engines, phones, robots and spacecraft keep track of which way they face as four numbers held to length one, a point on the three-sphere.",
      s: "William Rowan Hamilton, 1843; Ken Shoemake, “Animating Rotation with Quaternion Curves”, 1985" },
    psk: { w: "digital radio", t: "Phones send bits as points on the circle.",
      d: "A radio symbol is a rotation with a chosen angle and length. Phase-shift keying places 2, 4 or 8 symbols evenly around the circle and quadrature amplitude modulation fills a grid of them, so each symbol carries several of Shannon’s bits as one position on the circle.",
      s: "phase-shift keying and quadrature amplitude modulation, used in 4G, 5G and Wi-Fi" },
    grid: { w: "the power grid", t: "Alternating current is computed as rotations.",
      d: "The voltage at a socket rotates 50 or 60 times a second, and engineers write every voltage and current in the grid as a rotating arrow. The part of the current in step with the voltage delivers power, and the part a quarter cycle away flows out and back every cycle, the reactive power the grid carries without using it.",
      s: "Charles Proteus Steinmetz, 1893" },
    mri: { w: "magnetic resonance imaging", t: "An MRI scanner listens to protons rotating.",
      d: "In a strong magnetic field the spin of each hydrogen nucleus rotates around the field at a rate set by its strength. A radio pulse tips the spins, and the scanner reads the rotating signal they send back, and how fast it fades, to map the tissue.",
      s: "Felix Bloch and Edward Purcell, 1946; Paul Lauterbur and Peter Mansfield, 1973" },
    compression: { w: "pictures and sound", t: "Compressed images and audio store waves.",
      d: "JPEG splits a picture into small blocks and stores each as a sum of cosine waves, and MP3 does the same to short windows of sound, keeping the waves we notice and dropping the rest. A cosine is the shadow of a rotation.",
      s: "Nasir Ahmed, the discrete cosine transform, 1974; JPEG, 1992; MP3, 1993" },
    smith: { w: "the Smith chart", t: "Radio engineers match antennas by rotating around a disc.",
      d: "Phillip Smith drew every load a transmission line can end in inside one circle, with the wave that goes out and never returns at its centre and total reflection on its rim. Moving along the cable rotates the point around the centre, so matching an antenna is a matter of rotating to the right place.",
      s: "Phillip H. Smith, 1939" },
    negentropy: { w: "negative entropy", t: "Life feeds on order.",
      d: "Schrödinger wrote that a living thing stays alive by drawing order from its surroundings, feeding on negative entropy, and Brillouin identified information with negative entropy, each bit costing at least <i>k</i> ln 2 of it to acquire, so the order a system keeps and the information it holds are measured together.",
      s: "Erwin Schrödinger, <i>What Is Life?</i>, 1944; Léon Brillouin, 1953" },
    statefn: { w: "state functions", t: "Energy and entropy come back to their value around every closed cycle.",
      d: "Carnot studied engines that run in closed cycles, and Clausius found that for a reversible cycle the heat taken in, each part divided by its temperature, adds up to zero once the engine is back where it started. A quantity whose change around every closed cycle is zero depends only on the state, and that is how entropy itself was defined.",
      s: "Sadi Carnot, 1824; Rudolf Clausius, 1854 and 1865" },
    kirchhoff: { w: "Kirchhoff’s voltage law", t: "Around any closed loop, the voltages add up to zero.",
      d: "Going around any loop of a circuit and adding every rise and drop in voltage brings you back to the potential you started from, so the sum is zero, and every circuit is solved by writing that down for each loop.",
      s: "Gustav Kirchhoff, 1845" },
    hess: { w: "Hess’s law", t: "The heat of a reaction does not depend on the path.",
      d: "Hess measured that the total heat of a chemical change is the same whether it happens in one step or several, so any route out and back returns the same total, and chemists find the heat of reactions they cannot measure by closing the cycle.",
      s: "Germain Hess, 1840" },
    feedback: { w: "feedback", t: "A feedback loop returns a system to its set point.",
      d: "A thermostat, a hand on a steering wheel and the body’s control of blood sugar each compare the present state with a reference and act against the difference, so the system keeps coming back to where it should be. Wiener made that comparison the centre of cybernetics.",
      s: "James Clerk Maxwell, “On Governors”, 1868; Norbert Wiener, <i>Cybernetics</i>, 1948" },
    rope: { w: "rotary position embedding", t: "Language models encode word order as rotation.",
      d: "Many large language models mark where a word sits in a sentence by rotating its vector through an angle proportional to its position, so the model compares two words by the rotation between them, and their relative position survives any shift of the whole sentence.",
      s: "Jianlin Su et al., “RoFormer: Enhanced Transformer with Rotary Position Embedding”, 2021" },
    convention: { w: "convention and law", t: "The symbols are chosen; what they record is not.",
      d: "The main objection to calling Euler’s identity physical is that it follows from definitions, from how the exponential of a complex number is defined. Poincaré argued that the geometry we use is a convention chosen for convenience, and Einstein answered that geometry becomes a natural science once its quantities are tied to measurement, to rods and clocks. Klein had already defined a geometry by what stays invariant under its transformations. The same split holds here: 1, <i>i</i> and 90° are agreed names, and the relationship they name, a unit that returns whole and two equal steps that reach its opposite, is measured.",
      s: "Felix Klein, Erlangen program, 1872; Henri Poincaré, <i>Science and Hypothesis</i>, 1902; Albert Einstein, “Geometry and Experience”, 1921" },
    brainwatts: { w: "the brain’s power", t: "A human brain runs on about 20 watts.",
      d: "The brain uses roughly a fifth of the body’s resting energy, about 20 watts, to perceive, remember and handle language. Large language models are trained with gigawatt-hours in data centres, and each gain from making them larger has come at a steeper cost in data and compute.",
      s: "Marcus Raichle and Debra Gusnard, “Appraising the brain’s energy budget”, 2002; Jared Kaplan et al., “Scaling Laws for Neural Language Models”, 2020" },
    wigner: { w: "Wigner", t: "“The unreasonable effectiveness of mathematics in the natural sciences.”",
      d: "Eugene Wigner called the fit between mathematics and physical law a miracle: “the appropriateness of the language of mathematics for the formulation of the laws of physics is a wonderful gift which we neither understand nor deserve.”",
      s: "Eugene Wigner, <i>Communications on Pure and Applied Mathematics</i>, 13(1), 1960" },
    crossling: { w: "aligning languages", t: "Two languages’ word spaces differ by a rotation.",
      d: "Word embeddings trained separately on two languages have different axes, yet a single orthogonal map, a rotation, carries one onto the other well enough to translate words, and it can even be found without a bilingual dictionary. It works because the angles between concepts are preserved across the languages while their absolute positions differ.",
      s: "Tomas Mikolov, Quoc Le and Ilya Sutskever, 2013; Chao Xing and colleagues, 2015; Alexis Conneau and colleagues, “Word Translation Without Parallel Data”, 2018" },
    platonic: { w: "converging representations", t: "Different models settle on the same pattern of relations.",
      d: "Huh and colleagues proposed in 2024 that vision and language models converge toward a shared representation of reality as they scale. Jha and colleagues then translated embeddings between unrelated text models with no paired examples, through one shared latent space. Later studies refined what is shared: once similarity measures are corrected for model size, models agree on which examples are related to which, their local relational structure, more than on exact distances.",
      s: "Huh, Cheung, Wang and Isola, “The Platonic Representation Hypothesis”, ICML 2024; Jha, Zhang, Shmatikov and Morris, “Harnessing the Universal Geometry of Embeddings”, 2025; Gröger, Wen and Brbić, “Revisiting the Platonic Representation Hypothesis: An Aristotelian View”, 2026; You, Jang, Mo and Jung, “What Converges in the Platonic Representation Hypothesis? Structure over Geometry”, 2026" },
    markov: { w: "Markov’s letters", t: "Averages settle without independence.",
      d: "In 1902 Pavel Nekrasov argued that the law of large numbers, the way averages settle as samples grow, works only for independent events, and read free will into the steady yearly counts of marriages and crimes. Markov answered by building chains where each step depends on the one before, and proved their averages settle too. In 1913 he counted vowels and consonants through 20,000 letters of Pushkin’s Eugene Onegin, where each letter depends on the last, and the proportions settled all the same.",
      s: "Pavel Nekrasov, 1902; Andrey Markov, 1906 and 1913" },
    incompleteness: { w: "no system can vouch for itself", t: "From Hilbert to Gödel: every check needs something outside it.",
      d: "Hilbert hoped mathematics could prove its own consistency. Gödel showed in 1931 that any consistent system rich enough for arithmetic cannot, and his sentence about itself works only through a coding held outside the system. Tarski showed that the truth of a language has to be defined from a level above it, and Turing that climbing such a tower of checks needs a step taken from outside. The paradoxes appear exactly where a whole is treated as closed: the liar, a sign pointing only at itself, and the set of all sets.",
      s: "Kurt Gödel, 1931; Alfred Tarski, 1933; Alan Turing, 1939; Saul Kripke, 1975" },
    kuhn: { w: "paradigm shifts", t: "When a science changes the ground it stands on.",
      d: "Thomas Kuhn described how a science works inside a shared paradigm, the agreed assumptions, methods and standards that tell its practitioners what counts as a result, and how a paradigm shift replaces that ground, as when Copernicus moved the centre of the heavens or Einstein redefined space and time.",
      s: "Thomas Kuhn, <i>The Structure of Scientific Revolutions</i>, 1962" },
    verbalbehavior: { w: "verbal behaviour", t: "Meaning studied as something people do.",
      d: "Skinner’s Verbal Behavior (1957) treated language as behaviour shaped by its effects. Relational frame theory extended it to the relations people derive without being taught: if A is the same as B and B the same as C, they treat A as the same as C, and if one thing is larger than another they derive the reverse. It underlies acceptance and commitment therapy and is used in language training for autistic children and in education.",
      s: "B. F. Skinner, <i>Verbal Behavior</i>, 1957; Steven Hayes, Dermot Barnes-Holmes and Bryan Roche, <i>Relational Frame Theory</i>, 2001" },
    aicost: { w: "the cost of language models", t: "Data and energy, compared with a person.",
      d: "Training GPT-3 was estimated to use about 1,287 megawatt-hours of electricity; a human brain uses about 20 watts, so the same energy would run a brain for roughly 7,300 years. Recent large models are trained on around 15 trillion tokens of text, while children are exposed to fewer than 100 million words by the age of 13, the figure the BabyLM challenge uses as its budget for human-scale learning.",
      s: "David Patterson and colleagues, “Carbon Emissions and Large Neural Network Training”, 2021; Meta, Llama 3, 2024; Warstadt and colleagues, the BabyLM Challenge, 2023" },
  };

  window.GTC = { SCENES, S, DEFS, clearText: () => textCache.clear() };
})();
