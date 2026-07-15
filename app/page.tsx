"use client";

import { solveTarget } from "../lib/color";
import type { Vec3 } from "../lib/types";

export default function Home() {
  const demo: Vec3 = [0.02, 0.51, 0.62];
  const sol = solveTarget(demo);

  return (
    <main className="min-h-screen overflow-x-clip">
      <pre>{JSON.stringify(sol)}</pre>
    </main>
  );
}