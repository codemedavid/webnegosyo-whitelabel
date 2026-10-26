import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DesktopDownloads } from "@/components/download/desktop-downloads";
import { GetAppButtons } from "@/components/download/get-app-buttons";
import { InstallGuide } from "@/components/download/install-guide";
import { ListingStats } from "@/components/download/listing-stats";
import { ScanToDownload } from "@/components/download/scan-to-download";
import { ScreenshotRail } from "@/components/download/screenshot-rail";
import { WhatsNew } from "@/components/download/whats-new";
import { landingFontClass } from "@/components/landing/landing-fonts";
import { SMARTMENU } from "@/components/landing/landing-theme";
import { APP_SCREENS, APP_SCREEN_SIZE } from "@/lib/download/app-screens";
import { fetchAppStoreListing } from "@/lib/download/app-store-listing";
import { DESKTOP_VERSION, desktopDownloads, mobileDownloads } from "@/lib/downloads";

export const metadata: Metadata = {
  title: "Download SmartMenu — the app for food businesses",
  description:
    "Get the SmartMenu app for iPhone, iPad and Android. Take orders, ring up sales, split bills and see who keeps coming back, all from one phone.",
};

/** Matches the App Store lookup's own cache window. */
export const revalidate = 21600;

const PAGE_TOKENS = {
  "--dl-night": "#0E0B09",
  "--dl-ink": SMARTMENU.ink,
  "--dl-red": SMARTMENU.red,
  "--dl-red-deep": SMARTMENU.redDeep,
  "--dl-amber": SMARTMENU.amber,
  backgroundColor: "#0E0B09",
  fontFamily: "var(--font-landing-text), system-ui, sans-serif",
} as CSSProperties;

/** Three screenshots fanned behind the hero on wide screens. */
const HERO_FAN = [
  { screen: APP_SCREENS[1], className: "left-0 top-10 -rotate-[8deg]" },
  { screen: APP_SCREENS[2], className: "right-0 top-10 rotate-[8deg]" },
  { screen: APP_SCREENS[0], className: "left-1/2 top-0 z-10 -translate-x-1/2" },
] as const;

function HeroFan() {
  return (
    <div className="relative hidden h-[500px] w-[400px] shrink-0 lg:block" aria-hidden>
      {HERO_FAN.map(({ screen, className }) => (
        <Image
          key={screen.src}
          src={screen.src}
          alt=""
          width={APP_SCREEN_SIZE.width}
          height={APP_SCREEN_SIZE.height}
          sizes="216px"
          priority
          className={`absolute w-[216px] rounded-[26px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 ${className}`}
        />
      ))}
    </div>
  );
}

export default async function DownloadPage() {
  const listing = await fetchAppStoreListing();
  const iosApp = mobileDownloads.find((app) => app.platform === "ios");
  const androidApp = mobileDownloads.find((app) => app.platform === "android");
  const fallbackVersion = androidApp?.version ?? iosApp?.version ?? DESKTOP_VERSION;
  // The version line and the disclaimer only mean something while there is a
  // desktop build to download; every card reads "Coming soon" otherwise.
  const hasDesktopBuild = desktopDownloads.some((build) => build.available);

  return (
    <div className={`${landingFontClass} relative min-h-screen overflow-x-hidden text-white`} style={PAGE_TOKENS}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden" aria-hidden>
        <div className="absolute -left-40 -top-56 h-[560px] w-[560px] rounded-full bg-[var(--dl-red)] opacity-25 blur-[140px]" />
        <div className="absolute -right-32 top-24 h-[420px] w-[420px] rounded-full bg-[var(--dl-amber)] opacity-10 blur-[140px]" />
      </div>

      <div className="relative">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/smartmenu-mark.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-[family-name:var(--font-landing-display)] text-lg font-bold">SmartMenu</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-white/60">
            <Link href="/support" className="transition-colors hover:text-white">Support</Link>
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
          </nav>
        </header>

        <section className="mx-auto max-w-6xl px-5 pt-8 sm:pt-14">
          <div className="flex items-center justify-between gap-12">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-5 sm:gap-7">
                <Image
                  src="/download/app-icon.png"
                  alt="SmartMenu app icon"
                  width={144}
                  height={144}
                  priority
                  className="h-24 w-24 shrink-0 rounded-[24%] bg-white shadow-[0_24px_60px_-18px_rgba(215,38,29,0.65)] ring-1 ring-white/10 sm:h-36 sm:w-36"
                />
                <div className="min-w-0 pt-1 sm:pt-3">
                  <h1 className="font-[family-name:var(--font-landing-display)] text-4xl font-extrabold leading-none tracking-tight sm:text-6xl">
                    SmartMenu
                  </h1>
                  <p className="mt-2 text-base text-white/60 sm:text-xl">Smart Menu for Food Business</p>
                  <p className="mt-1.5 text-sm text-white/40">by WebNegosyo · iPhone, iPad &amp; Android</p>
                </div>
              </div>

              <p className="mt-8 max-w-xl font-[family-name:var(--font-landing-display)] text-2xl font-bold leading-tight sm:text-[34px]">
                Run your whole restaurant from <span className="whitespace-nowrap text-[var(--dl-amber)]">one phone.</span>
              </p>
              <p className="mt-3 max-w-xl text-white/55 sm:text-lg">
                Orders that ring, a register that prints, bills that split themselves and reports on
                who keeps coming back. Free to download for every SmartMenu store.
              </p>

              <div className="mt-8">
                {/* mobileDownloads is the one source for both buttons. */}
                <GetAppButtons apps={mobileDownloads} />
              </div>

              <div className="mt-8 hidden lg:block">
                <ScanToDownload />
              </div>
            </div>

            <HeroFan />
          </div>

          <ListingStats listing={listing} fallbackVersion={fallbackVersion} />
        </section>

        <ScreenshotRail screens={APP_SCREENS} />

        <InstallGuide apps={mobileDownloads} minimumIosVersion={listing?.minimumOsVersion ?? null} />

        <WhatsNew listing={listing} appStoreUrl={iosApp?.available ? iosApp.href : null} />

        <section aria-labelledby="desktop-heading" className="mx-auto max-w-6xl px-5 pt-20 sm:pt-28">
          <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="desktop-heading" className="font-[family-name:var(--font-landing-display)] text-3xl font-bold tracking-tight">
                Desktop POS
              </h2>
              <p className="mt-1 text-sm text-white/50">The point-of-sale for your store counter, on Mac and Windows.</p>
            </div>
            {hasDesktopBuild && (
              <span className="text-xs text-white/40">Latest release · v{DESKTOP_VERSION}</span>
            )}
          </div>

          <DesktopDownloads />

          {hasDesktopBuild && (
            <p className="mt-6 text-center text-xs text-white/35">
              By downloading, you agree to our{" "}
              <Link href="/privacy" className="underline hover:text-white/60">Privacy Policy</Link>.
            </p>
          )}
        </section>

        <footer className="mx-auto mt-24 flex max-w-6xl flex-col items-center gap-2 border-t border-white/10 px-5 py-10 text-center text-xs text-white/35 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} WebNegosyo. All rights reserved.</p>
          <p>Apple, the Apple logo and App Store are trademarks of Apple Inc.</p>
        </footer>
      </div>
    </div>
  );
}
