'use client'

import { useState } from 'react'
import { Download, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EXPORT_TTL_MINUTES, RECOVERY_DAYS } from '@/lib/order-deletion/constants'
import { formatPeso } from '@/lib/outlets/branch-format'
import type { OrderDeletionState } from './use-order-deletion'

function day(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })
}

export function ExportStep({ state }: { state: OrderDeletionState }) {
  const preview = state.preview
  if (!preview) return null

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Orders</dt>
          <dd className="text-lg font-semibold tabular-nums">{preview.orderCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sales total</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatPeso(preview.orderTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Oldest</dt>
          <dd className="font-medium">{day(preview.earliest)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Newest</dt>
          <dd className="font-medium">{day(preview.latest)}</dd>
        </div>
      </dl>
      {preview.activeCount > 0 && (
        <p className="text-sm text-destructive">
          {preview.activeCount} of these are still in progress.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Download a copy first. It is the only way to continue, and after {RECOVERY_DAYS} days it is the only
        copy of these orders left.
      </p>
      <Button type="button" onClick={state.downloadExport} disabled={state.busy}>
        <Download className="mr-2 h-4 w-4" />
        {state.busy ? 'Preparing file…' : `Download ${preview.orderCount} orders (CSV)`}
      </Button>
    </div>
  )
}

export function ConfirmStep({ state, storeName }: { state: OrderDeletionState; storeName: string }) {
  const [hasSavedFile, setHasSavedFile] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const exported = state.exported
  if (!exported) return null

  const canDelete = hasSavedFile && confirmation.trim() !== '' && password !== '' && !state.busy

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (canDelete) void state.confirm(password, confirmation).then(() => setPassword(''))
      }}
    >
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <p>
          Saved <span className="font-medium">{exported.fileName}</span> with {exported.orderCount} orders (
          {formatPeso(exported.orderTotal)}). Only those orders will be deleted — any that change before you
          confirm are kept. This file is valid for {EXPORT_TTL_MINUTES} minutes.
        </p>
      </div>

      <label htmlFor="saved-file" className="flex items-start gap-2 text-sm">
        <Checkbox id="saved-file" checked={hasSavedFile} onCheckedChange={(checked) => setHasSavedFile(checked === true)} />
        <span>I have opened the file and kept it somewhere safe.</span>
      </label>

      <div className="space-y-1">
        <Label htmlFor="confirm-store-name">
          Type <span className="font-semibold">{storeName}</span> to confirm
        </Label>
        <Input id="confirm-store-name" autoComplete="off" value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="confirm-password">Your password</Label>
        <Input id="confirm-password" type="password" autoComplete="current-password" value={password}
          onChange={(event) => setPassword(event.target.value)} />
      </div>

      <Button type="submit" variant="destructive" disabled={!canDelete}>
        {state.busy ? 'Deleting…' : `Delete ${exported.orderCount} orders`}
      </Button>
    </form>
  )
}

export function DoneStep({ state }: { state: OrderDeletionState }) {
  const result = state.result
  if (!result) return null
  return (
    <div className="space-y-3 text-sm">
      <p className="text-base font-medium">
        {result.deleted} order{result.deleted === 1 ? '' : 's'} deleted ({formatPeso(result.total)}).
      </p>
      {result.skipped > 0 && (
        <p className="text-muted-foreground">
          {result.skipped} were kept because they changed after your export or belong to a loyalty settlement.
        </p>
      )}
      <p className="text-muted-foreground">
        You can restore them from the history below until {day(result.purgeAfter)}. After that they are erased.
      </p>
      <Button type="button" variant="outline" onClick={state.startOver}>Done</Button>
    </div>
  )
}
