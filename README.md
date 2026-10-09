# A Geometrical Theory of Communication
### Measurement, Meaning and Representation

Walter Henrique Alves da Silva · ORCID [0009-0001-0857-096X](https://orcid.org/0009-0001-0857-096X)

Version 1.0, 4 October 2026: an open working manuscript, shared while it is being developed.

## What this is

In 1948 Claude Shannon's *A Mathematical Theory of Communication* showed how to send any message, by agreeing on its symbols beforehand, and Warren Weaver named the two problems it left open: whether the meaning arrives, and whether it has the effect intended. *A Geometrical Theory of Communication* takes up those two problems by putting back what Shannon set aside, the reference a meaning is checked against.

Its thesis is that information is invariance over change. The smallest form of that invariance is the circle, made of perpendicularity and symmetry, with Euler's identity checking the return. That check is measured the same way everywhere, so identity can be treated as a physical law. Composed, these comparisons form one object with exactly four layers, and Levels B and C become checks.

## The presentation

**[faltz009.github.io/geometrical-theory-of-communication](https://faltz009.github.io/geometrical-theory-of-communication/)**

A scrolling presentation of the argument in seven sections, with a moving figure on every card. It is served from `docs/` and is static HTML with no build step: `index.html` holds the text, `scenes.js` the figures, `engine.js` the particle stage and the deck, and `animations/` the two full-screen animations.

## The paper

- `main.pdf`: the paper, version 1.0
- `main.tex` and `figures/`: its LaTeX source and figures. Build from this folder with `latexmk -pdf main.tex`.
- `scripts/check_formalism.py`: numerical checks of the paper's formal boxes (Python 3 and NumPy); it prints its results as JSON.

## Implementation

[Closure SDK](https://github.com/faltz009/Closure-SDK) implements the protocol.

## Support

All of this is independent work done in my own time and released for free. If you find it useful or want to see it continue, any support helps.

| Method | Address |
|---|---|
| Ko-fi | [ko-fi.com/waltersilva](https://ko-fi.com/waltersilva) |
| BTC | `155jaKugGGhdwX2Dp55bfHWpWbWD3Gr3PG` |
| ETH (ERC-20) | `0x31f0253180b03c16a0aa2d7091311d7363ef22a4` |
| SOL | `HdGFaL6A8z8AetnyPn6vKPU4QJGaSHBtoqPK32qbe6wV` |
| PIX (Brazil) | `walter.h057@gmail.com` |

## License

[CC BY-NC-SA 4.0](LICENSE)
