import Link from 'next/link'
import type { OrderBackend } from '@/lib/order-backend'
import type { ReportRefusal } from '@/lib/reports/read/report-scope'

const REFUSAL_COPY: Readonly<Record<ReportRefusal, { title: string; detail: string }>> = {
  no_account: {
    title: 'We couldn’t confirm your account.',
    detail: 'Sign out and back in. If this keeps happening, ask the store owner to check your staff access.',
  },
  other_store: {
    title: 'These reports belong to another store.',
    detail: 'Switch to your own store’s admin to see its sales.',
  },
  no_permission: {
    title: 'Sales reports are hidden for your account.',
    detail: 'Ask the store owner to give you the Reports permission.',
  },
  platform_staff: {
    title: 'Sales reports aren’t available in support view yet.',
    detail: 'Ask the store owner to share the figures, or use the superadmin analytics.',
  },
}

function Panel({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
      <p className="text-[17px] font-extrabold text-wn-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-muted-foreground text-pretty">{detail}</p>
      {children}
    </div>
  )
}

export function ReportRefused({ reason }: { reason: ReportRefusal }) {
  return <Panel {...REFUSAL_COPY[reason]} />
}

/** Convex and own-database stores get sales reports in Phase 7 (plan §11.4): never half-accurate numbers. */
export function ReportUnsupported({ tenantSlug, backend }: { tenantSlug: string; backend: OrderBackend }) {
  return (
    <Panel
      title="Sales reports are coming to your store soon."
      detail={
        backend === 'convex'
          ? 'Your orders are kept on your store’s real-time system, which these reports don’t read yet. Product Analytics and the Dashboard show your sales in the meantime.'
          : 'Your orders are kept in your store’s own database, which these reports don’t read yet. The Dashboard shows your sales in the meantime.'
      }
    >
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href={`/${tenantSlug}/admin`}
          className="inline-flex min-h-11 items-center rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Open the Dashboard
        </Link>
        {backend === 'convex' && (
          <Link
            href={`/${tenantSlug}/admin/product-analytics`}
            className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[14px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Product Analytics
          </Link>
        )}
      </div>
    </Panel>
  )
}
