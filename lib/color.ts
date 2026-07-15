import type { Vec3, Mat3, Solution } from "./types";
import { dot, add, sub, scale, clampVec, maxOf, mulMat, solve3 } from "./linAlg";

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

// H(θ) = L + cos(θ)·(I - L) + sin(θ)·C (copy-pasting these functions—won't pretend I know it....)
const hueMat = (deg: number): Mat3 => {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t), sin = Math.sin(t);
  return I3.map((row, i) =>
    row.map((iv, j) => L[i][j] + cos * (iv - L[i][j]) + sin * C_MAT[i][j])
  ) as Mat3;
};

// primitives for normalizing values via our clamping function across the vectors
export const fInvert = (v: Vec3, k: number): Vec3 => {
  return clampVec([k + v[0] * (1 - 2 * k), k + v[1] * (1 - 2 * k), k + v[2] * (1 - 2 * k)]);
};

export const fBrightness = (v: Vec3, b: number): Vec3 => clampVec(scale(v, b));
export const fSepia = (v: Vec3): Vec3 => clampVec(mulMat(SEPIA, v));
export const fHueRotate = (v: Vec3, deg: number): Vec3 => clampVec(mulMat(hueMat(deg), v));
export const fSaturate = (v: Vec3, s: number): Vec3 => clampVec(mulMat(satMat(s), v));
// returns a grayscale version of the input vector, clamped to [0,1]
// any RGB color can be decomposed into: color = gray + chroma
export const fGrayscale = (v: Vec3): Vec3 => {
  const g = dot(LUM_GRAY, v);
  return clampVec([g, g, g]);
};

const U: Vec3 = mulMat(SEPIA, ONE); // (1.351, 1.203, 0.937)

// every gray comes out of sepia as a scaled version of the same tan color
// we must split that vector into brightness and color for the next transformations
const ELL: number = dot(LUM, U); // ~1.2154 brightness of the tan, just a grayscale version of U
const D: Vec3 = sub(U, scale(ONE, ELL)); // the chroma left over, our main tint; basically pure chroma

const E: Vec3 = mulMat(C_MAT, D); // pushes the chroma across the rgb plane

// error amount
const EPS_E: number = dot(LUM, E);

export function render(base: Vec3, g: number, hue: number, sat: number, bri: number): Vec3 {
  let v = fBrightness(base, 0);
  v = fInvert(v, g);
  v = fSepia(v);
  v = fHueRotate(v, hue);
  v = fSaturate(v, sat);
  v = fBrightness(v, bri);
  return v;
}

// the original equation is nonlinear because the unknowns (brightness, saturation,
// and hue) are multiplied together and mixed with sin/cos. we make a change of
// variables by combining those terms into k = g*b, A = k*s*cos(θ), and
// B = k*s*sin(θ). this turns the problem into a simple linear 3x3 system in the
// basis vectors ONE, D, and E. after solving for k, A, and B, we recover the
// original saturation and hue using geometry: s = sqrt(A²+B²)/k and θ = atan2(B,A).
// this avoids iterative optimization entirely and gives an exact deterministic solve.
export function solveTarget(target: Vec3): Solution {
  const t = clampVec(target);

  // black's k = 0. meaning s would be 0/0
  if (maxOf(t) < 1e-9) {
    return { g: 0, hue: 0, sat: 0, bri: 0, k: 0, isBlack: true };
  }

  // E still carries a residual luminance of about -0.0001, due to the hue-rotate coefficients being set to three decimals
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
  const afterHue = add(scale(ONE, ELL), R); // what the hue stage yields, per unit of g

  // stages do not clamp here
  const g = Math.min(1 / maxOf(U), 1 / maxOf(afterHue), k / maxOf(t));

  return { g, hue, sat, bri: k / g, k, isBlack: false };
}