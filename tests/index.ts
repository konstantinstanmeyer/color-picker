import type { Vec3 } from "../lib/types";
import { maxOf } from "../lib/linAlg";
import { render, solveTarget } from "../lib/color";
 
// ai-generated shmuck to test
let worst = 0,
  worstCase = null;
const cases: Vec3[] = [];
for (const r of [0, 1, 17, 128, 254, 255])
  for (const g of [0, 1, 17, 128, 254, 255])
    for (const b of [0, 1, 17, 128, 254, 255])
      cases.push([r / 255, g / 255, b / 255]); // corners + edges
for (let i = 0; i < 5000; i++)
  cases.push([Math.random(), Math.random(), Math.random()]); // random interior
 
for (const c of cases) {
  if (maxOf(c) < 1e-9) continue;
  const s = solveTarget(c);
  for (const base of [[0, 0, 0], [1, 1, 1], [0.145, 0.388, 0.922]] as Vec3[]) {
    const out = render(base, s.g, s.hue, s.sat, s.bri);
    const err = Math.max(...[0, 1, 2].map((i) => Math.abs(out[i] * 255 - c[i] * 255)));
    if (err > worst) {
      worst = err;
      worstCase = { c, base };
    }
  }
}
 
console.log("worst channel error /255:", worst, worstCase);