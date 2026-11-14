"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Magnetic } from "./Magnetic";
import { ThemeIconToggle } from "./ThemeToggle";

/**
 * Sticky top bar: mark on the left, section links through the middle, one bright action on the right.
 * It steps out of the way while you read down and comes back the moment you scroll up.
 */
export function Nav({ cta = { href: "/play", label: "Break the peg" } }: { cta?: { href: string; label: string } }) {
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  // On the landing page the section links are in-page anchors; from any other page they lead back to it.
  const pathname = usePathname();
  const home = pathname === "/" ? "" : "/";

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(y > 24);
      // hide only on a deliberate downward scroll, well past the hero chip
      if (y > 160 && y > last + 4) setHidden(true);
      else if (y < last - 4 || y < 160) setHidden(false);
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,transform,backdrop-filter] duration-500 [transition-timing-function:var(--ease-out-quint)] ${
        solid ? "bg-ink/85 border-b border-line/70 backdrop-blur-xl" : "bg-transparent"
      } ${hidden ? "-translate-y-full" : "translate-y-0"}`}
    >
      <nav className="shell flex h-16 items-center justify-between gap-6">
        <Link href="/" className="transition-opacity hover:opacity-70" aria-label="Floor home">
          <Logo />
        </Link>

        <div className="hidden items-center gap-8 text-[0.9375rem] text-mute md:flex">
          <Link href="/time-machine" className="link-draw text-amber hover:text-bone">
            Time machine
          </Link>
          <a href={`${home}#how`} className="link-draw hover:text-bone">
            How it works
          </a>
          <a href={`${home}#near`} className="link-draw hover:text-bone">
            On NEAR
          </a>
          <Link href="/docs" className={`link-draw hover:text-bone ${pathname === "/docs" ? "text-bone" : ""}`}>
            Docs
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <ThemeIconToggle />
        <Magnetic strength={0.18}>
          <Link
            href={cta.href}
            className="bg-blue hover:bg-blue-lit inline-block rounded-[4px] px-4 py-2 text-[0.9375rem] font-medium text-white transition-[background-color,box-shadow] duration-300 hover:shadow-[0_8px_24px_rgba(30,110,243,0.35)]"
          >
            {cta.label}
          </Link>
        </Magnetic>
        </div>
      </nav>
    </header>
  );
}
