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
    return { points, flows, labels };
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

  /* Space is time: two hands apart, and two ways to send the distance between them. Above, an
     agreed unit counted along it; below, a pulse crossing it while a clock runs. */
  SCENES.gspacetime = () => {
    const XL = -0.92, XR = 0.92, yU = 0.36, yT = -0.38, N = 6, points = [], meta = [];
    const add = (m, p) => { meta.push(m); points.push(p); };
    [XL, XR].forEach(x => { for (let k = 0; k < 44; k++) { const y = -0.66 + (1.4 * k) / 43; add({ kind: "fixed", x, y, a: 0.8 }, { x, y, c: "ice", a: 0.8, s: 0.9 }); } });
    for (let k = 0; k < 70; k++) { const x = XL + ((XR - XL) * k) / 69; add({ kind: "fixed", x, y: yU, a: 0.5 }, { x, y: yU, c: "brass", a: 0.5, s: 0.8 }); add({ kind: "fixed", x, y: yT, a: 0.3 }, { x, y: yT, c: "dim", a: 0.3, s: 0.75 }); }
    for (let n = 0; n <= N; n++) for (let k = 0; k < 7; k++) { const x = XL + ((XR - XL) * n) / N; add({ kind: "tick", n, x, y: yU - 0.05 + (0.1 * k) / 6 }, { x, y: yU, c: "brass", a: 0, s: 0.9 }); }
    for (let k = 0; k < 18; k++) add({ kind: "pulse", jx: gauss() * 0.02, jy: gauss() * 0.02 }, { x: XL, y: yT, c: "cyan", a: 1, s: 1.3 });
    for (let k = 0; k < 40; k++) add({ kind: "trail", u: k / 39 }, { x: XL, y: yT, c: "cyan", a: 0.6, s: 0.85 });
    const PER = 7, count = t => Math.min(N, Math.floor(((t % PER) / 3) * N)), cross = t => Math.min(1, Math.max(0, ((t % PER) - 3.5) / 2.5));
    const out = new Array(points.length);
    return {
      points, period: PER, stillT: 6.4,
      dynamic: t => {
        const c = count(t), f = cross(t), px = XL + (XR - XL) * f;
        meta.forEach((m, i) => {
          if (m.kind === "fixed") out[i] = { x: m.x, y: m.y, a: m.a };
          else if (m.kind === "tick") out[i] = { x: m.x, y: m.y, a: m.n <= c ? 0.95 : 0.15 };
          else if (m.kind === "pulse") out[i] = { x: px + m.jx, y: yT + m.jy, a: f > 0 ? 1 : 0.3 };
          else out[i] = { x: XL + (px - XL) * m.u, y: yT, a: f > 0 ? 0.55 : 0 };
        });
        return out;
      },
      labels: [
        { x: 0, y: yU + 0.22, html: "", cls: "slot c-brass", live: t => `${count(t)} units` },
        { x: 0, y: yU - 0.2, html: "count an agreed unit", cls: "example" },
        { x: 0, y: yT + 0.2, html: "", cls: "slot c-cyan", live: t => `light takes ${(cross(t) * 6.1).toFixed(1)} ns` },
        { x: 0, y: yT - 0.2, html: "time a movement", cls: "example" },
        { x: XL, y: -0.82, html: "your hands", cls: "tag" }, { x: XR, y: -0.82, html: "", cls: "tag" }
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
        { x: cx, y: cy - R - 0.2, html: "a rotation", cls: "tag" },
        { x: (x0 + x1) / 2, y: cy - R - 0.2, html: "seen from the side, a wave", cls: "tag" },
        { x: cx, y: cy + R + 0.2, html: "<i>e</i><sup><i>iωt</i></sup>", cls: "slot c-math" }
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

  /* The mirror of what the bit gave us: the circle at the centre, streaming out to what it
     already carries, each field lighting in turn. */
  SCENES.gives2 = () => {
    const R = 0.28, ITEMS = [
      { name: "physics", sym: "<i>e</i><sup><i>iωt</i></sup>", x: 0, y: 0.8 },
      { name: "mathematics", sym: "ℂ", x: 1.1, y: 0.3 },
      { name: "quantum computing", sym: "|<i>ψ</i>⟩", x: 0.72, y: -0.52 },
      { name: "matter", sym: "𝕆", x: -0.72, y: -0.52 },
      { name: "meaning", sym: "<i>A</i> = <i>A</i>", x: -1.1, y: 0.3 }
    ];
    const points = [
      ...S.arc(0, 0, R, 0, TAU * 0.995, 80, { c: "ice", a: 0.6, s: 0.85 }),
      ...S.line(-R, 0, R, 0, 20, { c: "dim", a: 0.4, s: 0.7 }), ...S.line(0, -R, 0, R, 20, { c: "dim", a: 0.4, s: 0.7 }),
      ...ITEMS.flatMap((it, k) => S.arc(it.x, it.y, 0.17, 0, TAU * 0.99, 52, { c: "ice", a: 0.75, s: 0.85, g: k }))
    ];
    const flows = [
      { n: 1, path: u => [R * Math.cos(u * TAU), R * Math.sin(u * TAU)], speed: 0.14, c: "gold", a: 1, s: 2.2 },
      ...ITEMS.map((it, k) => {
        const len = Math.hypot(it.x, it.y), sx = (it.x / len) * (R + 0.06), sy = (it.y / len) * (R + 0.06), ex = it.x - (it.x / len) * 0.21, ey = it.y - (it.y / len) * 0.21;
        return { n: 9, path: u => [sx + (ex - sx) * u, sy + (ey - sy) * u], speed: 0.3, c: "cyan", a: 0.9, s: 1, g: k };
      })
    ];
    return {
      points, flows,
      labels: [
        { x: 0, y: -R - 0.14, html: "the geometric bit", cls: "role c-math" },
        ...ITEMS.flatMap((it, k) => [
          { x: it.x, y: it.y, html: it.sym, cls: "slot c-math", g: k },
          { x: it.x, y: it.y - 0.3, html: it.name, cls: "example", g: k }
        ]),
        { x: 0, y: -1.04, html: "the reference, the rotation and the check, carried together", cls: "tag" }
      ]
    };
  };

  /* What else rests on identity: closure at the centre, a mark turning and returning, and the
     sciences that already check identity around it, each lighting in turn. */
  SCENES.closurefields = () => {
    const R = 0.26, ITEMS = [
      { name: "mathematics", sym: "<i>A</i> = <i>A</i>", x: 0, y: 0.8, c: "gold" },
      { name: "physics", sym: "conserved", x: 1.1, y: 0.3, c: "cyan" },
      { name: "biology", sym: "self", x: 0.72, y: -0.52, c: "coral" },
      { name: "perception", sym: "the same", x: -0.72, y: -0.52, c: "violet" },
      { name: "computing", sym: "match", x: -1.1, y: 0.3, c: "brass" }
    ];
    const points = [
      ...S.arc(0, 0, R, 0, TAU * 0.995, 80, { c: "mint", a: 0.6, s: 0.85 }),
      ...ITEMS.flatMap((it, k) => S.arc(it.x, it.y, 0.18, 0, TAU * 0.99, 54, { c: it.c, a: 0.55, s: 0.85, g: k }))
    ];
    const flows = [
      { n: 1, path: u => [R * Math.cos(u * TAU), R * Math.sin(u * TAU)], speed: 0.14, c: "gold", a: 1, s: 2.2 },
      ...ITEMS.map((it, k) => {
        const len = Math.hypot(it.x, it.y), sx = (it.x / len) * (R + 0.06), sy = (it.y / len) * (R + 0.06), ex = it.x - (it.x / len) * 0.22, ey = it.y - (it.y / len) * 0.22;
        return { n: 8, path: u => [ex + (sx - ex) * u, ey + (sy - ey) * u], speed: 0.3, c: it.c, a: 0.9, s: 1, g: k };
      })
    ];
    return {
      points, flows,
      labels: [
        { x: 0, y: -R - 0.14, html: "identity", cls: "role c-math" },
        ...ITEMS.flatMap((it, k) => [
          { x: it.x, y: it.y, html: it.sym, cls: "example", g: k },
          { x: it.x, y: it.y - 0.31, html: it.name, cls: "tag", g: k }
        ]),
        { x: 0, y: -1.04, html: "every science checks that something is still itself", cls: "tag" }
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
        { x: P[0].x, y: -0.44, html: "one perpendicular system", cls: "example" },
        { x: P[1].x, y: -0.44, html: "two, related to each other", cls: "example" },
        { x: P[2].x, y: -0.44, html: "no system holds", cls: "example c-coral" },
        { x: P[0].x, y: -0.62, html: "ℂ, ℍ", cls: "math" }, { x: P[1].x, y: -0.62, html: "𝕆", cls: "math" }, { x: P[2].x, y: -0.62, html: "𝕊", cls: "math c-coral" }
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

  /* What stays and what moves: above, a wave forward and the same wave backward (faint) add up to a
     standing wave (gold), the symmetry of the turn; below, two standing waves a quarter turn apart in
     space and in time add up to a travelling wave, its perpendicularity. */
  SCENES.waves = () => {
    const N = 80, X0 = -1.3, X1 = 1.3, k = TAU / 1.3, w = 1.7, A = 0.14;
    const panels = [
      { y: 0.5, f: [(x, t) => A * Math.cos(k * x - w * t), (x, t) => A * Math.cos(k * x + w * t)] },
      { y: -0.5, f: [(x, t) => A * Math.cos(k * x) * Math.cos(w * t), (x, t) => A * Math.sin(k * x) * Math.sin(w * t)] }
    ];
    const curves = [];
    panels.forEach(p => {
      curves.push({ p, fn: p.f[0], c: "cyan", a: 0.4, s: 0.75 }, { p, fn: p.f[1], c: "violet", a: 0.4, s: 0.75 });
      curves.push({ p, fn: (x, t) => p.f[0](x, t) + p.f[1](x, t), c: "gold", a: 1, s: 1.15 });
    });
    const points = [], meta = [];
    curves.forEach(cv => { for (let i = 0; i < N; i++) { const x = X0 + (X1 - X0) * i / (N - 1); meta.push({ cv, x }); points.push({ x, y: cv.p.y, c: cv.c, a: cv.a, s: cv.s }); } });
    /* the standing wave's nodes, where it never moves: cos kx = 0 */
    for (let n = -4; n <= 3; n++) { const x = (n + 0.5) * Math.PI / k; if (x > X0 && x < X1) { meta.push({ node: true, x }); points.push({ x, y: 0.5, c: "paper", a: 0.9, s: 1.7 }); } }
    const out = new Array(points.length);
    return {
      points, stillT: 0.55,
      dynamic: t => { meta.forEach((m, i) => { out[i] = m.node ? { x: m.x, y: 0.5, a: 0.9 } : { x: m.x, y: m.cv.p.y + m.cv.fn(m.x, t), a: m.cv.a }; }); return out; },
      labels: [
        { x: 0, y: 0.92, html: "symmetry", cls: "role c-violet" },
        { x: 0, y: 0.16, html: "forward and backward make a wave that stays", cls: "example" },
        { x: 0, y: -0.08, html: "perpendicularity", cls: "role" },
        { x: 0, y: -0.86, html: "a right angle apart makes a wave that moves", cls: "example" }
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

  /* 02: you, me and the lighter, joined into one relation */
  SCENES.trelation = () => {
    const A = [-1.9, -0.72], B = [1.9, -0.72], C = [0, 0.92];
    const edge = (P, Q) => u => [P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u];
    return tScene({
      shapes: [
        { pts: blobPts(...A, 0.03, 14), c: "brass", a: 1, s: 1.3, at: 2.2 },
        { pts: blobPts(...B, 0.03, 14), c: "cyan", a: 1, s: 1.3, at: 2.5 },
        { pts: blobPts(...C, 0.03, 14), c: "paper", a: 1, s: 1.3, at: 2.8 },
        { pts: segPts(...A, ...C, 70), c: "dim", a: 0.3, at: 3.1 }, { pts: segPts(...B, ...C, 70), c: "dim", a: 0.3, at: 3.1 }, { pts: segPts(...A, ...B, 90), c: "dim", a: 0.3, at: 3.1 }
      ],
      streams: [
        { path: edge(A, C), n: 7, speed: 0.12, c: "brass", ends: true, at: 3.4 }, { path: edge(B, C), n: 7, speed: 0.12, c: "cyan", ends: true, at: 3.4 },
        { path: edge(A, B), n: 6, speed: 0.08, c: "brass", ends: true, at: 3.8 }, { path: edge(B, A), n: 6, speed: 0.08, c: "cyan", ends: true, at: 3.8 }
      ],
      labels: [
        { x: A[0], y: A[1] - 0.14, html: "I", cls: "example reveal" }, { x: B[0], y: B[1] - 0.14, html: "you", cls: "example reveal" },
        { x: C[0], y: C[1] + 0.14, html: "the lighter", cls: "example reveal" }
      ]
    });
  };

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

  /* 06: one ring alone, and then a second arriving to link with it */
  SCENES.texist = () => {
    const R = 0.3, cy = -0.68, n = 120, pts = [];
    for (let k = 0; k < n; k++) pts.push({ x: 0, y: cy, c: "cyan", a: 0, s: 1 });
    for (let k = 0; k < n; k++) pts.push({ x: 0, y: cy, c: "coral", a: 0, s: 1 });
    return tScene({
      custom: {
        points: pts,
        update: (t, out, o) => {
          const yaw = 0.5 + t * 0.25, arrive = Math.min(1, Math.max(0, (t - 0.8) / 1.4)), ease = (1 - Math.cos(arrive * Math.PI)) / 2;
          const cx2 = R * 0.55 + 2.4 * (1 - ease);
          for (let k = 0; k < n; k++) {
            const a = k / n * TAU;
            let [X, Y, d] = view3(-R * 0.55 + R * Math.cos(a), R * Math.sin(a), 0, yaw, 0.25);
            out[o + k] = { x: X, y: cy + Y, a: (0.3 + 0.7 * d) * fadeIn(t, 0) };
            [X, Y, d] = view3(cx2 + R * Math.cos(a), 0, R * Math.sin(a), yaw, 0.25);
            out[o + n + k] = { x: X, y: cy + Y, a: (0.3 + 0.7 * d) * fadeIn(t, 0.8) };
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

  /* 08: paths leading out from the centre to nine places, the questions of the map */
  SCENES.tforward = () => {
    const nodes = Array.from({ length: 9 }, (_, k) => { const a = Math.PI / 2 - k / 9 * TAU; return [1.95 * Math.cos(a), 0.86 * Math.sin(a)]; });
    const COLS = ["cyan", "violet", "mint", "brass", "coral", "gold", "ice", "cyan", "violet"];
    return tScene({
      shapes: nodes.flatMap(([x, y], k) => [
        { pts: ringPts(x, y, 0.07, 26), c: COLS[k], a: 0.8, s: 0.9, at: k * 0.06 },
        { pts: segPts(x * 0.3, y * 0.3, x * 0.92, y * 0.92, 36), c: "dim", a: 0.2, at: k * 0.06 }
      ]),
      streams: nodes.map(([x, y], k) => ({ path: u => [x * (0.3 + 0.62 * u), y * (0.3 + 0.62 * u)], n: 5, speed: 0.16, c: COLS[k], ends: true, at: 0.3 + k * 0.06 }))
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

  /* A seed: the geometric bit's circle at the bottom, and a tree growing from it branch by branch,
     each branch ending in a small circle of its own. */
  SCENES.tseed = () => {
    const branches = [], P = 9, DEPTH = 6;
    const grow = (x, y, ang, len, d) => {
      const x2 = x + len * Math.cos(ang), y2 = y + len * Math.sin(ang);
      branches.push({ x, y, x2, y2, d });
      if (d < DEPTH) { grow(x2, y2, ang + 0.56, len * 0.72, d + 1); grow(x2, y2, ang - 0.5, len * 0.7, d + 1); }
    };
    grow(0, -0.62, Math.PI / 2, 0.42, 1);
    const pts = [], meta = [];
    branches.forEach(b => {
      const n = Math.max(4, Math.round(Math.hypot(b.x2 - b.x, b.y2 - b.y) * 60));
      for (let q = 0; q < n; q++) { pts.push({ x: b.x, y: b.y, c: b.d < 3 ? "mint" : "cyan", a: 0, s: 0.75 }); meta.push({ b, u: q / (n - 1) }); }
      if (b.d === DEPTH) for (let q = 0; q < 10; q++) { pts.push({ x: b.x2, y: b.y2, c: "cyan", a: 0, s: 0.8 }); meta.push({ b, leaf: q / 10 }); }
    });
    return tScene({
      shapes: [{ pts: ringPts(0, -0.74, 0.12, 44), c: "cyan", a: 0.95, s: 0.9, at: 0 }],
      labels: [{ x: 0, y: -0.98, html: "a seed", cls: "example" }],
      stillT: 7.5,
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P, fade = c > P - 0.8 ? (P - c) / 0.8 : 1;
          meta.forEach((m, k) => {
            const start = 0.4 + (m.b.d - 1) * 0.9, grown = Math.max(0, Math.min(1, (c - start) / 0.9));
            if (m.leaf !== undefined) { const a = m.leaf * TAU, r = 0.035 * Math.min(1, Math.max(0, (c - start - 0.9) / 0.5)); out[o + k] = { x: m.b.x2 + r * Math.cos(a), y: m.b.y2 + r * Math.sin(a), a: (r > 0 ? 0.9 : 0) * fade }; return; }
            const u = m.u * grown;
            out[o + k] = { x: m.b.x + (m.b.x2 - m.b.x) * u, y: m.b.y + (m.b.y2 - m.b.y) * u, a: (grown > 0 ? 0.75 : 0) * fade };
          });
        }
      }
    });
  };

  /* Two ways to break: above, the second stream is missing a record, a break in symmetry; below, two
     records have swapped places, a break in perpendicularity, and their links cross. */
  SCENES.cbreak = () => {
    const N = 9, X = k => -1.05 + 2.1 * k / (N - 1), rows = [[0.62, 0.36], [-0.34, -0.6]];
    const shapes = [], streams = [];
    const node = (x, y, c, a = 0.95) => shapes.push({ pts: blobPts(x, y, 0.016, 7), c, a, s: 1.2, at: 0 });
    const link = (x1, y1, x2, y2, c, a) => shapes.push({ pts: segPts(x1, y1 - 0.04, x2, y2 + 0.04, 16), c, a, s: 0.6, at: 0 });
    for (let k = 0; k < N; k++) node(X(k), rows[0][0], "ice");
    for (let k = 0, j = 0; k < N; k++) {
      if (k === 4) { shapes.push({ pts: ringPts(X(k), rows[0][1], 0.045, 18), c: "coral", a: 0.9, s: 0.8, at: 0 }); continue; }
      node(X(k), rows[0][1], "ice"); link(X(k), rows[0][0], X(k), rows[0][1], "dim", 0.35);
    }
    const order = [0, 1, 2, 6, 4, 5, 3, 7, 8];
    for (let k = 0; k < N; k++) { node(X(k), rows[1][0], "ice"); node(X(k), rows[1][1], k === 3 || k === 6 ? "cyan" : "ice"); }
    order.forEach((src, k) => { const moved = src !== k; link(X(src), rows[1][0], X(k), rows[1][1], moved ? "cyan" : "dim", moved ? 0.8 : 0.35);
      if (moved) streams.push({ path: u => [X(src) + (X(k) - X(src)) * u, rows[1][0] - 0.04 + (rows[1][1] - rows[1][0] + 0.08) * u], n: 3, speed: 0.35, c: "cyan", ends: true, at: 0 }); });
    streams.push({ path: u => [X(4), rows[0][0] - 0.04 + (rows[0][1] - rows[0][0] + 0.08) * u], n: 3, speed: 0.35, c: "coral", ends: true, at: 0 });
    return tScene({
      shapes, streams, stillT: 1.5,
      labels: [
        { x: 0, y: 0.9, html: "goes wrong in symmetry", cls: "role c-coral" }, { x: 0, y: 0.19, html: "a record exists on one side and not the other", cls: "example" },
        { x: 0, y: -0.07, html: "goes wrong in perpendicularity", cls: "role" }, { x: 0, y: -0.78, html: "a record is there, in the wrong place", cls: "example" }
      ]
    });
  };

  /* Physics already runs on it: a wheel turning in space, and the arrow of its angular momentum held
     still through the turning, sameness through change as physics measures it. */
  SCENES.tconserve = () => {
    const R = 0.62, cy = -0.02, pts = [];
    for (let k = 0; k < 110; k++) pts.push({ x: 0, y: cy, c: "cyan", a: 0, s: 0.85 });
    for (let s = 0; s < 6; s++) for (let q = 0; q < 12; q++) pts.push({ x: 0, y: cy, c: "ice", a: 0, s: 0.7 });
    for (let k = 0; k < 6; k++) pts.push({ x: 0, y: cy, c: "gold", a: 0, s: 1.5 - k * 0.12 });
    return tScene({
      shapes: [{ pts: segPts(0, cy, 0, cy + 0.82, 30), c: "gold", a: 0.95, s: 1.05, at: 0 },
               { pts: [[-0.05, cy + 0.74], [-0.025, cy + 0.78], [0, cy + 0.82], [0.025, cy + 0.78], [0.05, cy + 0.74]], c: "gold", a: 1, s: 1.2, at: 0 }],
      labels: [
        { x: 0.1, y: cy + 0.9, html: "angular momentum, unchanged", cls: "tag left c-math" },
        { x: 0, y: -0.86, html: "the wheel turns, and what is conserved stays the same", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const a0 = t * 0.9, tilt = 0.42; let i = o;
          const P = a => { const [X, Y, d] = view3(R * Math.cos(a), 0, R * Math.sin(a), 0, tilt); return [X, cy + Y, d]; };
          for (let k = 0; k < 110; k++) { const [x, y, d] = P(a0 + k / 110 * TAU); out[i++] = { x, y, a: 0.3 + 0.6 * d }; }
          for (let s = 0; s < 6; s++) for (let q = 0; q < 12; q++) { const a = a0 + s / 6 * TAU, u = (q + 1) / 12; const [X, Y] = view3(R * u * Math.cos(a), 0, R * u * Math.sin(a), 0, tilt); out[i++] = { x: X, y: cy + Y, a: 0.4 }; }
          for (let k = 0; k < 6; k++) { const [x, y, d] = P(a0 - k * 0.06); out[i++] = { x, y, a: (1 - k / 6) * (0.5 + 0.5 * d) }; }
        }
      }
    });
  };

  /* Where and how many: a line wrapped into a helix above a circle. A point climbs the helix; its
     shadow on the circle says where it is, the level says how many times around, the helix keeps the history. */
  SCENES.tcover = () => {
    const r = 0.46, N = 3, top = 0.66, cy0 = -0.66, P = 9, pts = [];
    const n = 270;
    for (let k = 0; k < n; k++) pts.push({ x: 0, y: 0, c: "violet", a: 0, s: 0.75 });
    for (let k = 0; k < 90; k++) pts.push({ x: 0, y: 0, c: "cyan", a: 0, s: 0.8 });
    for (let k = 0; k < 14; k++) pts.push({ x: 0, y: 0, c: "dim", a: 0, s: 0.6 });
    for (let k = 0; k < 8; k++) pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 1.6 });
    for (let k = 0; k < 8; k++) pts.push({ x: 0, y: 0, c: "cyan", a: 0, s: 1.6 });
    const turns = t => ((t % P) / P) * N;
    return tScene({
      stillT: 5.2,
      labels: [
        { x: 0.62, y: top - 0.05, html: "the line, wrapped: the history", cls: "tag left c-violet" },
        { x: 0.62, y: cy0, html: "the circle: where you are", cls: "tag left" },
        { x: 0, y: -1.02, html: "", cls: "example", live: t => { const k = Math.floor(turns(t)); return `${k} whole rotation${k === 1 ? "" : "s"}, and a point on the circle`; } }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const yaw = 0.3 + t * 0.12, tilt = 0.32, u = turns(t) / N; let i = o;
          const P3 = (a, y) => { const [X, Y, d] = view3(r * Math.cos(a), y, r * Math.sin(a), yaw, tilt); return [X, Y, d]; };
          const hy = v => top - 0.78 * (1 - v);
          for (let k = 0; k < n; k++) { const v = k / (n - 1), [x, y, d] = P3(v * N * TAU, hy(v)); out[i++] = { x, y, a: (v <= u ? 0.85 : 0.22) * (0.4 + 0.6 * d) }; }
          for (let k = 0; k < 90; k++) { const [x, y, d] = P3(k / 90 * TAU, cy0); out[i++] = { x, y, a: 0.3 + 0.5 * d }; }
          const [mx, my] = P3(u * N * TAU, hy(u)), [cx, cyy] = P3(u * N * TAU, cy0);
          for (let k = 0; k < 14; k++) { const f = k / 13; out[i++] = { x: mx + (cx - mx) * f, y: my + (cyy - my) * f, a: 0.4 }; }
          for (let k = 0; k < 8; k++) out[i++] = { x: mx + gauss() * 0.012, y: my + gauss() * 0.012, a: 1 };
          for (let k = 0; k < 8; k++) out[i++] = { x: cx + gauss() * 0.012, y: cyy + gauss() * 0.012, a: 1 };
        }
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


  /* Words as positions: a circle of words, each a direction from the centre. Pairs light up in turn,
     close in meaning and a small angle apart, or far in meaning and a wide angle apart. */
  SCENES.gembed = () => {
    const R = 0.66, cy = 0.02, W = [["apple", 0.25], ["pear", 0.55], ["love", 2.2], ["care", 2.5], ["you", 3.9], ["me", 4.25], ["radio", 5.35]];
    const PAIRS = [[0, 1, "close in meaning, a small angle"], [2, 3, "close in meaning, a small angle"], [0, 2, "far in meaning, a wide angle"], [4, 5, "close in meaning, a small angle"]], P = 3.2;
    const pts = [];
    W.forEach(() => { for (let q = 0; q < 24; q++) pts.push({ x: 0, y: cy, c: "dim", a: 0, s: 0.7 }); });
    for (let k = 0; k < 50; k++) pts.push({ x: 0, y: cy, c: "gold", a: 0, s: 1 });
    const cur = t => PAIRS[Math.floor(t / P) % PAIRS.length];
    return tScene({
      stillT: 1.6,
      shapes: [{ pts: ringPts(0, cy, R, 120), c: "ice", a: 0.3, s: 0.7, at: 0 },
               ...W.map(([n, a]) => ({ pts: blobPts(R * Math.cos(a), cy + R * Math.sin(a), 0.016, 8), c: "cyan", a: 0.95, s: 1.2, at: 0 }))],
      labels: [
        ...W.map(([n, a]) => ({ x: (R + 0.17) * Math.cos(a), y: cy + (R + 0.12) * Math.sin(a), html: n, cls: "example" })),
        { x: 0, y: -0.98, html: "", cls: "example", live: t => cur(t)[2] }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const [i, j] = cur(t), f = Math.min(1, (t % P) / 0.6); let k = o;
          W.forEach(([n, a], w) => { const on = w === i || w === j; for (let q = 0; q < 24; q++) { const u = q / 23; out[k++] = { x: R * u * Math.cos(a), y: cy + R * u * Math.sin(a), a: on ? 0.85 * f : 0.12, c: on ? "cyan" : "dim" }; } });
          const a0 = W[i][1], a1 = W[j][1];
          for (let q = 0; q < 50; q++) { const a = a0 + (a1 - a0) * (q / 49) * f; out[k++] = { x: 0.2 * Math.cos(a), y: cy + 0.2 * Math.sin(a), a: 0.95 }; }
        }
      }
    });
  };

  /* Where it strains: on the left a meaning estimated from statistics, a cloud of guesses that jitters
     and drifts; on the right a meaning held by rotation and return, a mark that comes back to its reference. */
  SCENES.gstrain = () => {
    const L = [-0.72, 0.05], Rr = [0.72, 0.05], r = 0.42, N = 70, pts = [], seeds = [];
    for (let k = 0; k < N; k++) { seeds.push([gauss(), gauss(), Math.random() * TAU, 0.6 + Math.random()]); pts.push({ x: L[0], y: L[1], c: "brass", a: 0, s: 0.95 }); }
    for (let k = 0; k < 10; k++) pts.push({ x: Rr[0], y: Rr[1] + r, c: "gold", a: 0, s: 1.6 - k * 0.1 });
    return tScene({
      stillT: 2.4,
      shapes: [{ pts: ringPts(Rr[0], Rr[1], r, 100), c: "cyan", a: 0.5, s: 0.8, at: 0 },
               { pts: blobPts(Rr[0], Rr[1] + r, 0.014, 6), c: "paper", a: 0.9, s: 1.1, at: 0 }],
      labels: [
        { x: L[0], y: L[1] - r - 0.2, html: "learned from statistics", cls: "tag" }, { x: L[0], y: L[1] - r - 0.34, html: "no reference to return to", cls: "example" },
        { x: Rr[0], y: Rr[1] - r - 0.2, html: "rotation and return", cls: "tag" }, { x: Rr[0], y: Rr[1] - r - 0.34, html: "checked against its reference", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const dx = 0.12 * Math.sin(t * 0.37), dy = 0.08 * Math.cos(t * 0.29);
          for (let k = 0; k < N; k++) { const [gx, gy, ph, w] = seeds[k]; out[o + k] = { x: L[0] + dx + gx * 0.16 + 0.03 * Math.sin(t * w * 3 + ph), y: L[1] + dy + gy * 0.16 + 0.03 * Math.cos(t * w * 3 + ph), a: 0.7 }; }
          const m = Math.PI / 2 - t * 1.1;
          for (let k = 0; k < 10; k++) { const q = m + k * 0.05; out[o + N + k] = { x: Rr[0] + r * Math.cos(q), y: Rr[1] + r * Math.sin(q), a: 1 - k / 10 }; }
        }
      }
    });
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

  /* Identity as a check: three different things placed round the circle are carried through a full
     rotation together, and each lands back on itself, lit as it returns. */
  SCENES.greturn = () => {
    const R = 0.6, cy = 0.02, P = 6, MOVE = 4;
    const tri = Array.from({ length: 30 }, (_, k) => { const s = Math.floor(k / 10), u = (k % 10) / 10, A = [[0, 0.1], [-0.09, -0.06], [0.09, -0.06]], a = A[s], b = A[(s + 1) % 3]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; });
    const sq = Array.from({ length: 32 }, (_, k) => { const s = Math.floor(k / 8), u = (k % 8) / 8, A = [[-0.08, -0.08], [0.08, -0.08], [0.08, 0.08], [-0.08, 0.08]], a = A[s], b = A[(s + 1) % 4]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; });
    const sp = Array.from({ length: 30 }, (_, k) => { const u = k / 29, a = u * 2.2 * TAU, r = 0.02 + 0.08 * u; return [r * Math.cos(a), r * Math.sin(a)]; });
    const shapes = [[tri, Math.PI / 2, "coral"], [sq, Math.PI / 2 + TAU / 3, "cyan"], [sp, Math.PI / 2 + 2 * TAU / 3, "violet"]];
    const pts = [], meta = [];
    shapes.forEach(([pp, a0, c], s) => { pp.forEach(p => { pts.push({ x: 0, y: cy, c, a: 0, s: 1 }); meta.push({ s, p, a0 }); }); for (let k = 0; k < 30; k++) { pts.push({ x: 0, y: cy, c: "gold", a: 0, s: 0.9 }); meta.push({ s, ring: k / 30 * TAU, a0 }); } });
    const ang = t => { const c = t % P; return c < MOVE ? TAU * (1 - Math.cos(Math.PI * c / MOVE)) / 2 : TAU; };
    return tScene({
      stillT: 4.6,
      shapes: [{ pts: ringPts(0, cy, R, 120), c: "ice", a: 0.25, s: 0.7, at: 0 }, { pts: blobPts(0, cy, 0.014, 8), c: "paper", a: 0.9, s: 1.1, at: 0 }],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const a = ang(t), c = t % P, glow = c >= MOVE ? Math.max(0, 1 - (c - MOVE) / (P - MOVE)) : 0;
          meta.forEach((m, k) => {
            const th = m.a0 + a, cx = R * Math.cos(th), y0 = cy + R * Math.sin(th);
            if (m.ring !== undefined) { const r = 0.13 + 0.06 * (1 - glow); out[o + k] = { x: R * Math.cos(m.a0) + r * Math.cos(m.ring), y: cy + R * Math.sin(m.a0) + r * Math.sin(m.ring), a: 0.9 * glow }; }
            else out[o + k] = { x: cx + m.p[0], y: y0 + m.p[1], a: 0.95 };
          });
        }
      }
    });
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

  /* Science almost does it: every field checks identity against a reference of its own, each landing
     near the shared centre and none exactly on it; the dashed centre is the one law they could all share. */
  SCENES.galmost = () => {
    const F = [["mathematics", "gold"], ["physics", "cyan"], ["engineering", "brass"], ["computing", "violet"], ["biology", "coral"]];
    const shapes = [{ pts: ringPts(0, 0.02, 0.18, 70), c: "paper", a: 0.25, s: 0.6, at: 0 }, { pts: blobPts(0, 0.02, 0.012, 6), c: "gold", a: 0.9, s: 1.2, at: 0 }];
    const streams = [], labels = [];
    F.forEach(([n, c], k) => {
      const a = Math.PI / 2 - k / F.length * TAU, x = 1.15 * Math.cos(a), y = 0.02 + 0.78 * Math.sin(a);
      const off = [0.11 * Math.cos(a + 1.1), 0.02 + 0.11 * Math.sin(a + 1.1)];
      shapes.push({ pts: ringPts(x, y, 0.09, 30), c, a: 0.8, s: 0.8, at: 0 });
      shapes.push({ pts: ringPts(off[0], off[1], 0.03, 14), c, a: 0.9, s: 0.8, at: 0 });
      const sx = x - 0.12 * Math.cos(a), sy = y - 0.12 * Math.sin(a);
      streams.push({ path: u => [sx + (off[0] - sx) * u, sy + (off[1] - sy) * u], n: 5, speed: 0.3, c, ends: true, at: 0 });
      labels.push({ x, y: y >= 0.02 ? y + 0.16 : y - 0.16, html: n, cls: "tag" });
    });
    labels.push({ x: 0, y: -0.98, html: "each field checks against a reference of its own, almost the same one", cls: "example" });
    return tScene({ shapes, streams, labels, stillT: 2 });
  };

  /* One object, two readings: a wheel turning in space, and beside it the same rotation written in
     the complex plane as e^{iθ}, the two marks joined so they move together. */
  SCENES.gtwoviews = () => {
    const W = [-0.78, 0.04], P = [0.78, 0.04], R = 0.42, pts = [], meta = [];
    for (let k = 0; k < 90; k++) { pts.push({ x: 0, y: 0, c: "brass", a: 0, s: 0.85 }); meta.push({ w: "rim", u: k / 90 }); }
    for (let s2 = 0; s2 < 6; s2++) for (let q = 0; q < 8; q++) { pts.push({ x: 0, y: 0, c: "brass", a: 0, s: 0.6 }); meta.push({ w: "spoke", s: s2, u: (q + 1) / 8 }); }
    for (let k = 0; k < 8; k++) { pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 1.5 }); meta.push({ w: "wmark" }); }
    for (let k = 0; k < 8; k++) { pts.push({ x: 0, y: 0, c: "gold", a: 0, s: 1.5 }); meta.push({ w: "pmark" }); }
    for (let k = 0; k < 24; k++) { pts.push({ x: 0, y: 0, c: "cyan", a: 0, s: 0.9 }); meta.push({ w: "radius", u: k / 23 }); }
    for (let k = 0; k < 30; k++) { pts.push({ x: 0, y: 0, c: "dim", a: 0, s: 0.6 }); meta.push({ w: "link", u: k / 29 }); }
    const tilt = 1.05;
    return tScene({
      stillT: 1.4,
      shapes: [
        { pts: ringPts(P[0], P[1], R, 110), c: "cyan", a: 0.45, s: 0.75, at: 0 },
        { pts: segPts(P[0] - R - 0.12, P[1], P[0] + R + 0.12, P[1], 40), c: "dim", a: 0.4, s: 0.6, at: 0 },
        { pts: segPts(P[0], P[1] - R - 0.12, P[0], P[1] + R + 0.12, 40), c: "dim", a: 0.4, s: 0.6, at: 0 }
      ],
      labels: [
        { x: W[0], y: -0.62, html: "a thing that turns", cls: "tag" },
        { x: P[0], y: -0.62, html: "the same rotation, written down", cls: "tag" },
        { x: P[0] + R + 0.2, y: P[1] - 0.08, html: "1", cls: "math" }, { x: P[0] + 0.08, y: P[1] + R + 0.16, html: "<i>i</i>", cls: "math" },
        { x: 0, y: -0.92, html: "physics is the turning, mathematics is <i>e</i><sup><i>iθ</i></sup>", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const th = t * 0.8;
          const wp = a => { const [X, Y] = view3(R * Math.cos(a), 0, R * Math.sin(a), 0, tilt); return [W[0] + X, W[1] + Y]; };
          const mw = wp(th), mp = [P[0] + R * Math.cos(th), P[1] + R * Math.sin(th)];
          meta.forEach((m, k) => {
            let x, y, a = 0.85;
            if (m.w === "rim") [x, y] = wp(m.u * TAU);
            else if (m.w === "spoke") { const q = wp(th + m.s / 6 * TAU); x = W[0] + (q[0] - W[0]) * m.u; y = W[1] + (q[1] - W[1]) * m.u; a = 0.5; }
            else if (m.w === "wmark") { x = mw[0] + gauss() * 0.012; y = mw[1] + gauss() * 0.012; a = 1; }
            else if (m.w === "pmark") { x = mp[0] + gauss() * 0.012; y = mp[1] + gauss() * 0.012; a = 1; }
            else if (m.w === "radius") { x = P[0] + (mp[0] - P[0]) * m.u; y = P[1] + (mp[1] - P[1]) * m.u; a = 0.8; }
            else { x = mw[0] + (mp[0] - mw[0]) * m.u; y = mw[1] + (mp[1] - mw[1]) * m.u; a = 0.3; }
            out[o + k] = { x, y, a };
          });
        }
      }
    });
  };

  /* Physics computed from rotations: a field of small rotations, each turning toward its neighbours
     while noise fades, so domains form and settle and the defects between them stay closed. */
  SCENES.gfield = () => {
    const NX = 15, NY = 9, SP = 0.17, F = 260, P = 11, x0 = -((NX - 1) * SP) / 2, y0 = -((NY - 1) * SP) / 2 + 0.06;
    let th = Array.from({ length: NX * NY }, () => Math.random() * TAU);
    const frames = [th.slice()];
    for (let f = 1; f < F; f++) {
      const noise = 0.9 * Math.max(0, 1 - f / (F * 0.7)), nx = th.slice();
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        let sx = 0, sy = 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => { const a = i + di, b = j + dj; if (a >= 0 && a < NX && b >= 0 && b < NY) { sx += Math.cos(th[b * NX + a]); sy += Math.sin(th[b * NX + a]); } });
        const target = Math.atan2(sy, sx), cur = th[j * NX + i];
        let d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
        nx[j * NX + i] = cur + 0.25 * d + noise * (Math.random() - 0.5);
      }
      th = nx; frames.push(th.slice());
    }
    const pts = [], meta = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) for (let q = 0; q < 5; q++) { pts.push({ x: 0, y: 0, c: q === 4 ? "gold" : "cyan", a: 0, s: q === 4 ? 1.1 : 0.7 }); meta.push({ i, j, q }); }
    return tScene({
      stillT: 9.5,
      labels: [{ x: 0, y: -0.98, html: "rotations, each turning toward its neighbours, settle into domains", cls: "example" }],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const fr = frames[Math.min(F - 1, Math.floor(((t % P) / P) * F * 1.15))];
          meta.forEach((m, k) => {
            const a = fr[m.j * NX + m.i], cx = x0 + m.i * SP, cy = y0 + m.j * SP, u = (m.q - 2) / 2 * 0.065;
            out[o + k] = { x: cx + u * Math.cos(a), y: cy + u * Math.sin(a), a: m.q === 4 ? 1 : 0.7, c: Math.cos(a) > 0 ? "cyan" : "violet" };
          });
        }
      }
    });
  };

  /* Everything we touch is information: one object in the middle, and every way we meet it, light to
     an eye, heat to a hand, a push, a reading on an instrument, is something carried from it to us. */
  SCENES.ginfo = () => {
    const O = [0, 0.04], R = [[-0.95, 0.5, "light", "gold"], [0.95, 0.5, "heat", "coral"], [-0.95, -0.45, "a push", "cyan"], [0.95, -0.45, "an instrument", "violet"]];
    const shapes = [{ pts: ringPts(O[0], O[1], 0.16, 60), c: "paper", a: 0.8, s: 0.9, at: 0 }, { pts: blobPts(O[0], O[1], 0.03, 16), c: "paper", a: 0.9, s: 1, at: 0 }];
    const streams = [], labels = [{ x: O[0], y: O[1] - 0.3, html: "the thing itself", cls: "tag" }];
    R.forEach(([x, y, n, c]) => {
      shapes.push({ pts: ringPts(x, y, 0.08, 26), c, a: 0.8, s: 0.8, at: 0 });
      const d = Math.hypot(x - O[0], y - O[1]), ux = (x - O[0]) / d, uy = (y - O[1]) / d;
      const sx = O[0] + ux * 0.2, sy = O[1] + uy * 0.2, ex = x - ux * 0.12, ey = y - uy * 0.12;
      streams.push({ path: u => [sx + (ex - sx) * u, sy + (ey - sy) * u], n: 6, speed: 0.32, c, ends: true, at: 0 });
      labels.push({ x, y: y > 0 ? y + 0.17 : y - 0.17, html: n, cls: "example" });
    });
    labels.push({ x: 0, y: -0.95, html: "every way we meet a thing is something carried from it to us", cls: "example" });
    return tScene({ shapes, streams, labels, stillT: 2 });
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

  /* Side by side: three rotations running on their own add up to one signal, and the whole signal is
     one point on a sphere of fixed power. Noise blurs each sent point into a small sphere; Shannon's
     capacity counts how many small spheres fit in the large one. */
  SCENES.gpacking = () => {
    const CX = -1.24, CY = [0.5, 0.14, -0.22], RS = 0.1, RATE = [1, 2, 3], AMP = [0.11, 0.07, 0.05], PH = [0, 1.1, 2.3], w = 1.25;
    const TX0 = -1.04, TX1 = -0.2, TY = 0.14, SPAN = 5, BX = 0.74, BY = 0.12, BR = 0.5, r = 0.084, d = 0.174;
    const sig = t => AMP.reduce((s, A, k) => s + A * Math.sin(RATE[k] * w * t + PH[k]), 0);
    const cells = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const x = d * (i + j / 2), y = d * j * Math.sqrt(3) / 2; if (Math.hypot(x, y) <= BR - r - 0.01) cells.push([BX + x, BY + y]); }
    const ORDER = [7, 2, 15, 0, 11, 4, 17, 9, 13, 5], SLOT = 1.9, noise = ORDER.map(() => { const a = Math.random() * TAU, q = 0.25 + 0.4 * Math.random(); return [q * r * Math.cos(a), q * r * Math.sin(a)]; });
    const pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    CY.forEach((y, k) => { for (let q = 0; q < 30; q++) add({ kind: "ring", k, b: q / 30 * TAU }, { x: CX, y, c: "dim", a: 0.5, s: 0.6 }); for (let q = 0; q < 6; q++) add({ kind: "rot", k, j: [gauss() * 0.008, gauss() * 0.008] }, { x: CX, y, c: "gold", a: 1, s: 1.1 }); });
    for (let q = 0; q < 90; q++) add({ kind: "trace", u: q / 89 }, { x: TX0, y: TY, c: "gold", a: 0.6, s: 0.65 });
    for (let q = 0; q < 140; q++) add({ kind: "big", b: q / 140 * TAU }, { x: BX, y: BY, c: "ice", a: 0.4, s: 0.65 });
    cells.forEach((cc, ci) => { for (let q = 0; q < 20; q++) add({ kind: "cell", ci, b: q / 20 * TAU }, { x: cc[0], y: cc[1], c: "cyan", a: 0.35, s: 0.55 }); add({ kind: "dot", ci }, { x: cc[0], y: cc[1], c: "cyan", a: 0.5, s: 0.7 }); });
    for (let q = 0; q < 7; q++) add({ kind: "fly", q }, { x: TX1, y: TY, c: "gold", a: 0, s: 1 });
    for (let q = 0; q < 7; q++) add({ kind: "got", j: [gauss() * 0.009, gauss() * 0.009] }, { x: BX, y: BY, c: "paper", a: 0, s: 1.05 });
    return tScene({
      stillT: 7.0,
      labels: [
        { x: CX, y: -0.48, html: "rotations side by side", cls: "example" },
        { x: (TX0 + TX1) / 2, y: -0.2, html: "add up to one signal", cls: "example" },
        { x: BX, y: BY - BR - 0.13, html: "each signal is one point on a sphere", cls: "example" },
        { x: BX, y: BY - BR - 0.27, html: "and noise blurs it into a small sphere", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const slot = Math.floor(t / SLOT), ph = t - slot * SLOT, cur = ORDER[slot % ORDER.length], nz = noise[slot % ORDER.length], target = cells[cur];
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "ring": v = { x: CX + RS * Math.cos(m.b), y: CY[m.k] + RS * Math.sin(m.b), a: 0.5 }; break;
              case "rot": { const a = RATE[m.k] * w * t + PH[m.k]; v = { x: CX + RS * Math.cos(a) + m.j[0], y: CY[m.k] + RS * Math.sin(a) + m.j[1], a: 1 }; break; }
              case "trace": { const tau = (1 - m.u) * SPAN; v = { x: TX0 + (TX1 - TX0) * m.u, y: TY + sig(t - tau), a: 0.2 + 0.6 * m.u }; break; }
              case "big": v = { x: BX + BR * Math.cos(m.b), y: BY + BR * Math.sin(m.b), a: 0.4 }; break;
              case "cell": { const lit = m.ci === cur && ph > 0.7; const [x, y] = cells[m.ci]; v = { x: x + r * Math.cos(m.b), y: y + r * Math.sin(m.b), a: lit ? 0.95 : 0.3, c: lit ? "brass" : "cyan" }; break; }
              case "dot": { const [x, y] = cells[m.ci]; v = { x, y, a: m.ci === cur && ph > 0.7 ? 0.95 : 0.45, c: m.ci === cur && ph > 0.7 ? "brass" : "cyan" }; break; }
              case "fly": { const u = Math.min(1, Math.max(0, (ph - m.q * 0.05) / 0.6)), x0 = TX1, y0 = TY + sig(t); v = { x: x0 + (target[0] + nz[0] - x0) * u, y: y0 + (target[1] + nz[1] - y0) * u + Math.sin(Math.PI * u) * 0.12, a: u > 0 && u < 1 ? 0.9 : 0 }; break; }
              default: v = { x: target[0] + nz[0] + m.j[0], y: target[1] + nz[1] + m.j[1], a: ph > 0.6 ? 1 : 0 };
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* Noise as a blur and noise as a direction. Left, Shannon: a sent point and the received points
     scattered round it at random, so only the radius of the cloud can be known. Right, closure: the
     gap between two composed streams is one rotation; its scalar part is the brightness at the centre
     (is the record there?) and its vector part an arrow among three axes (where did it go?). The two
     cases alternate: a record missing dims the light, a record moved leaves the light and points. */
  SCENES.gblur = () => {
    const L = [-0.8, 0.08], C = [0.74, 0.08], P = 9, AX = 0.56, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const rnd = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
    const g = (a, b) => (rnd(a, b) + rnd(a + 7, b) + rnd(a + 13, b) - 1.5) * 1.15;
    for (let q = 0; q < 10; q++) add({ kind: "sent", j: [gauss() * 0.012, gauss() * 0.012] }, { x: L[0], y: L[1], c: "gold", a: 1, s: 1.25 });
    for (let k = 0; k < 80; k++) add({ kind: "cloud", k }, { x: L[0], y: L[1], c: "cyan", a: 0.7, s: 0.75 });
    for (let q = 0; q < 70; q++) add({ kind: "ring", b: q / 70 * TAU }, { x: L[0], y: L[1], c: "dim", a: 0.45, s: 0.55 });
    const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], AC = ["coral", "mint", "cyan"];
    E.forEach((e, i) => { for (let q = 0; q < 34; q++) add({ kind: "axis", i, u: q / 33 - 0.5 }, { x: C[0], y: C[1], c: AC[i], a: 0.5, s: 0.55 }); });
    for (let q = 0; q < 22; q++) add({ kind: "light", j: [gauss() * 0.028, gauss() * 0.028] }, { x: C[0], y: C[1], c: "paper", a: 1, s: 1.4 });
    for (let q = 0; q < 40; q++) add({ kind: "halo", b: q / 40 * TAU }, { x: C[0], y: C[1], c: "paper", a: 0.5, s: 0.6 });
    for (let q = 0; q < 30; q++) add({ kind: "arrow", u: (q + 1) / 30 }, { x: C[0], y: C[1], c: "gold", a: 0, s: q > 26 ? 1.4 : 0.85 });
    const dir = (() => { const d = [0.8, 0.5, 0.25], n = Math.hypot(...d); return d.map(v => v / n * 0.42); })();
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    const state = t => { const c = t % P; if (c < P / 2) { const k = sm((c - 0.8) / 0.8) * (c < P / 2 - 0.5 ? 1 : sm((P / 2 - c) / 0.5)); return { W: 1 - 0.8 * k, A: 0.6 * k, miss: true }; } return { W: 1, A: sm((c - P / 2 - 0.8) / 0.8) * (c > P - 0.5 ? sm((P - c) / 0.5) : 1), miss: false }; };
    const yaw = t => 0.6 + t * 0.25, pr = (v, t) => view3(v[0], v[1], v[2], yaw(t), 0.45);
    return tScene({
      stillT: 6.6,
      labels: [
        { x: L[0], y: 0.64, html: "Shannon", cls: "role" }, { x: C[0], y: 0.64, html: "closure", cls: "role" },
        { x: L[0], y: -0.42, html: "random: only its size can be known", cls: "example" },
        { x: C[0], y: -0.42, html: "", cls: "example", live: t => state(t).miss ? "missing: the light at the centre changes" : "moved: the light holds, and only the direction changes" },
        ...["R", "G", "B"].map((h, i) => ({ x: 0, y: 0, html: h, cls: "tag", at: t => { const [x, y] = pr(E[i].map(v => v * (AX / 2 + 0.05)), t); return [C[0] + x, C[1] + y]; } }))
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const st = state(t), tip = dir.map(v => v * st.A);
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "sent": v = { x: L[0] + m.j[0], y: L[1] + m.j[1], a: 1 }; break;
              case "cloud": { const n = Math.floor(t / 0.35 + m.k * 0.37); v = { x: L[0] + g(m.k, n) * 0.11, y: L[1] + g(m.k + 101, n) * 0.11, a: 0.65 }; break; }
              case "ring": v = { x: L[0] + 0.27 * Math.cos(m.b), y: L[1] + 0.27 * Math.sin(m.b), a: 0.45 }; break;
              case "axis": { const [x, y, d] = pr(E[m.i].map(e => e * m.u * AX), t); v = { x: C[0] + x, y: C[1] + y, a: 0.2 + 0.45 * d }; break; }
              case "light": v = { x: C[0] + m.j[0], y: C[1] + m.j[1], a: 0.12 + 0.88 * st.W }; break;
              case "halo": v = { x: C[0] + 0.09 * Math.cos(m.b), y: C[1] + 0.09 * Math.sin(m.b), a: 0.55 * st.W }; break;
              default: { const [x, y] = pr(tip.map(e => e * m.u), t); v = { x: C[0] + x, y: C[1] + y, a: st.A > 0.02 ? 0.95 : 0 }; }
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* The noise theorem as a prism: a sent and a received stream of the same records, each composed into
     one rotation; the gap between the two enters a prism and splits into the existence channel (W) and
     the three position channels (R, G, B). A missing record lights only W; two swapped records light
     only R, G and B. */
  SCENES.gprism = () => {
    const N = 9, X0 = -1.38, DX = 0.105, YA = 0.42, YB = 0.1, PA = [-0.2, YA], PB = [-0.2, YB], PR = [0.38, 0.26], P = 10;
    const OUT = [{ y: 0.58, c: "paper", w: true }, { y: 0.2, c: "coral" }, { y: 0.04, c: "mint" }, { y: -0.12, c: "cyan" }], TX = 1.12;
    const pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    const RC = ["gold", "coral", "mint", "cyan", "violet", "ice", "brass", "gold", "coral"];
    for (let side = 0; side < 2; side++) for (let k = 0; k < N; k++) for (let q = 0; q < 6; q++) add({ kind: "rec", side, k, j: [gauss() * 0.011, gauss() * 0.011] }, { x: X0 + k * DX, y: side ? YB : YA, c: RC[k], a: 1, s: 1 });
    for (let q = 0; q < 14; q++) add({ kind: "hole", b: q / 14 * TAU }, { x: X0 + 5 * DX, y: YB, c: "dim", a: 0, s: 0.55 });
    [PA, PB].forEach((pp, side) => { for (let q = 0; q < 22; q++) add({ kind: "prod", side, b: q / 22 * TAU }, { x: pp[0], y: pp[1], c: "ice", a: 0.7, s: 0.6 }); });
    const tri = [[PR[0] - 0.1, PR[1] - 0.1], [PR[0] - 0.1, PR[1] + 0.12], [PR[0] + 0.1, PR[1] + 0.01]];
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => { for (let q = 0; q < 18; q++) { const u = q / 18; add({ kind: "fixed", x: tri[a][0] + (tri[b][0] - tri[a][0]) * u, y: tri[a][1] + (tri[b][1] - tri[a][1]) * u }, { x: PR[0], y: PR[1], c: "paper", a: 0.75, s: 0.65 }); } });
    const caseOf = t => (t % P) < P / 2 ? 0 : 1;
    const level = (o, t) => { const c = t % P, cs = caseOf(t), on = sm(((c % (P / 2)) - 1.2) / 0.8); if (cs === 0) return o.w ? 0.25 + 0.7 * on : 0.12 + 0.3 * on; return o.w ? 0.08 : 0.25 + 0.7 * on; };
    const streams = [
      ...[PA, PB].map((pp, side) => ({ path: u => [X0 + N * DX - 0.04 + (pp[0] - 0.035 - (X0 + N * DX - 0.04)) * u, pp[1]], n: 3, speed: 0.5, c: "ice", ends: true, s: 0.8 })),
      ...[PA, PB].map(pp => ({ path: u => [pp[0] + 0.04 + (PR[0] - 0.12 - pp[0] - 0.04) * u, pp[1] + (PR[1] - pp[1]) * u], n: 4, speed: 0.45, c: "paper", ends: true, s: 0.85 }))
    ];
    OUT.forEach((o, i) => { for (let q = 0; q < 34; q++) add({ kind: "beam", i, u: q / 33 }, { x: PR[0], y: PR[1], c: o.c, a: 0, s: o.w ? 1 : 0.85 }); });
    return tScene({
      stillT: 7.6,
      streams,
      labels: [
        { x: X0 + 0.42, y: YA + 0.13, html: "sent", cls: "tag" }, { x: X0 + 0.42, y: YB - 0.13, html: "received", cls: "tag" },
        { x: PA[0], y: YA + 0.13, html: "composed", cls: "tag" },
        { x: TX + 0.06, y: OUT[0].y, html: "W · is it there", cls: "fword left" },
        { x: TX + 0.06, y: OUT[2].y, html: "R G B · where it went", cls: "fword left" },
        { x: -0.1, y: -0.42, html: "", cls: "example", live: t => caseOf(t) ? "two records swapped: the existence channel stays exactly dark" : "one record missing: the existence channel lights" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P, cs = caseOf(t), sw = cs ? sm(((c - P / 2) - 0.2) / 0.8) : 0, miss = cs ? 0 : sm((c - 0.2) / 0.6);
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "rec": {
                let x = X0 + m.k * DX, y = m.side ? YB : YA, a = 1;
                if (m.side && cs === 0 && m.k === 5) a = 1 - miss;
                if (m.side && cs === 1 && (m.k === 2 || m.k === 6)) { const to = X0 + (m.k === 2 ? 6 : 2) * DX; x = x + (to - x) * sw; y += Math.sin(Math.PI * sw) * (m.k === 2 ? 0.08 : -0.08); }
                v = { x: x + m.j[0], y: y + m.j[1], a }; break;
              }
              case "hole": v = { x: X0 + 5 * DX + 0.035 * Math.cos(m.b), y: YB + 0.035 * Math.sin(m.b), a: cs === 0 ? 0.6 * miss : 0 }; break;
              case "prod": { const pp = m.side ? PB : PA; v = { x: pp[0] + 0.045 * Math.cos(m.b), y: pp[1] + 0.045 * Math.sin(m.b), a: 0.7 }; break; }
              case "fixed": v = { x: m.x, y: m.y, a: 0.75 }; break;
              default: { const ob = OUT[m.i], sx = PR[0] + 0.1, sy = PR[1] + 0.01, flow = (m.u + t * 0.35) % 1; v = { x: sx + (TX - sx) * flow, y: sy + (ob.y - sy) * flow, a: level(ob, t) * (0.4 + 0.6 * Math.sin(Math.PI * flow)) }; }
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* The ladder of fibrations: two points over a circle (the Möbius double cover), a circle over a
     sphere (Hopf, Dirac's monopole), a three-sphere over a four-sphere (the instanton) and a
     seven-sphere over an eight-sphere, the only four, as Adams proved. */
  SCENES.gladder = () => {
    const X = [-1.08, -0.36, 0.36, 1.08], FY = 0.42, BYc = -0.12, BRr = 0.17, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const COL = ["ice", "cyan", "mint", "violet"];
    const fib = n => Array.from({ length: n }, (_, k) => { const y = 1 - 2 * (k + 0.5) / n, rr = Math.sqrt(1 - y * y), a = k * 2.39996; return [rr * Math.cos(a), y, rr * Math.sin(a)]; });
    for (let q = 0; q < 70; q++) add({ kind: "bcirc", b: q / 70 * TAU }, { x: X[0], y: BYc, c: COL[0], a: 0.5, s: 0.6 });
    [1, 2, 3].forEach(col => fib(col === 1 ? 90 : 110).forEach(p => add({ kind: "bsph", col, p }, { x: X[col], y: BYc, c: COL[col], a: 0.5, s: 0.6 })));
    for (let col = 0; col < 4; col++) for (let q = 0; q < 8; q++) add({ kind: "bpt", col, j: [gauss() * 0.01, gauss() * 0.01] }, { x: X[col], y: BYc, c: "gold", a: 1, s: 1.1 });
    for (let col = 0; col < 4; col++) for (let q = 0; q < 18; q++) add({ kind: "link", col, u: q / 17 }, { x: X[col], y: 0, c: "dim", a: 0.35, s: 0.5 });
    for (let s2 = 0; s2 < 2; s2++) for (let q = 0; q < 8; q++) add({ kind: "two", s2, j: [gauss() * 0.011, gauss() * 0.011] }, { x: X[0], y: FY, c: s2 ? "cyan" : "gold", a: 1, s: 1.15 });
    for (let q = 0; q < 50; q++) add({ kind: "fcirc", b: q / 50 * TAU }, { x: X[1], y: FY, c: COL[1], a: 0.7, s: 0.65 });
    for (let q = 0; q < 6; q++) add({ kind: "fcpt", j: [gauss() * 0.008, gauss() * 0.008] }, { x: X[1], y: FY, c: "gold", a: 1, s: 1 });
    const eta = Math.PI / 4;
    for (let f = 0; f < 7; f++) for (let k = 0; k < 34; k++) { const phi = f / 7 * TAU, psi = k / 34 * TAU, x1 = Math.cos(eta) * Math.cos(psi), x2 = Math.cos(eta) * Math.sin(psi), x3 = Math.sin(eta) * Math.cos(psi + phi), x4 = Math.sin(eta) * Math.sin(psi + phi), dd = 1 - x4; add({ kind: "hopf", p: [x1 / dd, x3 / dd, x2 / dd] }, { x: X[2], y: FY, c: COL[2], a: 0.6, s: 0.55 }); }
    fib(150).forEach(p => add({ kind: "s7", p, j: Math.random() * TAU }, { x: X[3], y: FY, c: COL[3], a: 0.4, s: 0.55 }));
    return tScene({
      stillT: 3.2,
      labels: [
        ...["ℝ", "ℂ", "ℍ", "𝕆"].map((h, k) => ({ x: X[k], y: 0.76, html: h, cls: "math c-math" })),
        ...["two points", "a circle", "a three-sphere", "a seven-sphere"].map((h, k) => ({ x: X[k], y: 0.2, html: h, cls: "fword" })),
        ...["over a circle", "over a sphere", "over a four-sphere", "over an eight-sphere"].map((h, k) => ({ x: X[k], y: -0.38, html: h, cls: "fword" })),
        ...["the Möbius band", "Dirac’s monopole", "the instanton", "still open"].map((h, k) => ({ x: X[k], y: -0.51, html: h, cls: `fword c-${["cyan", "cyan", "mint", "violet"][k]}` })),
        { x: 0, y: -0.76, html: "spheres over spheres exist only at these four levels", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const th = t * 0.8, yaw = t * 0.3;
          const sph = (col, p, rad) => { const [x, y, d] = view3(p[0], p[1], p[2], yaw + col, 0.35); return [X[col] + x * rad, BYc + y * rad, d]; };
          const bp = col => col === 0 ? [X[0] + BRr * Math.cos(th), BYc + BRr * 0.45 * Math.sin(th)] : sph(col, [Math.cos(th * 0.7) * 0.8, 0.45, Math.sin(th * 0.7) * 0.8], BRr);
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "bcirc": v = { x: X[0] + BRr * Math.cos(m.b), y: BYc + BRr * 0.45 * Math.sin(m.b), a: 0.5 }; break;
              case "bsph": { const [x, y, d] = sph(m.col, m.p, BRr); v = { x, y, a: 0.12 + 0.55 * d }; break; }
              case "bpt": { const [x, y] = bp(m.col); v = { x: x + m.j[0], y: y + m.j[1], a: 1 }; break; }
              case "link": { const [x, y] = bp(m.col); v = { x: x + (X[m.col] - x) * m.u, y: y + (FY - 0.14 - y) * m.u, a: 0.35 }; break; }
              case "two": { const c = Math.cos(th / 2) * (m.s2 ? -1 : 1); v = { x: X[0] + 0.1 * c + m.j[0], y: FY + 0.035 * Math.sin(th / 2) * (m.s2 ? -1 : 1) + m.j[1], a: 1 }; break; }
              case "fcirc": v = { x: X[1] + 0.12 * Math.cos(m.b), y: FY + 0.05 * Math.sin(m.b), a: 0.7 }; break;
              case "fcpt": { const a = t * 1.6; v = { x: X[1] + 0.12 * Math.cos(a) + m.j[0], y: FY + 0.05 * Math.sin(a) + m.j[1], a: 1 }; break; }
              case "hopf": { const [x, y, d] = view3(m.p[0], m.p[1], m.p[2], t * 0.25, 0.9); v = { x: X[2] + x * 0.075, y: FY + y * 0.075, a: 0.15 + 0.7 * d }; break; }
              default: { const [x, y, d] = view3(m.p[0], m.p[1], m.p[2], -t * 0.2, 0.5), fl = 0.5 + 0.5 * Math.sin(t * 2 + m.j); v = { x: X[3] + x * 0.13, y: FY + y * 0.13, a: (0.1 + 0.45 * d) * (0.5 + 0.5 * fl) }; }
            }
            out[o + i] = v;
          });
        }
      }
    });
  };

  /* No abstract mathematics: one circle on the left, and from it, along flowing lines, every structure
     the section built: closures as whole numbers, rotations side by side as signals, rotations into each
     other as the four number systems, spacetime at the quaternion level, and spheres over spheres. */
  SCENES.gfrom = () => {
    const SX = -0.92, SY = 0.02, SR = 0.24, NX = 0.22, NY = [0.66, 0.33, 0, -0.33, -0.66], pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    for (let q = 0; q < 80; q++) add({ kind: "src", b: q / 80 * TAU }, { x: SX, y: SY, c: "ice", a: 0.5, s: 0.7 });
    for (let q = 0; q < 10; q++) add({ kind: "spt", j: [gauss() * 0.012, gauss() * 0.012] }, { x: SX, y: SY, c: "gold", a: 1, s: 1.25 });
    for (let k = 0; k < 3; k++) for (let q = 0; q < 16; q++) add({ kind: "num", k, b: q / 16 * TAU }, { x: NX, y: NY[0], c: "gold", a: 0, s: 0.6 });
    for (let q = 0; q < 40; q++) add({ kind: "wave", u: q / 39 }, { x: NX, y: NY[1], c: "gold", a: 0.8, s: 0.6 });
    [1, 2, 4, 8].forEach((h, c) => { for (let q = 0; q < h; q++) add({ kind: "bar", c, q }, { x: NX, y: NY[2], c: ["ice", "cyan", "mint", "violet"][c], a: 0.9, s: 0.8 }); });
    for (let ax = 0; ax < 3; ax++) for (let q = 0; q < 10; q++) add({ kind: "axis", ax, u: q / 9 }, { x: NX, y: NY[3], c: "mint", a: 0.8, s: 0.6 });
    for (let rg = 0; rg < 2; rg++) for (let q = 0; q < 30; q++) add({ kind: "lnk", rg, b: q / 30 * TAU }, { x: NX, y: NY[4], c: rg ? "violet" : "cyan", a: 0.8, s: 0.6 });
    const line = k => u => [SX + SR + 0.03 + (NX - 0.17 - SX - SR - 0.03) * u, SY + (NY[k] - SY) * u];
    return tScene({
      stillT: 5.2,
      streams: NY.map((_, k) => ({ path: line(k), n: 6, speed: 0.22, c: "gold", ends: true, at: 0.3 + k * 0.25, s: 0.9 })),
      shapes: NY.map((_, k) => ({ pts: Array.from({ length: 34 }, (_, q) => line(k)(q / 33)), c: "dim", a: 0.3, s: 0.5, at: 0.3 + k * 0.25 })),
      labels: [
        { x: SX, y: SY - SR - 0.12, html: "one circle", cls: "example" },
        ...["closures: whole numbers", "side by side: signals", "into each other: four number systems", "three and one: spacetime", "spheres over spheres: fibrations"].map((h, k) => ({ x: NX + 0.2, y: NY[k], html: h, cls: "example left" }))
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const a = t * 1.1, lit = Math.floor(t / 0.9) % 4;
          meta.forEach((m, i) => {
            let v;
            switch (m.kind) {
              case "src": v = { x: SX + SR * Math.cos(m.b), y: SY + SR * Math.sin(m.b), a: 0.5 }; break;
              case "spt": v = { x: SX + SR * Math.cos(a) + m.j[0], y: SY + SR * Math.sin(a) + m.j[1], a: 1 }; break;
              case "num": v = { x: NX - 0.09 + m.k * 0.09 + 0.032 * Math.cos(m.b), y: NY[0] + 0.032 * Math.sin(m.b), a: m.k < lit ? 0.9 : 0.15 }; break;
              case "wave": { const x = -0.13 + 0.26 * m.u, ph = t * 2.2 - x * 30; v = { x: NX + x, y: NY[1] + 0.05 * Math.sin(ph) + 0.025 * Math.sin(2 * ph + 1), a: 0.8 }; break; }
              case "bar": v = { x: NX - 0.105 + m.c * 0.07, y: NY[2] - 0.1 + m.q * 0.028, a: 0.9 }; break;
              case "axis": { const e = [[1, 0, 0], [0, 1, 0], [0, 0, 1]][m.ax], [x, y, d] = view3(e[0] * (m.u - 0.5) * 0.22, e[1] * (m.u - 0.5) * 0.22, e[2] * (m.u - 0.5) * 0.22, t * 0.5, 0.4); v = { x: NX + x, y: NY[3] + y, a: 0.3 + 0.6 * d }; break; }
              default: { const R = 0.07, p = m.rg ? [R * 0.55 + R * Math.cos(m.b), 0, R * Math.sin(m.b)] : [-R * 0.55 + R * Math.cos(m.b), R * Math.sin(m.b), 0], [x, y, d] = view3(p[0], p[1], p[2], t * 0.6, 0.3); v = { x: NX + x, y: NY[4] + y, a: 0.3 + 0.6 * d }; }
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

  /* What this work shows, built in six stages that follow the six claims: a shape that moves and keeps
     itself; the circle with its right angle and its opposite; the circle read by quadrant as two bits;
     a full rotation returning to the start; a turned copy of the shape lined up with it; and the one
     circle shared by physics, mathematics and computation. */
  SCENES.gshows = () => {
    const cy = 0.12, R = 0.46, P = 18, S = [0, 2.7, 5.4, 8.1, 10.8, 13.5], END = 17.3;
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    const VA = [0.35, 2.25, 4.15], pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    for (let k = 0; k < 110; k++) add({ kind: "ring", a: k / 110 * TAU }, { x: 0, y: cy, c: "ice", a: 0, s: 0.75 });
    [[0, 1], [1, 2], [2, 0]].forEach(([i, j]) => { for (let q = 0; q < 26; q++) { add({ kind: "tri", i, j, u: q / 26 }, { x: 0, y: cy, c: "gold", a: 0, s: 0.85 }); add({ kind: "copy", i, j, u: q / 26 }, { x: 0, y: cy, c: "cyan", a: 0, s: 0.85 }); } });
    for (let q = 0; q < 10; q++) add({ kind: "perp", j: [gauss() * 0.013, gauss() * 0.013] }, { x: 0, y: cy + R, c: "cyan", a: 0, s: 1.2 });
    for (let q = 0; q < 10; q++) add({ kind: "opp", j: [gauss() * 0.013, gauss() * 0.013] }, { x: -R, y: cy, c: "violet", a: 0, s: 1.2 });
    for (let q = 0; q < 10; q++) add({ kind: "start", j: [gauss() * 0.013, gauss() * 0.013] }, { x: R, y: cy, c: "paper", a: 0, s: 1.2 });
    for (let k = 0; k < 2; k++) for (let q = 0; q < 40; q++) add({ kind: "axis", k, u: q / 39 }, { x: 0, y: cy, c: "dim", a: 0, s: 0.55 });
    for (let q = 0; q < 12; q++) add({ kind: "runner", j: [gauss() * 0.012, gauss() * 0.012] }, { x: R, y: cy, c: "gold", a: 0, s: 1.3 });
    const stageOf = c => S.filter(s => c >= s).length;
    const shapeAngle = t => 0.35 * t;
    const vert = (i, t, c, rot = 0) => { const rr = 0.24 + (R - 0.24) * sm((c - S[1]) / 1.4), a = VA[i] + shapeAngle(t) + rot; return [rr * Math.cos(a), cy + rr * Math.sin(a)]; };
    const show = (c, k) => stageOf(c) === k;
    const lab = (k, x, y, html, cls) => ({ x, y, html: "", cls, live: t => show(t % P, k) && (t % P) < END ? html : "" });
    return tScene({
      stillT: 9.4,
      labels: [
        lab(2, 0, cy + R + 0.12, "a right angle", "example"), lab(2, -R - 0.08, cy, "the opposite", "example left-of"), lab(2, R + 0.08, cy, "the start", "example left"),
        ...[["00", 1], ["10", 3], ["11", 5], ["01", 7]].map(([h, n]) => lab(3, (R + 0.13) * Math.cos(n * Math.PI / 4), cy + (R + 0.13) * Math.sin(n * Math.PI / 4), h, "slot")),
        lab(4, 0, cy - R - 0.12, "<i>e</i><sup>2π<i>i</i></sup> = 1", "math c-math"),
        lab(6, 0, cy + R + 0.14, "physics", "role"), lab(6, -(R + 0.12) * 0.87, cy - (R + 0.12) * 0.5, "mathematics", "role left-of"), lab(6, (R + 0.12) * 0.87, cy - (R + 0.12) * 0.5, "computation", "role left"),
        { x: 0, y: -0.68, html: "", cls: "example", live: t => { const c = t % P; if (c > END) return ""; return ["1 · it moves and keeps its shape", "2 · the circle: a right angle and an opposite", "3 · read by quadrant, it gives Shannon’s two bits", "4 · a full rotation returns exactly to the start", "5 · a turned copy lines up with the original", "6 · one circle in physics, mathematics and computation"][stageOf(c) - 1]; } }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P, F = Math.min(1, c / 0.4) * (c > END ? Math.max(0, (P - c) / (P - END)) : 1), st = stageOf(c);
          meta.forEach((m, k) => {
            let r;
            if (m.kind === "ring") { const drawn = sm((c - S[1]) / 1.4), on = m.a / TAU < drawn ? 1 : 0, flash = st === 4 && c > S[3] + 2.1 && c < S[3] + 2.6; r = { x: R * Math.cos(m.a), y: cy + R * Math.sin(m.a), a: on * (flash ? 0.95 : 0.45) * F, c: flash ? "cyan" : "ice" }; }
            else if (m.kind === "tri") { const [x1, y1] = vert(m.i, t, c), [x2, y2] = vert(m.j, t, c); r = { x: x1 + (x2 - x1) * m.u, y: y1 + (y2 - y1) * m.u, a: 0.9 * F }; }
            else if (m.kind === "copy") { const on = sm((c - S[4]) / 0.5), rot = 1.3 * (1 - sm((c - S[4] - 0.6) / 1.6)), [x1, y1] = vert(m.i, t, c, rot), [x2, y2] = vert(m.j, t, c, rot); r = { x: x1 + (x2 - x1) * m.u, y: y1 + (y2 - y1) * m.u, a: (st >= 5 ? 0.85 * on : 0) * F }; }
            else if (m.kind === "perp" || m.kind === "opp" || m.kind === "start") { const [bx, by] = m.kind === "perp" ? [0, cy + R] : m.kind === "opp" ? [-R, cy] : [R, cy]; r = { x: bx + m.j[0], y: by + m.j[1], a: (st >= 2 ? sm((c - S[1] - 1.2) / 0.5) : 0) * F }; }
            else if (m.kind === "axis") { const L = R; r = m.k ? { x: 0, y: cy - L + 2 * L * m.u, a: (st >= 3 ? 0.4 * sm((c - S[2]) / 0.6) : 0) * F } : { x: -L + 2 * L * m.u, y: cy, a: (st >= 3 ? 0.4 * sm((c - S[2]) / 0.6) : 0) * F }; }
            else { const u = sm((c - S[3]) / 2.1), a = u * TAU; r = { x: R * Math.cos(a) + m.j[0], y: cy + R * Math.sin(a) + m.j[1], a: st === 4 ? F : 0 }; }
            out[o + k] = r;
          });
        }
      }
    });
  };

  /* One object, three fields: in each a change and what it keeps. A planet sweeps equal areas in equal
     times (Kepler's second law, angular momentum kept); a 3-4-5 triangle is moved, turned and flipped and
     keeps its sides; 23 is divided into fives and every step keeps 5 × q + r = 23. */
  SCENES.gkeeps = () => {
    const X = [-1.02, 0, 1.02], cy = 0.12, pts = [], meta = [];
    const add = (m, p) => { meta.push(m); pts.push(p); };
    const smooth = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    /* physics: the orbit, the sun at a focus, eight sectors of equal area */
    const a = 0.32, ecc = 0.62, b = a * Math.sqrt(1 - ecc * ecc), T = 7, SUN = [X[0] - a * ecc, cy];
    const kepler = M => { let E = M; for (let k = 0; k < 8; k++) E -= (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E)); return [X[0] + a * Math.cos(E), cy + b * Math.sin(E)]; };
    for (let k = 0; k < 110; k++) { const E = k / 110 * TAU; add({ kind: "orbit" }, { x: X[0] + a * Math.cos(E), y: cy + b * Math.sin(E), c: "dim", a: 0.4, s: 0.6 }); }
    for (let sct = 0; sct < 8; sct++) for (let r = 0; r < 6; r++) for (let q = 1; q <= 9; q++) {
      const M = (sct + r / 6) / 8 * TAU + 0.001, f = q / 9, [px, py] = kepler(M);
      add({ kind: "area", M, edge: r === 0, x: SUN[0] + (px - SUN[0]) * f, y: SUN[1] + (py - SUN[1]) * f }, { x: SUN[0], y: SUN[1], c: sct % 2 ? "violet" : "cyan", a: 0, s: r === 0 ? 0.8 : 0.6 });
    }
    for (let q = 0; q < 10; q++) add({ kind: "sun", j: [gauss() * 0.016, gauss() * 0.016] }, { x: SUN[0], y: SUN[1], c: "gold", a: 1, s: 1.3 });
    for (let q = 0; q < 7; q++) add({ kind: "planet", j: [gauss() * 0.01, gauss() * 0.01] }, { x: SUN[0], y: SUN[1], c: "paper", a: 1, s: 1.2 });
    /* mathematics: a 3-4-5 triangle under moves */
    const u = 0.085, V = [[0, 0], [4 * u, 0], [0, 3 * u]], G = [4 * u / 3, u], L = V.map(([x, y]) => [x - G[0], y - G[1]]);
    const KF = [[0, 0, 0, 0, 1], [1.5, 1.1, 0.05, 0.04, 1], [3.0, 1.1, 0.05, 0.04, -1], [4.5, 2.7, -0.05, -0.03, -1], [6.0, 2.7, -0.05, -0.03, 1], [7.5, TAU, 0, 0, 1]];
    const pose = t => {
      const c = t % 8; let k = 0; while (k < KF.length - 2 && c > KF[k + 1][0]) k++;
      const A = KF[k], B = KF[k + 1], w = smooth((c - A[0]) / (B[0] - A[0]));
      return A.slice(1).map((v, i) => v + (B[i + 1] - v) * w);
    };
    const place = ([x, y], P) => { const [th, dx, dy, f] = P, xx = x * f; return [X[1] + dx + xx * Math.cos(th) - y * Math.sin(th), cy + dy + xx * Math.sin(th) + y * Math.cos(th)]; };
    [[0, 1, 32], [1, 2, 40], [2, 0, 24]].forEach(([i, j, n]) => { for (let q = 0; q < n; q++) add({ kind: "tri", i, j, w: q / n }, { x: 0, y: cy, c: "violet", a: 0.9, s: 0.85 }); });
    const sq = 0.035;
    [[0, sq], [sq * 0.5, sq], [sq, sq], [sq, sq * 0.5], [sq, 0]].forEach(([x, y]) => add({ kind: "corner", p: [L[0][0] + x, L[0][1] + y] }, { x: 0, y: cy, c: "violet", a: 0.6, s: 0.6 }));
    const side = (i, j, t) => { const P = pose(t), [x1, y1] = place(L[i], P), [x2, y2] = place(L[j], P), [gx, gy] = place([0, 0], P), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, d = Math.hypot(mx - gx, my - gy); return [mx + (mx - gx) / d * 0.08, my + (my - gy) / d * 0.08]; };
    /* computation: 23 divided into fives */
    const P = 9, STEP = [0.9, 2.3, 3.7, 5.1], pile = i => [X[2] - 0.25 + (i % 6) * 0.1, cy - 0.1 - Math.floor(i / 6) * 0.085];
    const row = (q, j) => [X[2] - 0.2 + j * 0.1, cy + 0.36 - q * 0.085];
    for (let i = 0; i < 23; i++) { const s = i >= 3 ? 4 - Math.floor((i - 3) / 5) : -1; for (let q = 0; q < 5; q++) add({ kind: "apple", i, s, j: [gauss() * 0.009, gauss() * 0.009] }, { x: pile(i)[0], y: pile(i)[1], c: "brass", a: 0, s: 1.05 }); }
    const steps = c => STEP.filter(s => c > s + 0.4).length;
    return tScene({
      stillT: 6.2,
      labels: [
        ...["physics", "mathematics", "computation"].map((w, k) => ({ x: X[k], y: 0.72, html: w, cls: "role" })),
        { x: X[0], y: -0.5, html: "equal areas in equal times", cls: "example" },
        { x: X[1], y: -0.5, html: "the sides stay 3, 4 and 5", cls: "example" },
        { x: X[2], y: -0.5, html: "every step keeps 23", cls: "example" },
        { x: X[2], y: -0.37, html: "", cls: "example", live: t => { const q = steps(t % P); return `5 × ${q} + ${23 - 5 * q} = 23`; } },
        ...[[0, 1, "4"], [1, 2, "5"], [2, 0, "3"]].map(([i, j, h]) => ({ x: 0, y: cy, html: h, cls: "example", at: t => side(i, j, t) }))
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const Mnow = (t % T) / T * TAU, fadeK = (t % T) > T - 0.6 ? (T - t % T) / 0.6 : 1, planet = kepler(Mnow), PZ = pose(t);
          const c = t % P, fadeC = Math.min(1, c / 0.4) * (c > P - 0.5 ? (P - c) / 0.5 : 1);
          meta.forEach((m, k) => {
            let r;
            if (m.kind === "orbit") r = { x: pts[k].x, y: pts[k].y, a: 0.4 };
            else if (m.kind === "area") r = { x: m.x, y: m.y, a: m.M <= Mnow ? (m.edge ? 0.85 : 0.5) * fadeK : 0 };
            else if (m.kind === "sun") r = { x: SUN[0] + m.j[0], y: SUN[1] + m.j[1], a: 1 };
            else if (m.kind === "planet") r = { x: planet[0] + m.j[0], y: planet[1] + m.j[1], a: 1 };
            else if (m.kind === "tri") { const [x1, y1] = place(L[m.i], PZ), [x2, y2] = place(L[m.j], PZ); r = { x: x1 + (x2 - x1) * m.w, y: y1 + (y2 - y1) * m.w, a: 0.9 }; }
            else if (m.kind === "corner") { const [x, y] = place(m.p, PZ); r = { x, y, a: 0.6 }; }
            else {
              let [x, y] = pile(m.i);
              if (m.s >= 0) { const w = smooth((c - STEP[m.s - 1]) / 0.8), [rx, ry] = row(m.s - 1, (m.i - 3) % 5); x += (rx - x) * w; y += (ry - y) * w + Math.sin(Math.PI * w) * 0.08; }
              r = { x: x + m.j[0], y: y + m.j[1], a: 0.95 * fadeC };
            }
            out[o + k] = r;
          });
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

  SCENES.gcount = () => {
    const cx = -0.55, cy = 0.04, R = 0.5, T = 2.2, N = 5, P = T * (N + 1.2), pts = [];
    for (let k = 0; k < 12; k++) pts.push({ x: cx, y: cy + R, c: "gold", a: 0, s: 1.5 - k * 0.08 });
    for (let k = 0; k < 120; k++) pts.push({ x: cx, y: cy, c: "cyan", a: 0, s: 0.85 });
    for (let n = 0; n < N; n++) for (let q = 0; q < 24; q++) pts.push({ x: 0, y: 0, c: "cyan", a: 0, s: 0.8 });
    const X = n => 0.35 + n * 0.26, Y = cy;
    const count = t => Math.min(N, Math.floor((t % P) / T));
    return tScene({
      stillT: T * 3.6,
      labels: [
        ...Array.from({ length: N }, (_, n) => ({ x: X(n), y: Y - 0.2, html: "", cls: "slot", live: t => count(t) > n ? String(n + 1) : "" })),
        { x: cx, y: cy - R - 0.2, html: "a rotation that closes", cls: "tag" },
        { x: X(2), y: Y + 0.28, html: "whole things", cls: "tag" },
        { x: 0, y: -0.9, html: "each closure is one whole thing, and counting counts closures", cls: "example" }
      ],
      custom: {
        points: pts,
        update: (t, out, o) => {
          const c = t % P, n = count(t), u = c >= N * T ? 1 : (c % T) / T, a = Math.PI / 2 - u * TAU; let i = o;
          for (let k = 0; k < 12; k++) { const q = a + k * 0.05; out[i++] = { x: cx + R * Math.cos(q), y: cy + R * Math.sin(q), a: (1 - k / 12) * (c < N * T ? 1 : 0.4) }; }
          for (let k = 0; k < 120; k++) { const v = k / 120, q = Math.PI / 2 - v * TAU; out[i++] = { x: cx + R * Math.cos(q), y: cy + R * Math.sin(q), a: v <= u ? 0.6 : 0.12 }; }
          for (let m = 0; m < N; m++) for (let q = 0; q < 24; q++) { const b = q / 24 * TAU; out[i++] = { x: X(m) + 0.09 * Math.cos(b), y: Y + 0.09 * Math.sin(b), a: m < n ? 0.9 : 0 }; }
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
        { x: 1.1, y: 0.3, html: "rotations", cls: "tag left" },
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
        { x: cx, y: -0.8, html: "angles add, rotations multiply", cls: "example" },
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
        { x: 0, y: 0.72, html: "the same rotation, the same check", cls: "example" }
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
    dof: { w: "independent degrees of freedom", t: "Each independent way to vary is its own axis.",
      d: "The state of a physical system is a point in phase space, one coordinate for each independent position and momentum, and these coordinates are orthogonal axes. Boltzmann’s entropy, <i>S</i> = <i>k</i> log <i>W</i>, counts the states <i>W</i> compatible with what we observe, and for independent parts those counts multiply, so their entropies add, just as independent bits add. At equilibrium each independent quadratic degree of freedom holds the same share of energy, ½<i>kT</i>.",
      s: "Ludwig Boltzmann, 1877; J. Willard Gibbs, <i>Elementary Principles in Statistical Mechanics</i>, 1902" },
    erlangen: { w: "the Erlangen program", t: "A geometry is the study of what stays the same under its allowed moves.",
      d: "Klein sorted the geometries by the moves each one allows and what those moves keep. Euclidean geometry allows shifts, turns and reflections and keeps lengths and angles; similarity geometry also allows scaling and keeps only angles and ratios; projective geometry allows projections and keeps which points lie on which lines. Each geometry is defined by what it keeps.",
      s: "Felix Klein, “Vergleichende Betrachtungen über neuere geometrische Forschungen”, Erlangen, 1872" },
    hoare: { w: "proving a program correct", t: "A loop is proved correct by a statement that every pass keeps true.",
      d: "Floyd attached statements to the points of a program, and Hoare turned them into a system of proof: to show a loop does what it should, find an invariant, a statement that holds before the loop and that every pass keeps true; when the loop ends, the invariant and the exit condition give the result. Dividing 23 into fives keeps 5 × <i>q</i> + <i>r</i> = 23 true at every step while <i>q</i> and <i>r</i> change.",
      s: "Robert W. Floyd, “Assigning Meanings to Programs”, 1967; C. A. R. Hoare, “An Axiomatic Basis for Computer Programming”, 1969" },
    shannon1949: { w: "Communication in the Presence of Noise", t: "Shannon’s geometric proof of a channel’s capacity.",
      d: "Shannon wrote a signal of bandwidth <i>W</i> and duration <i>T</i> as a point in a space of 2<i>WT</i> dimensions. Signals of power <i>P</i> lie on a sphere of radius √(2<i>WTP</i>), and noise of power <i>N</i> moves each one by about √(2<i>WTN</i>), so every point sent arrives somewhere inside a small sphere around it. Counting how many small spheres fit without overlapping gives the capacity, <i>W</i> log₂(1 + <i>P</i>/<i>N</i>) bits per second.",
      s: "Claude E. Shannon, “Communication in the Presence of Noise”, <i>Proceedings of the IRE</i> 37, 1949" },
    adams: { w: "Adams’s theorem", t: "Spheres fibre over spheres this way only at the four levels of the tower.",
      d: "A sphere filled with spheres over another sphere, like the Hopf fibration, needs a map of Hopf invariant one. Frank Adams proved that such maps exist only from the 1-, 3-, 7- and 15-spheres, the real numbers, complex numbers, quaternions and octonions, so the same four levels Hurwitz found in algebra appear again in the shapes of spheres.",
      s: "J. F. Adams, “On the Non-Existence of Elements of Hopf Invariant One”, <i>Annals of Mathematics</i> 72, 1960" },
    instanton: { w: "the instanton", t: "The basic twisted field of Yang–Mills theory is the quaternionic Hopf fibration.",
      d: "Yang–Mills theory is the framework of the strong and weak forces. Its basic instanton, found in 1975, is a field that twists once over the four-sphere, and the bundle it lives on is the quaternionic Hopf fibration: a three-sphere over every point of the four-sphere.",
      s: "Belavin, Polyakov, Schwarz and Tyupkin, 1975; Michael Atiyah, <i>Geometry of Yang–Mills Fields</i>, 1979" },
    zerothlaw: { w: "the Zeroth Law", t: "Two compositions of the same ordered records disagree in exactly two ways: something is missing, or something moved.",
      d: "Compare the two composed streams where they part, in the frame their shared path provides. A missing record <i>g</i> leaves the difference <i>g</i> − 1, whose scalar part is never zero. A record <i>a</i> moved past a block <i>M</i> leaves <i>aM</i> − <i>Ma</i>, whose scalar part is exactly zero, since the scalar part of a product ignores the order of its factors, and whose vector part is twice the cross product of the two, at a right angle to both. Two more results make the reading exact: an error of size ε anywhere moves the composed result by exactly ε, and every position is equally visible. The same holds on every unitary group through the trace, and up the tower the octonions add a third kind, regrouping, until the sedenions, where errors can multiply to zero.",
      s: "Walter Henrique Alves da Silva, <i>The Zeroth Law: Identity and Coherence</i>, 2026; the Closure SDK" },
    hurwitz: { w: "Hurwitz’s theorem", t: "Only four number systems multiply while keeping length.",
      d: "A number system whose multiplication keeps lengths, so that the length of a product is the product of the lengths, exists only in dimensions 1, 2, 4 and 8: the real numbers, the complex numbers, the quaternions and the octonions. Doubling once more, to the sedenions, gives numbers that multiply to zero without either being zero.",
      s: "Adolf Hurwitz, 1898" },
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
    eqproof: { w: "proof and equality", t: "Every proof ends in an identity.",
      d: "A derivation transforms one expression step by step until it is recognized as the other, so a proved equation is two descriptions shown to be one thing, and modern mathematics extends the same idea to isomorphism and equivalence, structures counted as the same when a reversible map carries one onto the other.",
      s: "Gottlob Frege, 1892; Emmy Noether and the rise of structural algebra, 1920s" },
    homeo: { w: "homeostasis and immunity", t: "A living body keeps its identity by checking it.",
      d: "Walter Cannon named homeostasis in 1926, the body holding temperature, salt and sugar near fixed references, and the immune system recognizes its own molecules and attacks what it cannot match, so life depends on telling self from other at every moment.",
      s: "Walter Cannon, 1926; Frank Macfarlane Burnet, 1959" },
    constancy: { w: "perceptual constancy", t: "We see the same thing through changing appearances.",
      d: "A white page looks white in sunlight and in shade, and a door looks rectangular while its image is a trapezoid, because the visual system keeps what is invariant and discounts the change, and infants learn in their first year that an object hidden from view still exists.",
      s: "Hermann von Helmholtz, 1867; Jean Piaget, 1954" },
    checksum: { w: "checksums and hashes", t: "Digital systems verify identity by recomputing it.",
      d: "A checksum or hash condenses a file into a short value, and the receiver recomputes the value and compares, so a download, a disk or a blockchain is trusted when what arrived returns the same value as what was sent.",
      s: "W. Wesley Peterson, cyclic redundancy checks, 1961" },
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
      d: "Each description of the lighter is written in a frame, and any two frames are related by a rotation <i>g</i>. Applying <i>g</i> carries my description into yours and its inverse <i>g</i><sup>−1</sup> carries yours back into mine, so decode(encode(<i>A</i>)) = <i>A</i> holds for every <i>g</i>, and what stays fixed under all of them is the thing both descriptions are about. Physics builds its fields the same way: electromagnetism places this circle of phases at every point in space, the field records the rotation between neighbouring frames, and only what is invariant under those rotations can be measured.",
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
    wick: { w: "heat and imaginary time", t: "Inverse temperature behaves as imaginary time.",
      d: "Replacing time by an imaginary time proportional to 1/<i>kT</i> turns the evolution of a quantum system, <i>e</i><sup>−<i>iHt</i>/ħ</sup>, into Boltzmann’s weight <i>e</i><sup>−<i>H</i>/<i>kT</i></sup>, so the statistics of heat are the same exponential with its rotation turned into decay. Physicists use this Wick rotation to move between quantum dynamics and thermodynamics.",
      s: "Gian-Carlo Wick, 1954; Felix Bloch, 1932" },
    twistor: { w: "twistors", t: "Penrose rewrote spacetime with complex numbers.",
      d: "In twistor theory the points of spacetime are built from complex lines, light rays become the basic objects, and the equations of massless fields are solved with complex analysis. It has become a working tool for computing particle scattering, though gravity itself is not yet fully written this way.",
      s: "Roger Penrose, 1967; Edward Witten, 2003" },
    rope: { w: "rotary position embedding", t: "Language models encode word order as rotation.",
      d: "Many large language models mark where a word sits in a sentence by rotating its vector through an angle proportional to its position, so the model compares two words by the rotation between them, and their relative position survives any shift of the whole sentence.",
      s: "Jianlin Su et al., “RoFormer: Enhanced Transformer with Rotary Position Embedding”, 2021" },
    convention: { w: "convention and law", t: "The symbols are chosen; what they record is not.",
      d: "The main objection to calling Euler’s identity physical is that it follows from definitions, from how the exponential of a complex number is defined. Poincaré argued that the geometry we use is a convention chosen for convenience, and Einstein answered that geometry becomes a natural science once its quantities are tied to measurement, to rods and clocks. Klein had already defined a geometry by what stays invariant under its transformations. The same split holds here: 1, <i>i</i> and 90° are agreed names, and the relationship they name, a unit that returns whole and two equal steps that reach its opposite, is measured.",
      s: "Felix Klein, Erlangen program, 1872; Henri Poincaré, <i>Science and Hypothesis</i>, 1902; Albert Einstein, “Geometry and Experience”, 1921" },
    brainwatts: { w: "the brain’s power", t: "A human brain runs on about 20 watts.",
      d: "The brain uses roughly a fifth of the body’s resting energy, about 20 watts, to perceive, remember and handle language. Large language models are trained with gigawatt-hours in data centres, and each gain from making them larger has come at a steeper cost in data and compute.",
      s: "Marcus Raichle and Debra Gusnard, “Appraising the brain’s energy budget”, 2002; Jared Kaplan et al., “Scaling Laws for Neural Language Models”, 2020" },
    furey: { w: "Furey’s nested embeddings", t: "The Standard Model’s symmetries from ℝ ⊂ ℂ ⊂ ℍ ⊂ 𝕆.",
      d: "Cohl Furey builds the charge symmetries of the Standard Model inside one eight-complex-dimensional object made from the nested division algebras, so the particle content physics measures sits in the same tower the geometric bit composes into.",
      s: "N. Furey, “Standard Model Symmetries and the Nested Embeddings of ℝ ⊂ ℂ ⊂ ℍ ⊂ 𝕆”, arXiv:2607.18450, 2026" },
    shapeofreality: { w: "The Shape of Reality", t: "Physical constants as invariants of closed paths on the three-sphere.",
      d: "If the local geometry of space is the three-sphere and interactions are Hamilton products, masses and couplings are topological invariants of closed paths. The paper derives the fine-structure constant as 9π⁵/<i>e</i>³ − ln(9/4)/3π, and the proton-to-electron mass ratio as 6π⁵ + ζ(5)/30, within 4.6 parts in ten million of its measured value, among other Standard Model parameters.",
      s: "Walter Henrique Alves da Silva, <i>The Shape of Reality: Computing Physics from π and e</i>, doi:10.5281/zenodo.18906682" },
    wigner: { w: "Wigner", t: "“The unreasonable effectiveness of mathematics in the natural sciences.”",
      d: "Eugene Wigner called the fit between mathematics and physical law a miracle: “the appropriateness of the language of mathematics for the formulation of the laws of physics is a wonderful gift which we neither understand nor deserve.”",
      s: "Eugene Wigner, <i>Communications on Pure and Applied Mathematics</i>, 13(1), 1960" },
    pontryagin: { w: "Pontryagin duality", t: "Where on the circle and how many times around are dual.",
      d: "Every locally compact abelian group has a dual made of its characters, its maps into the unit circle. The dual of the circle is the integers and the dual of the integers is the circle, so position and count determine each other, and Fourier series, which write a periodic function as a sum over whole numbers of turns, are that duality at work.",
      s: "Lev Pontryagin, 1934; Egbert van Kampen, 1935" },
    argprinciple: { w: "the argument principle", t: "Count what is inside by measuring one return around the edge.",
      d: "For a function on a region, the integral of f′/f around the boundary, divided by 2πi, equals the number of zeros inside minus the number of poles. A discrete count is read off one continuous loop, and ∮ dz/z = 2πi is the single turn it is measured in.",
      s: "Augustin-Louis Cauchy, 1831; Lars Ahlfors, <i>Complex Analysis</i>, 1953" },
    meansquare: { w: "the diagonal", t: "A ratio of ratios, and the square of a sum of waves.",
      d: "Both sides of a unit square read one, each measured against the other axis, so the diagonal in units of a side is a ratio of ratios, √2, exact as a relationship and never finished as a decimal. Squaring a sum of waves gives an array whose diagonal holds each wave compared with itself, exact and never cancelling, while the other entries hold pairs whose relative phase lets them cancel. The author’s bound on the mean square of the prime-counting error starts from that diagonal and, assuming the Riemann Hypothesis, lowers the best published constant by almost half.",
      s: "Walter Henrique Alves da Silva, “An improved mean-square bound for the error term in the prime number theorem”, doi:10.5281/zenodo.22715327" },
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
    towerphys: { w: "physics in the tower", t: "Decades of work building physics from the division algebras.",
      d: "Geoffrey Dixon wrote the Standard Model in the algebra ℝ ⊗ ℂ ⊗ ℍ ⊗ 𝕆; Feza Gürsey and Murat Günaydin used the octonions for quarks in the 1970s; John Baez’s survey made the octonions widely known; Ivan Todorov and Michel Dubois-Violette, and Latham Boyle, used the exceptional Jordan algebra to look for three generations; Cohl Furey derived the Standard Model’s symmetries from the nested embeddings ℝ ⊂ ℂ ⊂ ℍ ⊂ 𝕆.",
      s: "Gürsey and Günaydin, 1973; Dixon, 1994; Baez, 2002; Todorov and Dubois-Violette, 2018; Boyle, 2020; Furey, 2016–2026" },
    wolfram: { w: "the Wolfram Physics Project", t: "Physics built from rules acting on relations.",
      d: "Stephen Wolfram and colleagues model the universe as a network of relations updated by simple rules, with space, time, relativity and quantum mechanics emerging from how the network evolves and from all the ways its updates can be ordered.",
      s: "Stephen Wolfram, <i>A Project to Find the Fundamental Theory of Physics</i>, 2020" },
    aicost: { w: "the cost of language models", t: "Data and energy, compared with a person.",
      d: "Training GPT-3 was estimated to use about 1,287 megawatt-hours of electricity; a human brain uses about 20 watts, so the same energy would run a brain for roughly 7,300 years. Recent large models are trained on around 15 trillion tokens of text, while children are exposed to fewer than 100 million words by the age of 13, the figure the BabyLM challenge uses as its budget for human-scale learning.",
      s: "David Patterson and colleagues, “Carbon Emissions and Large Neural Network Training”, 2021; Meta, Llama 3, 2024; Warstadt and colleagues, the BabyLM Challenge, 2023" },
    paradoxes: { w: "the paradoxes", t: "Each one takes a totality, or a sign about itself, as a finished thing.",
      d: "Russell’s set of all sets that do not contain themselves, Burali-Forti’s greatest ordinal and the liar all treat a whole that includes themselves as complete. Poincaré and Russell traced them to vicious circles, whatever involves all of a collection cannot be one of its members, and Kripke’s theory of truth leaves the liar ungrounded, with no truth value at all.",
      s: "Cesare Burali-Forti, 1897; Bertrand Russell, 1903; Henri Poincaré, 1906; Saul Kripke, 1975" }
  };

  window.GTC = { SCENES, S, DEFS, clearText: () => textCache.clear() };
})();
