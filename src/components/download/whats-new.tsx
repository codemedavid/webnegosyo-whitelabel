import { formatReleaseDate, type AppStoreListing } from "@/lib/download/app-store-listing";

interface WhatsNewProps {
  listing: AppStoreListing | null;
  appStoreUrl: string | null;
}

/** Bullets shown before "more", like the App Store. */
const VISIBLE_NOTES = 3;

function NoteList({ notes }: { notes: readonly string[] }) {
  return (
    <ul className="space-y-2.5">
      {notes.map((note, index) => (
        // Notes can repeat ("Bug fixes"); the position makes the key unique and
        // is stable because the list never reorders.
        <li key={`${index}-${note}`} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
          <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dl-amber)]" aria-hidden />
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}

/** The current release's notes, straight from the App Store listing. */
export function WhatsNew({ listing, appStoreUrl }: WhatsNewProps) {
  if (!listing || listing.releaseNotes.length === 0) return null;

  const visible = listing.releaseNotes.slice(0, VISIBLE_NOTES);
  const hidden = listing.releaseNotes.slice(VISIBLE_NOTES);
  const releasedOn = listing.releasedAt ? formatReleaseDate(listing.releasedAt) : null;

  return (
    <section aria-labelledby="whats-new-heading" className="mx-auto max-w-6xl px-5 pt-16 sm:pt-20">
      <div className="max-w-3xl">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="whats-new-heading" className="font-[family-name:var(--font-landing-display)] text-3xl font-bold tracking-tight text-white">
            What&apos;s New
          </h2>
          {appStoreUrl && (
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[var(--dl-amber)] hover:underline"
            >
              Version history
            </a>
          )}
        </div>
        <div className="mt-2 flex justify-between text-sm text-white/45">
          <span>Version {listing.version}</span>
          {releasedOn && <span>{releasedOn}</span>}
        </div>

        <div className="mt-5">
          <NoteList notes={visible} />
          {hidden.length > 0 && (
            <details className="group mt-2.5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--dl-amber)] [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">more</span>
                <span className="hidden group-open:inline">less</span>
              </summary>
              <div className="mt-2.5">
                <NoteList notes={hidden} />
              </div>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
