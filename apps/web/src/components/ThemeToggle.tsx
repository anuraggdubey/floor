"use client";

import { useEffect, useState } from "react";

const KEY = "floor.theme";

/** Dark / light switch. The choice is saved, and applied before first paint by a script in the layout. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={light}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      className="inline-flex items-center gap-2.5 rounded-full border border-white/30 py-1.5 pr-3.5 pl-2 text-[0.8125rem] text-white transition-colors hover:bg-white/10"
    >
      <span className="relative flex h-5 w-9 items-center rounded-full bg-black/25 transition-colors">
        <span
          className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ${light ? "translate-x-[1.1rem]" : "translate-x-0.5"}`}
        />
      </span>
      {light ? "Light mode" : "Dark mode"}
    </button>
  );
}
