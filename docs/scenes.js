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
 *   pulse    {count, period}: cycles emphasis through groups 0..count-1
 * Colours: cyan, ice, brass, dim, paper, violet, mint, coral, gold (see COLORS in engine.js).
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

  SCENES.answers = () => {
    const points = [];
    ANSWERS.forEach(a => points.push(...S.blob(a.x, a.y, a.r * 2.2, 0.2, 110, { c: "ice", a: 0.5, s: 0.9 })));
    return {
      points,
      labels: [
        ...ANSWERS.map(a => ({ x: a.x, y: a.y, html: a.w, cls: "word", def: defOf(a) })),
        { x: 0, y: 1.04, html: "choose a word", cls: "tag" }
      ]
    };
  };

  /* The same clouds regrouped by field. Word order matches ANSWERS, so each
     cloud keeps its particles and travels to its new place. */
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

  /* A sign pointing at a thing. With roles: the four places on the relation and
     the return arc (A = A). With fields: the field that works from each place,
     lit in turn. Groups: 0 sign, 1 thing, 2 what travels, 3 the check. */
  function relation({ roles = false, fields = false } = {}) {
    const g = k => (roles ? { g: k } : {});
    const points = [
      ...S.rect(-1.05, 0, 0.95, 0.6, 110, { c: "ice", a: 0.8, ...g(0) }),
      ...S.rect(1.05, 0, 0.95, 0.6, 110, { c: "ice", a: 0.8, ...g(1) }),
      ...lighterAt(1.05, 0, 1, g(1)),
      ...S.line(-0.52, 0, 0.5, 0, 70, { c: "paper", a: 0.55, s: 0.9, ...g(2) }),
      ...S.head(0.52, 0, 0, 0.09, 10, { c: "paper", a: 0.7, ...g(2) })
    ];
    const flows = [{ n: 34, path: u => [-0.52 + 1.02 * u, 0], speed: 0.32, c: "cyan", a: 1, s: 1.5, ...g(2) }];
    const labels = [
      { x: -1.05, y: 0.08, html: "“lighter”", cls: "word" },
      { x: -1.05, y: -0.12, html: "“igniter”", cls: "word dimmed small" },
      { x: -1.05, y: -0.42, html: "sign", cls: "tag" },
      { x: 1.05, y: -0.42, html: "thing", cls: "tag" }
    ];
    if (roles) {
      points.push(
        ...S.line(-1.5, 0.36, -0.6, 0.36, 44, { c: "cyan", a: 0.9, g: 0 }),
        ...S.line(0.6, 0.36, 1.5, 0.36, 44, { c: "cyan", a: 0.9, g: 1 }),
        ...S.bezier([0.72, -0.31], [0.62, -0.98], [-0.62, -0.98], [-0.72, -0.31], 70, { c: "cyan", a: 0.85, s: 1, g: 3 }),
        ...S.head(-0.72, -0.31, Math.PI / 2 + 0.25, 0.08, 8, { c: "cyan", a: 0.9, g: 3 })
      );
      labels.push(
        { x: -1.05, y: 0.52, html: "meaning", cls: "role", g: 0 },
        { x: 1.05, y: 0.52, html: "identity", cls: "role", g: 1 },
        { x: 0, y: 0.17, html: "information", cls: "role", g: 2 },
        { x: 0, y: -0.9, html: "knowledge", cls: "role", g: 3 },
        { x: 0, y: -0.5, html: "<i>A</i> = <i>A</i>", cls: "math", g: 3 }
      );
    }
    if (fields) labels.push(
      { x: -1.05, y: 0.68, html: "linguistics", cls: "field c-violet", g: 0 },
      { x: 1.05, y: 0.68, html: "physics · metaphysics", cls: "field c-cyan", g: 1 },
      { x: 0, y: 0.31, html: "engineering", cls: "field c-brass", g: 2 },
      { x: 0, y: -1.04, html: "epistemology", cls: "field c-mint", g: 3 }
    );
    return { points, flows, labels, pulse: fields ? { count: 4, period: 2.4 } : null };
  }
  SCENES.relation = () => relation();
  SCENES.roles = () => relation({ roles: true });
  SCENES.fields = () => relation({ roles: true, fields: true });

  /* ================= 03 · A communication problem ================= */

  /* I and you, one lighter above both, and the sign passing between us. */
  SCENES.communicate = () => {
    const I = [-1.12, -0.5], U = [1.12, -0.5], thing = [0, 0.52];
    return {
      points: [
        ...lighterAt(thing[0], thing[1], 1.3),
        ...S.arc(I[0], I[1], 0.17, 0, TAU * 0.98, 56, { c: "ice", a: 0.85 }),
        ...S.arc(U[0], U[1], 0.17, 0, TAU * 0.98, 56, { c: "ice", a: 0.85 }),
        ...S.line(-0.9, -0.5, 0.88, -0.5, 70, { c: "paper", a: 0.45, s: 0.85 }),
        ...S.head(0.9, -0.5, 0, 0.08, 9, { c: "paper", a: 0.7 }),
        ...S.line(-1.0, -0.33, -0.2, 0.36, 34, { c: "cyan", a: 0.5, s: 0.85 }),
        ...S.line(1.0, -0.33, 0.2, 0.36, 34, { c: "cyan", a: 0.5, s: 0.85 })
      ],
      flows: [{ n: 26, path: u => [-0.9 + 1.78 * u, -0.5], speed: 0.3, c: "cyan", a: 1, s: 1.5 }],
      labels: [
        { x: I[0], y: I[1], html: "I", cls: "word" },
        { x: U[0], y: U[1], html: "you", cls: "word" },
        { x: 0, y: -0.36, html: "“lighter”", cls: "word" },
        { x: 0, y: -0.66, html: "the sign", cls: "tag" },
        { x: 0, y: 0.9, html: "the thing", cls: "tag" }
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
        { x: 0, y: -1.0, html: "one of them is selected", cls: "example" }
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

  /* Shannon's entropy as questions: eight equally likely messages, each yes-or-no
     answer halving what remains, until three answers, three bits, find the one sent. */
  SCENES.questions = () => {
    const M = 5, T0 = 1.2, Q = 2.2, points = [], meta = [], X = i => -1.05 + i * 0.3, Y = 0.08;
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let i = 0; i < 8; i++) for (let k = 0; k < 44; k++)
      add({ kind: "msg", i, x: X(i) + (Math.random() - 0.5) * 0.18, y: Y + (Math.random() - 0.5) * 0.28 }, { x: X(i), y: Y, c: "cyan", a: 0.85, s: 0.9 });
    for (let k = 0; k < 30; k++) add({ kind: "split", u: k / 29 }, { x: 0, y: Y, c: "paper", a: 0, s: 0.8 });
    const asked = t => Math.max(0, Math.min(3, Math.floor((t - T0) / Q) + 1));   // questions asked so far
    const range = n => { let lo = 0, hi = 8; for (let q = 0; q < n; q++) { const mid = (lo + hi) / 2; if (M >= mid) lo = mid; else hi = mid; } return [lo, hi]; };
    const bit = q => (M >> (2 - q)) & 1;
    const out = new Array(points.length);
    const WORDS = ["Is it in the right half?", "In the right half of those?", "The right one of the last two?"];
    return {
      points, period: T0 + 3 * Q + 3.2, stillT: T0 + 3 * Q + 1,
      dynamic: t => {
        const n = asked(t), [lo, hi] = range(n), done = n === 3 && t > T0 + 3 * Q - 0.6;
        const [plo, phi] = range(Math.max(0, n - 1)), mid = (plo + phi) / 2, sx = (X(mid - 0.5) + X(mid)) / 2 + 0.0;
        meta.forEach((m, k) => {
          if (m.kind === "msg") {
            const inside = m.i >= lo && m.i < hi;
            out[k] = { x: m.x, y: m.y, a: inside ? 0.9 : 0.12, c: done && m.i === M ? "gold" : "cyan" };
          } else out[k] = { x: sx, y: Y - 0.26 + 0.6 * m.u, a: n > 0 && !done ? 0.7 : 0 };
        });
        return out;
      },
      labels: [
        ...Array.from({ length: 8 }, (_, i) => ({ x: X(i), y: Y - 0.3, html: i.toString(2).padStart(3, "0"), cls: "slot" })),
        { x: 0, y: 0.66, html: "", cls: "example", live: t => { const n = asked(t); return n === 0 ? "eight messages, equally likely" : `${WORDS[n - 1]} ${bit(n - 1) ? "Yes, 1." : "No, 0."}`; } },
        { x: 0, y: -0.62, html: "", cls: "math c-math", live: t => { const n = asked(t); return n === 0 ? "&nbsp;" : Array.from({ length: n }, (_, q) => bit(q)).join(" "); } },
        { x: 0, y: -0.9, html: "", cls: "tag", live: t => { const n = asked(t); return n === 0 ? "" : `${n} question${n > 1 ? "s" : ""}, ${n} bit${n > 1 ? "s" : ""}`; } }
      ]
    };
  };

  /* Entropy across fields: Shannon's bit at the centre, five fields around it, each
     counting its own arrangements and streaming into the same unit, one yes-or-no
     question, one bit. The fields light in turn. */
  const ENTROPY_FIELDS = [
    { name: "heat", mean: "how molecules are arranged", c: "cyan", x: -1.12, y: 0.34 },
    { name: "life", mean: "order kept, disorder given away", c: "coral", x: 0, y: 0.8 },
    { name: "black holes", mean: "the area of the horizon", c: "brass", x: 1.12, y: 0.34 },
    { name: "forests", mean: "how evenly species spread", c: "mint", x: 0.74, y: -0.64 },
    { name: "language", mean: "which word comes next", c: "violet", x: -0.74, y: -0.64 }
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
      points, flows, pulse: { count: 5, period: 2.6 },
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

  /* What the bit gives us: Level A solved, Level B open. */
  SCENES.levels = () => {
    const bar = (y, n, o) => S.rect(0, y, 2.7, 0.3, n, o);
    return {
      points: [
        ...S.fill(0, 0.55, 2.7, 0.3, 360, { c: "brass", a: 0.42, s: 0.8 }),
        ...bar(0.55, 110, { c: "brass", a: 0.9 }),
        ...bar(0, 130, { c: "cyan", a: 0.75 }),
        ...bar(-0.55, 110, { c: "dim", a: 0.55 })
      ],
      flows: [{ n: 60, path: S.rectPath(0, 0, 2.7, 0.3), speed: 0.05, c: "cyan", a: 1, s: 1.35 }],
      labels: [
        { x: -1.26, y: 0.55, html: narrow() ? "Level A" : "Level A · the technical problem", cls: "slot left" },
        { x: 1.26, y: 0.55, html: "solved, 1948", cls: "tag right brass" },
        { x: -1.26, y: 0, html: narrow() ? "Level B" : "Level B · the semantic problem", cls: "slot left lit" },
        { x: 1.26, y: 0, html: "open", cls: "tag right cyan" },
        { x: -1.26, y: -0.55, html: narrow() ? "Level C" : "Level C · the effectiveness problem", cls: "slot left" }
      ]
    };
  };


  /* ================= 05 · The geometric bit ================= */

  const DEG = 180 / Math.PI;
  const at = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

  const ease = f => f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);

  /* The overview: Shannon's bit, the perpendicular it implies, the circle it draws, and
     then each relationship the circle holds, lit one at a time as the labels map them. */
  const MAP = [
    { name: "perpendicularity", mean: "difference", c: "cyan", cls: "c-cyan" },
    { name: "symmetry", mean: "sameness", c: "coral", cls: "c-coral" },
    { name: "discreteness", mean: "integers, names, meaning", c: "mint", cls: "c-mint" },
    { name: "space", mean: "π, one ratio at every size", c: "violet", cls: "c-violet" },
    { name: "time", mean: "<i>e</i>, continuous turning", c: "brass", cls: "c-brass" },
    { name: "identity", mean: "invariance over change", c: "gold", cls: "c-math" }
  ];
  SCENES.gmap = () => {
    const nar = narrow(), R = nar ? 0.64 : 0.62, cy = nar ? 0 : 0.02, points = [], meta = [];
    const BUILT = 4.6, PH = 2.2, clamp = v => Math.max(0, Math.min(1, v));
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 190; k++) add({ kind: "ring", a: ((k + 0.5) / 190) * TAU, props: [2], base: "ice", ba: 0.45 }, { x: 0, y: cy, c: "ice", a: 0, s: 0.8 });
    for (let k = 0; k < 34; k++) add({ kind: "seg", u: k / 33, props: [1], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let k = 0; k < 34; k++) add({ kind: "perp", u: k / 33, props: [0], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 34; k++) add({ kind: "ext", d, u: k / 33, props: [d ? 0 : 1], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let k = 0; k < 14; k++) add({ kind: "corner", k, props: [0], base: "paper", ba: 0.6 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.7 });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 16; k++) add({ kind: "pole", q, jx: gauss() * 0.022, jy: gauss() * 0.022, props: [1], base: "paper", ba: 0.9 }, { x: 0, y: cy, c: "paper", a: 0, s: 1.05 });
    for (let k = 0; k < 90; k++) add({ kind: "pi", u: k / 89, props: [3], base: "violet", ba: 0 }, { x: 0, y: cy, c: "violet", a: 0, s: 0.85 });
    for (let k = 0; k < 100; k++) add({ kind: "trail", u: k / 99, props: [4, 5], base: "brass", ba: 0 }, { x: 0, y: cy, c: "brass", a: 0, s: 0.85 });
    for (let k = 0; k < 30; k++) add({ kind: "centre", jx: gauss() * 0.022, jy: gauss() * 0.022, props: [], base: "ice", ba: 0.9 }, { x: 0, y: cy, c: "ice", a: 0, s: 1 });
    for (let k = 0; k < 18; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02, props: [4, 5], base: "gold", ba: 1 }, { x: R, y: cy, c: "gold", a: 0, s: 1.3 });
    const phase = t => t < BUILT ? -1 : Math.floor((t - BUILT) / PH);
    const swing = t => (Math.PI / 2) * ease(clamp((t - 1.4) / 1.2));              // the perpendicular swinging up from the bit
    const sweep = t => TAU * ease(clamp((t - 2.8) / 1.8));                        // the circle drawn from 1 round to 1
    const grow = t => ease(clamp((t - 3.4) / 1.1));                              // the diameters completed through the centre
    const turn = t => TAU * ease(clamp((t - BUILT - 4 * PH) / (2 * PH - 0.3)));   // the mark's full turn, over the last two phases
    const P = (r, a) => at(0, cy, r, a);
    const out = new Array(points.length);
    const vis = (on, m, ph) => {
      if (!on) return { a: 0, c: m.base };
      if (ph < 0) return { a: m.ba, c: m.base };
      const lit = m.props.includes(ph);
      return { a: lit ? 1 : m.ba * 0.45, c: lit ? MAP[ph].c : m.base };
    };
    const lit = (k, html) => t => { const ph = phase(t); return ph < 0 ? "" : `<span style="opacity:${ph === k ? 1 : 0.4}">${html}</span>`; };
    return {
      points, period: BUILT + 6 * PH, stillT: BUILT + 5 * PH + 1.1,
      dynamic: t => {
        const ph = phase(t), sw = swing(t), s = sweep(t), g = grow(t), mt = turn(t);
        meta.forEach((m, i) => {
          let x, y, v;
          if (m.kind === "ring") { const on = m.a <= s; [x, y] = on ? P(R, m.a) : P(R, s); v = vis(on && s > 0, m, ph); }
          else if (m.kind === "seg") { [x, y] = P(R * m.u, 0); v = vis(true, m, ph); }
          else if (m.kind === "perp") { [x, y] = P(R * m.u, sw); v = vis(t > 1.4, m, ph); }
          else if (m.kind === "ext") { [x, y] = P(R * m.u * g, m.d ? -Math.PI / 2 : Math.PI); v = vis(g > 0.01, m, ph); }
          else if (m.kind === "corner") {
            const u = (m.k % 7) / 6 * 0.11, side = m.k < 7;
            x = side ? 0.11 : u; y = cy + (side ? u : 0.11); v = vis(t > 2.6, m, ph);
          }
          else if (m.kind === "pole") {
            [x, y] = P(R, m.q * Math.PI / 2); x += m.jx; y += m.jy;
            const on = m.q === 0 || (m.q === 1 ? t > 2.6 : g > 0.9);
            v = vis(on, m, ph); if (m.q === 0 && ph < 0) v.c = "brass";
          }
          else if (m.kind === "pi") { [x, y] = P(R + 0.1, Math.PI * m.u); v = vis(ph === 3, m, ph); }
          else if (m.kind === "trail") { [x, y] = P(R + 0.08, mt * m.u); v = vis(mt > 0.02, m, ph); if (v.a) v.a = Math.max(v.a, 0.5); }
          else if (m.kind === "centre") { x = m.jx; y = cy + m.jy; v = vis(true, m, ph); }
          else { [x, y] = P(R, mt); x += m.jx; y += m.jy; v = vis(ph >= 0, m, ph); }
          out[i] = { x, y, a: v.a, c: v.c };
        });
        return out;
      },
      labels: [
        { x: 0, y: cy - 0.15, html: "0", cls: "math", live: t => t < BUILT ? "0" : "" },
        { x: R + 0.1, y: cy - 0.15, html: "1", cls: "math left", live: t => t < BUILT ? "1" : "" },
        { x: 0, y: nar ? -1.02 : -1.0, html: "", cls: "example",
          live: t => t < 1.4 ? "Shannon’s bit, 0 and 1" : t < 2.8 ? "the perpendicular it implies" : t < BUILT ? "the circle it draws" : "" },
        ...MAP.flatMap((p, k) => {
          if (nar) {
            const x = (k % 3 - 1) * 1.26, y = k < 3 ? 1.06 : -1.06;
            return [{ x, y, html: "", cls: "example " + p.cls, live: lit(k, p.name) }];
          }
          const left = k < 3, x = left ? -1.0 : 1.0, y = 0.58 - (k % 3) * 0.58;
          return [
            { x, y, html: "", cls: "role " + p.cls + (left ? " right" : " left"), live: lit(k, p.name) },
            { x, y: y - 0.14, html: "", cls: "example" + (left ? " right" : " left"), live: lit(k, p.mean) }
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

  /* Two observers: my small circle starts on the right, your larger one at the top;
     both make the same quarter turn, measured from their own references. */
  SCENES.gobs = () => {
    const C = [{ cx: -0.86, cy: 0.05, r: 0.44, ref: 0, name: "mine" }, { cx: 0.74, cy: 0.05, r: 0.72, ref: Math.PI / 2, name: "yours" }];
    const points = [], meta = [];
    C.forEach((c, ci) => {
      for (let k = 0; k < 120; k++) { const [x, y] = at(c.cx, c.cy, c.r, (k / 120) * TAU); meta.push({ kind: "fixed", x, y, a: 0.45 }); points.push({ x, y, c: "ice", a: 0.45, s: 0.8 }); }
      for (let k = 0; k < 22; k++) { const [x, y] = at(c.cx, c.cy, (c.r * k) / 21, c.ref); meta.push({ kind: "fixed", x, y, a: 0.5 }); points.push({ x, y, c: "dim", a: 0.5, s: 0.8 }); }
      for (let k = 0; k < 26; k++) { meta.push({ kind: "hand", ci, u: k / 25 }); points.push({ x: c.cx, y: c.cy, c: "cyan", a: 0.9, s: 0.95 }); }
      for (let k = 0; k < 30; k++) { meta.push({ kind: "arc", ci, u: k / 29 }); points.push({ x: c.cx, y: c.cy, c: "cyan", a: 0.7, s: 0.8 }); }
      for (let k = 0; k < 16; k++) { meta.push({ kind: "mark", ci, jx: gauss() * 0.02, jy: gauss() * 0.02 }); points.push({ x: c.cx, y: c.cy, c: "gold", a: 1, s: 1.25 }); }
    });
    const out = new Array(points.length);
    const turn = t => { const p = Math.min(1, Math.max(0, (t - 0.8) / 1.8)); return (Math.PI / 2) * (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)); };
    return {
      points, period: 6, stillT: 5,
      dynamic: t => {
        const phi = turn(t);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: m.a }; return; }
          const c = C[m.ci];
          if (m.kind === "hand") { const [x, y] = at(c.cx, c.cy, c.r * m.u, c.ref + phi); out[i] = { x, y, a: 0.9 }; }
          else if (m.kind === "arc") { const [x, y] = at(c.cx, c.cy, c.r * 0.42, c.ref + phi * m.u); out[i] = { x, y, a: phi > 0.02 ? 0.75 : 0 }; }
          else { const [x, y] = at(c.cx, c.cy, c.r, c.ref + phi); out[i] = { x: x + m.jx, y: y + m.jy, a: 1 }; }
        });
        return out;
      },
      labels: [
        ...C.map(c => ({ x: c.cx, y: c.cy - c.r - 0.16, html: c.name, cls: "word" })),
        ...(narrow() ? [] : [
          { x: C[0].cx, y: C[0].cy - C[0].r - 0.32, html: "reference on the right", cls: "tag" },
          { x: C[1].cx, y: C[1].cy - C[1].r - 0.32, html: "reference at the top, larger", cls: "tag" }]),
        ...C.map(c => ({ x: c.cx, y: c.cy - c.r - (narrow() ? 0.36 : 0.5), live: t => `${Math.round(turn(t) * DEG)}°`, html: "0°", cls: "math c-math" }))
      ]
    };
  };

  /* Counting quarter turns: each power of i lands on a pole, every fourth on the same one.
     The spiral keeps the count the circle forgets; the readouts give where, and how many. */
  SCENES.gcount = () => {
    const nar = narrow(), cx = nar ? 0 : -0.42, cy = nar ? 0.14 : 0, R = nar ? 0.4 : 0.46, GROW = 0.05, STEPS = 8, DUR = 1.3;
    const POLES = ["1", "<i>i</i>", "−1", "−<i>i</i>"], points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 150; k++) add({ kind: "ring", a: (k / 150) * TAU }, { x: cx, y: cy, c: "ice", a: 0.4, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 36; k++) add({ kind: "dia", d, u: -1 + (2 * k) / 35 }, { x: cx, y: cy, c: "dim", a: 0.35, s: 0.7 });
    for (let k = 0; k < 220; k++) add({ kind: "spiral", u: k / 219 }, { x: cx, y: cy, c: "cyan", a: 0.7, s: 0.85 });
    for (let k = 0; k < 20; k++) add({ kind: "mark", jx: gauss() * 0.022, jy: gauss() * 0.022 }, { x: cx, y: cy, c: "gold", a: 1, s: 1.3 });
    const angle = t => {
      const k = Math.floor(t / DUR);
      if (k >= STEPS) return STEPS * Math.PI / 2;
      return (k + ease(Math.min(1, (t % DUR) / 0.75))) * Math.PI / 2;
    };
    const reached = t => Math.floor(angle(t) / (Math.PI / 2) + 1e-6);
    const sr = a => R + 0.08 + (a / (Math.PI / 2)) * GROW;           // the spiral's radius after turning through a
    const out = new Array(points.length);
    const powerLabels = [];
    for (let n = 0; n <= STEPS; n++) {
      const [x, y] = at(cx, cy, sr(n * Math.PI / 2) + 0.12, (n % 4) * Math.PI / 2);
      powerLabels.push({ x, y, html: "", cls: "slot", live: t => reached(t) >= n ? `<i>i</i><sup>${n}</sup>` : "" });
    }
    const where = t => POLES[reached(t) % 4], turns = t => Math.floor(reached(t) / 4);
    return {
      points, period: STEPS * DUR + 3, stillT: STEPS * DUR + 1,
      dynamic: t => {
        const a = angle(t);
        meta.forEach((m, i) => {
          let x, y, al;
          if (m.kind === "ring") { [x, y] = at(cx, cy, R, m.a); al = 0.4; }
          else if (m.kind === "dia") { [x, y] = at(cx, cy, R * m.u, m.d * Math.PI / 2); al = 0.35; }
          else if (m.kind === "spiral") { const b = a * m.u; [x, y] = at(cx, cy, sr(b), b); al = a > 0.02 ? 0.7 : 0; }
          else { [x, y] = at(cx, cy, R, a); x += m.jx; y += m.jy; al = 1; }
          out[i] = { x, y, a: al };
        });
        return out;
      },
      labels: [
        ...powerLabels,
        ...(nar ? [
          { x: -0.6, y: -0.98, live: t => `where ${where(t)}`, html: "where 1", cls: "math" },
          { x: 0.6, y: -0.98, live: t => `turns ${turns(t)}`, html: "turns 0", cls: "math c-math" }
        ] : [
          { x: 0.98, y: 0.42, html: "where", cls: "tag left" },
          { x: 0.98, y: 0.22, live: where, html: "1", cls: "math left" },
          { x: 0.98, y: -0.2, html: "how many turns", cls: "tag left" },
          { x: 0.98, y: -0.4, live: t => String(turns(t)), html: "0", cls: "math left c-math" }
        ])
      ]
    };
  };

  /* Euler: the turn through every angle, resting at the half and full turn, and each symbol's job on hover. */
  const SYMBOLS = [
    { w: "1", t: "The reference we hold.", d: "The starting direction and the unit length: every reading is taken against it, and a full turn is recognized by coming back to it.", s: "Leonhard Euler, <i>Introductio in analysin infinitorum</i>, 1748" },
    { w: "i", t: "A quarter turn.", d: "Multiplying by <i>i</i> turns a direction through a right angle, so two quarter turns reverse it and <i>i</i>² = −1.", s: "Caspar Wessel, 1799; Jean-Robert Argand, 1806: complex numbers as turns in the plane" },
    { w: "π", t: "How much: half a turn.", d: "The distance round a circle divided by the distance across it, the same at every size; measured in radius lengths, half a turn is π and a full turn is 2π.", s: "William Jones introduced the symbol, 1706; Euler made it standard" },
    { w: "e", t: "Continuous accumulation.", d: "The factor reached when change proportional to what already exists runs for one unit interval. Acting at right angles to the radius, the same accumulation turns a direction instead of growing it, giving <i>e</i><sup><i>iθ</i></sup>.", s: "Jacob Bernoulli, 1683, on continuously compounded interest; Euler, 1748" },
    { w: "0", t: "The check.", d: "Half a turn reaches the exact opposite of 1, and a direction plus its opposite leaves nothing: <i>e</i><sup><i>iπ</i></sup> + 1 = 0.", s: "The half-turn value of Euler’s formula" }
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

  /* The geometric bit: perpendicular axes for difference, opposite poles for sameness,
     the full turn for identity; a mark travels round and returns. */
  SCENES.gbitdef = () => {
    const R = 0.74, cx = 0, cy = 0.02;
    const points = [
      ...S.arc(cx, cy, R, 0, TAU * 0.995, 170, { c: "ice", a: 0.45, s: 0.8 }),
      ...S.line(cx - R * 1.1, cy, cx + R * 1.1, cy, 56, { c: "cyan", a: 0.5, s: 0.8 }),
      ...S.line(cx, cy - R * 1.1, cx, cy + R * 1.1, 56, { c: "cyan", a: 0.5, s: 0.8 }),
      ...S.line(cx + 0.12, cy, cx + 0.12, cy + 0.12, 8, { c: "paper", a: 0.6, s: 0.7 }),
      ...S.line(cx, cy + 0.12, cx + 0.12, cy + 0.12, 8, { c: "paper", a: 0.6, s: 0.7 }),
      ...[0, 1, 2, 3].flatMap(q => { const [x, y] = at(cx, cy, R, (q * Math.PI) / 2); return S.blob(x, y, 0.05, 0.05, 18, { c: "paper", a: 1, s: 1.05 }); }),
      ...S.arc(cx, cy, R + 0.16, 0.2, TAU - 0.35, 120, { c: "cyan", a: 0.3, s: 0.75 }),
      ...S.head(...at(cx, cy, R + 0.16, TAU - 0.35), -Math.PI / 2 + (TAU - 0.35) + Math.PI, 0.07, 6, { c: "cyan", a: 0.5 })
    ];
    return {
      points,
      flows: [{ n: 1, path: u => at(cx, cy, R, u * TAU), speed: 0.12, c: "gold", a: 1, s: 2.4 }],
      labels: [
        ...(narrow() ? [
          { x: -1.25, y: 0.62, html: "difference", cls: "role" }, { x: 1.25, y: 0.62, html: "sameness", cls: "role" },
          { x: 0, y: -1.02, html: "identity", cls: "role" }
        ] : [
          { x: -1.02, y: 0.62, html: "perpendicularity", cls: "role left" }, { x: -1.02, y: 0.5, html: "difference", cls: "example left" },
          { x: 1.02, y: 0.62, html: "symmetry", cls: "role right" }, { x: 1.02, y: 0.5, html: "sameness", cls: "example right" },
          { x: 0, y: -1.0, html: "closure", cls: "role" }, { x: 0, y: -1.12, html: "identity", cls: "example" }
        ])
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

  /* ---------------- definitions for hoverable phrases in the text ---------------- */

  const DEFS = {
    gates: { w: "logic gates", t: "Each gate is a surface over the square.",
      d: "A gate reads bits at a corner and returns a bit. AND returns 1 only at the corner 11, exactly as the polynomial <i>xy</i> does, and XOR returns 1 where the inputs differ, as <i>x</i> + <i>y</i> − 2<i>xy</i> does. Every gate is a polynomial over the cube, read at its corners.",
      s: "Ryan O’Donnell, <i>Analysis of Boolean Functions</i>, 2014, chapter 1" },
    distance: { w: "Hamming distance", t: "Counting differences is measuring distance.",
      d: "The number of positions where two strings differ equals the squared straight-line distance between their corners, because each difference adds one and each match adds nothing.",
      s: "Richard Hamming, “Error Detecting and Error Correcting Codes”, 1950" },
    codes: { w: "error-correcting codes", t: "Valid messages are spaced out on the cube.",
      d: "A code uses only some of the corners, chosen far enough apart that a few flipped bits still leave the received string closest to the message that was sent.",
      s: "Richard Hamming, 1950; Claude Shannon, 1948" },
    machines: { w: "hypercube computers", t: "The Connection Machine was wired as a 12-dimensional cube.",
      d: "Its 65,536 processors were grouped into 4,096 routing nodes, each linked to its neighbours along twelve perpendicular directions, so a message crossed the machine by flipping one coordinate at a time.",
      s: "W. Daniel Hillis, <i>The Connection Machine</i>, 1985" },
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
      s: "Claude Shannon, “Prediction and Entropy of Printed English”, 1951" }
  };

  window.GTC = { SCENES, S, DEFS, clearText: () => textCache.clear() };
})();
