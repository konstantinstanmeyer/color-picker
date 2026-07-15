# png-recolor

Generates the CSS `filter` chain that recolors a flat PNG from one color to
another. It solves for the filter values directly instead of searching for
them, so the same input always gives the same output.

```
filter: brightness(0%) invert(24.631%) sepia(100%) hue-rotate(160.614deg)
        saturate(1174.6%) brightness(93.204%);
```

## Why it works this way

Most tools that produce these filter strings guess. They run a randomized
optimizer a few thousand times per color and keep the closest result, which is
why pasting the same color twice gives two different answers.

This one computes the answer. The reason it can is that four of the CSS filter
functions: `grayscale`, `sepia`, `saturate`, `hue-rotate`. They're defined in the
spec as 3×3 matrix multiplications on the pixel's RGB values, and the other two
(`brightness`, `invert`) are affine. Once you see a color as a vector and a
filter as a matrix, recoloring stops being an image-editing problem and becomes
a linear one, with a single exact solution rather than a target to approximate.

The math it leans on:

- **Vectors.** A color is three numbers, so it is a point in 3D space. Adding,
  scaling, and transforming colors are then ordinary vector operations, which
  is what lets any of the rest apply.
- **The dot product and luminance.** Perceived brightness is a weighted sum of
  the channels (`0.213·r + 0.715·g + 0.072·b`). That single number splits every
  color into a brightness part and a leftover "chroma" part, and that split is
  the whole strategy: set brightness with one filter, aim and scale the chroma
  with others.
- **Matrix multiplication.** Each of the four matrix filters is one multiply.
  Because a multiply is linear, a gray pushed through `sepia` always lands on
  the same tan direction, only scaled, which is the fixed reference the rest of
  the chain steers.
- **Rotation and a basis.** `hue-rotate` is a rotation of the 2D plane of
  zero-brightness colors. Two independent chroma vectors span that plane, so
  rotating the one tint `sepia` gives us reaches every hue. Nothing has to be
  searched because everything is reachable by construction.
- **A 3×3 linear solve (Cramer's rule).** After a change of variables that folds
  the multiplied-together unknowns into three combined terms, the target reduces
  to three equations in three unknowns. Cramer's rule solves it exactly, with no
  iteration and no tolerance. The source of the determinism.
- **A fixed-point iteration.** The spec rounds `hue-rotate`'s coefficients to
  three decimals, which leaves a tiny brightness leak that `saturate` then
  magnifies. A handful of refine-and-repeat passes cancels it. This is the one
  iterative step, and it converges to a single answer, so it stays deterministic.
- **Quantization.** A screen color is an 8-bit integer per channel. Snapping the
  target to that grid before solving means the tool answers the exact color you
  picked, and its reported error is honest rather than measured against a
  slightly different number.

`how-it-works.md` builds all of this from scratch, assuming no color background.

## Run

```
npm install
npm run dev
```

Next.js App Router, Tailwind v4, no other dependencies.

## Layout

```
app/    the page, layout, and styles
lib/    the math — types, linear algebra, the color solver
```

The math lives in `lib/` and knows nothing about React; `app/page.tsx` imports
from it and does nothing but draw the UI. The split is deliberate: the solver is
the part that has to be correct, and keeping it free of UI means it can be read,
reused, and tested on its own.

## Limits

One flat color in, one flat color out. It recolors icons and logos, not photos.
The filter applies to the whole element, so put it on the `<img>`, not a wrapper
around other content. Where you can set `mask-image`, use that instead: it uses
the PNG's alpha as a stencil, needs no math, and is exact. Filters win only when
you can't set a mask.