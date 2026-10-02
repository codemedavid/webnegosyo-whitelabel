'use client'

import { useState, type FormEvent } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DnsRecordsTable } from './dns-records-table'
import { useCustomDomain } from './use-custom-domain'
import type { CustomDomainView } from '@/lib/domains/custom-domain-service'

export interface CustomDomainPanelProps {
  tenantId: string
  /** The routed domain the page already knows, for the not-available message. */
  initialDomain: string | null
  /** False until the platform's Vercel credentials are configured. */
  isAvailable: boolean
}

const PILL_TONES = {
  live: { label: 'Live', border: 'border-emerald-500/40 text-emerald-600', dot: 'bg-emerald-500' },
  dns: { label: 'Waiting for DNS', border: 'border-amber-500/40 text-amber-600', dot: 'animate-pulse bg-amber-500' },
  verifying: { label: 'Verifying ownership', border: 'border-amber-500/40 text-amber-600', dot: 'animate-pulse bg-amber-500' },
} as const

function toneOf(view: CustomDomainView): keyof typeof PILL_TONES {
  if (view.status === 'pending') return 'verifying'
  return view.isDnsReady ? 'live' : 'dns'
}

function StatusPill({ view }: { view: CustomDomainView }) {
  const tone = PILL_TONES[toneOf(view)]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {tone.label}
    </span>
  )
}

function DnsSteps({ view }: { view: CustomDomainView }) {
  const isVerifying = view.status === 'pending'
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Sign in where you bought the domain (GoDaddy, Namecheap, Cloudflare, Hostinger…).</li>
        <li>Open its DNS settings and add the records below. Delete any other A, AAAA or CNAME record with the same name.</li>
        <li>
          {isVerifying
            ? 'We check automatically. Once the TXT record is found, your domain is connected to this store.'
            : 'We check automatically and set up the secure (https) certificate for you.'}
        </li>
      </ol>
      <DnsRecordsTable records={view.records} />
      <p className="text-xs text-muted-foreground">
        DNS changes usually take a few minutes, but can take up to 48 hours. On Cloudflare, set the records to
        &quot;DNS only&quot; (grey cloud).
      </p>
    </div>
  )
}

function ConnectForm({ isBusy, onConnect }: { isBusy: boolean; onConnect: (domain: string) => Promise<boolean> }) {
  const [input, setInput] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!input.trim()) return
    if (await onConnect(input)) setInput('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Label htmlFor="custom-domain-input">Your domain</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="custom-domain-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="order.yourstore.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isBusy}
        />
        <Button type="submit" disabled={isBusy || !input.trim()}>
          {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Connect domain
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use a domain you already own. A subdomain like <code>order.yourstore.com</code> is easiest to set up and
        keeps your main website untouched.
      </p>
    </form>
  )
}

export function CustomDomainPanel({ tenantId, initialDomain, isAvailable }: CustomDomainPanelProps) {
  const { view, busy, error, check, connect, remove } = useCustomDomain({ tenantId, isAvailable })
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)

  if (!isAvailable) {
    return (
      <p className="text-sm text-muted-foreground">
        {initialDomain ? `Connected: ${initialDomain}. ` : ''}Self-serve custom domains are not enabled on this
        platform yet. Contact support to connect one.
      </p>
    )
  }

  if (!view) {
    if (busy) {
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your domain…
        </p>
      )
    }
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-red-600">
          {error ?? 'Could not load your domain.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void check()}>
          Try again
        </Button>
      </div>
    )
  }

  const domain = view.domain
  const isLive = view.status === 'active' && view.isDnsReady

  async function handleRemove() {
    setIsConfirmingRemove(false)
    await remove()
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {!domain && <ConnectForm isBusy={busy !== null} onConnect={connect} />}

      {domain && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{domain}</span>
              <StatusPill view={view} />
            </div>
            <div className="flex flex-wrap gap-2">
              {isLive && (
                <Button asChild variant="outline" size="sm">
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
                    Open <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                  </a>
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => void check()} disabled={busy !== null}>
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy === 'check' ? 'animate-spin' : ''}`} aria-hidden />
                Check now
              </Button>
              {isConfirmingRemove ? (
                <>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void handleRemove()} disabled={busy !== null}>
                    Yes, remove
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsConfirmingRemove(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsConfirmingRemove(true)} disabled={busy !== null}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          {isConfirmingRemove && (
            <p className="text-sm text-muted-foreground">
              Customers visiting {domain} will no longer reach your store. Your regular store address keeps working.
            </p>
          )}

          {!isLive && <DnsSteps view={view} />}

          {isLive && (
            <p className="text-sm text-muted-foreground">
              Your store is live at <span className="font-medium text-foreground">https://{domain}</span> with a
              secure certificate.
            </p>
          )}
        </>
      )}
    </div>
  )
}
