"use client";

import { useEffect, useState } from "react";

export interface TocItem {
  id: string;
  label: string;
}

/** Sticky contents list that follows the reader down the page and lights the section being read. */
export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      // the last section whose heading has passed the line just under the nav is the one being read
      let current = items[0]?.id ?? "";
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= 140) current = i.id;
      }
      setActive(current);
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
  }, [items]);

  return (
    <nav aria-label="On this page" className="text-[0.875rem]">
      <p className="kicker mb-4">On this page</p>
      <ul className="border-line/70 space-y-0.5 border-l">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={`-ml-px block border-l py-1.5 pl-4 transition-colors duration-300 ${
                active === i.id ? "border-blue-lit text-bone" : "text-mute hover:text-bone border-transparent"
              }`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
