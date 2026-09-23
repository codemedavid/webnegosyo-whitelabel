'use client'

/**
 * One member, expanded: their contact, every card they hold, the rewards they
 * are sitting on, their orders, and the two corrections a counter needs.
 *
 * Neither reward action moves stamps. The balance was already spent to mint the
 * reward, and handing the stamps back would silently re-arm the next earn — a
 * merchant who wants them back makes an adjustment, which says so in the ledger.
 */

import { useState } from 'react'
import { callLoyaltyApi } from '@/lib/loyalty/browser-client'
import { describeMemberStatus } from '@/lib/loyalty/members'
import type { LoyaltyMemberDetail } from '@/lib/loyalty/member-repository'

const CLAIMABLE = new Set(['issued', 'restored'])

const REWARD_STATUS_LABELS: Record<string, string> = {
  issued: 'Ready to use',
  restored: 'Ready to use',
  reserved: 'In a sale right now',
  consumed: 'Used',
  expired: 'Expired',
  voided: 'Cancelled',
}

const LEDGER_KIND_LABELS: Record<string, string> = {
  earn: 'Earned',
  reverse: 'Returned',
  redeem: 'Redeemed',
  correction: 'Adjusted',
}

const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900'
const primary =
  'rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50'
const ghost =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50'

function peso(amount: number): string {
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-PH', {
    maximumFractionDigits: 2,
  })}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('en-PH') : ''
}

/**
 * A fresh idempotency key per intent — minted when the form opens, reused for
 * every retry. Mint it per submit and a double click writes twice.
 */
function newRequestId(): string {
  return `adj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function LoyaltyMemberDetailCard({
  tenantId,
  detail,
  onChanged,
}: {
  tenantId: string
  detail: LoyaltyMemberDetail
  onChanged: () => void
}) {
  const { member, profile, rewards, history, orders, addresses } = detail
  const status = describeMemberStatus(member.status)

  const [programId, setProgramId] = useState(member.programs[0]?.programId ?? '')
  const [delta, setDelta] = useState('1')
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [note, setNote] = useState('')
  const [requestId, setRequestId] = useState(newRequestId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const adjust = async () => {
    const magnitude = Number(delta)
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError('Enter how many to add or take away.')
      return
    }
    if (!note.trim()) {
      setError('Say why you are changing this balance.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await callLoyaltyApi<{ isDuplicate?: boolean; rewardsIssued?: number }>(
        '/api/loyalty/members',
        {
          tenantId,
          body: {
            action: 'adjust_balance',
            adjustment: {
              programId,
              customerKey: member.customerKey,
              delta: direction === 'add' ? magnitude : -magnitude,
              note: note.trim(),
              requestId,
            },
          },
        }
      )
      const issued = Number(result.rewardsIssued) || 0
      setMessage(
        result.isDuplicate
          ? 'That change was already saved.'
          : issued > 0
            ? `Saved — ${issued} reward${issued === 1 ? '' : 's'} unlocked.`
            : 'Balance updated.'
      )
      setNote('')
      setDelta('1')
      setRequestId(newRequestId())
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const settle = async (entitlementId: string, action: 'consume' | 'void') => {
    const reason = window.prompt(
      action === 'consume'
        ? 'What happened? e.g. Honoured at the counter, receipt 0412'
        : 'Why is this reward being cancelled?'
    )
    if (!reason?.trim()) return
    setBusy(true)
    setError(null)
    try {
      await callLoyaltyApi('/api/loyalty/members', {
        tenantId,
        body: { action: 'resolve_reward', resolution: { entitlementId, action, note: reason.trim() } },
      })
      setMessage(action === 'consume' ? 'Marked as used.' : 'Reward cancelled.')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That reward could not be settled.')
    } finally {
      setBusy(false)
    }
  }

  const claimable = rewards.filter((reward) => CLAIMABLE.has(reward.status))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Who they are ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {status.label} — {status.hint}
          </p>
          <p className="text-sm text-gray-700">{member.phone ?? 'No phone on file'}</p>
          {member.email ? <p className="text-sm text-gray-700">{member.email}</p> : null}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">
            {addresses.length === 1 ? 'Address' : 'Addresses'}
          </p>
          {addresses.length === 0 ? (
            <p className="text-sm text-gray-600">
              No address on file — none of their orders carried one.
            </p>
          ) : (
            addresses.map((address) => (
              <p key={address} className="text-sm text-gray-900">
                {address}
              </p>
            ))
          )}
        </div>

        {profile ? (
          <dl className="grid grid-cols-3 gap-3">
            {[
              ['Orders', String(profile.orderCount)],
              ['Spent', peso(profile.totalSpent)],
              ['Average', peso(profile.averageOrderValue)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-base font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-gray-600">
            No customer profile yet — spend totals appear once an order is captured against this
            number.
          </p>
        )}
        {profile?.smsOptOut ? (
          <p className="text-sm font-medium text-red-700">
            Opted out of SMS — do not include in campaigns.
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Progress</p>
          {member.programs.map((program) => (
            <div key={program.programId} className="rounded-lg bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">{program.programName}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {program.balance}
                  {program.threshold > 0 ? ` / ${program.threshold}` : ''}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
                {program.percent === null ? null : (
                  <div
                    className={`h-2 rounded-full ${
                      program.rewardsAvailable > 0 ? 'bg-emerald-600' : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.max(program.percent, 2)}%` }}
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {program.rewardLabel}
                {program.programStatus !== 'active'
                  ? ` · programme ${program.programStatus} — these stamps are not growing`
                  : ''}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Rewards, adjustments, history ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Rewards</p>
          {rewards.length === 0 ? (
            <p className="text-sm text-gray-600">
              No rewards yet. One is issued automatically the moment a card fills up.
            </p>
          ) : null}
          {claimable.map((reward) => (
            <div key={reward.id} className="rounded-lg bg-emerald-50 p-3">
              <p className="font-semibold text-gray-900">{reward.label}</p>
              <p className="text-xs text-gray-600">
                {reward.programName}
                {reward.issuedAt ? ` · earned ${formatDate(reward.issuedAt)}` : ''}
                {reward.expiresAt ? ` · expires ${formatDate(reward.expiresAt)}` : ' · never expires'}
              </p>
              {reward.isReserved ? (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  A register is using this reward right now.
                </p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className={ghost}
                    disabled={busy}
                    onClick={() => void settle(reward.id, 'consume')}
                  >
                    They used it
                  </button>
                  <button
                    type="button"
                    className={ghost}
                    disabled={busy}
                    onClick={() => void settle(reward.id, 'void')}
                  >
                    Cancel it
                  </button>
                </div>
              )}
            </div>
          ))}
          {rewards
            .filter((reward) => !CLAIMABLE.has(reward.status))
            .map((reward) => (
              <p key={reward.id} className="flex justify-between text-xs text-gray-600">
                <span className="truncate">{reward.label}</span>
                <span className="font-medium">
                  {REWARD_STATUS_LABELS[reward.status] ?? reward.status}
                </span>
              </p>
            ))}
        </div>

        {member.programs.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-semibold uppercase text-gray-500">Fix a balance</p>
            {member.programs.length > 1 ? (
              <select
                className={field}
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                aria-label="Card"
              >
                {member.programs.map((program) => (
                  <option key={program.programId} value={program.programId}>
                    {program.programName}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex gap-2">
              <select
                className={field}
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'add' | 'remove')}
                aria-label="Add or take away"
              >
                <option value="add">Add</option>
                <option value="remove">Take away</option>
              </select>
              <input
                className={field}
                type="number"
                min="1"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                aria-label="Amount"
              />
            </div>
            <input
              className={field}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Reason, e.g. Cashier forgot to stamp order 0412"
              aria-label="Reason"
            />
            <button type="button" className={primary} disabled={busy} onClick={() => void adjust()}>
              {busy ? 'Saving…' : 'Save change'}
            </button>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
          </div>
        ) : null}

        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">
            Card history ({history.length}) and orders ({orders.length})
          </summary>
          <div className="mt-3 space-y-3">
            <ul className="space-y-1">
              {history.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-2 text-xs text-gray-700">
                  <span>
                    {LEDGER_KIND_LABELS[entry.kind] ?? entry.kind}{' '}
                    <strong className={entry.delta < 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </strong>
                    {entry.note ? ` — ${entry.note}` : ''}
                    {/* Shadow rows were recorded but never touched the balance. */}
                    {entry.isShadow ? ' (test only, not counted)' : ''}
                  </span>
                  <span className="shrink-0 text-gray-500">{formatDate(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1">
              {orders.map((order) => (
                <li key={order.id} className="flex justify-between gap-2 text-xs text-gray-700">
                  <span className="truncate">
                    {peso(order.total)}
                    {order.channel ? ` · ${order.channel}` : ''}
                    {order.status ? ` · ${order.status}` : ''}
                    {order.address ? ` · ${order.address}` : ''}
                  </span>
                  <span className="shrink-0 text-gray-500">{formatDate(order.orderedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </div>
  )
}
