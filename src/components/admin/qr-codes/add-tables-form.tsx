'use client'

import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { STORE_FLOOR_KEY, type QrOutlet } from '@/lib/qr-print/qr-items'
import { parseTableLabels } from '@/lib/qr-print/table-labels'

interface AddTablesFormProps {
  /** Branches to choose from; empty for a single-location store. */
  outlets: QrOutlet[]
  onAdd: (outletKey: string, labels: string[]) => void
}

/**
 * Codes for tables that are not on a floor plan yet. Only printed — nothing
 * is saved, because the storefront needs nothing but the label in the link.
 */
export function AddTablesForm({ outlets, onAdd }: AddTablesFormProps) {
  const inputId = useId()
  const branchId = useId()
  const [text, setText] = useState('')
  const [outletKey, setOutletKey] = useState(outlets[0]?.id ?? STORE_FLOOR_KEY)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = parseTableLabels(text)
    if (parsed.error) {
      setError(parsed.error)
      return
    }
    if (parsed.labels.length === 0) {
      setError('Type at least one table, like 1-12 or A1, A2, Patio')
      return
    }
    onAdd(outletKey, parsed.labels)
    setText('')
    setError(null)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-dashed p-4">
      <div>
        <h3 className="font-medium">Add table numbers</h3>
        <p className="text-sm text-muted-foreground">
          Type a range like <span className="font-mono">1-12</span> or <span className="font-mono">A1-A8</span>, or names
          separated by commas. These are for printing only — draw your floor in the merchant app&apos;s Tables screen to
          keep them.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>Tables</Label>
          <Textarea
            id={inputId}
            value={text}
            rows={2}
            placeholder="1-12, Patio 1, Patio 2"
            aria-invalid={error !== null}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setError(null)
            }}
          />
        </div>
        {outlets.length > 0 && (
          <div className="space-y-1.5 sm:w-56">
            <Label htmlFor={branchId}>Branch</Label>
            <Select value={outletKey} onValueChange={setOutletKey}>
              <SelectTrigger id={branchId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm">
        <Plus className="h-4 w-4" aria-hidden />
        Make codes
      </Button>
    </form>
  )
}
