'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Plus, ShieldAlert, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  createMerchantMcpKeyAction,
  revokeMerchantMcpKeyAction,
} from '@/app/actions/merchant-mcp-keys'
import type { McpKeySummary } from '@/lib/mcp-keys-service'

type Props = {
  initialKeys: McpKeySummary[]
  connectUrl: string
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Tenant admin "Connect AI" manager: mint and revoke the Bearer keys that let
 * Claude or ChatGPT manage THIS store through the merchant MCP endpoint. The
 * plaintext key is shown exactly once after minting.
 */
export function MerchantMcpKeysManager({ initialKeys, connectUrl }: Props) {
  const [keys, setKeys] = useState<McpKeySummary[]>(initialKeys)
  const [label, setLabel] = useState('')
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleCreate = () => {
    const trimmed = label.trim()
    if (!trimmed) {
      toast.error('Enter a label first')
      return
    }
    startTransition(async () => {
      try {
        const result = await createMerchantMcpKeyAction(trimmed)
        setKeys((prev) => [result.key, ...prev])
        setFreshKey(result.plaintext)
        setLabel('')
        toast.success('Key created — copy it now, it won’t be shown again')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create key')
      }
    })
  }

  const handleRevoke = (id: string) => {
    startTransition(async () => {
      try {
        const summary = await revokeMerchantMcpKeyAction(id)
        setKeys((prev) => prev.map((k) => (k.id === id ? summary : k)))
        toast.success('Key revoked')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to revoke key')
      }
    })
  }

  const copyFreshKey = async () => {
    if (!freshKey) return
    await navigator.clipboard.writeText(freshKey)
    setCopied(true)
    toast.success('Key copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {freshKey ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  Copy this key now — it will never be shown again.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border bg-white px-3 py-2 font-mono text-sm">
                    {freshKey}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyFreshKey}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3 text-muted-foreground"
                  onClick={() => setFreshKey(null)}
                >
                  I’ve saved it — dismiss
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a new key</CardTitle>
          <CardDescription>
            Label it by where it will live (e.g. “Owner laptop – Claude”). Use it as the Bearer token when
            connecting Claude or ChatGPT to{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{connectUrl}</code>. Keys can only
            manage this store.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Key label"
              maxLength={120}
              disabled={isPending}
            />
            <Button onClick={handleCreate} disabled={isPending || !label.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No keys yet. Generate one above to connect an AI.</p>
          </div>
        ) : (
          <div className="divide-y">
            {keys.map((key) => {
              const isRevoked = Boolean(key.revokedAt)
              return (
                <div key={key.id} className="flex items-center gap-4 px-6 py-4">
                  <KeyRound
                    className={`h-5 w-5 shrink-0 ${isRevoked ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm font-medium ${isRevoked ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {key.label}
                      </span>
                      {isRevoked ? (
                        <Badge variant="outline" className="border-red-300 text-red-600">Revoked</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {key.keyPrefix}••••  ·  created {formatDate(key.createdAt)}
                      {key.lastUsedAt ? `  ·  last used ${formatDate(key.lastUsedAt)}` : ''}
                    </p>
                  </div>
                  {!isRevoked ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-600" disabled={isPending}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke “{key.label}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Any AI connector using this key will immediately lose access to your store. This cannot
                            be undone — generate a new key to reconnect.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRevoke(key.id)}
                            className="bg-red-500 text-white hover:bg-red-600"
                          >
                            Revoke key
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
