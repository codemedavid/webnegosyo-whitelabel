import type { ReactNode } from "react";
import { formatReleaseDate, type AppStoreListing } from "@/lib/download/app-store-listing";
import { BriefcaseIcon, StarIcon } from "./platform-icons";

interface ListingStatsProps {
  listing: AppStoreListing | null;
  /**
   * Shown when the App Store can't be read: the iOS version this page offers.
   * Never another platform's — null shows a dash.
   */
  fallbackVersion: string | null;
}

interface StatCell {
  label: string;
  value: ReactNode;
  caption: ReactNode;
}

const STAR_COUNT = 5;

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="flex justify-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: STAR_COUNT }, (_, index) => (
        <StarIcon
          key={index}
          className={`h-3.5 w-3.5 ${index < filled ? "text-[var(--dl-amber)]" : "text-white/20"}`}
        />
      ))}
    </span>
  );
}

const UNKNOWN_VERSION = "—";

function buildCells(listing: AppStoreListing | null, fallbackVersion: string | null): StatCell[] {
  const ratingCell: StatCell[] =
    listing?.rating != null
      ? [
          {
            label: `${listing.ratingCount} ${listing.ratingCount === 1 ? "Rating" : "Ratings"}`,
            value: listing.rating.toFixed(1),
            caption: <Stars rating={listing.rating} />,
          },
        ]
      : [];
  const releasedOn = listing?.releasedAt ? formatReleaseDate(listing.releasedAt) : null;

  return [
    ...ratingCell,
    { label: "Price", value: "Free", caption: "To download" },
    { label: "Age rating", value: "4+", caption: "Years" },
    {
      label: "Category",
      value: <BriefcaseIcon className="mx-auto h-7 w-7" />,
      caption: "Business",
    },
    {
      label: "Version",
      value: listing?.version ?? fallbackVersion ?? UNKNOWN_VERSION,
      caption: releasedOn ?? "Latest",
    },
    { label: "Made for", value: "PH", caption: "Food businesses" },
  ];
}

/** The App Store's row of quick facts, scrollable sideways on a phone. */
export function ListingStats({ listing, fallbackVersion }: ListingStatsProps) {
  const cells = buildCells(listing, fallbackVersion);

  return (
    <dl className="mt-10 flex overflow-x-auto border-y border-white/10 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={`flex min-w-[118px] flex-1 flex-col items-center gap-1.5 px-3 text-center ${
            index > 0 ? "border-l border-white/10" : ""
          }`}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            {cell.label}
          </dt>
          <dd className="font-[family-name:var(--font-landing-display)] text-2xl font-bold leading-none text-white/85">
            {cell.value}
          </dd>
          <dd className="text-xs text-white/45">{cell.caption}</dd>
        </div>
      ))}
    </dl>
  );
}
