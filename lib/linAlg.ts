import type { Vec3, Mat3 } from "./types";

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// standard vector operations
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const clampVec = (v: Vec3): Vec3 => [clamp01(v[0]), clamp01(v[1]), clamp01(v[2])];
export const maxOf = (v: Vec3) => Math.max(v[0], v[1], v[2]);

export function mulMat(M: Mat3, v: Vec3): Vec3 {
    return [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
    ];
}

// using Cramer's Rule x_i = det(t) / det(A) |||| A with column i replaced by t
export function solve3(c1: Vec3, c2: Vec3, c3: Vec3, t: Vec3): Vec3 {
    const det = (a: Vec3, b: Vec3, c: Vec3) =>
        a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
    const D0 = det(c1, c2, c3);

    if (Math.abs(D0) < 1e-12) return [0, 0, 0]; // should never hit this edge case, but might as well... like that Ben Franklin saying

    return [det(t, c2, c3) / D0, det(c1, t, c3) / D0, det(c1, c2, t) / D0];
}