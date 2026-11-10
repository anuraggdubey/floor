/**
 * The doorway: a figure stepping into a wall of live panels. Drawn entirely in SVG so it costs nothing to
 * load, scales to any screen, and carries the same cut-out-collage feel as the rest of the page.
 */
export function Doorway({ className = "" }: { className?: string }) {
  const panels = [
    { x: 14, y: 18, w: 70, h: 44 },
    { x: 14, y: 68, w: 70, h: 34 },
    { x: 14, y: 108, w: 70, h: 58 },
    { x: 216, y: 18, w: 70, h: 34 },
    { x: 216, y: 58, w: 70, h: 54 },
    { x: 216, y: 118, w: 70, h: 48 },
  ];

  return (
    <svg viewBox="0 0 300 230" className={className} role="img" aria-label="A figure stepping into a wall of live market panels">
      <defs>
        <pattern id="halftone" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.18)" />
        </pattern>
        <linearGradient id="doorGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b0c0e" />
          <stop offset="100%" stopColor="#141922" />
        </linearGradient>
        <clipPath id="doorClip">
          <rect x="96" y="0" width="108" height="206" rx="2" />
        </clipPath>
      </defs>

      {/* the door frame: a dark slab cut into the blue */}
      <rect x="4" y="6" width="292" height="200" rx="3" fill="#0b0c0e" />
      <rect x="4" y="6" width="292" height="200" rx="3" fill="url(#halftone)" opacity="0.5" />

      {/* side panels: little charts and books either side of the opening */}
      {panels.map((p, i) => (
        <g key={i}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2" fill="#12161c" stroke="#222831" strokeWidth="0.8" />
          {i % 2 === 0 ? (
            <polyline
              points={`${p.x + 5},${p.y + p.h - 8} ${p.x + p.w * 0.3},${p.y + p.h * 0.45} ${p.x + p.w * 0.52},${p.y + p.h * 0.62} ${p.x + p.w * 0.74},${p.y + 7} ${p.x + p.w - 5},${p.y + p.h * 0.3}`}
              fill="none"
              stroke="#1e6ef3"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          ) : (
            Array.from({ length: 6 }).map((_, r) => (
              <g key={r}>
                <rect x={p.x + 5} y={p.y + 6 + r * 5} width={18 + ((r * 7) % 16)} height="2" fill="#46e39b" opacity="0.5" />
                <rect x={p.x + p.w - 24} y={p.y + 6 + r * 5} width={14 + ((r * 5) % 10)} height="2" fill="#ff4438" opacity="0.45" />
              </g>
            ))
          )}
        </g>
      ))}

      {/* the opening itself, lit from deep inside */}
      <g clipPath="url(#doorClip)">
        <rect x="96" y="0" width="108" height="206" fill="url(#doorGlow)" />
        {/* a corridor of receding panels, drawing the eye in */}
        {[0, 1, 2, 3].map((d) => {
          const inset = d * 11;
          const o = 0.5 - d * 0.1;
          return (
            <rect
              key={d}
              x={101 + inset}
              y={14 + inset * 0.9}
              width={98 - inset * 2}
              height={176 - inset * 1.8}
              fill="none"
              stroke="#1e6ef3"
              strokeWidth="1"
              opacity={o}
            />
          );
        })}
        {/* the floor of the corridor, with a crack running down it */}
        <polygon points="96,206 204,206 168,120 132,120" fill="#0f1319" />
        <path d="M150 120 L146 150 L154 172 L148 206" stroke="#ff4438" strokeWidth="1.6" fill="none" opacity="0.8" />
        {/* light spilling out of the crack */}
        <ellipse cx="150" cy="170" rx="34" ry="12" fill="#ff4438" opacity="0.1" />

        {/* the figure, mid-step, seen from behind */}
        <g fill="#0b0c0e">
          <ellipse cx="150" cy="126" rx="8.5" ry="9.5" />
          <path d="M141 137c0-3 4-5 9-5s9 2 9 5l3 33c0 2-2 3-4 3h-16c-2 0-4-1-4-3z" />
          <path d="M140 141l-5 25 4 1 5-24z" />
          <path d="M160 141l5 25-4 1-5-24z" />
          <path d="M145 172l-2 24h5l3-21zM155 172l2 24h-5l-3-21z" />
        </g>
        <ellipse cx="150" cy="198" rx="17" ry="4" fill="#000" opacity="0.5" />
      </g>

      {/* frame edge highlights */}
      <rect x="96" y="0" width="108" height="206" rx="2" fill="none" stroke="#1e6ef3" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}
