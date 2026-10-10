'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { revokeOnboardingInviteAction } from '@/app/actions/onboarding-invites'
import type { OnboardingInvite } from '@/lib/onboarding/invites/repository'
import { inviteStatus, type InviteStatus } from '@/lib/onboarding/invites/status'
import { EmptyState, Panel } from '@/components/superadmin/ui/primitives'
import { usePlatformAccess } from '@/components/superadmin/platform-access-context'
import { getPaymentTermLabel } from '../../components/payment-term'

const STATUS_LABEL: Record<InviteStatus, string> = { active: 'Waiting', used: 'Used', revoked: 'Turned off', expired: 'Expired' }
const STATUS_CLASS: Record<InviteStatus, string> = {
  active: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  used: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  revoked: 'border-white/15 bg-white/[0.04] text-white/50',
  expired: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const formatDate = (iso: string) => DATE_FORMAT.format(new Date(iso))

function whenText(invite: OnboardingInvite, status: InviteStatus): string {
  if (status === 'used' && invite.claimedAt) return `Used ${formatDate(invite.claimedAt)}`
  if (status === 'revoked' && invite.revokedAt) return `Turned off ${formatDate(invite.revokedAt)}`
  return `${status === 'expired' ? 'Expired' : 'Expires'} ${formatDate(invite.expiresAt)}`
}

export function SignupLinksTable({ invites }: { invites: OnboardingInvite[] }) {
  const router = useRouter()
  const canEdit = usePlatformAccess().can('checkout_leads.edit')
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function handleRevoke(inviteId: string) {
    setRevokingId(inviteId)
    try {
      const { error } = await revokeOnboardingInviteAction(inviteId)
      if (error) toast.error(error)
      else toast.success('Link turned off')
      router.refresh()
    } catch (revokeError) {
      console.error('[signup-links] revoke failed', revokeError)
      toast.error('Could not turn the link off. Please try again.')
    } finally {
      setRevokingId(null)
    }
  }

  if (invites.length === 0) {
    return <Panel><EmptyState icon={Link2} title="No sign-up links yet" description="Links you make show up here with whether they were used." /></Panel>
  }

  return (
    <Panel padding="p-0" className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
          <tr>
            <th className="px-4 py-3 font-medium">Link for</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {invites.map((invite) => {
            const status = inviteStatus(invite)
            return (
              <tr key={invite.id} className="text-white/85">
                <td className="px-4 py-3">
                  <span className="font-medium text-white">{invite.label}</span>
                  <span className="block text-xs text-white/45">Made {formatDate(invite.createdAt)}</span>
                </td>
                <td className="px-4 py-3 text-white/70">{getPaymentTermLabel(invite.paymentTerm)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                </td>
                <td className="px-4 py-3 text-xs text-white/60">{whenText(invite, status)}</td>
                <td className="px-4 py-3 text-right">
                  {canEdit && status === 'active' && (
                    <button type="button" disabled={revokingId === invite.id} onClick={() => handleRevoke(invite.id)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
                      Turn off
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}
