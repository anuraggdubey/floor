"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Watches every [data-reveal] on the page and flips it on as it enters view. One observer for the whole
 * document, so adding a reveal anywhere costs nothing.
 */
export function RevealProvider() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.shown = "true";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}

/** Splits text into letters that rise into place one after another. */
export function SplitText({
  children,
  className = "",
  delay = 0,
  step = 18,
  as: Tag = "span",
}: {
  children: string;
  className?: string;
  delay?: number;
  step?: number;
  as?: "span" | "h1" | "h2" | "p";
}) {
  const words = children.split(" ");
  let i = 0;
  return (
    <Tag className={className} data-reveal>
      {words.map((word, wi) => (
        <span key={wi} className="inline-block whitespace-nowrap">
          {Array.from(word).map((ch, ci) => (
            <span key={ci} data-letter style={{ ["--letter-delay" as string]: `${delay + i++ * step}ms` }}>
              {ch}
            </span>
          ))}
          {wi < words.length - 1 && <span data-letter style={{ ["--letter-delay" as string]: `${delay + i++ * step}ms` }}>&nbsp;</span>}
        </span>
      ))}
    </Tag>
  );
}

/** A plain block that rises in when it reaches the viewport. */
export function Rise({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={ref} className={className} data-reveal style={{ ["--reveal-delay" as string]: `${delay}ms` }}>
      {children}
    </div>
  );
}
