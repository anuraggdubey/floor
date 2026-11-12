"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/** Sticky top bar: mark on the left, section links through the middle, one bright action on the right. */
export function Nav({ cta = { href: "/play", label: "Break the peg" } }: { cta?: { href: string; label: string } }) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        solid ? "bg-ink/85 border-b border-line/70 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <nav className="shell flex h-16 items-center justify-between gap-6">
        <Link href="/" className="transition-opacity hover:opacity-70" aria-label="Floor home">
          <Logo />
        </Link>

        <div className="hidden items-center gap-8 text-[0.9375rem] text-mute md:flex">
          <Link href="/time-machine" className="text-amber transition-colors hover:text-bone">
            Time machine
          </Link>
          <a href="#how" className="transition-colors hover:text-bone">
            How it works
          </a>
          <a href="#market" className="transition-colors hover:text-bone">
            The market
          </a>
          <a href="#near" className="transition-colors hover:text-bone">
            On NEAR
          </a>
          <a href="#honest" className="transition-colors hover:text-bone">
            Honest limits
          </a>
        </div>

        <Link
          href={cta.href}
          className="bg-blue hover:bg-blue-lit rounded-[4px] px-4 py-2 text-[0.9375rem] font-medium text-white transition-all duration-300 hover:-translate-y-px"
        >
          {cta.label}
        </Link>
      </nav>
    </header>
  );
}
