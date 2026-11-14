"use client";

import { useRef, type ReactNode } from "react";

/**
 * A wrapper that makes its child lean toward the pointer while it is near, then spring back. The pull is
 * small on purpose: a button should feel eager, not loose. Mouse-only through CSS (`.magnet`).
 */
export function Magnetic({
  children,
  strength = 0.22,
  className = "",
}: {
  children: ReactNode;
  /** how far, as a fraction of the pointer offset from the centre */
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={ref}
      className={`magnet ${className}`}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.setProperty("--mag-x", `${dx * strength}px`);
        el.style.setProperty("--mag-y", `${dy * strength}px`);
      }}
      onPointerLeave={() => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty("--mag-x", "0px");
        el.style.setProperty("--mag-y", "0px");
      }}
    >
      {children}
    </div>
  );
}
