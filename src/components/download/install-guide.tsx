import type { ReactNode } from "react";
import type { MobileDownload } from "@/lib/downloads";
import { AndroidIcon, AppleIcon } from "./platform-icons";

interface InstallGuideProps {
  apps: readonly MobileDownload[];
  /** From the App Store listing; omitted from the copy when unknown. */
  minimumIosVersion: string | null;
}

interface GuideCardProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  steps: readonly ReactNode[];
  note?: string;
}

function GuideCard({ icon, title, subtitle, steps, note }: GuideCardProps) {
  return (
    <article className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="flex items-center gap-3.5">
        {icon}
        <div>
          <h3 className="font-[family-name:var(--font-landing-display)] text-xl font-bold text-white">{title}</h3>
          <p className="text-sm text-white/50">{subtitle}</p>
        </div>
      </div>
      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3.5 text-[15px] leading-relaxed text-white/75">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {note && (
        <p className="mt-6 rounded-xl bg-[var(--dl-amber)]/10 px-4 py-3 text-sm text-[var(--dl-amber)]">{note}</p>
      )}
    </article>
  );
}

const SIGN_IN_STEP = (
  <>
    Open <strong className="text-white">SmartMenu</strong> and sign in with your store account. New here?
    Tap <strong className="text-white">Explore the demo store</strong> to look around first.
  </>
);

/** Step-by-step install for each phone, with the APK's sideloading caveat. */
export function InstallGuide({ apps, minimumIosVersion }: InstallGuideProps) {
  const android = apps.find((app) => app.platform === "android");
  const iosSubtitle = minimumIosVersion
    ? `From the App Store · iOS ${minimumIosVersion} or later`
    : "From the App Store";
  const apkSize = android?.size ? ` It is about ${android.size}, so Wi-Fi helps.` : "";

  return (
    <section aria-labelledby="install-heading" className="mx-auto max-w-6xl px-5 pt-16 sm:pt-20">
      <h2 id="install-heading" className="font-[family-name:var(--font-landing-display)] text-3xl font-bold tracking-tight text-white">
        Install in a minute
      </h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <GuideCard
          icon={
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[var(--dl-ink)]">
              <AppleIcon className="h-6 w-6" />
            </span>
          }
          title="iPhone & iPad"
          subtitle={iosSubtitle}
          steps={[
            <>Tap <strong className="text-white">Download on the App Store</strong>, then <strong className="text-white">Get</strong>.</>,
            SIGN_IN_STEP,
          ]}
        />
        <GuideCard
          icon={
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--dl-red)] text-white">
              <AndroidIcon className="h-6 w-6" />
            </span>
          }
          title="Android"
          subtitle={android?.version ? `Direct download · v${android.version}` : "Direct download"}
          steps={[
            <>Tap <strong className="text-white">Download for Android</strong>.{apkSize}</>,
            <>Open the downloaded file. If your phone asks, allow your browser to <strong className="text-white">install unknown apps</strong>.</>,
            SIGN_IN_STEP,
          ]}
          note="Not on Google Play yet. Every new version is posted on this page."
        />
      </div>
    </section>
  );
}
