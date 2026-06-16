import Link from 'next/link'
import type { Tenant } from '@/types/database'
import { getTenantBranding } from '@/lib/branding-utils'
import { SiteFooter } from '@/components/customer/site-footer'

interface FooterContentPageProps {
  tenant: Tenant
  title: string
  content: string
}

/**
 * Split a content blob into paragraphs on blank lines.
 * Single newlines are preserved within a paragraph via whitespace-pre-wrap.
 */
function splitIntoParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
}

/**
 * Presentational, server-friendly content page for a single footer text page
 * (About Us / Terms of Service / Refund-Cancellation Policy / Privacy Policy).
 */
export function FooterContentPage({ tenant, title, content }: FooterContentPageProps) {
  const branding = getTenantBranding(tenant as unknown as Record<string, unknown>)
  const paragraphs = splitIntoParagraphs(content)
  const logoUrl = typeof tenant.logo_url === 'string' ? tenant.logo_url : ''
  const businessName = tenant.name || ''

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: branding.background, color: branding.textSecondary }}
    >
      {/* Slim top bar: logo + business name, links back to the menu */}
      <header
        className="w-full border-b"
        style={{ borderColor: branding.border, backgroundColor: branding.background }}
      >
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3 sm:px-6">
          <Link
            href="/menu"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={businessName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : null}
            <span
              className="text-base font-semibold"
              style={{ color: branding.textPrimary }}
            >
              {businessName}
            </span>
          </Link>
        </div>
      </header>

      {/* Page body */}
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <h1
            className="mb-8 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: branding.textPrimary }}
          >
            {title}
          </h1>

          <div className="space-y-5 text-base leading-7">
            {paragraphs.map((paragraph, index) => (
              <p
                key={index}
                className="whitespace-pre-wrap"
                style={{ color: branding.textSecondary }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      </main>

      <SiteFooter tenant={tenant} />
    </div>
  )
}
