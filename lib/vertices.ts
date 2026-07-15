import { V3 } from "./types";

const C = 0.22; // cube half-extent
const O = 0.36; // octahedron radius

export const vertices: V3[] = [
  { x: C, y: C, z: C },
  { x: -C, y: C, z: C },
  { x: -C, y: -C, z: C },
  { x: C, y: -C, z: C },
  { x: C, y: C, z: -C },
  { x: -C, y: C, z: -C },
  { x: -C, y: -C, z: -C },
  { x: C, y: -C, z: -C },
  { x: O, y: 0, z: 0 },
  { x: -O, y: 0, z: 0 },
  { x: 0, y: O, z: 0 },
  { x: 0, y: -O, z: 0 },
  { x: 0, y: 0, z: O },
  { x: 0, y: 0, z: -O },
];
 
export const edges: number[][] = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
  [8, 10, 9, 11], // x+ top x- bottom
  [8, 12, 9, 13], // x+ front x- back
  [10, 12, 11, 13], // top front bottom back
];