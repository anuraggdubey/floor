/**
 * A crowd seen from behind, watching. Rows get larger and denser toward the bottom so the band reads as
 * depth rather than a pattern. Generated from a fixed seed, so it renders identically everywhere.
 */
function rnd(n: number): number {
  const x = Math.sin(n * 91.7) * 10000;
  return x - Math.floor(x);
}

export function Crowd({ className = "" }: { className?: string }) {
  // Nearer rows are bigger, denser and darker, which is what gives the band its depth.
  const rows = [
    { y: 40, scale: 0.5, n: 22, fill: "#2f62b8" },
    { y: 58, scale: 0.64, n: 18, fill: "#204b96" },
    { y: 80, scale: 0.82, n: 14, fill: "#13306a" },
    { y: 110, scale: 1.06, n: 11, fill: "#0b1b3d" },
    { y: 148, scale: 1.32, n: 9, fill: "#070c18" },
  ];

  let k = 0;
  return (
    <svg viewBox="0 0 1200 170" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <pattern id="crowdTone" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="0.8" cy="0.8" r="0.75" fill="rgba(255,255,255,0.22)" />
        </pattern>
      </defs>

      {rows.map((row, ri) => {
        const step = 1200 / row.n;
        return (
          <g key={ri}>
            {Array.from({ length: row.n + 1 }).map((_, i) => {
              k++;
              const jitter = (rnd(k) - 0.5) * step * 0.4;
              const x = i * step + jitter;
              const s = row.scale * (0.9 + rnd(k + 300) * 0.22);
              const hat = rnd(k + 700) > 0.72;
              const lift = rnd(k + 900) > 0.93; // one or two with a raised arm
              const head = 13 * s;
              // the occasional pale head keeps the band from flattening into one silhouette
              const pale = rnd(k + 1200) > 0.9;
              return (
                <g key={i} transform={`translate(${x} ${row.y})`} fill={pale ? "#c9d3e2" : row.fill}>
                  {/* shoulders */}
                  <path
                    d={`M${-26 * s} ${74 * s} c0 ${-24 * s} ${11 * s} ${-36 * s} ${26 * s} ${-36 * s} s${26 * s} ${12 * s} ${26 * s} ${36 * s} z`}
                  />
                  {/* head */}
                  <ellipse cx="0" cy={2 * s} rx={head * 0.8} ry={head} />
                  {hat && (
                    <g>
                      <ellipse cx="0" cy={-4 * s} rx={head * 1.5} ry={head * 0.4} fill="#e3e8f0" />
                      <ellipse cx="0" cy={-10 * s} rx={head * 0.82} ry={head * 0.5} fill="#e3e8f0" />
                    </g>
                  )}
                  {lift && (
                    <path
                      d={`M${-22 * s} ${44 * s} l${-10 * s} ${-34 * s} l${7 * s} ${-3 * s} l${11 * s} ${32 * s} z`}
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      <rect width="1200" height="170" fill="url(#crowdTone)" opacity="0.25" />
    </svg>
  );
}
