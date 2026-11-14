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

/** Compact sun / moon button for the navbar. Same saved choice as the footer switch. */
export function ThemeIconToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const read = () => setLight(document.documentElement.dataset.theme === "light");
    read();
    // stay in step with the footer switch
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  function toggle() {
    const next = !light;
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {
      /* private mode: lasts for this visit */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      className="border-line text-mute hover:text-bone hover:border-mute/60 inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
    >
      {light ? (
        <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
