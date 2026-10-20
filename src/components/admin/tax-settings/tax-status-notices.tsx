import { CircleAlert, Clock, Lock } from 'lucide-react'

/** Shown above the form while the store has no tax profile. */
export function NotSetUpBanner({ canEdit }: { canEdit: boolean }) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">Not set up yet</p>
        <p className="text-sm">
          {canEdit
            ? 'Senior and PWD discounts depend on whether you’re VAT-registered. Pick one below, check the rest, then save — it takes a minute.'
            : 'Senior and PWD discounts depend on these settings. Ask the store owner to set them up.'}
        </p>
      </div>
    </div>
  )
}

/** For staff who may look but not change. */
export function ReadOnlyNote() {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      Only the store owner can change these settings.
    </p>
  )
}

export function LastChangedLine({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  )
}

/** The profile could not be read — never shown as "not set up", which would invite overwriting it. */
export function TaxLoadError() {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">We couldn’t load your tax settings</p>
        <p className="text-sm text-muted-foreground">Nothing was changed. Refresh the page to try again.</p>
      </div>
    </div>
  )
}
