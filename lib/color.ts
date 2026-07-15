import type { Vec3, Mat3, Solution, Mode, Step } from "./types";
import { clamp01, dot, add, sub, scale, clampVec, maxOf, mulMat, solve3 } from "./linAlg";

export function hexToVec(hex: string): Vec3 | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function vecToHex(v: Vec3): string {
  return (
    "#" +
    v.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("")
  );
}

export const vecTo255 = (v: Vec3): Vec3 =>
  [
    Math.round(clamp01(v[0]) * 255),
    Math.round(clamp01(v[1]) * 255),
    Math.round(clamp01(v[2]) * 255),
  ] as Vec3;

export const quantize = (v: Vec3): Vec3 => scale(vecTo255(v), 1 / 255);

export function vecToHsv(v: Vec3) {
  const [r, g, b] = v;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToVec(h: number, s: number, v: number): Vec3 {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const rgb: Vec3 =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
             [c, 0, x];
  const m = v - c;
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

// grayscale weights for later operations
export const LUM_GRAY: Vec3 = [0.2126, 0.7152, 0.0722];

// luminance vector, browsers have different brightness perception per-color to be accounted for
const LUM: Vec3 = [0.213, 0.715, 0.072];
const L: Mat3 = [LUM, LUM, LUM];

const ONE: Vec3 = [1, 1, 1]; // vector of ones for full-color intensity inversions
const I3: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // identity matrix

// color transformations going by quarter-turns of hue-rotations
const C_MAT: Mat3 = [
  [-0.213, -0.715, 0.928],
  [0.143, 0.140, -0.283],
  [-0.787, 0.715, 0.072],
];

const SEPIA: Mat3 = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

// S(s) = (1-s)·L + s·I (interpolation formula for saturation matrix)
const satMat = (s: number): Mat3 =>
  I3.map((row, i) => row.map((iv, j) => (1 - s) * L[i][j] + s * iv)) as Mat3;

// H(θ) = L + cos(θ)·(I - L) + sin(θ)·C
const hueMat = (deg: number): Mat3 => {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t), sin = Math.sin(t);
  return I3.map((row, i) =>
    row.map((iv, j) => L[i][j] + cos * (iv - L[i][j]) + sin * C_MAT[i][j])
  ) as Mat3;
};

// primitives for normalizing values via our clamping function across the vectors
export const fInvert = (v: Vec3, k: number): Vec3 =>
  clampVec([k + v[0] * (1 - 2 * k), k + v[1] * (1 - 2 * k), k + v[2] * (1 - 2 * k)]);

export const fBrightness = (v: Vec3, b: number): Vec3 => clampVec(scale(v, b));
export const fSepia = (v: Vec3): Vec3 => clampVec(mulMat(SEPIA, v));
export const fHueRotate = (v: Vec3, deg: number): Vec3 => clampVec(mulMat(hueMat(deg), v));
export const fSaturate = (v: Vec3, s: number): Vec3 => clampVec(mulMat(satMat(s), v));
// any RGB color can be decomposed into: color = gray + chroma
export const fGrayscale = (v: Vec3): Vec3 => {
  const g = dot(LUM_GRAY, v);
  return clampVec([g, g, g]);
};

const U: Vec3 = mulMat(SEPIA, ONE); // (1.351, 1.203, 0.937)

// every gray comes out of sepia as a scaled version of the same tan color;
// split that vector into brightness and color for the next transformations
const ELL: number = dot(LUM, U); // ~1.2154 brightness of the tan
const D: Vec3 = sub(U, scale(ONE, ELL)); // the chroma left over, our main tint
const E: Vec3 = mulMat(C_MAT, D); // pushes the chroma across the rgb plane
const EPS_E: number = dot(LUM, E); // residual luminance from the rounded coefficients

/** Run the whole filter chain forward, from a base color. */
export function render(base: Vec3, g: number, hue: number, sat: number, bri: number): Vec3 {
  let v = fBrightness(base, 0);
  v = fInvert(v, g);
  v = fSepia(v);
  v = fHueRotate(v, hue);
  v = fSaturate(v, sat);
  v = fBrightness(v, bri);
  return v;
}

/**
 * The original equation is nonlinear because the unknowns (brightness,
 * saturation, hue) are multiplied together and mixed with sin/cos. We change
 * variables to k = g*b, A = k*s*cos(θ), B = k*s*sin(θ), turning it into a linear
 * 3x3 system in the basis vectors ONE, D, E. After solving for k, A, B, we
 * recover saturation and hue geometrically: s = sqrt(A²+B²)/k, θ = atan2(B,A).
 * No iterative optimization; an exact deterministic solve.
 */
export function solveTarget(target: Vec3): Solution {
  const t = clampVec(target);

  // black's k = 0, meaning s would be 0/0
  if (maxOf(t) < 1e-9) {
    return { g: 0, hue: 0, sat: 0, bri: 0, k: 0, isBlack: true };
  }

  // E carries a residual luminance of ~-0.0001 from the 3-decimal coefficients;
  // correct for it with a short fixed-point iteration
  let ellPrime = ELL;
  let k = 0;
  let A = 0;
  let B = 0;

  for (let i = 0; i < 6; i++) {
    [k, A, B] = solve3(scale(ONE, ellPrime), D, E, t);
    const s = Math.hypot(A, B) / k;
    const theta = Math.atan2(B, A);
    ellPrime = ELL + (1 - s) * Math.sin(theta) * EPS_E;
  }

  const sat = Math.hypot(A, B) / k;
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;

  // split k = g·b, keeping g as large as the three clamping bounds allow
  const rad = (hue * Math.PI) / 180;
  const R = add(scale(D, Math.cos(rad)), scale(E, Math.sin(rad))); // the aimed tint
  const afterHue = add(scale(ONE, ELL), R); // what the hue stage yields per unit of g

  const g = Math.min(1 / maxOf(U), 1 / maxOf(afterHue), k / maxOf(t));

  return { g, hue, sat, bri: k / g, k, isBlack: false };
}

/* ============================================================================
 * FROM SOLUTION TO CSS STRING
 *
 * The pipeline starts at BLACK. Real artwork is black, white, or some brand
 * color, so we need a prelude that gets from the base to a known gray. Two ways:
 *
 *   FLATTEN    brightness(0) crushes any base to black. Ignores the base color.
 *              Drops shading.
 *   PRESERVE   grayscale(100%) keeps relative lightness, then rescales it. Keeps
 *              gradients. Needs the base color to be right; can't start at pure
 *              black (g0 = 0), so it falls back to invert() there.
 * ==========================================================================*/

export function buildSteps(sol: Solution, mode: Mode, base: Vec3): Step[] {
  const pct = (x: number) => fmt(x * 100) + "%";

  if (sol.isBlack) return [{ fn: "brightness(0%)", label: "straight to black" }];

  const steps: Step[] = [];
  const g0 = dot(LUM_GRAY, base); // luminance of the base color

  if (mode === "flatten" || g0 < 1e-6) {
    steps.push({ fn: "brightness(0%)", label: "flatten to black" });
    steps.push({ fn: `invert(${pct(sol.g)})`, label: "lift to the pivot gray" });
  } else {
    steps.push({ fn: "grayscale(100%)", label: "drop to luminance" });
    steps.push({ fn: `brightness(${pct(sol.g / g0)})`, label: "scale to the pivot gray" });
  }

  steps.push({ fn: "sepia(100%)", label: "inject a tint" });
  steps.push({ fn: `hue-rotate(${fmt(sol.hue)}deg)`, label: "aim the tint" });
  steps.push({ fn: `saturate(${pct(sol.sat)})`, label: "set the tint strength" });
  steps.push({ fn: `brightness(${pct(sol.bri)})`, label: "set the final brightness" });
  return steps;
}

/**
 * Three decimals, a measured choice: 0 decimals costs up to 6.7/255 of error;
 * 1 → 1.0/255; 2 → 0.17/255; 3 → 0.008/255. saturate()'s huge value multiplies
 * any upstream rounding straight through.
 */
function fmt(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

/** Re-run the chain forward, recording every intermediate. This is the receipt. */
export function trace(sol: Solution, mode: Mode, base: Vec3) {
  const out: { label: string; color: Vec3 }[] = [{ label: "base", color: base }];
  let v = base;
  const push = (label: string, color: Vec3) => {
    v = color;
    out.push({ label, color });
  };

  if (sol.isBlack) {
    push("brightness", fBrightness(v, 0));
    return out;
  }

  const g0 = dot(LUM_GRAY, base);
  if (mode === "flatten" || g0 < 1e-6) {
    push("brightness", fBrightness(v, 0));
    push("invert", fInvert(v, sol.g));
  } else {
    push("grayscale", fGrayscale(v));
    push("brightness", fBrightness(v, sol.g / g0));
  }
  push("sepia", fSepia(v));
  push("hue-rotate", fHueRotate(v, sol.hue));
  push("saturate", fSaturate(v, sol.sat));
  push("brightness", fBrightness(v, sol.bri));
  return out;
}