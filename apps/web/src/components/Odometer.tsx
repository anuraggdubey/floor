"use client";

/**
 * A number whose digits roll into place like a mechanical counter. Used for the live peg price, where the
 * eye should catch *which* digits moved: a one-tick drift in the last place barely stirs, a crash spins the
 * leading digits.
 */
export function Odometer({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`tnum inline-flex ${className}`} aria-label={value}>
      {Array.from(value).map((ch, i) => {
        if (ch < "0" || ch > "9") return <span key={i}>{ch}</span>;
        const d = Number(ch);
        return (
          <span key={i} className="odo" aria-hidden="true">
            <span style={{ transform: `translateY(${-d}em)` }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <i key={n}>{n}</i>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
