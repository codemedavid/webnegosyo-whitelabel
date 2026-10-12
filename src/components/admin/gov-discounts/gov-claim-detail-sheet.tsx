'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { GOV_DISCOUNT_RULES } from '@/lib/gov-discount'
import {
  formatManilaDateTimeFull,
  formatPesoCentavos,
  kindLabel,
  orderReference,
} from '@/lib/gov-discount-reports/format'
import { visibleFlags } from '@/lib/gov-discount-reports/review-queue'
import type { ClaimVerification, GrantEntry } from '@/lib/gov-discount-reports/types'
import { GrantStatusBadges } from './grant-status-badges'
import { GovReviewForm } from './gov-review-form'
import { MaskedId } from './masked-id'

export interface GovClaimDetailSheetProps {
  grant: GrantEntry | null
  tenantId: string
  tenantSlug: string
  /** Shown only for a multi-branch store. */
  branchName: string | null
  onClose: () => void
}

const VERIFICATION_COPY: Readonly<Record<ClaimVerification, { label: string; detail: string }>> = {
  verified: {
    label: 'Checked against the saved order',
    detail: 'WebNegosyo re-priced this discount from the order it saved, using your tax settings.',
  },
  mismatch: {
    label: 'Did not match our check',
    detail: 'WebNegosyo re-priced this discount and got a different amount. See the flags below.',
  },
  payload_only: {
    label: 'Checked against the register’s own lines',
    detail: 'The saved order could not be read, so the discount was re-priced from what the register sent.',
  },
}

function Row({ label, value, isStrong }: { label: string; value: ReactNode; isStrong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right tabular-nums ${isStrong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function AmountsSection({ grant }: { grant: GrantEntry }) {
  const isExempt = GOV_DISCOUNT_RULES[grant.kind].vatTreatment === 'exempt'
  const ratePercent = GOV_DISCOUNT_RULES[grant.kind].ratePercent
  return (
    <Section title="Amounts">
      <dl className="divide-y">
        <Row label="Their share (VAT included)" value={formatPesoCentavos(grant.grossShare)} />
        <Row label={isExempt ? 'VAT exempted' : 'VAT reduction'} value={formatPesoCentavos(grant.vatRemoved)} />
        <Row label={isExempt ? 'VAT-exempt sales' : 'VAT-exclusive sales'} value={formatPesoCentavos(grant.vatExemptSales)} />
        <Row label={`Discount (${ratePercent}%)`} value={formatPesoCentavos(grant.discount)} />
        <Row label="They paid for their share" value={formatPesoCentavos(grant.netDue)} />
        <Row label="Total taken off" value={formatPesoCentavos(grant.reduction)} isStrong />
        {grant.orderTotal !== null && <Row label="Whole order total" value={formatPesoCentavos(grant.orderTotal)} />}
      </dl>
    </Section>
  )
}

function CheckSection({ grant }: { grant: GrantEntry }) {
  const copy = VERIFICATION_COPY[grant.verification]
  const difference = grant.serverReduction === null ? null : grant.reduction - grant.serverReduction
  const hasDifference = difference !== null && Math.abs(difference) >= 0.01
  return (
    <Section title="Our check">
      <p className="text-sm font-medium">{copy.label}</p>
      <p className="text-sm text-muted-foreground">{copy.detail}</p>
      {grant.serverReduction !== null && (
        <dl className="mt-1 divide-y">
          <Row label="Register took off" value={formatPesoCentavos(grant.reduction)} />
          <Row label="Rules allow" value={formatPesoCentavos(grant.serverReduction)} />
          {hasDifference && difference !== null && (
            <Row
              label="Difference"
              value={<span className="text-red-700 dark:text-red-300">{formatPesoCentavos(difference)}</span>}
              isStrong
            />
          )}
        </dl>
      )}
    </Section>
  )
}

function FlagsSection({ grant }: { grant: GrantEntry }) {
  if (grant.flags.length === 0) return null
  return (
    <Section title="Why it was flagged">
      <ul className="space-y-2">
        {visibleFlags(grant.flags).map((chip) => (
          <li key={chip.flag} className="rounded-md border px-3 py-2">
            <p className="text-sm font-medium">{chip.label}</p>
            <p className="text-sm text-muted-foreground">{chip.explain}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function HistorySection({ grant }: { grant: GrantEntry }) {
  if (grant.reviews.length === 0) {
    return (
      <Section title="Reviews">
        <p className="text-sm text-muted-foreground">Nobody has reviewed this yet.</p>
      </Section>
    )
  }
  return (
    <Section title="Reviews">
      <ol className="space-y-2">
        {grant.reviews.map((review) => (
          <li key={review.id} className="rounded-md border px-3 py-2 text-sm">
            <p>
              <span className={review.verdict === 'ok' ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'font-medium text-red-700 dark:text-red-300'}>
                {review.verdict === 'ok' ? 'OK' : 'Problem'}
              </span>{' '}
              <span className="text-muted-foreground">
                · {review.reviewerName} · {formatManilaDateTimeFull(review.createdAt)}
              </span>
            </p>
            {review.note && <p className="mt-1 whitespace-pre-wrap">{review.note}</p>}
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** One grant, everything about it, and the reviewer's two buttons. */
export function GovClaimDetailSheet({ grant, tenantId, tenantSlug, branchName, onClose }: GovClaimDetailSheetProps) {
  return (
    <Sheet open={grant !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {grant && (
          <>
            <SheetHeader>
              <SheetTitle>{grant.claimantName}</SheetTitle>
              <SheetDescription>
                {kindLabel(grant.kind)} · {orderReference(grant)} · {formatManilaDateTimeFull(grant.occurredAt)}
              </SheetDescription>
              <div className="flex flex-wrap gap-1">
                <GrantStatusBadges grant={grant} />
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <Section title="Claimant">
                <dl className="divide-y">
                  <Row label={GOV_DISCOUNT_RULES[grant.kind].idLabel} value={<MaskedId idNumber={grant.idNumber} claimantName={grant.claimantName} />} />
                  <Row
                    label="Covered"
                    value={grant.allocationMode === 'shared' ? `Shared table of ${grant.diners ?? '?'}` : 'Their own order'}
                  />
                </dl>
              </Section>

              <AmountsSection grant={grant} />

              <Section title="Who">
                <dl className="divide-y">
                  <Row label="Given by" value={grant.grantedByName} />
                  <Row label="Approved by" value={grant.approvedByName ?? 'No approval needed'} />
                  <Row label="Where" value={grant.source === 'online' ? 'Online checkout' : 'Register'} />
                  {branchName && <Row label="Branch" value={branchName} />}
                  {grant.reversedAt && <Row label="Taken back" value={formatManilaDateTimeFull(grant.reversedAt)} />}
                </dl>
                <Link
                  href={`/${tenantSlug}/admin/orders`}
                  className="inline-block pt-1 text-sm text-primary underline-offset-4 hover:underline"
                >
                  Find {orderReference(grant)} in Orders
                </Link>
              </Section>

              <CheckSection grant={grant} />
              <FlagsSection grant={grant} />
              <HistorySection grant={grant} />

              <GovReviewForm key={grant.id} tenantId={tenantId} tenantSlug={tenantSlug} claimId={grant.id} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
