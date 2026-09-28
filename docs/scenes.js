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

  /* A sign and thing, with optional observation above the line and a return
     below it. Named roles show meaning, identity, information and knowledge. */
  function relation({ roles = false, fields = false, defined = false, observation = true } = {}) {
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
    if (observation) {
      points.push(
        ...S.line(-0.64, 0.3, -0.06, 0.73, 32, { c: "mint", a: 0.45, ...g(3) }),
        ...S.line(0.06, 0.73, 0.64, 0.3, 32, { c: "mint", a: 0.45, ...g(3) }),
        ...S.arc(0, 0.75, 0.055, 0, TAU, 22, { c: "mint", a: 0.85, ...g(3) })
      );
      labels.push({ x: 0, y: 0.96, html: "observation · measurement", cls: "role c-mint", ...g(3) });
    }
    if (roles) {
      points.push(
        ...S.line(-1.5, 0.36, -0.6, 0.36, 44, { c: "cyan", a: 0.9, g: 0 }),
        ...S.line(0.6, 0.36, 1.5, 0.36, 44, { c: "cyan", a: 0.9, g: 1 }),
        ...S.bezier([0.72, -0.31], [0.62, -0.98], [-0.62, -0.98], [-0.72, -0.31], 70, { c: "cyan", a: 0.85, s: 1, g: 3 }),
        ...S.head(-0.72, -0.31, Math.PI / 2 + 0.25, 0.08, 8, { c: "cyan", a: 0.9, g: 3 })
      );
      labels.push(
        { x: -1.05, y: 0.52, html: defined ? "meaning" : "what I say", cls: "role", g: 0 },
        { x: 1.05, y: 0.52, html: defined ? "identity" : "what we see", cls: "role", g: 1 },
        { x: 0, y: 0.17, html: defined ? "information" : "points to", cls: "role", g: 2 },
        { x: 0, y: -0.9, html: defined ? "knowledge" : "what you can check", cls: "role", g: 3 }
      );
      if (defined) labels.push({ x: 0, y: -0.5, html: "<i>A</i> = <i>A</i>", cls: "math", g: 3 });
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
  /* The triad above; below, three signals: all 0s is one 0, all 1s is one 1, and the
     mixed string carries its 0s, its 1s and the relations between them, arcs where they differ. */
  SCENES.roles = () => {
    const by = 0.46, rows = [["000000", -0.22, "= 0"], ["111111", -0.52, "= 1"], ["011010", -0.84, ""]];
    const X = k => -0.72 + k * 0.24;
    const mixed = rows[2][0], diffs = [];
    for (let k = 0; k < 5; k++) if (mixed[k] !== mixed[k + 1]) diffs.push(k);
    return {
      points: [
        ...S.rect(-1.05, by, 0.8, 0.44, 90, { c: "ice", a: 0.75 }),
        ...S.rect(1.05, by, 0.8, 0.44, 90, { c: "ice", a: 0.75 }),
        ...lighterAt(1.05, by, 0.8),
        ...S.line(-0.6, by, 0.6, by, 60, { c: "paper", a: 0.4 }),
        ...S.line(-0.66, by + 0.23, -0.06, 0.94, 30, { c: "mint", a: 0.55 }),
        ...S.line(0.06, 0.94, 0.66, by + 0.23, 30, { c: "mint", a: 0.55 }),
        ...S.arc(0, 0.96, 0.05, 0, TAU, 20, { c: "mint", a: 0.85 }),
        ...diffs.flatMap(k => S.arc((X(k) + X(k + 1)) / 2, rows[2][1] - 0.1, 0.11, Math.PI + 0.25, TAU - 0.25, 18, { c: "cyan", a: 0.95, s: 1 }))
      ],
      labels: [
        { x: 0, y: 1.1, html: "observation", cls: "role c-mint", def: DEFS["peirce-relation"] },
        { x: -1.05, y: by, html: "you", cls: "word" },
        { x: -1.05, y: by - 0.34, html: "observer", cls: "tag" },
        { x: 1.05, y: by - 0.34, html: "observed", cls: "tag" },
        ...rows.flatMap(([str, y], r) => [...str].map((ch, k) => ({ x: X(k), y, html: ch, cls: "math" + (r === 2 ? "" : " dimmed") }))),
        ...rows.filter(r => r[2]).map(([, y, eq]) => ({ x: 0.82, y, html: eq, cls: "math left dimmed" })),
        { x: 0.82, y: rows[2][1], html: "0s, 1s and<br>their relations", cls: "example left c-cyan" }
      ]
    };
  };
  SCENES.fields = () => relation({ roles: true, fields: true });
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
      points, flows, pulse: { count: 5, period: 2.4 },
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
     π and e carry the continuous turn; discreteness is that turn closing on a whole number. */
  const MAP = [
    { name: "perpendicularity", mean: "difference", c: "cyan", cls: "c-cyan", cap: "two directions, each free of the other" },
    { name: "symmetry", mean: "sameness", c: "coral", cls: "c-coral", cap: "opposite poles, the same after a half turn" },
    { name: "space", mean: "π, continuous", c: "violet", cls: "c-violet", cap: "π measures the turn in space, through every angle" },
    { name: "time", mean: "<i>e</i>, continuous", c: "brass", cls: "c-brass", cap: "<i>e</i> measures the turn as it accumulates in time" },
    { name: "discreteness", mean: "integers, names, meaning", c: "mint", cls: "c-mint", cap: "no whole-number arithmetic reaches π or <i>e</i>, yet the full turn gives <i>e</i><sup>2<i>πi</i></sup> = 1" },
    { name: "identity", mean: "invariance over change", c: "gold", cls: "c-math", cap: "<i>A</i> = <i>A</i>" }
  ];
  SCENES.gmap = () => {
    const nar = narrow(), R = nar ? 0.64 : 0.62, cy = nar ? 0 : 0.02, points = [], meta = [];
    const BUILT = 4.6, PH = 2.8, END = BUILT + 6 * PH, clamp = v => Math.max(0, Math.min(1, v));
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 190; k++) add({ kind: "ring", a: ((k + 0.5) / 190) * TAU, props: [4], base: "ice", ba: 0.45 }, { x: R, y: cy, c: "ice", a: 0, s: 0.8 });
    for (let k = 0; k < 34; k++) add({ kind: "seg", u: k / 33, props: [0, 1], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let k = 0; k < 34; k++) add({ kind: "perp", u: k / 33, props: [0], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 34; k++) add({ kind: "ext", d, u: (k + 1) / 34, props: [1], base: "paper", ba: 0.55 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.8 });
    for (let k = 0; k < 14; k++) add({ kind: "corner", k, props: [0], base: "paper", ba: 0.6 }, { x: 0, y: cy, c: "paper", a: 0, s: 0.7 });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 16; k++) add({ kind: "pole", q, jx: gauss() * 0.022, jy: gauss() * 0.022, props: [1], base: "paper", ba: 0.9 }, { x: 0, y: cy, c: "paper", a: 0, s: 1.05 });
    for (let k = 0; k < 90; k++) add({ kind: "pi", u: k / 89, props: [2], base: "violet", ba: 0 }, { x: 0, y: cy, c: "violet", a: 0, s: 0.85 });
    for (let k = 0; k < 110; k++) add({ kind: "trail", a: ((k + 0.5) / 110) * TAU, props: [3, 4], base: "brass", ba: 0 }, { x: 0, y: cy, c: "brass", a: 0, s: 0.85 });
    for (let k = 0; k < 30; k++) add({ kind: "centre", jx: gauss() * 0.022, jy: gauss() * 0.022, props: [], base: "ice", ba: 0.9 }, { x: 0, y: cy, c: "ice", a: 0, s: 1 });
    for (let k = 0; k < 18; k++) add({ kind: "mark", jx: gauss() * 0.02, jy: gauss() * 0.02, props: [3, 4, 5], base: "gold", ba: 1 }, { x: R, y: cy, c: "gold", a: 0, s: 1.3 });

    /* the animation plays once and rests; hovering a label previews its property.
       hover: -1 none, 0..5 a property, 6 Shannon's bit (the circle projected onto one line) */
    let offset = 0, last = 0, hover = -1, hoverStart = 0;
    const local = t => { if (t < offset) offset = 0; last = t; return t - offset; };
    const BIT = 6;
    const phase = t => t < BUILT ? -1 : Math.min(5, Math.floor((t - BUILT) / PH));
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
          const left = k < 3, x = left ? -1.0 : 1.0, y = 0.58 - (k % 3) * 0.58;
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

  /* A = A twice. On top, the letter-reading scene of chapter 03: tell it apart, recognize
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
    for (let k = 0; k < 40; k++) {
      const u = (k % 20) / 19, y = ly + (k < 20 ? 0.035 : -0.035);
      add({ kind: "eq", x: -0.09 + 0.18 * u, y }, { x: 0, y, c: "cyan", a: 1, s: 1 });
    }

    /* the circle */
    const cx = -0.36, cy = -0.42, R = 0.46;
    for (let k = 0; k < 160; k++) add({ kind: "ring", a: (k / 160) * TAU, props: [2] }, { x: cx, y: cy, c: "ice", a: 0.4, s: 0.8 });
    for (let d = 0; d < 2; d++) for (let k = 0; k < 40; k++) add({ kind: "dia", d, u: -1 + (2 * k) / 39, props: [d ? 0 : 1] }, { x: cx, y: cy, c: "paper", a: 0.4, s: 0.8 });
    for (let k = 0; k < 12; k++) add({ kind: "corner", k, props: [0] }, { x: cx, y: cy, c: "paper", a: 0.6, s: 0.75 });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 14; k++) add({ kind: "pole", q, jx: gauss() * 0.018, jy: gauss() * 0.018, props: q % 2 ? [0] : [1] }, { x: cx, y: cy, c: "paper", a: 0.9, s: 1 });
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
        { x: cx, y: -1.06, html: "", cls: "example", live: t => t < S0 ? "the right angle between 1 and <i>i</i>" : t < S1 ? "a half turn, and the circle is as it was" : t < S2 ? "a full turn, and <i>A</i> is back" : "the form changed, the identity held" }
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
        { x: cx, y: -0.58, html: "", cls: "slot c-math", live: t => { const n = Math.floor(theta(t) / TAU); return `${((theta(t) % TAU) / Math.PI).toFixed(2)}<i>π</i> · ${n} whole turn${n === 1 ? "" : "s"}`; } },
        { x: bx, y: -0.78, html: "discreteness composed toward the continuous", cls: "example" },
        { x: cx, y: -0.78, html: "the continuous closing on whole numbers", cls: "example" }
      ]
    };
  };

  /* Level B: the lighter at the centre and two of us looking at it from different places,
     each on our own circle, each turning back and forth at our own pace. Each of us sees the
     lighter turned in our own frame; the angle between us changes, and at every moment it is
     an exact quantity, so turning your view back by it gives mine. */
  SCENES.glighter = () => {
    const X0 = -0.36, VIEW = 0.24, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const OBS = [
      { R: 0.42, a0: -Math.PI / 2, amp: 1.0, w: 0.33, ph: 0, c: "ice", word: "I say <b>lighter</b>" },
      { R: 0.62, a0: Math.PI * 0.72, amp: 1.2, w: 0.25, ph: 1.3, c: "cyan", word: "you say <b>igniter</b>" }
    ];
    lighterAt(X0, 0.02, 1.1).forEach(p => add({ kind: "fixed", x: p.x, y: p.y, a: p.a }, p));
    OBS.forEach(o => { for (let k = 0; k < 150; k++) { const [x, y] = at(X0, 0, o.R, (k / 150) * TAU); add({ kind: "fixed", x, y, a: 0.2 }, { x, y, c: "dim", a: 0.2, s: 0.7 }); } });
    const icon = lighterAt(0, 0, 0.5);
    OBS.forEach((o, oi) => {
      for (let k = 0; k < 20; k++) add({ kind: "eye", oi, jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: 0, y: 0, c: o.c, a: 1, s: 1.2 });
      for (let k = 0; k < 18; k++) add({ kind: "sight", oi, u: k / 17 }, { x: 0, y: 0, c: o.c, a: 0.45, s: 0.75 });
      icon.forEach(p => add({ kind: "icon", oi, dx: p.x, dy: p.y }, { x: 0, y: 0, c: p.c, a: p.a, s: 0.8 }));
    });
    for (let k = 0; k < 50; k++) add({ kind: "arc", u: k / 49 }, { x: 0, y: 0, c: "gold", a: 0.8, s: 0.9 });
    const ang = (oi, t) => { const o = OBS[oi]; return o.a0 + o.amp * Math.sin(o.w * t + o.ph); };   // back and forth: clockwise, then counterclockwise
    const deg = a => Math.round((((a * DEG) % 360) + 360) % 360);
    const between = t => { let d = ang(1, t) - ang(0, t); d = ((d % TAU) + TAU) % TAU; return d > Math.PI ? d - TAU : d; };   // signed, the short way round
    const ARC = 0.16, out = new Array(points.length);
    return {
      points, stillT: 2.2,
      dynamic: t => {
        const a0 = ang(0, t), d = between(t);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") { out[i] = { x: m.x, y: m.y, a: m.a }; return; }
          if (m.kind === "arc") { const [x, y] = at(X0, 0, ARC + 0.04, a0 + d * m.u); out[i] = { x, y, a: 0.85 }; return; }
          const o = OBS[m.oi], a = ang(m.oi, t), [ex, ey] = at(X0, 0, o.R, a);
          if (m.kind === "eye") out[i] = { x: ex + m.jx, y: ey + m.jy, a: 1 };
          else if (m.kind === "sight") { const u = 0.1 + 0.55 * m.u; out[i] = { x: X0 + (ex - X0) * (1 - u), y: ey * (1 - u), a: 0.45 }; }
          else {                                                         // the lighter as this observer sees it: turned with their frame
            const r = a + Math.PI / 2, c = Math.cos(r), s = Math.sin(r), [vx, vy] = at(X0, 0, o.R + VIEW, a);
            out[i] = { x: vx + m.dx * c - m.dy * s, y: vy + m.dx * s + m.dy * c, a: 0.9 };
          }
        });
        return out;
      },
      labels: [
        ...OBS.map((o, oi) => ({ x: 0, y: 0, html: o.word, cls: "word small", at: t => { const a = ang(oi, t), [x, y] = at(X0, 0, o.R + VIEW + 0.2, a); return [Math.max(-1.05, x + Math.cos(a) * 0.22), y]; } })),
        ...[["my frame", t => `${deg(ang(0, t))}°`], ["your frame", t => `${deg(ang(1, t))}°`], ["between us", t => `${Math.round(Math.abs(between(t)) * DEG)}°, exactly`], ["the lighter", () => "the same"]].flatMap(([tag, v], k) => [
          { x: 1.02, y: 0.5 - k * 0.34, html: tag, cls: "tag left" },
          { x: 1.02, y: 0.36 - k * 0.34, html: "", cls: "slot left" + (k > 1 ? " c-math" : ""), live: v }
        ])
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
        { x: cx, y: cy - R - 0.2, html: "a turn", cls: "tag" },
        { x: (x0 + x1) / 2, y: cy - R - 0.2, html: "seen from the side, a wave", cls: "tag" },
        { x: cx, y: cy + R + 0.2, html: "<i>e</i><sup><i>iωt</i></sup>", cls: "slot c-math" }
      ]
    };
  };

  /* The mirror of Weaver's levels: Level A solved by Shannon's bit, Level B checked by the turn, Level C by the return. */
  SCENES.levels2 = () => {
    const bar = (y, n, o) => S.rect(0, y, 2.7, 0.3, n, o);
    return {
      points: [
        ...bar(0.55, 110, { c: "brass", a: 0.75 }),
        ...S.fill(0, 0, 2.7, 0.3, 360, { c: "cyan", a: 0.4, s: 0.8 }),
        ...bar(0, 130, { c: "cyan", a: 0.95 }),
        ...bar(-0.55, 110, { c: "mint", a: 0.85 })
      ],
      flows: [{ n: 60, path: S.rectPath(0, 0, 2.7, 0.3), speed: 0.05, c: "gold", a: 1, s: 1.3 },
              { n: 40, path: S.rectPath(0, -0.55, 2.7, 0.3), speed: 0.05, c: "mint", a: 1, s: 1.2 }],
      labels: [
        { x: -1.26, y: 0.55, html: "Level A · the technical problem", cls: "slot left" },
        { x: 1.26, y: 0.55, html: "Shannon’s bit, 1948", cls: "tag right brass" },
        { x: -1.26, y: 0, html: "Level B · the semantic problem", cls: "slot left lit" },
        { x: 1.26, y: 0, html: "checked by the turn", cls: "tag right cyan" },
        { x: -1.26, y: -0.55, html: "Level C · the effectiveness problem", cls: "slot left" },
        { x: 1.26, y: -0.55, html: "checked by the return", cls: "tag right c-mint" }
      ]
    };
  };


  /* Composition, both ways: Shannon's bits into the corners of a cube, geometric bits into
     a sphere made of circles, turning. */
  SCENES.spheres = () => {
    const lx = -0.88, rx = 0.78, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const V = [];
    for (let k = 0; k < 8; k++) V.push([(k & 1 ? 1 : -1) * 0.34, (k & 2 ? 1 : -1) * 0.34, (k & 4 ? 1 : -1) * 0.34]);
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      const d = V[a].reduce((n, x, j) => n + (x !== V[b][j] ? 1 : 0), 0);
      if (d === 1) for (let k = 0; k < 14; k++) { const u = k / 13; add({ kind: "cube", p: V[a].map((x, j) => x + (V[b][j] - x) * u) }, { x: lx, y: 0, c: "brass", a: 0.7, s: 0.85 }); }
    }
    V.forEach(p => { for (let k = 0; k < 8; k++) add({ kind: "cube", p: p.map(x => x + gauss() * 0.015) }, { x: lx, y: 0, c: "brass", a: 1, s: 1.1 }); });
    const circles = [];
    for (let j = 0; j < 7; j++) { const tilt = (j / 7) * Math.PI; for (let k = 0; k < 64; k++) { const a = (k / 64) * TAU; circles.push([0.55 * Math.cos(a), 0.55 * Math.sin(a) * Math.cos(tilt), 0.55 * Math.sin(a) * Math.sin(tilt), j]); } }
    circles.forEach(c => add({ kind: "sphere", p: c }, { x: rx, y: 0, c: c[3] % 2 ? "violet" : "cyan", a: 0.7, s: 0.85 }));
    const out = new Array(points.length);
    return {
      points, stillT: 2,
      dynamic: t => {
        meta.forEach((m, i) => {
          const [x, y, z] = m.p;
          if (m.kind === "cube") { const [X, Y, d] = view3(x, y, z, 0.6 + t * 0.2, 0.45); out[i] = { x: lx + X, y: 0.02 + Y, a: 0.35 + 0.6 * d }; }
          else { const [X, Y, d] = view3(x, y, z, t * 0.25, 0.35); out[i] = { x: rx + X, y: 0.02 + Y, a: 0.2 + 0.7 * d }; }
        });
        return out;
      },
      labels: [
        { x: lx, y: 0.78, html: "Shannon’s bits", cls: "tag" },
        { x: rx, y: 0.78, html: "geometric bits", cls: "tag" },
        { x: lx, y: -0.74, html: "compose into cubes", cls: "example" },
        { x: rx, y: -0.74, html: "compose into spheres", cls: "example" }
      ]
    };
  };

  /* Level C: I ask for the lighter, the meaning crosses to you, and your action brings the
     lighter back along the lower arc, where I can compare it with what I meant. */
  SCENES.loop = () => {
    const I = [-1.05, 0], U = [1.05, 0];
    const top = [[I[0] + 0.12, 0.12], [-0.45, 0.85], [0.45, 0.85], [U[0] - 0.12, 0.12]];
    const bot = [[U[0] - 0.12, -0.14], [0.45, -0.85], [-0.45, -0.85], [I[0] + 0.12, -0.14]];
    const icon = lighterAt(0, 0, 0.8), points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    [I, U].forEach(p => S.blob(p[0], p[1], 0.1, 0.1, 50, {}).forEach(q => add({ kind: "fixed", x: q.x, y: q.y, a: 0.95 }, { x: q.x, y: q.y, c: "paper", a: 0.95, s: 1.1 })));
    S.bezier(...top, 70, {}).forEach(q => add({ kind: "fixed", x: q.x, y: q.y, a: 0.45 }, { x: q.x, y: q.y, c: "cyan", a: 0.45, s: 0.8 }));
    S.head(top[3][0], top[3][1], -0.9, 0.08, 10, {}).forEach(q => add({ kind: "fixed", x: q.x, y: q.y, a: 0.6 }, { x: q.x, y: q.y, c: "cyan", a: 0.6, s: 0.8 }));
    S.bezier(...bot, 70, {}).forEach(q => add({ kind: "fixed", x: q.x, y: q.y, a: 0.45 }, { x: q.x, y: q.y, c: "mint", a: 0.45, s: 0.8 }));
    S.head(bot[3][0], bot[3][1], Math.PI - 0.9, 0.08, 10, {}).forEach(q => add({ kind: "fixed", x: q.x, y: q.y, a: 0.6 }, { x: q.x, y: q.y, c: "mint", a: 0.6, s: 0.8 }));
    icon.forEach(q => add({ kind: "icon", dx: q.x, dy: q.y }, { x: U[0], y: U[1], c: q.c, a: q.a, s: 0.8 }));
    const out = new Array(points.length);
    return {
      points, stillT: 3.5,
      flows: [{ n: 10, path: u => S.bezierAt(...top, u), speed: 0.16, c: "cyan", a: 1, s: 1.2 }],
      dynamic: t => {
        const u = (t * 0.12) % 1, [bx, by] = S.bezierAt(...bot, u);
        meta.forEach((m, i) => { out[i] = m.kind === "fixed" ? { x: m.x, y: m.y, a: m.a } : { x: bx + m.dx, y: by + m.dy, a: 0.95 }; });
        return out;
      },
      labels: [
        { x: I[0], y: I[1] - 0.2, html: "I", cls: "word" }, { x: U[0], y: U[1] - 0.2, html: "you", cls: "word" },
        { x: 0, y: 0.84, html: "Level A · the signal arrives", cls: "tag" },
        { x: U[0], y: U[1] + 0.26, html: "Level B · you recover what I meant", cls: "tag" },
        { x: 0, y: -0.9, html: "Level C · your action brings it back", cls: "tag" },
        { x: I[0], y: I[1] + 0.26, html: "<i>A</i> = <i>A</i>", cls: "slot c-math" }
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
  /* shaft and head of an arrow as a list of [x, y], for figures that move */
  const arrowPts = (x0, y0, x1, y1, n, hn, size = 0.07) => {
    const out = [], ang = Math.atan2(y1 - y0, x1 - x0);
    for (let k = 0; k < n; k++) { const u = k / (n - 1); out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]); }
    for (let k = 0; k < hn; k++) {
      const u = (k % Math.ceil(hn / 2)) / Math.ceil(hn / 2), side = k < hn / 2 ? -0.5 : 0.5;
      out.push([x1 - size * u * Math.cos(ang + side), y1 - size * u * Math.sin(ang + side)]);
    }
    return out;
  };

  /* An error at the root grows along every branch: the same tree drawn twice, once with a
     small change at its start that compounds level by level. */
  SCENES.cascade = () => {
    const segs = [], build = (level, path) => { segs.push({ level, path }); if (level < 4) { build(level + 1, [...path, -1]); build(level + 1, [...path, 1]); } };
    build(0, []);
    const N = 9, root = [-1.38, 0.02], len = L => 0.6 * Math.pow(0.8, L), spread = L => 0.5 * Math.pow(0.74, L);
    const points = [], meta = [];
    [0, 1].forEach(tr => segs.forEach((sg, si) => { for (let k = 0; k < N; k++) { meta.push({ tr, si, u: (k + 0.5) / N }); points.push({ x: root[0], y: root[1], c: tr ? "coral" : "cyan", a: tr ? 0.8 : 0.7, s: 0.85 }); } }));
    const place = (sg, err) => {
      let x = root[0], y = root[1], a = 0, sx = x, sy = y;
      for (let L = 0; L <= sg.level; L++) {
        a += (L > 0 ? sg.path[L - 1] * spread(L) : 0) + err * Math.pow(1.8, L);
        sx = x; sy = y; x += len(L) * Math.cos(a); y += len(L) * Math.sin(a);
      }
      return [sx, sy, x, y];
    };
    const out = new Array(points.length);
    return {
      points, stillT: 3.1,
      dynamic: t => {
        const err = 0.045 * Math.sin(t * 0.5), ends = [segs.map(sg => place(sg, 0)), segs.map(sg => place(sg, err))];
        meta.forEach((m, i) => { const [sx, sy, x, y] = ends[m.tr][m.si]; out[i] = { x: sx + (x - sx) * m.u, y: sy + (y - sy) * m.u, a: m.tr ? 0.8 : 0.7 }; });
        return out;
      },
      labels: [
        { x: root[0], y: root[1] - 0.18, html: "what a number is", cls: "tag" },
        { x: root[0] + 0.05, y: root[1] + 0.2, html: "a small error here", cls: "example left" },
        { x: 1.08, y: 0.1, html: "everything built on it", cls: "tag left" },
        { x: 1.08, y: -0.08, html: "carries it, grown", cls: "example left" }
      ]
    };
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

  /* No closed systems. Left: the liar, a sign pointing only at itself. Right: the open tower,
     each system adding the consistency of the one below and checking it from above. */
  SCENES.selfref = () => {
    const bx = -0.82, by = 0.12, lx = 0.78, rows = [-0.66, -0.22, 0.22, 0.66];
    const loop = u => { const a = -Math.PI / 2 + u * 1.5 * Math.PI; return [bx + 0.45 + 0.28 * Math.cos(a), by + 0.28 + 0.28 * Math.sin(a)]; };
    return {
      points: [
        ...S.rect(bx, by, 0.9, 0.34, 110, { c: "coral", a: 0.55 }),
        ...Array.from({ length: 50 }, (_, k) => { const [x, y] = loop(k / 49); return { x, y, c: "coral", a: 0.35, s: 0.75 }; }),
        ...rows.flatMap((y, k) => S.rect(lx, y, 0.86, 0.26, 90, { c: k ? "cyan" : "ice", a: 0.6 })),
        ...rows.slice(1).flatMap((y, k) => S.line(lx - 0.5, y - 0.03, lx - 0.5, rows[k] + 0.03, 10, { c: "cyan", a: 0.35, s: 0.7 }))
      ],
      flows: [
        { n: 8, path: loop, speed: 0.25, c: "coral", a: 0.8, s: 1.1 },
        ...rows.slice(1).map((y, k) => ({ n: 3, path: u => [lx - 0.5, y - 0.03 - (y - rows[k] - 0.06) * u], speed: 0.35, c: "cyan", a: 1, s: 1.1 }))
      ],
      labels: [
        { x: bx, y: by, html: "this sentence is false", cls: "example" },
        { x: bx, y: -0.2, html: "a sign pointing only at itself", cls: "tag" },
        { x: lx, y: rows[0], html: "arithmetic", cls: "example" },
        { x: lx, y: rows[1], html: "+ its consistency", cls: "example" },
        { x: lx, y: rows[2], html: "+ the consistency of that", cls: "example" },
        { x: lx, y: rows[3], html: "…", cls: "example" },
        { x: lx, y: -0.98, html: "the open tower of checks", cls: "tag" }
      ]
    };
  };

  /* A cup in space, tipped from edge on to seen from above: the rim is a line, an ellipse,
     a circle, and the cup never changes. */
  SCENES.cup = () => {
    const pts3 = [], cx = -0.2;
    for (let k = 0; k < 150; k++) { const a = (k / 150) * TAU; pts3.push([0.62 * Math.cos(a), 0.42, 0.62 * Math.sin(a), "cyan", 0.95]); }
    for (let k = 0; k < 110; k++) { const a = (k / 110) * TAU; pts3.push([0.44 * Math.cos(a), -0.42, 0.44 * Math.sin(a), "ice", 0.6]); }
    for (let j = 0; j < 12; j++) { const a = (j / 12) * TAU; for (let k = 0; k < 12; k++) { const u = k / 11; pts3.push([(0.44 + 0.18 * u) * Math.cos(a), -0.42 + 0.84 * u, (0.44 + 0.18 * u) * Math.sin(a), "ice", 0.35]); } }
    const tilt = t => 0.06 + 1.32 * (0.5 - 0.5 * Math.cos(t * 0.42));
    const out = new Array(pts3.length);
    const view = t => { const tl = tilt(t); return tl < 0.3 ? "seen edge on, the rim is a line" : tl < 1.15 ? "tilted, the rim is an ellipse" : "from above, the rim is a circle"; };
    return {
      points: pts3.map(([x, y, z, c, a]) => ({ x: cx + x, y, c, a, s: 0.85 })),
      stillT: 3.4,
      dynamic: t => {
        const tl = tilt(t);
        pts3.forEach(([x, y, z, c, a], i) => { const [X, Y, d] = view3(x, y, z, 0.35, tl); out[i] = { x: cx + X, y: Y, a: a * (0.35 + 0.65 * d) }; });
        return out;
      },
      labels: [
        { x: cx, y: -1.0, html: "", cls: "example", live: view },
        { x: 1.08, y: 0.1, html: "the cup", cls: "tag left" },
        { x: 1.08, y: -0.08, html: "unchanged", cls: "example left" }
      ]
    };
  };

  /* Why three: a bounded planar motion settles onto a cycle; the Lorenz system, bounded in
     three dimensions, never repeats. */
  SCENES.three = () => {
    const lx = -0.88, rx = 0.84, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    const spiral = [];                                                   // r' = r(1 - r²), θ' = 1, from r = 0.12
    for (let k = 0; k < 360; k++) { const t = k * 0.035, r = 1 / Math.sqrt(1 + (1 / 0.0144 - 1) * Math.exp(-2 * t)); spiral.push([lx + 0.52 * r * Math.cos(t), 0.02 + 0.52 * r * Math.sin(t)]); }
    spiral.forEach(([x, y]) => add({ kind: "fixed", x, y, a: 0.45 }, { x, y, c: "cyan", a: 0.45, s: 0.75 }));
    let x = 1, y = 1, z = 1; const lor = [];
    for (let k = 0; k < 3000; k++) {
      const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z;
      x += dx * 0.005; y += dy * 0.005; z += dz * 0.005;
      if (k > 500 && k % 3 === 0) lor.push([x / 21, (z - 25) / 21, y / 21]);
    }
    lor.forEach((p, k) => add({ kind: "lorenz", k }, { x: rx, y: 0, c: "violet", a: 0.5, s: 0.75 }));
    for (let k = 0; k < 16; k++) add({ kind: "trace2", jx: gauss() * 0.018, jy: gauss() * 0.018 }, { x: lx, y: 0, c: "gold", a: 1, s: 1.2 });
    for (let k = 0; k < 16; k++) add({ kind: "trace3", jx: gauss() * 0.018, jy: gauss() * 0.018 }, { x: rx, y: 0, c: "gold", a: 1, s: 1.2 });
    const out = new Array(points.length), S3 = 0.62;
    return {
      points, stillT: 5,
      dynamic: t => {
        const yaw = 0.35 * Math.sin(t * 0.18), i2 = Math.floor((t * 40) % spiral.length), i3 = Math.floor((t * 30) % lor.length);
        const P3 = p => { const [X, Y, d] = view3(p[0], p[1], p[2], yaw, 0.15); return [rx + S3 * X, 0.02 + S3 * Y, d]; };
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "lorenz") { const [X, Y, d] = P3(lor[m.k]); out[i] = { x: X, y: Y, a: 0.25 + 0.5 * d }; }
          else if (m.kind === "trace2") out[i] = { x: spiral[i2][0] + m.jx, y: spiral[i2][1] + m.jy, a: 1 };
          else { const [X, Y] = P3(lor[i3]); out[i] = { x: X + m.jx, y: Y + m.jy, a: 1 }; }
        });
        return out;
      },
      labels: [
        { x: lx, y: 0.78, html: "two dimensions", cls: "tag" },
        { x: rx, y: 0.78, html: "three dimensions", cls: "tag" },
        { x: lx, y: -0.78, html: "it settles into a cycle", cls: "example" },
        { x: rx, y: -0.78, html: "bounded, and it never repeats", cls: "example" }
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

  /* Broom Bridge: the rule carved into the stone, appearing as it is cut. */
  SCENES.stone = () => {
    const text = S.text("i² = j² = k² = ijk = −1", 0, 0.12, 0.3, 760, { c: "brass", a: 0.95, s: 0.9 }, 'italic 500 {px}px "EB Garamond", Georgia, serif');
    const stone = [...S.rect(0, 0.12, 3.0, 0.78, 170, { c: "dim", a: 0.5 }), ...S.fill(0, 0.12, 3.0, 0.78, 200, { c: "dim", a: 0.1, s: 0.7 })];
    const points = [...stone, ...text], nS = stone.length, out = new Array(points.length);
    return {
      points, stillT: 6,
      dynamic: t => {
        const edge = -1.55 + 3.3 * Math.min(1, t / 4.5);
        points.forEach((p, i) => { out[i] = i < nS ? { x: p.x, y: p.y, a: p.a } : { x: p.x, y: p.y, a: p.x < edge ? 0.95 : 0 }; });
        return out;
      },
      labels: [
        { x: 0, y: 0.72, html: "carved into the stone", cls: "tag" },
        { x: 0, y: -0.48, html: "Broom Bridge, Dublin, 16 October 1843", cls: "example" }
      ]
    };
  };

  /* One product, two answers: p and q lie on a floor seen at an angle; their dot product
     runs along p, their cross product stands up out of the floor. */
  SCENES.split = () => {
    const O = [-0.3, -0.42], F = 0.38, P = 0.95, Q = 0.8, ap = 0.2;
    const fl = (r, a) => [O[0] + r * Math.cos(a), O[1] + r * F * Math.sin(a)];
    const phi = t => 1.45 + 1.25 * Math.sin(t * 0.45);
    const points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 120; k++) { const [x, y] = fl(1.15, (k / 120) * TAU); add({ kind: "fixed", x, y, a: 0.22 }, { x, y, c: "dim", a: 0.22, s: 0.7 }); }
    arrowPts(O[0], O[1], ...fl(P, ap), 30, 10).forEach(([x, y]) => add({ kind: "fixed", x, y, a: 0.9 }, { x, y, c: "cyan", a: 0.9, s: 0.9 }));
    for (let k = 0; k < 36; k++) add({ kind: "q", k }, { x: O[0], y: O[1], c: "ice", a: 0.9, s: 0.9 });
    for (let k = 0; k < 30; k++) add({ kind: "dot", u: k / 29 }, { x: O[0], y: O[1], c: "coral", a: 1, s: 1.15 });
    for (let k = 0; k < 36; k++) add({ kind: "cross", k }, { x: O[0], y: O[1], c: "gold", a: 1, s: 1 });
    const out = new Array(points.length);
    const vals = t => { const f = phi(t); return { f, dot: P * Q * Math.cos(f), cross: P * Q * Math.sin(f) }; };
    return {
      points, stillT: 2.2,
      dynamic: t => {
        const { f, cross } = vals(t), qa = arrowPts(O[0], O[1], ...fl(Q, ap + f), 26, 10), ca = arrowPts(O[0], O[1], O[0], O[1] + 0.9 * cross, 26, 10);
        const dl = Q * Math.cos(f);
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "q") { const [x, y] = qa[m.k]; out[i] = { x, y, a: 0.9 }; }
          else if (m.kind === "dot") { const [x, y] = fl(dl * m.u, ap); out[i] = { x, y: y - 0.035, a: 1 }; }
          else { const [x, y] = ca[m.k]; out[i] = { x, y, a: Math.abs(cross) > 0.02 ? 1 : 0 }; }
        });
        return out;
      },
      labels: [
        { x: 0.1, y: 0.98, html: "<i>pq</i> = −<i>p</i>·<i>q</i> + <i>p</i>×<i>q</i>", cls: "slot c-math" },
        { x: 0, y: 0, html: "<i>p</i>", cls: "slot", at: () => { const [x, y] = fl(P + 0.12, ap); return [x, y]; } },
        { x: 0, y: 0, html: "<i>q</i>", cls: "slot", at: t => { const [x, y] = fl(Q + 0.14, ap + phi(t)); return [x, y]; } },
        { x: -0.3, y: -0.84, html: "", cls: "example", live: t => `<i>p</i> · <i>q</i>, how much they agree: <span style="color:var(--coral)">${vals(t).dot.toFixed(2)}</span>` },
        { x: -0.3, y: -1.0, html: "", cls: "example", live: t => `<i>p</i> × <i>q</i>, the perpendicular they make: <span style="color:var(--math)">${vals(t).cross.toFixed(2)}</span>` }
      ]
    };
  };

  /* The tower: each doubling, drawn as the signed units ±1, ±e₁, …; each row lights in turn,
     and the sedenions' row will not hold still. */
  const TOWER = [
    { sym: "ℝ", dim: 1, lost: "" },
    { sym: "ℂ", dim: 2, lost: "gives up order" },
    { sym: "ℍ", dim: 4, lost: "gives up commutativity" },
    { sym: "𝕆", dim: 8, lost: "gives up associativity" },
    { sym: "𝕊", dim: 16, lost: "gives up the norm", extra: "nonzero × nonzero = 0" }
  ];
  SCENES.tower = () => {
    const points = [], meta = [], gap = 0.046, rowY = r => -0.84 + r * 0.42;
    TOWER.forEach((row, r) => {
      const n = 2 * row.dim;
      for (let k = 0; k < n; k++) for (let j = 0; j < 5; j++) {
        const x = (k - (n - 1) / 2) * gap + gauss() * 0.006, y = rowY(r) + gauss() * 0.006;
        meta.push({ r, k, x, y }); points.push({ x, y, c: r === 4 ? "coral" : r === 3 ? "violet" : r === 2 ? "mint" : r === 1 ? "cyan" : "ice", a: 0.9, s: 1, g: r });
      }
    });
    const out = new Array(points.length);
    return {
      points, pulse: { count: 5, period: 2.2 }, stillT: 2,
      dynamic: t => {
        meta.forEach((m, i) => {
          const shake = m.r === 4 ? 1 : 0;
          out[i] = { x: m.x + shake * 0.03 * Math.sin(t * 3.1 + m.k * 1.7), y: m.y + shake * 0.07 * Math.sin(t * 2.3 + m.k * 2.9), a: 0.9 };
        });
        return out;
      },
      labels: [
        ...TOWER.map((row, r) => ({ x: -1.12, y: rowY(r), html: row.sym, cls: "math", g: r })),
        ...TOWER.map((row, r) => ({ x: -1.34, y: rowY(r), html: String(row.dim), cls: "tag", g: r })),
        ...TOWER.filter(row => row.lost).map(row => { const r = TOWER.indexOf(row); return { x: 0.86, y: rowY(r) + (row.extra ? 0.07 : 0), html: row.lost, cls: "example left", g: r }; }),
        { x: 0.86, y: rowY(4) - 0.1, html: TOWER[4].extra, cls: "example left c-coral", g: 4 }
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

  /* Two turns to come back: a mark carried along a Möbius band is on the far side after one
     lap and home after two, the way a spin-one-half state changes sign after one full turn. */
  SCENES.mobius = () => {
    const pts3 = [];
    for (let a = 0; a < 120; a++) for (const b of [0, 6]) {             // the band's edge, which is a single loop
      const u = (a / 120) * TAU, v = -0.42 + (0.84 * b) / 6, r = 1 + v * Math.cos(u / 2);
      pts3.push([r * Math.cos(u), v * Math.sin(u / 2), r * Math.sin(u), 0.6]);
    }
    for (let a = 0; a < 24; a++) for (let b = 0; b < 9; b++) {          // rulings across the band show its half twist
      const u = (a / 24) * TAU, v = -0.42 + (0.84 * b) / 8, r = 1 + v * Math.cos(u / 2);
      pts3.push([r * Math.cos(u), v * Math.sin(u / 2), r * Math.sin(u), 0.3]);
    }
    const band = (u, v) => { const r = 1 + v * Math.cos(u / 2); return [r * Math.cos(u), v * Math.sin(u / 2), r * Math.sin(u)]; };
    const sc = 0.66, cx = -0.25, nB = pts3.length, points = [], out = [];
    pts3.forEach(([x, y, z, a]) => points.push({ x: cx + x * sc, y: y * sc, c: "ice", a, s: 0.8 }));
    for (let k = 0; k < 18; k++) points.push({ x: cx, y: 0, c: "gold", a: 1, s: 1.3, jx: gauss() * 0.02, jy: gauss() * 0.02 });
    const lap = t => t * 0.75, tilt = 1.0;
    return {
      points, stillT: 11,
      dynamic: t => {
        const yaw = 0.3 + t * 0.06, s = lap(t);
        for (let i = 0; i < nB; i++) { const [x, y, z, a] = pts3[i], [X, Y, d] = view3(x, y, z, yaw, tilt); out[i] = { x: cx + X * sc, y: Y * sc, a: a * (0.35 + 0.65 * d) }; }
        const [mx, my, mz] = band(s, 0.34), [X, Y] = view3(mx, my, mz, yaw, tilt);
        for (let i = nB; i < points.length; i++) out[i] = { x: cx + X * sc + points[i].jx, y: Y * sc + points[i].jy, a: 1 };
        return out;
      },
      labels: [
        { x: 1.1, y: 0.3, html: "turns", cls: "tag left" },
        { x: 1.1, y: 0.12, html: "", cls: "slot left c-math", live: t => (lap(t) / TAU).toFixed(2) },
        { x: 1.1, y: -0.18, html: "the state", cls: "tag left" },
        { x: 1.1, y: -0.36, html: "", cls: "slot left", live: t => Math.floor(lap(t) / TAU) % 2 ? "sign reversed" : "itself" }
      ]
    };
  };

  /* What we measure: a string around a circle, unrolled beside its diameter: three diameters
     and a little more, π. */
  SCENES.unroll = () => {
    const cx = -0.3, cy = 0.42, R = 0.3, C = TAU * R, x0 = -1.24, ly = -0.26, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 110; k++) { const [x, y] = at(cx, cy, R, (k / 110) * TAU); add({ kind: "fixed", x, y, a: 0.3 }, { x, y, c: "ice", a: 0.3, s: 0.75 }); }
    for (let k = 0; k < 26; k++) { const x = cx - R + (2 * R * k) / 25; add({ kind: "fixed", x, y: cy, a: 0.8 }, { x, y: cy, c: "brass", a: 0.8, s: 0.85 }); }
    for (let k = 0; k < 190; k++) add({ kind: "string", s: (C * k) / 189 }, { x: cx, y: cy - R, c: "cyan", a: 0.95, s: 0.95 });
    for (let j = 0; j < 3; j++) for (let k = 0; k < 26; k++) add({ kind: "dia", j, x: x0 + 2 * R * j + (2 * R * k) / 25 }, { x: x0, y: ly - 0.12, c: "brass", a: 0, s: 0.95 });
    for (let k = 0; k < 8; k++) add({ kind: "rest", x: x0 + 6 * R + ((C - 6 * R) * k) / 7 }, { x: x0, y: ly - 0.12, c: "coral", a: 0, s: 1.1 });
    const f = t => ease(Math.max(0, Math.min(1, (t - 1.2) / 2.8)));
    const out = new Array(points.length);
    const shown = t => Math.max(0, Math.min(3, Math.floor((t - 4.6) / 0.8) + 1));
    return {
      points, period: 12, stillT: 10,
      dynamic: t => {
        const p = f(t), n = shown(t), rest = t > 7.2;
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "string") {
            const [ax, ay] = at(cx, cy, R, -Math.PI / 2 + m.s / R), bx = x0 + m.s;
            out[i] = { x: ax + (bx - ax) * p, y: ay + (ly - ay) * p, a: 0.95 };
          }
          else if (m.kind === "dia") out[i] = { x: m.x, y: ly - 0.12, a: m.j < n && t > 4.6 ? 0.95 : 0 };
          else out[i] = { x: m.x, y: ly - 0.12, a: rest ? 1 : 0 };
        });
        return out;
      },
      labels: [
        { x: cx + R + 0.12, y: cy, html: "the diameter", cls: "tag left" },
        { x: x0 + C / 2, y: ly + 0.14, html: "the string, unrolled", cls: "tag" },
        { x: x0 + C / 2, y: ly - 0.42, html: "", cls: "slot c-math", live: t => t < 4.6 ? "&nbsp;" : t < 7.2 ? `${shown(t)} diameter${shown(t) > 1 ? "s" : ""}` : "3 diameters and 0.14…, which is π" }
      ]
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
        { x: cx, y: -0.8, html: "angles add, turns multiply", cls: "example" },
        { x: (bx0 + bx1) / 2, y: -0.62, html: "<i>e</i><sup>−<i>E</i>₁/<i>kT</i></sup> · <i>e</i><sup>−<i>E</i>₂/<i>kT</i></sup> = <i>e</i><sup>−(<i>E</i>₁+<i>E</i>₂)/<i>kT</i></sup>", cls: "slot c-math" },
        { x: (bx0 + bx1) / 2, y: -0.8, html: "energies add, weights multiply", cls: "example" },
        { x: bx0, y: by1 + 0.12, html: "weight", cls: "tag" },
        { x: bx1, y: by0 - 0.1, html: "energy", cls: "tag" }
      ]
    };
  };

  /* The metre and the second: a quarter of the Earth's meridian, and the caesium cycles now
     counted in every second. */
  SCENES.earth = () => {
    const cx = -0.62, R = 0.62, wx0 = 0.56, wx1 = 1.46, wy = 0.36, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    for (let k = 0; k < 170; k++) { const [x, y] = at(cx, 0, R, (k / 170) * TAU); add({ kind: "fixed", x, y, a: 0.4 }, { x, y, c: "ice", a: 0.4, s: 0.8 }); }
    for (let k = 0; k < 40; k++) { const u = -1 + (2 * k) / 39; add({ kind: "fixed", x: cx, y: u * R, a: 0.22 }, { x: cx, y: 0, c: "dim", a: 0.22, s: 0.7 }); add({ kind: "fixed", x: cx + u * R, y: 0, a: 0.22 }, { x: cx, y: 0, c: "dim", a: 0.22, s: 0.7 }); }
    for (let k = 0; k < 60; k++) { const [x, y] = at(cx, 0, R + 0.05, (Math.PI / 2) * (k / 59)); add({ kind: "fixed", x, y, a: 0.95 }, { x, y, c: "gold", a: 0.95, s: 1.05 }); }
    for (let k = 0; k < 150; k++) add({ kind: "wave", u: k / 149 }, { x: wx0, y: wy, c: "cyan", a: 0.85, s: 0.85 });
    const out = new Array(points.length);
    const count = t => Math.floor((t % 1) * 9192631770).toLocaleString("en-US");
    return {
      points, stillT: 0.49,
      flows: [{ n: 3, path: u => at(cx, 0, R + 0.05, (Math.PI / 2) * (1 - u)), speed: 0.18, c: "paper", a: 1, s: 1.5 }],
      dynamic: t => {
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else { const x = wx0 + (wx1 - wx0) * m.u; out[i] = { x, y: wy + 0.1 * Math.sin(m.u * 38 - t * 30), a: 0.85 }; }
        });
        return out;
      },
      labels: [
        { x: cx, y: R + 0.14, html: "North Pole", cls: "tag" },
        { x: cx + R + 0.16, y: -0.1, html: "equator", cls: "tag left" },
        { x: 0, y: 0, html: "10,000,000 metres, 1791", cls: "example left", at: () => at(cx, 0, R + 0.16, Math.PI / 4) },
        { x: (wx0 + wx1) / 2, y: wy + 0.26, html: "caesium-133", cls: "tag" },
        { x: (wx0 + wx1) / 2, y: wy - 0.26, html: "", cls: "slot c-math", live: count },
        { x: (wx0 + wx1) / 2, y: wy - 0.44, html: "of 9,192,631,770 cycles in one second", cls: "example" }
      ]
    };
  };

  /* Relational frames: A larger than B and B larger than C are trained; the reverse and the
     combination are derived without training. */
  SCENES.frames = () => {
    const A = [-1.05, -0.05], B = [0, -0.05], C = [1.05, -0.05];
    const arc = [[A[0], A[1] + 0.18], [A[0] + 0.3, 0.75], [C[0] - 0.3, 0.75], [C[0], C[1] + 0.18]];
    return {
      points: [
        ...[A, B, C].flatMap(p => S.blob(p[0], p[1], 0.1, 0.1, 50, { c: "paper", a: 0.9, s: 1 })),
        ...S.line(A[0] + 0.16, A[1] + 0.06, B[0] - 0.16, B[1] + 0.06, 30, { c: "cyan", a: 0.85, g: 0 }), ...S.head(B[0] - 0.16, B[1] + 0.06, 0, 0.07, 8, { c: "cyan", a: 0.85, g: 0 }),
        ...S.line(B[0] + 0.16, B[1] + 0.06, C[0] - 0.16, C[1] + 0.06, 30, { c: "cyan", a: 0.85, g: 0 }), ...S.head(C[0] - 0.16, C[1] + 0.06, 0, 0.07, 8, { c: "cyan", a: 0.85, g: 0 }),
        ...S.line(B[0] - 0.16, B[1] - 0.16, A[0] + 0.16, A[1] - 0.16, 30, { c: "violet", a: 0.85, g: 1 }), ...S.head(A[0] + 0.16, A[1] - 0.16, Math.PI, 0.07, 8, { c: "violet", a: 0.85, g: 1 }),
        ...S.bezier(...arc, 90, { c: "gold", a: 0.85, g: 2 }), ...S.head(C[0], C[1] + 0.18, -Math.PI / 2, 0.07, 8, { c: "gold", a: 0.85, g: 2 })
      ],
      pulse: { count: 3, period: 2.6 },
      labels: [
        { x: A[0], y: A[1] - 0.02, html: "A", cls: "slot" }, { x: B[0], y: B[1] - 0.02, html: "B", cls: "slot" }, { x: C[0], y: C[1] - 0.02, html: "C", cls: "slot" },
        { x: -0.52, y: 0.2, html: "larger than · trained", cls: "example", g: 0 },
        { x: 0.52, y: 0.2, html: "larger than · trained", cls: "example", g: 0 },
        { x: -0.52, y: -0.38, html: "smaller than · derived by reversing", cls: "example", g: 1 },
        { x: 0, y: 0.86, html: "A larger than C · derived by combining", cls: "example", g: 2 }
      ]
    };
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

  /* The same turn tested in three places, checked together at every return. */
  SCENES.tests = () => {
    const X = [-1.0, 0, 1.0], R = 0.28, cy = 0.12, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    X.forEach(cx => { for (let k = 0; k < 90; k++) { const [x, y] = at(cx, cy, R, (k / 90) * TAU); add({ kind: "ring", x, y }, { x, y, c: "ice", a: 0.45, s: 0.8 }); } });
    X.forEach((cx, j) => { for (let k = 0; k < 14; k++) add({ kind: "mark", j, jx: gauss() * 0.018, jy: gauss() * 0.018 }, { x: cx + R, y: cy, c: "gold", a: 1, s: 1.2 }); });
    const step = t => { const k = Math.floor(t / 1.1), f = Math.min(1, (t % 1.1) / 0.55); return (k + ease(f)) * Math.PI / 2; };
    const out = new Array(points.length);
    return {
      points, stillT: 4.35,
      dynamic: t => {
        const a = step(t), flash = Math.abs(((a / TAU) % 1)) < 0.02 || Math.abs(((a / TAU) % 1) - 1) < 0.02;
        meta.forEach((m, i) => {
          if (m.kind === "ring") out[i] = { x: m.x, y: m.y, a: flash ? 0.9 : 0.45, c: flash ? "cyan" : "ice" };
          else { const [x, y] = at(X[m.j], cy, R, a); out[i] = { x: x + m.jx, y: y + m.jy, a: 1 }; }
        });
        return out;
      },
      labels: [
        ...["people", "machines", "physics"].map((w, j) => ({ x: X[j], y: cy - R - 0.2, html: w, cls: "role" })),
        { x: 0, y: 0.72, html: "the same turn, the same check", cls: "example" }
      ]
    };
  };

  /* Coda: the lighter, a turn around it, and the words for it changing while it stays. */
  SCENES.coda = () => {
    const points = [...lighterAt(0, -0.02, 1.45), ...S.arc(0, 0.02, 0.74, 0, TAU * 0.995, 170, { c: "ice", a: 0.35, s: 0.8 })];
    const word = (w, k) => t => `<span style="opacity:${(Math.floor(t / 2.4) % 2 === k) ? 1 : 0.25}">${w}</span>`;
    return {
      points,
      flows: [{ n: 1, path: u => at(0, 0.02, 0.74, u * TAU), speed: 0.12, c: "gold", a: 1, s: 2.4 }],
      labels: [
        { x: -1.18, y: 0.02, html: "", cls: "word", live: word("lighter", 0) },
        { x: 1.18, y: 0.02, html: "", cls: "word", live: word("igniter", 1) },
        { x: 0, y: -1.0, html: "<i>A</i> = <i>A</i>", cls: "math c-math" }
      ]
    };
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
    frames: { w: "more technically", t: "Frames related by a rotation, and an object that stays the same.",
      d: "Each description of the lighter is written in a frame, and any two frames are related by a rotation <i>g</i>. Applying <i>g</i> turns my description into yours and its inverse <i>g</i><sup>−1</sup> turns yours back into mine, so decode(encode(<i>A</i>)) = <i>A</i> holds for every <i>g</i>, and what stays fixed under all of them is the thing both descriptions are about. Physics builds its fields the same way: electromagnetism places this circle of phases at every point in space, the field records the rotation between neighbouring frames, and only what is invariant under those rotations can be measured.",
      s: "Hermann Weyl, 1929: the electron’s phase and the circle symmetry of electromagnetism" },
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
    osc: { w: "oscillations", t: "An oscillation is the shadow of a turn.",
      d: "A mass on a spring, a pendulum swinging a little and the current in an alternating circuit all rise and fall as the height of a point turning at steady speed, so physicists write them as <i>e</i><sup><i>iωt</i></sup> and measure its shadow. Charles Steinmetz made this the working method of electrical engineering.",
      s: "Charles Proteus Steinmetz, 1893; <i>The Feynman Lectures on Physics</i>, I.23" },
    amplitudes: { w: "quantum amplitudes", t: "Every way something can happen carries a turning arrow.",
      d: "Feynman described each way an event can happen as a small arrow that turns as time passes. The arrows of all the ways are added, the length of the sum gives the probability, and ways whose arrows point in opposite directions cancel.",
      s: "Richard Feynman, <i>QED: The Strange Theory of Light and Matter</i>, 1985" },
    quantization: { w: "quantization", t: "Only whole returns survive.",
      d: "Louis de Broglie gave the electron a wave and required it to fit around its orbit a whole number of times, coming back in step with itself. The orbits allowed are the ones where the turn closes, and their energies are the levels of the atom.",
      s: "Louis de Broglie, doctoral thesis, 1924" },
    relativity: { w: "relativity", t: "Changing speed is turning in spacetime.",
      d: "Passing from one moving frame to another is a rotation in which the circle’s functions are replaced by their hyperbolic twins. Written as rapidities, speeds combine the way angles add, and the spacetime interval stays fixed the way the radius stays fixed on the circle.",
      s: "Hermann Minkowski, “Space and Time”, 1908" },
    signals: { w: "signals", t: "Every signal is a sum of turns.",
      d: "Fourier showed that any repeating signal is a sum of turns at different speeds. A phone sends two bits at a time as one of four points on the circle, 00, 01, 11 and 10, which is the quadrant reading of the geometric bit.",
      s: "Joseph Fourier, 1822; quadrature phase-shift keying" },
    paradoxes: { w: "the paradoxes", t: "Each one takes a totality, or a sign about itself, as a finished thing.",
      d: "Russell’s set of all sets that do not contain themselves, Burali-Forti’s greatest ordinal and the liar all treat a whole that includes themselves as complete. Poincaré and Russell traced them to vicious circles, whatever involves all of a collection cannot be one of its members, and Kripke’s theory of truth leaves the liar ungrounded, with no truth value at all.",
      s: "Cesare Burali-Forti, 1897; Bertrand Russell, 1903; Henri Poincaré, 1906; Saul Kripke, 1975" }
  };

  window.GTC = { SCENES, S, DEFS, clearText: () => textCache.clear() };
})();
