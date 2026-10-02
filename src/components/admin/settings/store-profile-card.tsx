import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingStatusLabel } from './setting-status'

interface StoreProfileCardProps {
  name: string
  slug: string
  isActive: boolean
  /** The connected custom domain, if any. */
  domain: string | null
  /** The platform root domain (`webnegosyo.com`); null outside production. */
  rootDomain: string | null
}

/** The store's identity as customers meet it. Read-only: the platform team changes these. */
export function StoreProfileCard({ name, slug, isActive, domain, rootDomain }: StoreProfileCardProps) {
  const platformAddress = rootDomain ? `${slug}.${rootDomain}` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store profile</CardTitle>
        <CardDescription>To change your store name or web address, contact the WebNegosyo team.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y rounded-lg border">
          <ProfileRow label="Store name">{name}</ProfileRow>
          <ProfileRow label="Web address">
            {platformAddress ? <AddressLink host={platformAddress} /> : <span className="font-mono text-sm">{slug}</span>}
          </ProfileRow>
          {domain && (
            <ProfileRow label="Custom domain">
              <AddressLink host={domain} />
            </ProfileRow>
          )}
          <ProfileRow label="Status">
            <SettingStatusLabel
              status={isActive ? { tone: 'ok', label: 'Live — taking orders' } : { tone: 'attention', label: 'Offline' }}
            />
          </ProfileRow>
        </dl>
      </CardContent>
    </Card>
  )
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-36 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{children}</dd>
    </div>
  )
}

function AddressLink({ host }: { host: string }) {
  return (
    <a
      href={`https://${host}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 underline decoration-border underline-offset-4 hover:decoration-foreground"
    >
      <span className="truncate">{host}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
