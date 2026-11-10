/**
 * The Floor mark, drawn by hand rather than constructed from perfect geometry: a shelter standing on a
 * floor line that has cracked open beneath it. Every stroke is slightly off-true on purpose, so the mark
 * reads as inked rather than generated. The crack draws itself in and the window warms up on hover.
 */
export function LogoMark({ className = "", animate = true }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={`${className} group/mark`}>
      <g
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* roof: two hand-pulled strokes that do not quite meet at the apex */}
        <path d="M5.4 14.3C8.1 11 11 8.1 14.4 5.2c0.6-0.5 1.3-0.5 1.9 0 3.3 2.8 6.3 5.8 9.1 9.2" />
        {/* walls, each leaning a hair differently */}
        <path d="M8.3 13.4v8.9" />
        <path d="M23.4 13.9v8.4" />
        {/* floor line, left of the break — drawn with a slight sag, as a real line would be */}
        <path d="M2.3 23.6c3.4 0.5 7 0.7 10.6 0.6" />
        {/* floor line, right of the break — dropped lower: this side has already given way */}
        <path d="M19.4 25.1c3.4-0.2 6.9-0.6 10.3-1.2" />
      </g>
      {/* the crack: a jagged gap where the floor let go */}
      <path
        d="M12.9 24.2 15 28.6l1.4-3.1 1.6 3.4 1-3.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={animate ? 0.55 : 0.55}
        className={animate ? "transition-opacity duration-500 group-hover/mark:opacity-100" : ""}
        vectorEffect="non-scaling-stroke"
      />
      {/* the window: the one warm thing in the mark, and the only filled shape */}
      <circle
        cx="15.9"
        cy="17.4"
        r="2.5"
        className={
          animate
            ? "fill-amber transition-all duration-500 group-hover/mark:fill-[color-mix(in_oklab,var(--color-amber)_100%,white_28%)]"
            : "fill-amber"
        }
      />
    </svg>
  );
}

/** Mark plus wordmark. The word is spaced out so it reads like a plaque rather than a logo type. */
export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-7 w-7 shrink-0" />
      {!compact && (
        <span className="font-display text-[1.0625rem] font-medium tracking-[0.14em] uppercase">Floor</span>
      )}
    </span>
  );
}
