import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { StatsRow } from "@/components/StatsRow";
import { CrashStory } from "@/components/CrashStory";
import { HowItWorks } from "@/components/HowItWorks";
import { MarketSection } from "@/components/MarketSection";
import { NearSection } from "@/components/NearSection";
import { HonestSection } from "@/components/HonestSection";
import { PreFooter, Footer } from "@/components/Footer";
import { LiveProvider } from "@/components/LiveProvider";
import { Ticker } from "@/components/Ticker";

export default function Home() {
  return (
    <LiveProvider>
      <Nav />
      <main>
        <Hero />
        <StatsRow />
        <CrashStory />
        <Ticker />
        <HowItWorks />
        <MarketSection />
        <NearSection />
        <HonestSection />
      </main>
      <PreFooter />
      <Footer />
    </LiveProvider>
  );
}
