import { Info } from 'lucide-react'

/** Caveats that sit beside the numbers — a partial read is disclosed, never hidden. */
export function DashboardNotes({ notes }: { notes: string[] }) {
  // Two reads can raise the same caveat; say it once (and keep the keys unique).
  const unique = [...new Set(notes)]
  if (unique.length === 0) return null
  return (
    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <ul className="space-y-1">
        {unique.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  )
}
