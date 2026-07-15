// A color as three channels in 0..1 (NOT 0..255). All color math uses 0..1
export type Vec3 = [number, number, number];
// A 3x3 matrix stored as three rows
export type Mat3 = [Vec3, Vec3, Vec3];

// The six filter parameters the solver pins down for one target color
export type Solution = {
  // invert() amount, 0..1 — sets the pivot gray level
  g: number;
  // hue-rotate() angle in degrees, 0..360
  hue: number;
  // saturate() multiplier. Vivid targets need large values (5000%+)
  sat: number;
  // final brightness() multiplier
  bri: number;
  // k = g · brightness: the total scale the linear solve actually pinned down
  k: number;
  isBlack: boolean;
};

// How the prelude reaches a known gray from the artwork's base color
export type Mode = "flatten" | "preserve";

// One filter function plus a human label, for display in the pipeline view
export type Step = { fn: string; label: string };