"use client";

import { useEffect, useRef } from "react";
import { drawScene, type SceneState } from "@/lib/diorama";

export interface Camera {
  scale: number;
  /** Horizontal / vertical offset as a fraction of the canvas. */
  x: number;
  y: number;
}

/**
 * Canvas host for the diorama. Keeps the scene in a ref so the render loop never restarts when live data
 * arrives — the picture just keeps moving while the numbers change underneath it.
 *
 * `camera`, when given, is a *target*: the view glides to it rather than cutting, which is what makes a
 * guided sequence feel filmed instead of slideshown. `parallax` tilts the view a hair toward the pointer.
 */
export function Diorama({
  scene,
  className = "",
  scale = 1,
  yOffset = 0,
  xOffset = 0,
  dim = 0,
  paused = false,
  camera,
  parallax = false,
}: {
  scene: SceneState;
  className?: string;
  scale?: number;
  yOffset?: number;
  xOffset?: number;
  dim?: number;
  paused?: boolean;
  camera?: Camera;
  parallax?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef(scene);
  const targetRef = useRef<Camera>({ scale, x: xOffset, y: yOffset });
  const dimRef = useRef(dim);
  sceneRef.current = scene;
  dimRef.current = dim;
  targetRef.current = camera ?? { scale, x: xOffset, y: yOffset };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    // Only animate while on screen, so a background canvas never burns a laptop battery.
    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true), { threshold: 0 });
    io.observe(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // pointer position as -1..1, smoothed in the loop
    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (parallax && !reduced) window.addEventListener("pointermove", onMove, { passive: true });

    const cur: Camera = { ...targetRef.current };
    const par = { x: 0, y: 0 };
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || paused) return;
      const dt = last ? Math.min(64, t - last) : 16;
      if (t - last < (reduced ? 200 : 1000 / 48)) return; // cap the frame rate
      last = t;

      // frame-rate independent easing toward the target camera
      const k = 1 - Math.pow(0.0009, dt / 1000);
      const tg = targetRef.current;
      cur.scale += (tg.scale - cur.scale) * k;
      cur.x += (tg.x - cur.x) * k;
      cur.y += (tg.y - cur.y) * k;
      par.x += (mouse.x - par.x) * 0.05;
      par.y += (mouse.y - par.y) * 0.05;

      ctx.clearRect(0, 0, w, h);
      // Effect timestamps (dumps, payouts) are wall-clock Date.now() values, but requestAnimationFrame hands us
      // time since page load. Mixing the two made every effect look permanently fresh, so use one clock.
      drawScene(ctx, w, h, sceneRef.current, performance.timeOrigin + t, {
        scale: cur.scale,
        xOffset: cur.x + par.x * 0.012,
        yOffset: cur.y + par.y * 0.008,
        dim: dimRef.current,
      });
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
    };
  }, [paused, parallax]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
