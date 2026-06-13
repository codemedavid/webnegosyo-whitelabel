"use client";

import { useEffect, useState } from "react";
import {
  DESKTOP_VERSION,
  desktopDownloads,
  type DesktopDownload,
} from "@/lib/downloads";

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.83.93-2.2 1.65-3.32 1.56-.13-1.1.45-2.27 1.1-3 .73-.82 2.04-1.45 3.1-1.54.02.13.03.27.03.4zM20.94 17.1c-.5 1.15-.74 1.66-1.39 2.68-.9 1.42-2.18 3.18-3.76 3.2-1.4.01-1.76-.92-3.66-.91-1.9.01-2.3.93-3.7.92-1.58-.02-2.79-1.61-3.69-3.02-2.52-3.96-2.79-8.6-1.23-11.07 1.1-1.75 2.85-2.78 4.49-2.78 1.67 0 2.72.92 4.1.92 1.34 0 2.16-.92 4.09-.92 1.46 0 3.01.8 4.11 2.17-3.61 1.98-3.02 7.14.34 8.81z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M0 3.45 9.75 2.1v9.45H0V3.45zM10.95 1.95 24 0v11.4H10.95V1.95zM0 12.6h9.75v9.45L0 20.55V12.6zM10.95 12.6H24V24l-13.05-1.8V12.6z" />
    </svg>
  );
}

function DownloadCard({
  item,
  recommended,
}: {
  item: DesktopDownload;
  recommended: boolean;
}) {
  const Icon = item.os === "macos" ? AppleIcon : WindowsIcon;

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border p-8 transition-colors ${
        recommended
          ? "border-white/40 bg-white/[0.06]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      }`}
    >
      {recommended && (
        <span className="absolute -top-3 left-8 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-black">
          Recommended for you
        </span>
      )}

      <Icon className="h-10 w-10 text-white" />

      <h3 className="mt-6 text-2xl font-semibold text-white">{item.label}</h3>
      <p className="mt-1 text-sm text-white/50">{item.requirement}</p>

      <div className="mt-6 flex items-center gap-3 text-xs text-white/40">
        <span className="rounded-md border border-white/10 px-2 py-1">
          v{DESKTOP_VERSION}
        </span>
        <span>{item.ext}</span>
        <span>·</span>
        <span>{item.size}</span>
      </div>

      <a
        href={item.href}
        download
        className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-colors ${
          recommended
            ? "bg-white text-black hover:bg-white/90"
            : "border border-white/20 text-white hover:bg-white/10"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download for {item.label}
      </a>
    </div>
  );
}

export function DesktopDownloads() {
  const [detectedOs, setDetectedOs] = useState<"macos" | "windows" | null>(null);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) setDetectedOs("macos");
    else if (ua.includes("win")) setDetectedOs("windows");
  }, []);

  // Sort so the detected OS comes first
  const ordered = [...desktopDownloads].sort((a, b) => {
    if (a.os === detectedOs) return -1;
    if (b.os === detectedOs) return 1;
    return 0;
  });

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {ordered.map((item) => (
        <DownloadCard
          key={item.os}
          item={item}
          recommended={item.os === detectedOs}
        />
      ))}
    </div>
  );
}
