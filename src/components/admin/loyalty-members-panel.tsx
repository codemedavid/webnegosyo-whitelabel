'use client'

/**
 * Who is on the stamp card, on the web.
 *
 * Same read, same ranking and same management actions as the merchant app's
 * Rewards → Members: both call `/api/loyalty/members`, and the ORDER comes from
 * the platform, so a merchant on a laptop and a merchant on a phone are told to
 * call the same customer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { callLoyaltyApi } from '@/lib/loyalty/browser-client'
import { describeMemberStatus, type LoyaltyMember, type LoyaltyMemberStatus, type LoyaltyMemberTotals } from '@/lib/loyalty/members'
import type { LoyaltyMemberDetail } from '@/lib/loyalty/member-repository'
import { LoyaltyMemberDetailCard } from './loyalty-member-detail'

const SEARCH_SETTLE_MS = 350

type Filter = LoyaltyMemberStatus | 'all'

const FILTERS: readonly { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Reward ready', value: 'reward_ready' },
  { label: 'Almost there', value: 'almost_there' },
  { label: 'Gone quiet', value: 'dormant' },
  { label: 'Collecting', value: 'earning' },
]

const TONE_CLASSES: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  accent: 'bg-orange-50 text-orange-700 ring-orange-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
}

function countFor(filter: Filter, totals: LoyaltyMemberTotals | null): number | null {
  if (!totals) return null
  switch (filter) {
    case 'all':
      return totals.total
    case 'reward_ready':
      return totals.rewardReady
    case 'almost_there':
      return totals.almostThere
    case 'dormant':
      return totals.dormant
    case 'earning':
      return totals.earning
    default:
      return null
  }
}

function remainingLabel(member: LoyaltyMember): string {
  const headline = member.headline
  if (!headline) return 'No card yet'
  if (headline.rewardsAvailable > 0) return 'Ready to claim'
  if (headline.remaining === null) return 'Progress unavailable'
  if (headline.remaining <= 0) return 'Ready to claim'
  const unit = headline.earnMode === 'points' ? 'point' : 'visit'
  return `${headline.remaining} more ${unit}${headline.remaining === 1 ? '' : 's'}`
}

export function LoyaltyMembersPanel({ tenantId }: { tenantId: string }) {
  const [members, setMembers] = useState<LoyaltyMember[]>([])
  const [totals, setTotals] = useState<LoyaltyMemberTotals | null>(null)
  const [isTruncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [settledQuery, setSettledQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<LoyaltyMemberDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query), SEARCH_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    try {
      const result = await callLoyaltyApi<{
        members: LoyaltyMember[]
        totals: LoyaltyMemberTotals
        isTruncated: boolean
      }>('/api/loyalty/members', {
        tenantId,
        query: { search: settledQuery, status: filter === 'all' ? null : filter },
        failure: 'Your members could not be loaded.',
      })
      setMembers(result.members)
      setTotals(result.totals)
      setTruncated(result.isTruncated === true)
      setError(null)
    } catch (e) {
      // A failed read must never render as "nobody is collecting stamps".
      setError(e instanceof Error ? e.message : 'Your members could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, settledQuery, filter])

  useEffect(() => {
    void load()
  }, [load])

  const openMember = useCallback(
    async (member: LoyaltyMember) => {
      if (openKey === member.customerKey) {
        setOpenKey(null)
        setDetail(null)
        return
      }
      setOpenKey(member.customerKey)
      setDetail(null)
      setDetailError(null)
      try {
        const result = await callLoyaltyApi<LoyaltyMemberDetail>('/api/loyalty/members', {
          tenantId,
          query: { customerKey: member.customerKey },
          failure: 'This member could not be loaded.',
        })
        setDetail(result)
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : 'This member could not be loaded.')
      }
    },
    [openKey, tenantId]
  )

  const reloadDetail = useCallback(async () => {
    if (!openKey) return
    await load()
    try {
      const result = await callLoyaltyApi<LoyaltyMemberDetail>('/api/loyalty/members', {
        tenantId,
        query: { customerKey: openKey },
      })
      setDetail(result)
    } catch {
      setDetail(null)
    }
  }, [openKey, tenantId, load])

  const headline = useMemo(() => {
    if (!totals || totals.total === 0) return null
    const parts = [`${totals.total} on the card`]
    if (totals.rewardReady > 0) parts.push(`${totals.rewardReady} can claim now`)
    if (totals.almostThere > 0) parts.push(`${totals.almostThere} almost there`)
    if (totals.dormant > 0) parts.push(`${totals.dormant} gone quiet`)
    return parts.join(' · ')
  }, [totals])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          {headline ? <p className="text-sm text-gray-600">{headline}</p> : null}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a name or number"
          aria-label="Search members"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 sm:w-72"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const isActive = option.value === filter
          const count = countFor(option.value, totals)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={isActive}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                isActive
                  ? 'bg-gray-900 text-white ring-gray-900'
                  : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
              {count === null ? '' : ` ${count}`}
            </button>
          )
        })}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">{error}</p>
          <button
            type="button"
            className="mt-2 rounded-lg bg-gray-900 px-3 py-1.5 text-white"
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-gray-600">Loading members…</p>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="font-medium text-gray-900">
            {settledQuery || filter !== 'all' ? 'Nobody matches' : 'No members yet'}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {settledQuery || filter !== 'all'
              ? 'Try a different search or filter.'
              : 'Members appear the moment a customer earns their first stamp. Loyalty is linked to a phone number, so an order placed without one cannot earn.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => {
            const status = describeMemberStatus(member.status)
            const isOpen = openKey === member.customerKey
            return (
              <li key={member.customerKey} className="rounded-lg border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => void openMember(member)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {member.name?.trim() || member.phone || 'Guest'}
                    </p>
                    <p className="truncate text-sm text-gray-600">
                      {member.phone ?? member.email ?? 'No contact on file'}
                    </p>
                  </div>

                  <div className="w-40 shrink-0">
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      {member.headline?.percent === null || member.headline === null ? null : (
                        <div
                          className={`h-2 rounded-full ${
                            member.rewardsAvailable > 0 ? 'bg-emerald-600' : 'bg-orange-500'
                          }`}
                          style={{ width: `${Math.max(member.headline.percent, 2)}%` }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {member.headline
                        ? `${member.headline.balance}${
                            member.headline.threshold > 0 ? ` / ${member.headline.threshold}` : ''
                          } · ${remainingLabel(member)}`
                        : remainingLabel(member)}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      TONE_CLASSES[status.tone] ?? TONE_CLASSES.neutral
                    }`}
                  >
                    {status.label}
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-gray-200 p-4">
                    {detailError ? (
                      <p className="text-sm text-red-700">{detailError}</p>
                    ) : !detail ? (
                      <p className="text-sm text-gray-600">Loading…</p>
                    ) : (
                      <LoyaltyMemberDetailCard
                        tenantId={tenantId}
                        detail={detail}
                        onChanged={() => void reloadDetail()}
                      />
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {isTruncated ? (
        <p className="text-xs text-gray-600">
          Showing the first members only — search for someone specific to find them.
        </p>
      ) : null}
    </section>
  )
}
