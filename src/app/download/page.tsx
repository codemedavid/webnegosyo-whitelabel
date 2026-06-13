import type { Metadata } from "next";
import Link from "next/link";
import { DesktopDownloads } from "@/components/download/desktop-downloads";
import { DESKTOP_VERSION, mobileDownloads } from "@/lib/downloads";

export const metadata: Metadata = {
  title: "Download WebNegosyo",
  description:
    "Download the WebNegosyo POS for macOS and Windows, plus the WebNegosyo mobile apps for iOS and Android. Run your restaurant from the counter or on the go.",
};

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* subtle grid / glow backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-white/[0.05] blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            WebNegosyo
          </Link>
          <nav className="flex items-center gap-6 text-sm text-white/60">
            <Link href="/support" className="transition-colors hover:text-white">
              Support
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
            Download
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Run your store, anywhere.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/55 sm:text-lg">
            Get the WebNegosyo POS for your counter and the mobile apps for life
            on the go. One platform, every screen.
          </p>
        </section>

        {/* Desktop POS */}
        <section className="mx-auto max-w-4xl px-6 pt-20 sm:pt-28">
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                WebNegosyo POS
              </h2>
              <p className="mt-1 text-sm text-white/50">
                The desktop point-of-sale for your store counter.
              </p>
            </div>
            <span className="text-xs text-white/40">
              Latest release · v{DESKTOP_VERSION}
            </span>
          </div>

          <DesktopDownloads />

          <p className="mt-6 text-center text-xs text-white/35">
            By downloading, you agree to our{" "}
            <Link href="/privacy" className="underline hover:text-white/60">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        {/* Mobile apps */}
        <section className="mx-auto max-w-4xl px-6 pt-24 sm:pt-32">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              WebNegosyo Mobile
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Manage orders and track sales from your phone.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {mobileDownloads.map((app) => (
              <div
                key={app.platform}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-8"
              >
                <div className="flex items-center gap-3">
                  {app.platform === "ios" ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-8 w-8 text-white"
                      aria-hidden
                    >
                      <path d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.83.93-2.2 1.65-3.32 1.56-.13-1.1.45-2.27 1.1-3 .73-.82 2.04-1.45 3.1-1.54.02.13.03.27.03.4zM20.94 17.1c-.5 1.15-.74 1.66-1.39 2.68-.9 1.42-2.18 3.18-3.76 3.2-1.4.01-1.76-.92-3.66-.91-1.9.01-2.3.93-3.7.92-1.58-.02-2.79-1.61-3.69-3.02-2.52-3.96-2.79-8.6-1.23-11.07 1.1-1.75 2.85-2.78 4.49-2.78 1.67 0 2.72.92 4.1.92 1.34 0 2.16-.92 4.09-.92 1.46 0 3.01.8 4.11 2.17-3.61 1.98-3.02 7.14.34 8.81z" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-8 w-8 text-white"
                      aria-hidden
                    >
                      <path d="M3.609 1.814 13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893 2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198 2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626-2.491-2.49 2.492-2.492zM5.864 2.658 16.802 8.99l-2.303 2.303-8.635-8.635z" />
                    </svg>
                  )}
                  <div>
                    <h3 className="font-semibold text-white">{app.store}</h3>
                    <p className="text-xs text-white/45">{app.label}</p>
                  </div>
                </div>

                <div className="mt-8">
                  {app.available && app.href ? (
                    <a
                      href={app.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                    >
                      Get it on {app.store}
                    </a>
                  ) : (
                    <span className="inline-flex w-full cursor-default items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-white/45">
                      Coming soon
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mx-auto mt-28 max-w-6xl border-t border-white/10 px-6 py-10 text-center text-xs text-white/35">
          <p>© {new Date().getFullYear()} WebNegosyo. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
