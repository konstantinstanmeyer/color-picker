// import { vertices, edges } from "../lib/vertices";
import { V3 } from "../lib/types";
import { useEffect, useRef } from "react";
import { vertices, edges } from "../lib/penger";

const wfRotYZ = (v: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
};
const wfRotXZ = (v: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c };
};
const wfTranslateZ = (v: V3, dz: number): V3 => ({ x: v.x, y: v.y, z: v.z + dz });

export default function Wireframe() {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const cv = ref.current;
        const ctx = cv?.getContext("2d");
        if (!cv || !ctx) return;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round((cv.clientWidth || 220) * dpr);
        cv.height = Math.round((cv.clientHeight || 96) * dpr);
        const W = cv.width;
        const H = cv.height;

        const DZ = 1.6;
        const ZOOM = 1.7
        const SPIN = Math.PI * 0.5

        const css = getComputedStyle(document.documentElement);
        const strong = css.getPropertyValue("--ink").trim() || "#16202a";
        const faint = css.getPropertyValue("--rule").trim() || "#b4c0c8";

        const place = (v: V3, angle: number) => {
            const p = wfTranslateZ(wfRotXZ(wfRotYZ(v, 0.5), angle), DZ);
            return {
            x: ((p.x / p.z * ZOOM + 1) / 2) * W,
            y: (1 - (p.y / p.z * ZOOM + 1) / 2) * H,
            };
        };

        let raf = 0;
        let start = 0;
        const draw = (t: number) => {
            if (!start) start = t;
            const angle = ((t - start) / 1000) * SPIN;

            ctx.clearRect(0, 0, W, H);
            ctx.lineWidth = 1.25 * dpr;
            ctx.lineJoin = "round";

            for (const loop of edges) {
                ctx.strokeStyle = loop[0] >= 8 ? faint : strong;
                ctx.beginPath();
                if (loop.length === 2) {
                    const a = place(vertices[loop[0]], angle);
                    const b = place(vertices[loop[1]], angle);
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                } else {
                    for (let i = 0; i <= loop.length; i++) {
                    const p = place(vertices[loop[i % loop.length]], angle);
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                    }
                }
                ctx.stroke();
            }
            raf = requestAnimationFrame(draw);
        };

        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
    <div className="min-w-0 border border-rule md:w-[220px] md:shrink-0">
        <canvas ref={ref} className="block h-32 w-full" />
    </div>
    );
}