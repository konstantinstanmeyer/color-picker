"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Vec3, Mode } from "../lib/types";
import {
  hexToVec,
  vecToHex,
  vecTo255,
  quantize,
  vecToHsv,
  hsvToVec,
  solveTarget,
  buildSteps,
  trace,
} from "../lib/color";
import Wireframe from "@/components/Wireframe";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    setTheme(
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    );
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}

function useMeasuredColor(chain: string, base: Vec3) {
  const [state, setState] = useState<{ color: Vec3 | null; supported: boolean }>({
    color: null,
    supported: true,
  });
  const key = base.join(",");

  useEffect(() => {
    const src = document.createElement("canvas");
    const dst = document.createElement("canvas");
    src.width = src.height = dst.width = dst.height = 8;
    const sctx = src.getContext("2d");
    const dctx = dst.getContext("2d", { willReadFrequently: true });

    if (!sctx || !dctx || !("filter" in dctx)) {
      setState({ color: null, supported: false });
      return;
    }

    sctx.fillStyle = vecToHex(base); // a patch standing in for the artwork
    sctx.fillRect(0, 0, 8, 8);

    dctx.clearRect(0, 0, 8, 8);
    dctx.filter = chain; // the very string we are about to hand the user
    dctx.drawImage(src, 0, 0);

    const d = dctx.getImageData(4, 4, 1, 1).data;
    setState({ color: [d[0] / 255, d[1] / 255, d[2] / 255], supported: true });
  }, [chain, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

const KEY = "self-center py-1.5 pr-3 text-right font-cond text-[10px] font-medium uppercase tracking-[0.12em] text-muted";

const CAP = "font-cond text-[10px] font-semibold uppercase tracking-[0.18em] text-muted";

const INPUT_CLS = "h-7 border border-rule bg-field px-2 font-mono text-[12px] text-ink outline-none focus:border-accent";

const BTN = "h-7 border border-rule bg-panel px-2 font-cond text-[10px] font-medium uppercase tracking-[0.12em] text-muted transition-colors hover:border-accent hover:text-ink";

const BTN_ON = "h-7 border border-accent bg-accent px-2 font-cond text-[10px] font-medium uppercase tracking-[0.12em] text-onaccent";

const SEG = "flex [&>*+*]:-ml-px";

const CHECKER: React.CSSProperties = {
  backgroundImage:
    "repeating-conic-gradient(currentColor 0% 25%, transparent 0% 50%)",
  backgroundSize: "10px 10px",
  color: "rgba(128,128,128,0.16)",
};

const SAMPLE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#000" d="M50 6l12.6 29.4L94 38.6 70.5 59.2 77.4 90 50 74.2 22.6 90l6.9-30.8L6 38.6l31.4-3.2z"/></svg>`
  );

function Group({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border border-rule px-2 pb-3 pt-1 sm:px-3">
      <legend className="flex items-center gap-2 px-1.5">
        <span className={CAP}>{title}</span>
        {right}
      </legend>
      {children}
    </fieldset>
  );
}

function ColorWheel({ value, onChange }: { value: Vec3; onChange: (v: Vec3) => void }) {
  const SIZE = 172;
  const R = SIZE / 2 - 1;
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  const hsv = vecToHsv(value);
  const memo = useRef({ h: hsv.h, s: hsv.s });
  if (hsv.v > 0.02 && hsv.s > 0.02) memo.current = { h: hsv.h, s: hsv.s };
  const h = hsv.v > 0.02 && hsv.s > 0.02 ? hsv.h : memo.current.h;
  const s = hsv.v > 0.02 ? hsv.s : memo.current.s;

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - SIZE / 2;
        const dy = y - SIZE / 2;
        const dist = Math.hypot(dx, dy);
        if (dist > R) continue;
        const i = (y * SIZE + x) * 4;
        // angle around the disc = hue, distance from the center = saturation
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const [r, g, b] = hsvToVec(ang, Math.min(1, dist / R), hsv.v);
        img.data[i] = r * 255;
        img.data[i + 1] = g * 255;
        img.data[i + 2] = b * 255;
        img.data[i + 3] = 255 * Math.min(1, R - dist); // feather the rim
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hsv.v, R]);

  const pick = useCallback(
    (cx: number, cy: number) => {
      const cv = ref.current;
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      const x = ((cx - r.left) / r.width) * SIZE - SIZE / 2;
      const y = ((cy - r.top) / r.height) * SIZE - SIZE / 2;
      const dist = Math.min(R, Math.hypot(x, y));
      const ang = (Math.atan2(y, x) * 180) / Math.PI;
      onChange(hsvToVec(ang, dist / R, hsv.v < 0.05 ? 1 : hsv.v));
    },
    [hsv.v, onChange, R]
  );

  const mx = SIZE / 2 + Math.cos((h * Math.PI) / 180) * s * R;
  const my = SIZE / 2 + Math.sin((h * Math.PI) / 180) * s * R;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <canvas
          ref={ref}
          width={SIZE}
          height={SIZE}
          className="cursor-crosshair touch-none rounded-full wheel-fade"
          style={{ width: SIZE, height: SIZE }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => dragging.current && pick(e.clientX, e.clientY)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        />
        <div
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-white outline outline-1 outline-black/60"
          style={{ left: mx, top: my, background: vecToHex(value) }}
        />
      </div>

      <div className="grid w-full min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
        <span className={`${KEY} pr-0`}>Val</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(hsv.v * 1000)}
            onChange={(e) => onChange(hsvToVec(h, s, Number(e.target.value) / 1000))}
            className="slider flex-1"
            style={{
              background: `linear-gradient(to right,#000,${vecToHex(hsvToVec(h, s, 1))})`,
            }}
          />
          <span className="w-8 text-right font-mono text-[11px] text-muted">
            {Math.round(hsv.v * 100)}
          </span>
        </div>

        <span className={`${KEY} pr-0`}>Hue</span>
        <span className="font-mono text-[11px] text-muted">
          {Math.round(h)}° · sat {Math.round(s * 100)}%
        </span>
      </div>
    </div>
  );
}


function ImageSampler({
  src,
  onSample,
  onBase,
}: {
  src: string | null;
  onSample: (v: Vec3) => void;
  onBase: (v: Vec3) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The decoded pixels are read once at load and kept here. Every click then
  // works against this buffer instead of calling getImageData again — a
  // full-canvas read on every tap is both slow and, on some engines, a
  // readback stall. w/h travel with it so a stale click after a new image can't
  // index out of bounds.
  const buf = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setPin(null);
    setNote(null);
    buf.current = null;
    if (!src) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const cv = ref.current;
      if (!cv) return;
      const k = Math.min(1, 1200 / Math.max(image.width, image.height));
      cv.width = Math.round(image.width * k);
      cv.height = Math.round(image.height * k);
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(image, 0, 0, cv.width, cv.height);
      buf.current = {
        data: ctx.getImageData(0, 0, cv.width, cv.height).data,
        w: cv.width,
        h: cv.height,
      };
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const sample = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = buf.current;
    if (!b) return;
    const { data, w, h } = b;
    const cv = e.currentTarget;
    const r = cv.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    setPin({ x: fx, y: fy });

    const sx = Math.min(w - 1, Math.max(0, Math.round(fx * w)));
    const sy = Math.min(h - 1, Math.max(0, Math.round(fy * h)));
    const seed = (sy * w + sx) * 4;

    if (data[seed + 3] < 16) {
      setNote("Transparent pixel — the color under full alpha is meaningless. Pick elsewhere.");
      return;
    }

    const sr = data[seed];
    const sg = data[seed + 1];
    const sb = data[seed + 2];
    const TOL = 12; // per-channel closeness, in 0..255 — tight enough to stop at edges
    const CAP = 20000; // don't average an entire flat background into one sample

    const close = (x: number, y: number): boolean => {
      const i = (y * w + x) * 4;
      return (
        data[i + 3] >= 16 &&
        Math.abs(data[i] - sr) <= TOL &&
        Math.abs(data[i + 1] - sg) <= TOL &&
        Math.abs(data[i + 2] - sb) <= TOL
      );
    };

    const filled = new Uint8Array(w * h);
    const stack: number[] = [sx, sy]; // flat pairs, to avoid per-node array allocs
    let rAcc = 0;
    let gAcc = 0;
    let bAcc = 0;
    let count = 0;

    while (stack.length && count < CAP) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (filled[y * w + x]) continue;

      // walk left to the first pixel of this run
      let lx = x;
      while (lx >= 0 && !filled[y * w + lx] && close(lx, y)) lx--;
      lx++;

      // walk right, filling the run and seeding the rows above/below only where
      // their inside-ness flips from outside to inside
      let spanUp = false;
      let spanDn = false;
      for (let rx = lx; rx < w && !filled[y * w + rx] && close(rx, y); rx++) {
        filled[y * w + rx] = 1;
        const i = (y * w + rx) * 4;
        rAcc += data[i];
        gAcc += data[i + 1];
        bAcc += data[i + 2];
        count++;

        const up = y > 0 && !filled[(y - 1) * w + rx] && close(rx, y - 1);
        if (up && !spanUp) {
          stack.push(rx, y - 1);
          spanUp = true;
        } else if (!up) {
          spanUp = false;
        }

        const dn = y < h - 1 && !filled[(y + 1) * w + rx] && close(rx, y + 1);
        if (dn && !spanDn) {
          stack.push(rx, y + 1);
          spanDn = true;
        } else if (!dn) {
          spanDn = false;
        }
      }
    }

    setNote(null);
    onSample([rAcc / count / 255, gAcc / count / 255, bAcc / count / 255]);
  };

  const detect = () => {
    const b = buf.current;
    if (!b) return;
    const { data } = b;
    const counts = new Map<number, number>();
    let best = -1;
    let bestN = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue; // skip transparent and anti-aliased pixels
      const key = ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>> 0;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      if (n > bestN) {
        bestN = n;
        best = key;
      }
    }
    if (best < 0) {
      setNote("No opaque pixels to read.");
      return;
    }
    setNote(null);
    onBase([((best >> 16) & 255) / 255, ((best >> 8) & 255) / 255, (best & 255) / 255]);
  };

  if (!src) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-rule text-[12px] text-faint">
        No image loaded.
      </div>
    );
  }

  return (
    <div>
      <div className="relative border border-rule">
        <div className="absolute inset-0" style={CHECKER} />
        <canvas
          ref={ref}
          onClick={sample}
          className="relative block h-auto max-h-64 w-full cursor-crosshair object-contain"
        />
        {pin && (
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-white outline outline-1 outline-black/70"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] text-faint">Click to read a pixel.</span>
        <button onClick={detect} className={BTN}>
          Read base
        </button>
      </div>
      {note && <p className="mt-2 text-[11px] text-warn">{note}</p>}
    </div>
  );
}

function Claim() {
  return (
    <div className="border-b border-rule text-ink">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-3 md:flex-row md:items-end md:justify-between md:px-4">
        <div className="min-w-0">
          <p className="font-cond text-[10px] font-medium uppercase tracking-[0.22em] text-muted">
            Solved, not guessed
          </p>
          <h2 className="mt-1 font-cond text-[22px] font-semibold uppercase leading-[1.05] tracking-[0.02em] sm:text-[28px] md:text-[32px]">
            The most accurate PNG recolor
            <br className="hidden sm:block" />{" "}
            <span className="font-normal">filter generator on the web!!!</span>
          </h2>
          <p className="mt-2 max-w-md text-[11px] leading-snug text-muted">
            Every other tool for this runs a randomized search and hands you a different
            answer each time you press the button. This one solves a 3x3 linear system.
            Same input, same output, every time — and it shows you its own error.
          </p>
        </div>
        <Wireframe />
      </div>
    </div>
  );
}

export default function Page() {
  const { theme, setTheme } = useTheme();

  const INITIAL_TARGET = hexToVec("#70d9d2")!;
  const [target, setTarget] = useState<Vec3>(INITIAL_TARGET);
  const [targetDraft, setTargetDraft] = useState(vecToHex(INITIAL_TARGET));
  const [base, setBase] = useState<Vec3>([0, 0, 0]);
  const [mode, setMode] = useState<Mode>("flatten");
  const [tab, setTab] = useState<"wheel" | "image" | "hex">("hex");
  const [baseDraft, setBaseDraft] = useState("#000000");
  const [img, setImg] = useState<string | null>(null);
  const [fmtTab, setFmtTab] = useState<"css" | "tailwind" | "jsx">("css");
  const [copied, setCopied] = useState(false);

  useEffect(() => setTargetDraft(vecToHex(target)), [target]);
  useEffect(() => setBaseDraft(vecToHex(base)), [base]);

  const goal = useMemo(() => quantize(target), [target]);

  const sol = useMemo(() => solveTarget(goal), [goal]);
  const steps = useMemo(() => buildSteps(sol, mode, base), [sol, mode, base]);
  const path = useMemo(() => trace(sol, mode, base), [sol, mode, base]);
  const chain = steps.map((s) => s.fn).join(" ");

  // two independent verdicts on the same chain:
  // predicted = my model of the filter spec (a consistency check)
  // measured  = what this browser's engine actually paints (the real test)
  const predicted = path[path.length - 1].color;
  const { color: measured, supported } = useMeasuredColor(chain, base);

  const goal255 = vecTo255(goal);
  const out255 = vecTo255(measured ?? predicted);
  const err = [0, 1, 2].map((i) => out255[i] - goal255[i]) as Vec3;
  const worst = Math.max(...err.map(Math.abs));

  const snippets: Record<typeof fmtTab, string> = {
    css: `filter: ${chain};`,
    tailwind: `[filter:${chain.replace(/\s+/g, "_")}]`,
    jsx: `style={{ filter: "${chain}" }}`,
  };

  const copy = async () => {
    // clipboard.writeText rejects on insecure origins or denied permission;
    // swallowing it silently would leave the button looking broken. Fall back
    // to the legacy path and only flash "Copied" if something actually copied.
    const text = snippets[fmtTab];
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const loadFile = (f?: File) => {
    if (!f) return;
    // Object URLs pin the file's bytes in memory until revoked. Free the
    // previous one before replacing it, or every dropped image leaks.
    setImg((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setTab("image");
  };

  useEffect(() => {
    return () => {
      if (img) URL.revokeObjectURL(img);
    };
  }, []);

  const verdictTone =
    worst === 0 ? "text-ok" : worst <= 1 ? "text-ok" : worst <= 3 ? "text-warn" : "text-bad";

  return (
    <main className="min-h-screen overflow-x-clip bg-panel font-sans text-[13px] text-ink">
      <div className="mx-auto max-w-[1160px] p-0 sm:p-4 md:p-6">
        <div className="border-b border-rule bg-panel">
          <div className="flex items-center justify-between gap-4 border-b border-rule bg-panel px-3 py-2">
            <div className="flex items-baseline gap-3">
              <h1 className="font-cond text-[13px] font-semibold uppercase tracking-[0.2em] text-ink">
                PNG Recolor
              </h1>
              <span className="hidden font-mono text-[11px] text-faint sm:inline">
                closed-form CSS filter solver
              </span>
            </div>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={BTN}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>

          <Claim />

          <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
            <section className="min-w-0">
              <div className="border-b border-rule-soft bg-panel px-3 py-1.5">
                <span className={CAP}>Input</span>
              </div>

              <div className="min-w-0 space-y-4 p-2 sm:p-3">
                <div className="grid grid-cols-[48px_minmax(0,1fr)] divide-y divide-rule-soft border-y border-rule-soft sm:grid-cols-[64px_minmax(0,1fr)]">
                  <span className={KEY}>Base</span>
                  <div className="flex items-center gap-1.5 py-1.5">
                    <span
                      className="h-7 w-7 shrink-0 border border-rule"
                      style={{ background: vecToHex(base) }}
                    />
                    <input
                      value={baseDraft}
                      onChange={(e) => {
                        setBaseDraft(e.target.value);
                        const v = hexToVec(e.target.value);
                        if (v) setBase(v);
                      }}
                      spellCheck={false}
                      className={`${INPUT_CLS} w-24`}
                    />
                    <div className={SEG}>
                      <button onClick={() => setBase([0, 0, 0])} className={BTN}>
                        Black
                      </button>
                      <button onClick={() => setBase([1, 1, 1])} className={BTN}>
                        White
                      </button>
                    </div>
                  </div>

                  <span className={KEY}>Method</span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                    <div className={SEG}>
                      <button
                        onClick={() => setMode("flatten")}
                        className={mode === "flatten" ? BTN_ON : BTN}
                      >
                        Flatten
                      </button>
                      <button
                        onClick={() => setMode("preserve")}
                        className={mode === "preserve" ? BTN_ON : BTN}
                      >
                        Preserve shading
                      </button>
                    </div>
                    <p className="text-[11px] leading-tight text-faint">
                      {mode === "flatten"
                        ? "brightness(0) crushes any base to black. Ignores the base color. Drops shading."
                        : "grayscale() keeps relative lightness. Keeps gradients. Base color must be right."}
                    </p>
                  </div>

                  <span className={KEY}>Image</span>
                  <div className="py-1.5">
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        loadFile(e.dataTransfer.files?.[0]);
                      }}
                      className="flex h-7 cursor-pointer items-center justify-between border border-dashed border-rule px-2 text-[11px] text-faint transition-colors hover:border-accent hover:text-muted"
                    >
                      <span>{img ? "Loaded — drop another to replace" : "Drop a PNG, or click to browse"}</span>
                      <span className="font-cond text-[10px] uppercase tracking-[0.12em]">
                        Browse
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => loadFile(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                <Group
                  title="Target"
                  right={
                    <div className={SEG}>
                      {(
                        [
                          ["hex", "Hex"],
                          ["wheel", "Wheel"],
                          ["image", "Image"],
                        ] as const
                      ).map(([id, l]) => (
                        <button
                          key={id}
                          onClick={() => setTab(id)}
                          className={`${tab === id ? BTN_ON : BTN} h-6`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {tab === "wheel" && <ColorWheel value={target} onChange={setTarget} />}
                  {tab === "image" && (
                    <ImageSampler src={img} onSample={setTarget} onBase={setBase} />
                  )}
                  {tab === "hex" && (
                    <div className="flex items-center gap-2 py-1">
                      <input
                        value={targetDraft}
                        onChange={(e) => {
                          setTargetDraft(e.target.value);
                          const v = hexToVec(e.target.value);
                          if (v) setTarget(v);
                        }}
                        spellCheck={false}
                        className={`${INPUT_CLS} w-28`}
                        placeholder="#0582a0"
                      />
                      <input
                        type="color"
                        value={vecToHex(target)}
                        onChange={(e) => {
                          const v = hexToVec(e.target.value);
                          if (v) setTarget(v);
                        }}
                        className="h-7 w-10 cursor-pointer border border-rule bg-transparent p-0"
                      />
                      <span className="font-mono text-[11px] text-faint">
                        {hexToVec(targetDraft)
                          ? goal255.join(" · ")
                          : "needs 3 or 6 hex digits"}
                      </span>
                    </div>
                  )}
                </Group>
              </div>
            </section>

            <div className="hidden bg-rule md:block" />

            <section className="min-w-0 border-t border-rule md:border-t-0">
              <div className="flex items-center justify-between border-b border-rule-soft bg-panel px-3 py-1.5">
                <span className={CAP}>Output</span>
                <span className={`font-mono text-[11px] ${verdictTone}`}>
                  Δ {worst}
                </span>
              </div>

              <div className="min-w-0 space-y-4 p-2 sm:p-3">
                <div className="min-w-0 border border-rule">
                  <div className="flex items-center justify-between border-b border-rule bg-panel px-1.5 py-1">
                    <div className={SEG}>
                      {(
                        [
                          ["css", "CSS"],
                          ["tailwind", "Tailwind"],
                          ["jsx", "JSX"],
                        ] as const
                      ).map(([id, l]) => (
                        <button
                          key={id}
                          onClick={() => setFmtTab(id)}
                          className={`${fmtTab === id ? BTN_ON : BTN} h-6`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <button onClick={copy} className={`${BTN} h-6`}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre bg-field px-2.5 py-2.5 font-mono text-[11px] leading-relaxed text-ink sm:text-[12px]">
                    {snippets[fmtTab]}
                  </pre>
                </div>

                <Group title="Comparison">
                  <div className="min-w-0 border border-rule">
                    <div className="flex h-20">
                      <div className="flex-1" style={{ background: vecToHex(goal) }} />
                      <div
                        className="flex-1"
                        style={{ background: vecToHex(measured ?? predicted) }}
                      />
                    </div>
                    <div className="min-w-0 overflow-x-auto border-t border-rule">
                    <table className="w-full min-w-[280px] font-mono text-[11px]">
                      <thead className="bg-panel text-faint">
                        <tr>
                          <th className="border-r border-rule px-2 py-1 text-left font-normal font-cond uppercase tracking-[0.12em]">
                            &nbsp;
                          </th>
                          <th className="border-r border-rule px-2 py-1 text-right font-normal">
                            R
                          </th>
                          <th className="border-r border-rule px-2 py-1 text-right font-normal">
                            G
                          </th>
                          <th className="border-r border-rule px-2 py-1 text-right font-normal">
                            B
                          </th>
                          <th className="hidden px-2 py-1 text-right font-normal sm:table-cell">HEX</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-rule-soft">
                          <td className="border-r border-rule px-2 py-1 font-cond text-[10px] uppercase tracking-[0.12em] text-muted">
                            {tab === "image" ? "Pixel" : "Target"}
                          </td>
                          {goal255.map((c, i) => (
                            <td key={i} className="border-r border-rule-soft px-2 py-1 text-right">
                              {c}
                            </td>
                          ))}
                          <td className="hidden px-2 py-1 text-right sm:table-cell">{vecToHex(goal)}</td>
                        </tr>
                        <tr className="border-t border-rule-soft">
                          <td className="border-r border-rule px-2 py-1 font-cond text-[10px] uppercase tracking-[0.12em] text-muted">
                            {measured ? "Rendered" : "Predicted"}
                          </td>
                          {out255.map((c, i) => (
                            <td key={i} className="border-r border-rule-soft px-2 py-1 text-right">
                              {c}
                            </td>
                          ))}
                          <td className="hidden px-2 py-1 text-right sm:table-cell">
                            {vecToHex(measured ?? predicted)}
                          </td>
                        </tr>
                        <tr className="border-t border-rule">
                          <td className="border-r border-rule px-2 py-1 font-cond text-[10px] uppercase tracking-[0.12em] text-muted">
                            Error
                          </td>
                          {err.map((d, i) => (
                            <td
                              key={i}
                              className={`border-r border-rule-soft px-2 py-1 text-right ${
                                d === 0 ? "text-faint" : Math.abs(d) <= 1 ? "text-ok" : "text-warn"
                              }`}
                            >
                              {d > 0 ? `+${d}` : d}
                            </td>
                          ))}
                          <td className="hidden px-2 py-1 text-right text-faint sm:table-cell">
                            {supported ? "measured" : "model"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-faint">
                    {supported
                      ? "Measured by painting the base through this exact filter string on a canvas and reading the pixel back — the same engine that paints your image. ±1 is the 8-bit rounding floor."
                      : "No canvas filter support in this browser, so the figures above are the model's prediction, not a measurement."}
                  </p>
                </Group>

                <Group title="Pipeline">
                  <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[240px] font-mono text-[11px]">
                    <tbody>
                      {path.map((p, i) => (
                        <tr key={i} className="border-b border-rule-soft last:border-0">
                          <td className="w-6 py-1 pr-2 text-right text-faint">
                            {String(i).padStart(2, "0")}
                          </td>
                          <td className="w-6 py-1">
                            <span
                              className="block h-4 w-4 border border-rule"
                              style={{ background: vecToHex(p.color) }}
                            />
                          </td>
                          <td className="py-1 pl-2 text-ink">{p.label}</td>
                          <td className="hidden py-1 pl-3 text-faint sm:table-cell">
                            {i === 0 ? "as supplied" : steps[i - 1]?.label}
                          </td>
                          <td className="py-1 pl-3 text-right text-muted">
                            {vecToHex(p.color)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </Group>

                <Group title="Preview">
                  <div className="grid grid-cols-2 border border-rule">
                    {[
                      { k: "Before", s: {} as React.CSSProperties },
                      { k: "After", s: { filter: chain } as React.CSSProperties },
                    ].map((v, i) => (
                      <div key={v.k} className={i === 1 ? "border-l border-rule" : ""}>
                        <div className="relative p-4">
                          <div className="absolute inset-0" style={CHECKER} />
                          <img
                            src={img ?? SAMPLE}
                            alt={v.k}
                            style={v.s}
                            className="relative mx-auto h-20 w-full object-contain"
                          />
                        </div>
                        <div className="border-t border-rule-soft bg-panel px-2 py-1 text-center">
                          <span className={CAP}>{v.k}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Group>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-2 border-t border-rule bg-panel font-mono text-[11px] text-muted sm:flex sm:flex-wrap sm:items-stretch">
            {[
              ["mode", mode],
              ["base", vecToHex(base)],
              ["target", vecToHex(goal)],
              ["engine", supported ? "measured" : "model"],
              ["stages", String(steps.length)],
            ].map(([k, v]) => (
              <span
                key={k}
                className="flex items-center gap-1.5 border-b border-r border-rule px-3 py-1 sm:border-b-0"
              >
                <span className="font-cond text-[10px] uppercase tracking-[0.12em] text-faint">
                  {k}
                </span>
                {v}
              </span>
            ))}
            <span className={`flex items-center gap-1.5 px-3 py-1 ${verdictTone}`}>
              <span className="font-cond text-[10px] uppercase tracking-[0.12em] text-faint">
                error
              </span>
              R{err[0] > 0 ? `+${err[0]}` : err[0]} G{err[1] > 0 ? `+${err[1]}` : err[1]} B
              {err[2] > 0 ? `+${err[2]}` : err[2]}
            </span>
            <span className="ml-auto hidden items-center px-3 py-1 text-faint sm:flex">
              no search · no random seed · one 3×3 solve
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}