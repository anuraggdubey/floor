import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";
import { RevealProvider } from "@/components/Reveal";
import { Atmosphere } from "@/components/Atmosphere";

const grotesk = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://floorxa.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: "Floor",
  title: "Floor — depeg cover you can break yourself",
  description:
    "A depeg cover market on NEAR. Solvers compete to back your cover with their own margin; when the peg breaks for long enough, the contract pays you. Break the peg yourself and watch it happen.",
  openGraph: {
    title: "Floor — depeg cover you can break yourself",
    description: "Break the peg yourself and watch the cover pay. Built on NEAR.",
    type: "website",
    siteName: "Floor",
  },
  twitter: {
    card: "summary_large_image",
    title: "Floor — depeg cover you can break yourself",
    description: "Break the peg yourself and watch the cover pay. Built on NEAR.",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* set the saved theme before first paint so a light-mode visitor never sees a dark flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('floor.theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}",
          }}
        />
      </head>
      <body className="bg-ink text-bone antialiased">
        <SmoothScroll />
        <RevealProvider />
        <Atmosphere />
        <div className="page-enter">{children}</div>
      </body>
    </html>
  );
}
