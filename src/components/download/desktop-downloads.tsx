"use client";

import { useEffect, useState } from "react";
import {
  DESKTOP_VERSION,
  desktopDownloads,
  type DesktopDownload,
} from "@/lib/downloads";
import { AppleIcon, WindowsIcon } from "./platform-icons";

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
        {item.available && (
          <span className="rounded-md border border-white/10 px-2 py-1">
            v{DESKTOP_VERSION}
          </span>
        )}
        <span>{item.ext}</span>
        {item.size && (
          <>
            <span>·</span>
            <span>{item.size}</span>
          </>
        )}
      </div>

      {item.available && item.href ? (
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
      ) : (
        <span className="mt-8 inline-flex w-full items-center justify-center rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white/35">
          Coming soon
        </span>
      )}
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

  // Downloadable builds first, then the visitor's own OS.
  const ordered = [...desktopDownloads].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
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
          recommended={item.available && item.os === detectedOs}
        />
      ))}
    </div>
  );
}
