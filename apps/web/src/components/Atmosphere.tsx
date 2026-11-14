"use client";

import { useEffect, useRef } from "react";

/**
 * Two quiet layers on top of every page: a film grain that stops the dark background from looking like a flat
 * fill, and a hairline at the very top that fills as you read down. Neither takes clicks.
 */
export function Atmosphere() {
  const bar = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      el.style.transform = `scaleX(${p})`;
      el.style.opacity = max > 200 ? "1" : "0";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div ref={bar} className="scroll-progress" aria-hidden="true" />
    </>
  );
}
