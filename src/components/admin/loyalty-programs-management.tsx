'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LoyaltySyncStatus } from './loyalty-sync-status'
import { createClient } from '@/lib/supabase/client'
import { parseLoyaltyProgramInput } from '@/lib/loyalty/manage'
import { describeLoyaltyReward } from '@/lib/loyalty/offer'
import type { LoyaltyProgramSummary } from '@/lib/loyalty/repository'
import type { LoyaltyRules } from '@/lib/loyalty/types'
const initialRules: LoyaltyRules = {
  earnMode: 'stamp',
  threshold: 10,
  pointsPerPeso: null,
  minSpend: null,
  reward: { type: 'fixed', amount: 50 },
  rewardExpiryDays: null,
  isExclusive: true,
}
const control =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60'
const button =
  'rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'

export function LoyaltyProgramsManagement({
  tenantId,
  tenantSlug,
}: {
  tenantId: string
  tenantSlug: string
}) {
  const [programs, setPrograms] = useState<LoyaltyProgramSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<LoyaltyProgramSummary | null>(null)
  const [name, setName] = useState('')
  const [activatesAt, setActivatesAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [scope, setScope] = useState<'business' | 'branch'>('business')
  const [outletId, setOutletId] = useState('')
  const [rules, setRules] = useState<LoyaltyRules>(initialRules)
  const [choices, setChoices] = useState<{
    outlets: { id: string; name: string }[]
    items: { id: string; name: string }[]
  }>({ outlets: [], items: [] })
  const [shadow, setShadow] = useState(false)
  const call = useCallback(
    async (body?: Record<string, unknown>) => {
      const client = createClient()
      const { data } = await client.auth.getSession()
      if (!data.session) throw new Error('Sign in to manage loyalty programs.')
      const response = await fetch(
        `/api/loyalty/programs${body ? '' : `?tenantId=${encodeURIComponent(tenantId)}`}`,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify({ tenantId, ...body }) : undefined,
          cache: 'no-store',
        },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || 'Could not load loyalty programs.')
      return result
    },
    [tenantId],
  )
  const load = useCallback(async () => {
    try {
      const result = await call()
      setPrograms(result.programs)
      setShadow(result.loyalty.isShadow)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load programs.')
    } finally {
      setLoading(false)
    }
  }, [call])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!composing) return
    let active = true
    const client = createClient()
    Promise.all([
      client
        .from('outlets')
        .select('id,name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name'),
      client
        .from('menu_items')
        .select('id,name,presell_enabled')
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
        .order('name'),
    ]).then(([outlets, items]) => {
      if (!active) return
      if (outlets.error || items.error) {
        setError(
          'Could not load branches and menu items. Reopen the form to retry.',
        )
        return
      }
      setChoices({ outlets: outlets.data ?? [], items: (items.data ?? []).filter(item => !item.presell_enabled) })
    })
    return () => {
      active = false
    }
  }, [tenantId, composing])
  const open = (program: LoyaltyProgramSummary | null) => {
    setActivatesAt('')
    setEndsAt('')
    setEditing(program)
    setName(program?.name ?? '')
    setScope(program?.scope ?? 'business')
    setOutletId(program?.outletId ?? '')
    setRules(
      program?.rules ?? {
        ...initialRules,
        earnMode: program?.earnMode ?? 'stamp',
      },
    )
    setError(null)
    setComposing(true)
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = parseLoyaltyProgramInput({
      name,
      scope,
      outletId,
      rules,
      activatesAt: activatesAt ? `${activatesAt}T00:00:00+08:00` : null,
      endsAt: endsAt ? `${endsAt}T00:00:00+08:00` : null,
    })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await call(
        editing
          ? {
              action: 'revise',
              programId: editing.id,
              rules: parsed.value.rules,
              expectedVersion: editing.versionNumber,
            }
          : { action: 'create', program: parsed.value },
      )
      setComposing(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save program.')
    } finally {
      setBusy(false)
    }
  }
  const changeStatus = async (
    program: LoyaltyProgramSummary,
    status: string,
  ) => {
    if (
      status === 'ended' &&
      !window.confirm(
        'End this program? Future orders stop earning; issued rewards keep their original terms.',
      )
    )
      return
    setBusy(true)
    try {
      await call({
        action: 'set_status',
        programId: program.id,
        status,
        expectedStatus: program.status,
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update program.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Loyalty programs</h1>
          <p className="mt-2 text-gray-600">
            Set the reward, earning rules, and where customers can use it.
          </p>
        </div>
        <Link className="text-sm underline" href={`/${tenantSlug}/loyalty`}>
          Customer loyalty page ↗
        </Link>
      </header>
      {error ? (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error}{' '}
          {!composing ? (
            <button className="ml-3 underline" onClick={() => void load()}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {loading ? <p role="status">Loading programs…</p> : null}
      <LoyaltySyncStatus tenantId={tenantId} />
      {shadow ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Shadow mode records earning for validation. Rewards are not issued to
          customers.
        </p>
      ) : null}
      {composing ? (
        <form
          onSubmit={save}
          className="space-y-5 rounded-2xl border bg-white p-6"
        >
          <h2 className="text-xl font-semibold">
            {editing ? 'Edit reward & rules' : 'New program'}
          </h2>
          {editing ? (
            <p className="text-sm text-gray-600">
              This creates a new rules version. Issued rewards keep their
              original terms.
            </p>
          ) : null}
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              Program name
              <input
                className={control}
                aria-label="Program name"
                value={name}
                maxLength={80}
                required
                disabled={!!editing}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Earn with
              <select
                className={control}
                value={rules.earnMode}
                disabled={!!editing}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    earnMode: e.target.value as 'stamp' | 'points',
                    pointsPerPeso: e.target.value === 'points' ? 1 : null,
                  })
                }
              >
                <option value="stamp">Stamps per order</option>
                <option value="points">Points per peso</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              {rules.earnMode === 'stamp' ? 'Orders' : 'Points'} per reward
              <input
                className={control}
                type="number"
                min="1"
                step={rules.earnMode === 'stamp' ? '1' : '0.01'}
                value={rules.threshold}
                required
                onChange={(e) =>
                  setRules({ ...rules, threshold: Number(e.target.value) })
                }
              />
            </label>
            {rules.earnMode === 'points' ? (
              <label className="space-y-1 text-sm">
                Points per ₱1
                <input
                  className={control}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rules.pointsPerPeso ?? ''}
                  required
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      pointsPerPeso: Number(e.target.value),
                    })
                  }
                />
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              Minimum order spend (₱, optional)
              <input
                className={control}
                type="number"
                min="0"
                step="0.01"
                value={rules.minSpend ?? ''}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    minSpend:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              Program scope
              <select
                className={control}
                value={scope}
                disabled={!!editing}
                onChange={(e) =>
                  setScope(e.target.value as 'business' | 'branch')
                }
              >
                <option value="business">All branches</option>
                <option value="branch">One branch</option>
              </select>
            </label>
            {scope === 'branch' ? (
              <label className="space-y-1 text-sm">
                Branch
                <select
                  className={control}
                  required
                  value={outletId}
                  disabled={!!editing}
                  onChange={(e) => setOutletId(e.target.value)}
                >
                  <option value="">Choose a branch</option>
                  {choices.outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              Reward type
              <select
                className={control}
                aria-label="Reward type"
                value={rules.reward.type}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    reward:
                      e.target.value === 'free_item'
                        ? { type: 'free_item', menuItemId: '', itemName: '' }
                        : e.target.value === 'percent'
                          ? { type: 'percent', percent: 10, maxAmount: null }
                          : { type: 'fixed', amount: 50 },
                  })
                }
              >
                <option value="fixed">Fixed amount off</option>
                <option value="percent">Percentage off</option>
                <option value="free_item">Free menu item</option>
              </select>
            </label>
            {rules.reward.type === 'fixed' ? (
              <label className="space-y-1 text-sm">
                Reward amount (₱)
                <input
                  className={control}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rules.reward.amount}
                  required
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      reward: { type: 'fixed', amount: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ) : rules.reward.type === 'percent' ? (
              <>
                <label className="space-y-1 text-sm">
                  Reward percent
                  <input
                    className={control}
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={rules.reward.percent}
                    required
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        reward: {
                          ...(rules.reward as Extract<
                            LoyaltyRules['reward'],
                            { type: 'percent' }
                          >),
                          percent: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  Discount cap (₱, optional)
                  <input
                    className={control}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={rules.reward.maxAmount ?? ''}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        reward: {
                          ...(rules.reward as Extract<
                            LoyaltyRules['reward'],
                            { type: 'percent' }
                          >),
                          maxAmount:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <label className="space-y-1 text-sm">
                Free menu item
                <select
                  className={control}
                  aria-label="Free menu item"
                  required
                  value={rules.reward.menuItemId}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      reward: {
                        type: 'free_item',
                        menuItemId: e.target.value,
                        itemName:
                          choices.items.find(
                            (item) => item.id === e.target.value,
                          )?.name ?? '',
                      },
                    })
                  }
                >
                  <option value="">Choose an item</option>
                  {choices.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!editing ? (
              <>
                <label className="space-y-1 text-sm">
                  Activation date (Manila, optional)
                  <input
                    type="date"
                    className={control}
                    value={activatesAt}
                    onChange={(e) => setActivatesAt(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  End date (Manila, optional)
                  <input
                    type="date"
                    className={control}
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
              </>
            ) : null}
            <label className="space-y-1 text-sm">
              Reward expiry (days, optional)
              <input
                className={control}
                type="number"
                min="1"
                step="1"
                value={rules.rewardExpiryDays ?? ''}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    rewardExpiryDays:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </fieldset>
          <p className="text-sm text-gray-600">
            One reward per sale, with no vouchers or manual discounts. Free-item
            rewards cover one base item; upgrades and add-ons stay payable.
          </p>
          <div className="flex gap-3">
            <button className={button} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save new rules' : 'Save as draft'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setComposing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className={button} onClick={() => open(null)}>
          New program
        </button>
      )}
      {!loading && !programs.length ? (
        <p className="text-gray-600">
          No programs yet. Create a stamp card or points program to reward your
          regulars.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {programs.map((program) => (
          <article
            key={program.id}
            className="space-y-4 rounded-2xl border bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{program.name}</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs capitalize">
                {program.status}
              </span>
            </div>
            <p>
              {program.rules
                ? `${program.rules.threshold} ${program.earnMode === 'stamp' ? 'stamps' : 'points'} → ${describeLoyaltyReward(program.rules.reward)}`
                : 'Reward rules are missing. Edit this program to set them.'}
            </p>
            <p className="text-sm text-gray-500">
              {program.members} members · {program.rewardsOutstanding} rewards
              unclaimed · Rules v{program.versionNumber ?? '—'}
            </p>
            <p className="text-sm text-gray-500">
              {program.rules?.rewardExpiryDays
                ? `Rewards expire after ${program.rules.rewardExpiryDays} days`
                : 'Rewards do not expire'}
            </p>
            {program.status !== 'ended' ? (
              <div className="flex flex-wrap gap-3 text-sm">
                <button
                  className="underline"
                  disabled={busy}
                  onClick={() => open(program)}
                >
                  Edit reward & rules
                </button>
                <button
                  className="underline"
                  disabled={busy || !program.rules}
                  onClick={() =>
                    void changeStatus(
                      program,
                      program.status === 'active' ? 'paused' : 'active',
                    )
                  }
                >
                  {program.status === 'active'
                    ? 'Pause'
                    : program.status === 'paused'
                      ? 'Resume'
                      : 'Activate'}
                </button>
                <button
                  className="text-red-700 underline"
                  disabled={busy}
                  onClick={() => void changeStatus(program, 'ended')}
                >
                  End
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}
