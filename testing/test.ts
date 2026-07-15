type Vec3 = [number, number, number] // rgb vectors
type Mat3 = [Vec3, Vec3, Vec3] // 3x3 matrices

const clamp01 = (x:number) => x < 0 ? 0 : x > 1 ? 1 : x;

// standard vector operations
const dot = (a:Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add   = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub   = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const clampVec = (v: Vec3): Vec3 => [clamp01(v[0]), clamp01(v[1]), clamp01(v[2])];
const maxOf = (v: Vec3) => Math.max(v[0], v[1], v[2]);

function mulMatrix(M: Mat3, v: Vec3): Vec3{
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

// H(θ) = L + cos(θ)·(I - L) + sin(θ)·C (copy-pasting this won't pretend I know it....)
const hueMat = (deg: number): Mat3 => {
    const t = (deg * Math.PI) / 180;
    const cos = Math.cos(t), sin = Math.sin(t);
    return I3.map((row, i) =>
        row.map((iv, j) => L[i][j] + cos*(iv - L[i][j]) + sin*C_MAT[i][j])
    ) as Mat3;
};