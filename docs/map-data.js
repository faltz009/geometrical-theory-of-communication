/* The map of the thesis: its content, kept apart from the page so it can be edited directly.
 *
 * FIELDS   the tags a reader can filter by; each has one hue, set in map.css.
 * PAPERS   where an insight is worked out: [label, link, kind]. The author's papers link to
 *          their DOIs; a null link without a kind means not yet public; kind "ref" is an
 *          outside source cited by name.
 * CORE     what the thesis does, ranked by importance, shown first.
 * EVOLUTION  how the theory changed: a verbatim "then", the thesis's "now", and a status
 *          (corrected, sharpened, kept); BREAKS lists what would falsify it.
 * HUBS     the questions the thesis reaches, each with its gallery of insights and a glyph.
 *
 * An insight: { title, text, fields: [...], weight: 2 major | 3 supporting,
 *               papers: [keys of PAPERS], topic: id of an animated screen in index.html }
 * Only what the main explanation (chapters 01–06) does not already cover belongs here.
 */
window.MAP = (() => {
  const FIELDS = {
    physics: "Physics", mathematics: "Mathematics", epistemology: "Epistemology", information: "Information theory",
    computing: "Computing", linguistics: "Linguistics", psychology: "Psychology", neuroscience: "Neuroscience",
    biology: "Biology", chemistry: "Chemistry", music: "Music"
  };

  const PAPERS = {
    boc: ["At the Border of Chaos, 2025", "https://doi.org/10.31234/osf.io/4nv79_v1"],
    gtc25: ["The Geometrical Theory of Communication, 2025", "https://doi.org/10.5281/zenodo.15715747"],
    trinity: ["The Holy Trinity of Information", "https://doi.org/10.5281/zenodo.15898912"],
    ied: ["Information Evolution Dynamics", "https://doi.org/10.5281/zenodo.17156438"],
    hydrogen: ["Hydrogen and the Ruliad", "https://doi.org/10.5281/zenodo.17705796"],
    shape: ["The Shape of Reality", "https://doi.org/10.5281/zenodo.18906682"],
    zeroth: ["The Zeroth Law", "https://doi.org/10.5281/zenodo.19140055"],
    gpe: ["Geometric Prediction Error", "https://doi.org/10.5281/zenodo.19052561"],
    zero: ["A Geometric Definition of Zero", "https://doi.org/10.5281/zenodo.19427453"],
    lean: ["The Lean 4 proof", "https://github.com/faltz009/geometric-zero-rh"],
    computer: ["The Geometric Computer", "https://doi.org/10.5281/zenodo.19578024"],
    calculus: ["Geometric Calculus", "https://doi.org/10.5281/zenodo.20349033"],
    levin: ["Commentary on Levin and Stepney", "https://github.com/faltz009/whitepapers/tree/main/Commentary%20on%20Levin%2C%20Susan%20Stepney%2C%20et%20all"],
    thesis: ["This thesis", "https://github.com/faltz009/geometrical-theory-of-communication"],
    bcl: ["Before the Critical Line, in preparation", null],
    wnh: ["What Notation Hides, in preparation", null],
    furey16: ["Furey 2016", "https://arxiv.org/abs/1611.09182"],
    furey22: ["Furey and Hughes 2022", "https://arxiv.org/abs/2210.10126"],
    furey26: ["Furey 2026", "https://arxiv.org/abs/2607.18450"],
    connes: ["Chamseddine and Connes 1996", "https://arxiv.org/abs/hep-th/9606001"],
    hott: ["Licata and Shulman 2013", "https://arxiv.org/abs/1301.3443"],
    rovelli: ["Rovelli 1996", "https://arxiv.org/abs/quant-ph/9609002"],
    rope: ["Su et al. 2021", "https://arxiv.org/abs/2104.09864"],
    wheeler: ["Wheeler 1989", null, "ref"],
    landauer: ["Landauer 1961", null, "ref"],
    lawvere: ["Lawvere 1969", null, "ref"],
    shechtman: ["Shechtman et al. 1984", null, "ref"],
    gabor: ["Gabor 1948", null, "ref"],
    clocks: ["Hall, Rosbash and Young, Nobel Prize 2017", null, "ref"],
    helix: ["Watson and Crick 1953", null, "ref"],
    pasteur: ["Pasteur 1848", null, "ref"],
    hering: ["Hering 1878", null, "ref"],
    hd: ["Taube, Muller and Ranck 1990", null, "ref"],
    torus: ["Gardner et al., Nature 2022", null, "ref"],
    precession: ["O’Keefe and Recce 1993", null, "ref"],
    entropic: ["Carhart-Harris et al. 2014", null, "ref"],
    avalanches: ["Beggs and Plenz 2003", null, "ref"],
    shor: ["Shor 1994", null, "ref"],
    nyquist: ["Nyquist 1932", null, "ref"],
    ab: ["Aharonov and Bohm 1959; Tonomura et al. 1986", null, "ref"],
    flux: ["Deaver and Fairbank 1961", null, "ref"],
    qpsk: ["Quadrature phase-shift keying", null, "ref"],
    pythagorean: ["Pythagorean tuning", null, "ref"]
  };

  /* What the thesis does, ranked by importance. The first is the contribution everything else
     rests on; most are explained in the presentation itself, which topic links to. */
  const CORE = [
    { title: "Information has a shape", fields: ["information", "mathematics", "physics"], papers: ["thesis"], topic: "shape",
      text: "Shannon gave information a measure; this thesis gives it a shape, the circle. Perpendicularity is difference, symmetry is sameness, π and e carry the continuous turn, the completed turn is a discrete count, and the return is identity, invariance over change, all in one figure the bit already implies." },
    { title: "Information is invariance over change", fields: ["information", "epistemology"], papers: ["thesis", "gtc25"], topic: "roles",
      text: "The lighter stays the same while the views, the words and the people change. Information is what holds through that change, A = A, a process from the thing to a sign and back." },
    { title: "Identity becomes an operation", fields: ["mathematics", "epistemology", "physics"], papers: ["thesis", "zeroth"], topic: "gbit",
      text: "The identity principle that logic, mathematics and meaning rest on stops being a premise: starting from any radius A, the full turn returns it, e^{2πi}A = A, so A = A is something we perform and check." },
    { title: "All three levels of communication", fields: ["information", "linguistics", "psychology"], papers: ["thesis"], topic: "levelc",
      text: "Weaver’s three problems become one loop: the signal is recognized at Level A, the meaning is recovered through the reference it travels with at Level B, and the action brings it back to the sender at Level C." },
    { title: "Shannon’s bit, recovered", fields: ["information", "computing"], papers: ["thesis"], topic: "reading",
      text: "Nothing of the classical theory is lost: the bit is the circle read at its quadrants, with the turn and the reference set aside, so entropy, codes and computation all come back as one reading of the geometric bit." },
    { title: "A definition of number", fields: ["mathematics"], papers: ["thesis", "bcl"], topic: "counting",
      text: "A number is a closed distinction, a one, and physical reality presents it as a count of completed returns, in every oscillation, every orbit and every tick of a clock." },
    { title: "The continuous and the discrete, joined", fields: ["mathematics"], papers: ["thesis"], topic: "bridge",
      text: "π and e are transcendental, beyond any arithmetic of whole numbers, and together they give e^{2πi} = 1 exactly, so the circle passes from the continuous to the discrete with no approximation, where Shannon’s bits approach the continuous by composing discreteness." },
    { title: "Euler’s identity is a law", fields: ["physics", "mathematics"], papers: ["thesis", "calculus", "bcl"], topic: "law",
      text: "Measured by the standard we use for Newton’s laws or thermodynamics, the ratio of the circle, the perpendicular turn and the return pass it, and classical mechanics, quantum mechanics and relativity already run on it." },
    { title: "Closure, the counterpart of entropy", fields: ["physics", "information", "biology"], papers: ["thesis", "boc"], topic: "closure",
      text: "Entropy counts what a state could have been and closure keeps the one it is, the negentropy living things feed on and the condition for a cause to stay itself, so information lives between the two." },
    { title: "A computation that checks itself", fields: ["computing", "mathematics"], papers: ["thesis", "computer"], topic: "composing",
      text: "Shannon’s bits compose into cubes and geometric bits compose into spheres, where every operation is a turn and every result carries the reference it can be checked against." },
    { title: "Incompleteness, with the checker put back", fields: ["mathematics", "epistemology"], papers: ["thesis"], topic: "goedel",
      text: "Gödel’s proof needs Gödel at every step and states its conclusion about the system with him removed. A closed system cannot verify its own truth, and there are no closed systems." },
    { title: "One relationship across the sciences", fields: ["epistemology", "physics", "neuroscience"], papers: ["thesis", "computer"],
      text: "The same comparison organizes physics, mathematics, computation, language and life, and the rest of this map follows it into each of them, with the papers where each step is worked out." }
  ];

  /* How the theory evolved: what the earlier papers said, what the thesis says now, and whether
     the change corrected a claim, sharpened it or kept it. The quotes are verbatim. */
  const EVOLUTION = [
    { title: "Boundaries: made, or found?", status: "corrected", when: "At the Border of Chaos, 2025", fields: ["epistemology", "physics"], papers: ["boc", "thesis"],
      then: "all boundaries are constructed",
      now: "The names we draw are constructed and the relationships are not: the right angle and the full return exist before any symbol is given to them." },
    { title: "Truth: consensus, or reproduction?", status: "corrected", when: "At the Border of Chaos, 2025", fields: ["epistemology"], papers: ["boc", "thesis"],
      then: "truth only emerges through consensus",
      now: "A relationship is true when anyone can reproduce the comparison that shows it, and consensus is what that reproduction produces, not its source." },
    { title: "Discreteness: arbitrary, or exact?", status: "corrected", when: "At the Border of Chaos, 2025", fields: ["mathematics", "epistemology"], papers: ["boc", "thesis"],
      then: "necessary but ultimately arbitrary division of continuous reality into discrete categories",
      now: "One division is not arbitrary, the completed turn: the continuous closes exactly on a whole number, e^{2πi} = 1, and every other boundary is drawn against it." },
    { title: "Incompleteness: a feature, or an artefact?", status: "corrected", when: "The Geometrical Theory of Communication, 2025", fields: ["mathematics", "epistemology"], papers: ["gtc25", "thesis"], topic: "goedel",
      then: "The incompleteness Gödel discovered is the mathematical signature of genuine semantic capability.",
      now: "Incompleteness belongs to a formal system with its checker removed. Put the checker back and the open tower of checks reaches every true sentence of arithmetic." },
    { title: "The direction of a turn", status: "corrected", when: "a draft of this thesis, September 2026", fields: ["physics", "epistemology"], papers: ["thesis"],
      then: "with the direction of turning agreed between us",
      now: "The turn carries its own direction in the order its positions are reached, and only the words clockwise and counterclockwise depend on who is looking." },
    { title: "Computation: any linear map, or the turn?", status: "sharpened", when: "The Geometrical Theory of Communication, 2025", fields: ["mathematics", "computing"], papers: ["gtc25", "zeroth"],
      then: "all information processing reduces to the fundamental form Ax = b",
      now: "The step is still linear, and the two founding observations single out which maps: the turns that keep length and order, the quaternions on the three-sphere." },
    { title: "Zero and the bit", status: "sharpened", when: "The Geometrical Theory of Communication, 2025", fields: ["mathematics", "information"], papers: ["gtc25", "zero"],
      then: "what we call “0” in our binary systems isn’t nothingness but potential",
      now: "A bit is a sign, +1 or −1, the first row of the Hopf table, and zero became a geometric event, the moment a running composition closes." },
    { title: "Dualities as projections", status: "sharpened", when: "At the Border of Chaos, 2025", fields: ["physics", "mathematics"], papers: ["boc", "calculus"],
      then: "these dualities reflect our projection of high-dimensional reality onto lower-dimensional representations",
      now: "The projection is now a specific map, Hopf’s: a measurement returns the base and leaves the fibre unresolved, which is why a qubit shows a point and hides its phase." },
    { title: "Why three", status: "sharpened", when: "The Geometrical Theory of Communication, 2025", fields: ["physics", "mathematics"], papers: ["gtc25", "thesis"], topic: "three",
      then: "three-body problem’s unsolvability isn’t mathematical coincidence but reflects nature’s fundamental unpredictability threshold",
      now: "Stated at its proper strength: in the plane a bounded motion must approach a cycle, three dimensions allow bounded motion that never repeats, and time is the plus one they are read against." },
    { title: "The metre", status: "sharpened", when: "At the Border of Chaos, 2025", fields: ["physics"], papers: ["boc", "thesis"], topic: "metre",
      then: "a projection operation that converted Earth’s continuous curvature into a discrete unit",
      now: "The metre was a quarter turn, and the turn is the one unit that never needed an outside reference." },
    { title: "Two operations became two directions", status: "kept", when: "The Geometrical Theory of Communication, 2025", fields: ["epistemology", "mathematics"], papers: ["gtc25", "thesis"],
      then: "not a static fact but an active process requiring both operations",
      now: "Telling apart and recognizing again are perpendicularity and symmetry, and the process that needs both is the turn, e^{2πi}A = A." },
    { title: "Defined through interaction", status: "kept", when: "The Geometrical Theory of Communication, 2025", fields: ["epistemology", "physics"], papers: ["gtc25", "zeroth"],
      then: "we must define it through how it interacts with not-A",
      now: "To exist is to interact, now the first of two observations that force the algebra, and the check of A runs through its own return." },
    { title: "Meaning at the border", status: "kept", when: "The Geometrical Theory of Communication, 2025", fields: ["information", "neuroscience"], papers: ["gtc25", "boc"],
      then: "Meaningful information is generated at the boundary between order and chaos",
      now: "Kept, with its two measures named: closure, what returns, and entropy, what spreads, with meaning between them." }
  ];
  const BREAKS = {
    title: "What would break it",
    text: "The chain has held from At the Border of Chaos to here, and every correction above sharpened a link without breaking one. These are the observations that would break it, and where each stands.",
    fields: ["mathematics", "physics", "neuroscience", "psychology"], papers: ["zero", "shape", "gpe", "thesis"],
    items: [
      ["A zero off the critical line", "which would break the closure reading of the Riemann Hypothesis; none among the first ten trillion zeros computed"],
      ["Constants away from their formulas", "such as the proton-to-electron mass ratio, now about five parts in ten million from 6π⁵ + ζ(5)/30"],
      ["Binding that ignores order", "since Geometric Prediction Error predicts an order-sensitive signature in neural binding, open to test in recordings"],
      ["Meaning without a return", "if people trained on turns in one notation could not derive their reversals and compositions, which the behavioural experiment here tests"]
    ]
  };

  const HUBS = [
    { q: "What exists?", glyph: "exists", line: "Existence as interaction, and what it forces.", items: [
      { title: "Perpendicularity and symmetry exist before symbols", weight: 2, fields: ["physics", "mathematics"], papers: ["thesis"], topic: "alphabet",
        text: "The alphabet of space is perpendicularity and symmetry, and physics already writes them as thermodynamics and conservation laws; we cut a pizza into right angles without a compass." },
      { title: "Euclid’s fifth postulate, read as interaction", weight: 2, fields: ["mathematics", "physics"], papers: ["calculus"],
        text: "Four of Euclid’s postulates follow from the turn being defined everywhere, continuous and periodic. The fifth asks for two paths that never interact, and on the three-sphere every closed path is linked with every other, so parallel lines are linked circles whose meeting lies beyond the horizon." },
      { title: "To exist is to interact", weight: 2, fields: ["physics", "epistemology"], papers: ["zeroth", "thesis"], topic: "exists",
        text: "Something exists physically when it is available to interaction. A particle with no forces, no effects and no interactions is, for every purpose, the same as nothing." },
      { title: "Two observations force the algebra", weight: 2, fields: ["mathematics", "physics"], papers: ["zeroth"],
        text: "Existence requires interaction and coherence requires direction. Of the four number systems Hurwitz allows, the reals and complex numbers are commutative and lose direction, the octonions blur running products, and the quaternions keep both, which forces the three-sphere with no free parameters." },
      { title: "Theseus’s ship and Zeno’s race", weight: 2, fields: ["epistemology", "mathematics"], papers: ["boc", "thesis"],
        text: "Replace every plank and the ship is still the ship while the relationships that make it a ship are kept, which is invariance over change. Achilles passes the tortoise the way a turn completes, a continuous motion closing on a whole return. At the Border of Chaos began with these two puzzles, and this is where they are answered." },
      { title: "Why this is true", weight: 2, fields: ["epistemology", "physics"], papers: ["thesis", "bcl"], topic: "truth",
        text: "Every starting relationship can be reproduced with a string, a cup or a pizza, and every consequence is written to be followed, so measurement tests where the argument begins and reasoning checks each step from there." },
      { title: "Law without law", weight: 3, fields: ["physics", "epistemology"], papers: ["wheeler", "rovelli", "landauer"],
        text: "Wheeler asked whether physical law comes from something prior to law, Rovelli made interactions the primitive facts of quantum physics, and Landauer showed that every record is physical, three independent routes to the same starting point." },
      { title: "Why 3 + 1", weight: 3, fields: ["physics", "mathematics"], papers: ["thesis", "shape"], topic: "three",
        text: "In the plane a bounded motion must settle into a cycle, and three dimensions allow motion that never repeats, so the plane shows the unit and three dimensions, followed through time, test it." },
      { title: "One object, many views", weight: 3, fields: ["physics", "psychology"], papers: ["thesis"], topic: "cup",
        text: "A single picture leaves the direction of view unresolved, and the agreement of many pictures recovers one object through its changing appearances." }
    ] },
    { q: "What can be proved?", glyph: "proved", line: "Foundations, paradox and the notation that hides them.", items: [
      { title: "No closed systems, and where paradox appears", weight: 2, fields: ["mathematics", "epistemology"], papers: ["thesis", "calculus"], topic: "closed",
        text: "Paradoxes appear exactly where a totality or a self-referring sign is taken as finished: the liar, Russell’s set of all sets, Burali-Forti’s greatest ordinal. Russell’s set has the shape of Euclid’s fifth, a structure defined by not interacting with itself." },
      { title: "What notation hides", weight: 2, fields: ["mathematics", "epistemology"], papers: ["wnh", "calculus"],
        text: "A bit is two symbols inside an assumed flat geometry, i is written as a definition when it is a derivation, and Euler’s identity is taught as a curiosity when it is a law. Each time, a richer object is projected into notation and the part left out returns later as something to explain." },
      { title: "One diagonal behind every paradox", weight: 3, fields: ["mathematics", "epistemology"], papers: ["lawvere"],
        text: "Lawvere showed in 1969 that Cantor’s diagonal argument, Russell’s paradox, Gödel’s incompleteness and Tarski’s undefinability of truth are one fixed-point theorem, the same self-application this thesis reads as a sign asked to check itself." },
      { title: "Identity as a path, in type theory", weight: 3, fields: ["mathematics"], papers: ["hott"],
        text: "Homotopy type theory treats identity as a path and proves that the loops of the circle are the integers, π₁(S¹) ≅ ℤ, the formal twin of a number counted in completed returns." },
      { title: "Mathematics is language made precise", weight: 3, fields: ["linguistics", "mathematics", "epistemology"], papers: ["thesis"], topic: "language",
        text: "A mathematical symbol records an operation, what it compares and what the comparison keeps, so anyone anywhere who measures a circle finds π, and the notation is what we agree on afterwards." }
    ] },
    { q: "What is matter made of?", glyph: "matter", line: "The tower of algebras as a hierarchy of physics.", items: [
      { title: "The tower returns the Standard Model", weight: 2, fields: ["physics", "mathematics"], papers: ["furey16", "furey22", "furey26"], topic: "tower",
        text: "Built upward from the circle, the tower runs ℝ ⊂ ℂ ⊂ ℍ ⊂ 𝕆. Built downward, Cohl Furey recovers the Standard Model’s particles and symmetries from exactly that tower, so the two directions meet in the middle." },
      { title: "Quantum mechanics is the same calculus", weight: 2, fields: ["physics", "mathematics"], papers: ["calculus"],
        text: "A qubit lives on the three-sphere and its measurement is the Hopf projection onto the Bloch sphere, so the Born rule follows from the projection, Schrödinger’s equation is the rate at which identity changes, and time evolution is that change accumulated." },
      { title: "Physical constants from the shape of space", weight: 2, fields: ["physics", "mathematics"], papers: ["shape", "calculus"],
        text: "If elementary interactions are turns on the three-sphere, masses and couplings are invariants of its closed paths: α⁻¹ = 9π⁵/e³ − ln(9/4)/3π, and the proton-to-electron mass ratio 6π⁵ + ζ(5)/30 differs from the measured value by about five parts in ten million, with 6 the inverse Chern–Simons invariant of the trefoil knot." },
      { title: "The tower of algebras", weight: 2, fields: ["mathematics", "physics"], papers: ["thesis", "zeroth"], topic: "tower",
        text: "Each doubling gives something up, order, then commutativity, then associativity, and the sedenions lose the norm itself, where a message and a code can combine into nothing and the identity check stops working." },
      { title: "A perpendicular at every point", weight: 2, fields: ["mathematics"], papers: ["thesis"], topic: "perpendicular",
        text: "Only the circle, the three-sphere and the seven-sphere carry a full set of perpendicular directions everywhere at once. Bott, Milnor, Kervaire and Adams proved there are no others, the same limit the tower reaches through its algebra." },
      { title: "Matter turns twice", weight: 2, fields: ["physics"], papers: ["thesis", "furey16"], topic: "matter",
        text: "A particle of spin one half comes back to itself only after two full turns, since after one it returns with its sign reversed, which neutron experiments measured in 1975." },
      { title: "Hamilton’s search", weight: 3, fields: ["mathematics", "physics"], papers: ["thesis"], topic: "hamilton",
        text: "For more than a decade Hamilton tried to turn space with triples of numbers, and on 16 October 1843 he saw that it takes four and carved the rule into Broom Bridge." },
      { title: "What the notation split", weight: 3, fields: ["physics", "mathematics"], papers: ["thesis", "wnh"], topic: "split",
        text: "One quaternion product gives how much two directions agree and the direction perpendicular to both, and Gibbs and Heaviside split it into the dot and cross products that physics still teaches apart." },
      { title: "Five-fold symmetry needs more dimensions", weight: 3, fields: ["chemistry", "physics", "mathematics"], papers: ["shechtman"],
        text: "A periodic crystal can only turn by a half, a third, a quarter or a sixth of a circle, and Shechtman’s five-fold quasicrystals turned out to be slices of periodic lattices in higher dimensions, carrying the orders 2, 3 and 5 of the icosahedron’s rotations." },
      { title: "Hydrogen, the smallest check", weight: 3, fields: ["chemistry", "physics"], papers: ["hydrogen"],
        text: "One proton, one electron and one binding interaction make hydrogen the minimal physical instance of the three roles, and its orbital rotations map onto the three-sphere." },
      { title: "Geometry to particles, a precedent", weight: 3, fields: ["physics"], papers: ["connes"],
        text: "Chamseddine and Connes derived the Standard Model with gravity from a noncommutative geometry, so deriving particle physics from geometry is an established programme, here with a different starting object." }
    ] },
    { q: "What do we measure?", glyph: "measure", line: "Measurement as projection, and what it leaves out.", items: [
      { title: "Entropy across the sciences", weight: 3, fields: ["physics", "information", "biology"], papers: ["thesis"], topic: "entropy-fields",
        text: "Heat, life, black holes, forests and language models all use the same count of arrangements, the entropy Shannon named for messages." },
      { title: "Why measurement errors are Gaussian", weight: 2, fields: ["mathematics", "physics"], papers: ["gtc25"],
        text: "A uniform distribution on a sphere of many dimensions, projected onto any single direction, becomes a Gaussian. Measurement is projection, so the law of errors Gauss described without explaining is what projecting a many-dimensional state looks like." },
      { title: "Shannon’s bit is the first row", weight: 2, fields: ["information", "physics"], papers: ["thesis", "gtc25"], topic: "hopf",
        text: "Read as information, the Hopf rows are one bit, one qubit, two qubits and three qubits. The first row’s fibre is two points, +1 and −1, so a bit is a sign, and writing it as 0 and 1 hides the sign." },
      { title: "Holography recovers a lost reference", weight: 2, fields: ["physics"], papers: ["gabor"],
        text: "A photograph records how bright light is and loses its phase, where each wave was in its turn. Gabor added a reference beam in 1948 so the phase could be recovered, and crystallography’s phase problem is the same loss with the same cure, bringing the reference back." },
      { title: "What do we measure?", weight: 3, fields: ["physics"], papers: ["thesis", "calculus"], topic: "measure",
        text: "To measure is to ask a question an interaction can answer, and a string around any cup, of any size, returns the same ratio." },
      { title: "The metre was a quarter turn", weight: 3, fields: ["physics"], papers: ["thesis", "boc"], topic: "metre",
        text: "The metre began as a quarter of the Earth’s meridian and the second is a count of caesium cycles, and the unit metrology still treats as a bare number is the turn itself." }
    ] },
    { q: "What is a number?", glyph: "number", line: "Number theory on the sphere.", items: [
      { title: "The Riemann Hypothesis as a closure event", weight: 2, fields: ["mathematics"], papers: ["zero", "lean", "bcl"],
        text: "With every prime placed on the three-sphere, the Euler product is a running composition there, and a zero of ζ is the moment that composition balances, W² = 1/2, which forces the real part to be 1/2. The argument is formalized in Lean 4." },
      { title: "Every prime has a place on the sphere", weight: 2, fields: ["mathematics"], papers: ["zero", "computer"],
        text: "Lagrange proved that every prime is a sum of four squares, p = a² + b² + c² + d², which gives each prime a canonical point on the three-sphere, and the Euler product becomes a walk through those points." },
      { title: "The spacing of zeros from the sphere’s own measure", weight: 3, fields: ["mathematics"], papers: ["zero"],
        text: "Riemann zeros are spaced like the eigenvalues of random matrices, which here follows from the natural measure on the three-sphere, and the first thousand zeros fit it far better than chance, a KS distance of 0.111 against 0.322." },
      { title: "−1/12 as a reflection", weight: 3, fields: ["mathematics"], papers: ["zero"],
        text: "ζ(2) = π²/6 is the volume of the three-sphere divided by 12, so the famous value ζ(−1) = −1/12 is that volume constant reflected through the critical line." },
      { title: "A sharper bound on the primes", weight: 3, fields: ["mathematics"], papers: ["bcl"],
        text: "Assuming the Riemann Hypothesis, the mean-square error in counting primes stays below 0.4644 for X ≥ 10⁶, 46% below the best published constant." },
      { title: "Collatz on the sphere", weight: 3, fields: ["mathematics", "computing"], papers: ["computer"],
        text: "The 3n + 1 map becomes a composition of turns on the three-sphere, where its convergence can be watched geometrically." }
    ] },
    { q: "What is life?", glyph: "life", line: "Living things keep a turn going.", items: [
      { title: "The eye reads the Hopf split", weight: 2, fields: ["biology", "neuroscience", "physics"], papers: ["hering", "zeroth", "computer"],
        text: "The retina does not send red, green and blue to the brain. It sends one brightness channel and two opposing colour channels, red against green and blue against yellow, which is the Hopf split of a unit quaternion into a scalar and a direction, the one the eye evolved to read." },
      { title: "DNA counts its turns", weight: 2, fields: ["biology", "chemistry", "mathematics"], papers: ["helix"],
        text: "The double helix is a turn carried along a line, about ten and a half base pairs to a full turn, and the cell tracks the winding exactly: enzymes called topoisomerases change DNA’s linking number, a whole count of how many times the two strands wind around each other." },
      { title: "A clock in every cell", weight: 2, fields: ["biology"], papers: ["clocks"],
        text: "Circadian clocks are molecular feedback loops that complete one turn a day and are reset by light, so a cell keeps time by counting returns, and cyanobacteria, among the oldest living things, already keep one." },
      { title: "Life keeps its shape the same way", weight: 2, fields: ["biology"], papers: ["levin", "trinity"],
        text: "Bioelectric patterns keep a body plan while every cell is replaced, the same three roles in a different substrate, which is where this work meets Michael Levin’s on cognition in living tissue." },
      { title: "Life turns one way", weight: 3, fields: ["biology", "chemistry"], papers: ["pasteur"],
        text: "Living things build proteins from left-handed amino acids and nucleic acids from right-handed sugars, a direction of turning written into chemistry itself, first seen by Pasteur in crystals of tartaric acid in 1848." },
      { title: "Seeing is a projection, recovered", weight: 3, fields: ["biology", "neuroscience"], papers: ["boc", "thesis"],
        text: "Each eye receives a flat, inverted image, and the brain recovers one object in three dimensions from the two projections, the cup seen from two places at once." },
      { title: "Where new things come from", weight: 3, fields: ["biology", "computing"], papers: ["ied"],
        text: "Selection and variation explain what survives and not what is new, and a third operation, resonance, creates states neither persistence nor elimination could reach." }
    ] },
    { q: "How do minds mean?", glyph: "minds", line: "Cognition and language as the same check.", items: [
      { title: "The turn preserves identity", weight: 2, fields: ["psychology", "linguistics", "physics"], papers: ["thesis"], topic: "two-references",
        text: "Two people see the lighter from different places and call it by different names, and because the angle between their frames can be undone exactly, the meaning each recovers is the same lighter." },
      { title: "Level C, repeated, calibrates Level B", weight: 2, fields: ["psychology", "linguistics", "information"], papers: ["gtc25", "thesis"],
        text: "Information is meaningful when it transforms the system that receives it. Each time an action brings the meaning back to the sender the shared reference is corrected, so communication keeps itself calibrated, which is how two speakers come to share a frame at all." },
      { title: "The brain navigates on circles", weight: 2, fields: ["neuroscience", "biology"], papers: ["hd", "torus"],
        text: "Head-direction cells hold an animal’s heading as a point on a ring, and in 2022 the activity of grid cells was shown to lie on a torus, a product of two circles, so the brain’s map of space is built from turns." },
      { title: "Meaning at the border of chaos", weight: 2, fields: ["neuroscience", "linguistics", "biology"], papers: ["boc", "gtc25", "avalanches"],
        text: "What only returns tells nothing new and what only spreads keeps nothing, so meaning lives between closure and entropy. The brain runs at that border, with neural avalanches following the power laws of critical systems, and language shows the same balance in Zipf’s law and in the colour terms every culture draws." },
      { title: "Three roles keep a mind honest", weight: 2, fields: ["psychology", "neuroscience"], papers: ["trinity"],
        text: "Checking A = A without hallucinating or freezing takes three roles at different speeds: an interface that reports what is, a protected memory of what has predicted well, and the space between where the two meet and meaning forms. Perception must never write straight into memory, or the system sees only what it already believes." },
      { title: "Prediction error is a distance on the sphere", weight: 2, fields: ["neuroscience", "mathematics"], papers: ["gpe", "zeroth"],
        text: "Friston’s free-energy principle measures prediction error through probability distributions, and on the three-sphere it is the distance from identity, one multiplication per step, with any perturbation carried through the chain at exactly its own size." },
      { title: "How we convey it", weight: 2, fields: ["psychology", "linguistics"], papers: ["thesis"], topic: "convey",
        text: "Understanding a relation shows in what a person can do with it, reversing it and combining it with others, which Relational Frame Theory measures directly." },
      { title: "Position written as phase", weight: 3, fields: ["neuroscience"], papers: ["precession"],
        text: "As a rat runs through a place, the cells coding for it fire at steadily earlier phases of the hippocampal theta rhythm, so where the animal is gets written as how far a turn has gone." },
      { title: "The entropic brain", weight: 3, fields: ["neuroscience", "psychology"], papers: ["entropic"],
        text: "Psychedelics raise the entropy of brain activity and loosen the boundaries between categories and between self and world, a measured push away from closure toward spreading." },
      { title: "Why word frequencies follow a power law", weight: 3, fields: ["linguistics"], papers: ["calculus"],
        text: "The most frequent words sit at the landmarks of the turn, is at identity, and at composition, but at the right angle and not at the half turn, and Zipf’s law follows from how rarely deep compositions are reused." }
    ] },
    { q: "Where is it already running?", glyph: "running", line: "Technologies and laws that already work with the turn.", items: [
      { title: "Physics already runs on the turn", weight: 2, fields: ["physics"], papers: ["thesis"], topic: "physics",
        text: "A turn seen from the side is an oscillation, so springs, circuits, quantum amplitudes, atomic orbits and changes of frame in relativity are all written with e^{iωt}." },
      { title: "Phones send bits as turns", weight: 2, fields: ["computing", "information"], papers: ["qpsk"],
        text: "Quadrature phase-shift keying sends two bits at a time as one of four phases of a carrier wave, 00, 01, 11 and 10 around the circle, which is the quadrant reading of the geometric bit." },
      { title: "Language models read position as rotation", weight: 2, fields: ["computing", "linguistics"], papers: ["rope"],
        text: "Rotary position embedding turns each word’s vectors by an angle proportional to its position, so the model compares two words by the relative turn between them." },
      { title: "A phase that returns around a loop", weight: 2, fields: ["physics"], papers: ["ab"],
        text: "Electrons passing on either side of a shielded magnet interfere differently though no force touches them, because their phase has turned by a different amount around the loop, which Tonomura confirmed in 1986." },
      { title: "Shor’s algorithm factors by finding a return", weight: 2, fields: ["computing", "mathematics"], papers: ["shor"],
        text: "Shor reduced factoring to finding the period of a repeating sequence, the number of steps before it returns, which a quantum computer reads with a Fourier transform." },
      { title: "The circle of fifths does not close", weight: 2, fields: ["music", "mathematics"], papers: ["pythagorean"],
        text: "Twelve perfect fifths overshoot seven octaves by the Pythagorean comma, about a quarter of a semitone, a turn that fails to come back, and equal temperament spreads that gap evenly so every key returns." },
      { title: "Magnetic flux comes in whole returns", weight: 3, fields: ["physics"], papers: ["flux"],
        text: "The flux through a superconducting ring is quantized in units of h/2e, because the phase of the superconducting state has to come back to itself after a whole number of turns around the ring." },
      { title: "Stability counts windings", weight: 3, fields: ["computing", "physics"], papers: ["nyquist"],
        text: "Nyquist’s criterion decides whether a feedback loop is stable by counting how many times its response winds around a single point, an integer that is a count of turns." }
    ] },
    { q: "What can we build?", glyph: "build", line: "Computation that carries its own check.", items: [
      { title: "The geometric computer", weight: 2, fields: ["computing"], papers: ["computer"],
        text: "A digital brain built from unit quaternions alone, with a cell that fires when the running product returns to identity, one-shot learning when a sequence closes and consolidation in quiet periods, and no gradient descent anywhere." },
      { title: "One distance, five names", weight: 2, fields: ["computing", "mathematics", "neuroscience"], papers: ["computer"],
        text: "The distance from identity on the three-sphere is error in arithmetic, prediction error in learning, the distance from the critical line in number theory, the birth threshold of the Game of Life and the balance of colour channels in vision." },
      { title: "Brackets learned as inverses", weight: 3, fields: ["computing"], papers: ["zeroth"],
        text: "A network of 1,031 parameters trained for nine minutes on the three-sphere learns that opening and closing brackets are each other’s inverse, with no instruction beyond the geometry and the demand that balanced sequences return to identity." },
      { title: "A diagnostic for any ordered data", weight: 3, fields: ["computing", "information"], papers: ["zeroth"],
        text: "Coherence between two ordered sequences breaks in exactly two ways, something missing or something moved, and every perturbation is carried through the chain at its own size, so each failure is found and named." },
      { title: "What we can test next", weight: 3, fields: ["psychology", "computing", "physics"], papers: ["thesis"], topic: "next",
        text: "People learning different notations for the same turns, machines tested for turning consistently when their input turns, and every level of the tower asked what new comparison it makes possible." }
    ] }
  ];

  return { FIELDS, PAPERS, CORE, EVOLUTION, BREAKS, HUBS };
})();
