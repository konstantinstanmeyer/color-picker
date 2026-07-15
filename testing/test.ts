type Vec3 = [number, number, number] // rgb vectors
type Mat3 = [Vec3, Vec3, Vec3] // 3x3 matrices

// grascale weights for later operations
const LUM_GRAY: Vec3 = [0.2126, 0.7152, 0.0722];

const clamp01 = (x:number) => x < 0 ? 0 : x > 1 ? 1 : x;

// standard vector operations
const dot = (a:Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const clampVec = (v: Vec3): Vec3 => [clamp01(v[0]), clamp01(v[1]), clamp01(v[2])];
const maxOf = (v: Vec3) => Math.max(v[0], v[1], v[2]);

function mulMat(M: Mat3, v: Vec3): Vec3{
    return [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
    ]
};

// luminance vector, browsers have different brightness perception per-color to be accounted for
const LUM: Vec3 = [0.213, 0.715, 0.072];
const L: Mat3 = [LUM, LUM, LUM];

const ONE: Vec3 = [1, 1, 1]; // vector of ones for full-color intensity inversions
const I3: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // identity matrix

// color transformations going by quarter-turns of hue-rotations
const C_MAT: Mat3 = [
    [-0.213, -0.715,  0.928],
    [ 0.143,  0.140, -0.283],
    [-0.787,  0.715,  0.072],
]

const SEPIA: Mat3 = [
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
];

// S(s) = (1-s)·L + s·I (interpolation formula for saturation matrix)
const satMat = (s: number): Mat3 =>
    I3.map((row, i) => row.map((iv, j) => (1 - s)*L[i][j] + s*iv)) as Mat3;

// H(θ) = L + cos(θ)·(I - L) + sin(θ)·C (copy-pasting these functions—won't pretend I know it....)
const hueMat = (deg: number): Mat3 => {
    const t = (deg * Math.PI) / 180;
    const cos = Math.cos(t), sin = Math.sin(t);
    return I3.map((row, i) =>
        row.map((iv, j) => L[i][j] + cos*(iv - L[i][j]) + sin*C_MAT[i][j])
    ) as Mat3;
};

// primitimves for normalizing values via our clamping function across the vectors
const fInvert = (v: Vec3, k: number): Vec3 => {
    return clampVec([k + v[0]*(1-2*k), k + v[1]*(1-2*k), k + v[2]*(1-2*k)]);
};

const fBrightness = (v: Vec3, b: number): Vec3 => clampVec(scale(v, b));
const fSepia      = (v: Vec3): Vec3 => clampVec(mulMat(SEPIA, v));
const fHueRotate  = (v: Vec3, deg: number): Vec3 => clampVec(mulMat(hueMat(deg), v));
const fSaturate   = (v: Vec3, s: number): Vec3 => clampVec(mulMat(satMat(s), v));
// returns a grayscale version of the input vector, clamped to [0,1]
// ny RGB color can be decomposed into: color = gray + chroma
const fGrayscale = (v: Vec3): Vec3 => {
  const g = dot(LUM_GRAY, v);
  return clampVec([g, g, g]);
};

const U: Vec3 = mulMat(SEPIA, ONE);   // (1.351, 1.203, 0.937)

// every gray comes out of sepia as a scaled version of the same tan color
// we must split that vector into brightness and color for the next transformations
const ELL: number = dot(LUM, U); // ~1.2154 brightness of the tan, just a grayscale version of U
const D: Vec3 = sub(U, scale(ONE, ELL)); // the chroma left over, our main tint; basically pure chroma

const E: Vec3 = mulMat(C_MAT, D); // pushes the chroma across the rgb plane

const EPS_E: number = dot(LUM, E);

// using Cramer's Rule x_i = det(t) / det(A) |||| A with column i replaced by 
function solve3(c1: Vec3, c2: Vec3, c3: Vec3, t: Vec3): Vec3 {
    const det = (a: Vec3, b: Vec3, c: Vec3) =>
        a[0]*(b[1]*c[2]-b[2]*c[1]) - b[0]*(a[1]*c[2]-a[2]*c[1]) + c[0]*(a[1]*b[2]-a[2]*b[1]);
    const D0 = det(c1, c2, c3);
    if (Math.abs(D0) < 1e-12) return [0, 0, 0]; // should never hit this edge case, but might as well... like that Ben Franklin saying
    return [det(t,c2,c3)/D0, det(c1,t,c3)/D0, det(c1,c2,t)/D0];
}

// console.log(solve3(ONE, D, E, U)); // sanity check

