import { MessageSquareText } from 'lucide-react'

/** Shown when the gate refuses: a branch account, or staff without Customers access. */
export function TextsNotAllowed({ isBranch }: { isBranch: boolean }) {
  const title = isBranch ? 'Texts are for store-wide accounts' : 'Texts are for the owner'
  const body = isBranch
    ? "Ask the owner. Texts reach every guest of the store, so branch accounts can't open them."
    : 'Only the owner or staff with Customers access can send texts.'
  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <MessageSquareText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
