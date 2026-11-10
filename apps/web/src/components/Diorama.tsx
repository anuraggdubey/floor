"use client";

import { useEffect, useRef } from "react";
import { drawScene, type SceneState } from "@/lib/diorama";

/**
 * Canvas host for the diorama. Keeps the scene in a ref so the render loop never restarts when live data
 * arrives — the picture just keeps moving while the numbers change underneath it.
 */
export function Diorama({
  scene,
  className = "",
  scale = 1,
  yOffset = 0,
  xOffset = 0,
  dim = 0,
  paused = false,
}: {
  scene: SceneState;
  className?: string;
  scale?: number;
  yOffset?: number;
  xOffset?: number;
  dim?: number;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef(scene);
  const optsRef = useRef({ scale, yOffset, xOffset, dim });
  sceneRef.current = scene;
  optsRef.current = { scale, yOffset, xOffset, dim };

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
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || paused) return;
      if (t - last < (reduced ? 200 : 1000 / 48)) return; // cap the frame rate
      last = t;
      ctx.clearRect(0, 0, w, h);
      const o = optsRef.current;
      drawScene(ctx, w, h, sceneRef.current, t, o);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [paused]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
