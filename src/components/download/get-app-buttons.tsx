"use client";

import type { MobileDownload } from "@/lib/downloads";
import { AndroidIcon, AppleIcon } from "./platform-icons";
import { useMobilePlatform } from "./use-mobile-platform";

interface GetAppButtonsProps {
  apps: readonly MobileDownload[];
}

interface StoreButtonProps {
  app: MobileDownload;
  isRecommended: boolean;
}

const BUTTON_BASE =
  "relative inline-flex h-16 min-w-[232px] items-center gap-3.5 rounded-2xl px-5 text-left transition motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dl-amber)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dl-night)]";

function buttonCopy(app: MobileDownload): { eyebrow: string; title: string } {
  if (app.platform === "ios") return { eyebrow: "Download on the", title: "App Store" };
  return { eyebrow: "Download for", title: "Android" };
}

function StoreButton({ app, isRecommended }: StoreButtonProps) {
  const Icon = app.platform === "ios" ? AppleIcon : AndroidIcon;
  const { eyebrow, title } = buttonCopy(app);
  const tone =
    app.platform === "ios"
      ? "bg-white text-[var(--dl-ink)] hover:bg-white/90"
      : "bg-[var(--dl-red)] text-white hover:bg-[var(--dl-red-deep)]";
  const apkMeta = app.kind === "apk" && app.size ? `APK · ${app.size}` : null;

  if (!app.available || !app.href) {
    return (
      <span className={`${BUTTON_BASE} cursor-default border border-white/15 text-white/45`}>
        <Icon className="h-7 w-7 shrink-0" />
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-medium">{title}</span>
          <span className="text-lg font-semibold">Coming soon</span>
        </span>
      </span>
    );
  }

  // The App Store opens its own app on a phone; a new tab keeps this page on a
  // computer. The APK is a file, so it downloads without leaving the page.
  const linkTarget =
    app.kind === "store" ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <a href={app.href} {...linkTarget} className={`${BUTTON_BASE} ${tone}`}>
      {isRecommended && (
        <span className="absolute -top-2.5 right-3 rounded-full bg-[var(--dl-amber)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--dl-ink)]">
          Your phone
        </span>
      )}
      <Icon className="h-8 w-8 shrink-0" />
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] font-medium opacity-75">{eyebrow}</span>
        <span className="font-[family-name:var(--font-landing-display)] text-[22px] font-bold leading-none">
          {title}
        </span>
      </span>
      {apkMeta && (
        <span className="ml-auto pl-2 text-[11px] font-medium opacity-75">{apkMeta}</span>
      )}
    </a>
  );
}

/**
 * The two store buttons. On a phone, that phone's button moves first and is
 * marked; on a computer both stay in their usual order.
 */
export function GetAppButtons({ apps }: GetAppButtonsProps) {
  const platform = useMobilePlatform();
  const ordered = [...apps].sort((a, b) => {
    if (a.platform === platform) return -1;
    if (b.platform === platform) return 1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {ordered.map((app) => (
        <StoreButton key={app.platform} app={app} isRecommended={app.platform === platform} />
      ))}
    </div>
  );
}
