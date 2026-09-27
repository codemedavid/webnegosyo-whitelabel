'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { callLoyaltyApi } from '@/lib/loyalty/browser-client'
import { LOYALTY_ACTIVITY_KINDS, LOYALTY_ACTIVITY_LABELS, type LoyaltyActivityEvent, type LoyaltyActivityKind, type LoyaltyActivityPage } from '@/lib/loyalty/activity'
import { normalizePhoneE164 } from '@/lib/phone'

const field = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900'
const button = 'rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50'

export function LoyaltyActivityPanel({ tenantId, customerKey, reloadKey = 0 }: { tenantId: string; customerKey?: string; reloadKey?: number }) {
  const [kind, setKind] = useState<LoyaltyActivityKind | ''>('')
  const [phone, setPhone] = useState('')
  const [searchedKey, setSearchedKey] = useState<string | undefined>()
  const [searchError, setSearchError] = useState<string | null>(null)
  const [events, setEvents] = useState<LoyaltyActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const identity = `${tenantId}:${customerKey ?? searchedKey ?? ''}:${kind}`
  const currentIdentity = useRef(identity)
  currentIdentity.current = identity
  const load = useCallback(async (after?: string) => {
    const ticket = ++request.current
    setLoading(true)
    setError(null)
    try {
      const page = await callLoyaltyApi<LoyaltyActivityPage>('/api/loyalty/activity', {
        tenantId, query: { kind, customerKey: customerKey ?? searchedKey, cursor: after, limit: '30' }, failure: 'Activity could not be loaded.',
      })
      if (ticket !== request.current || currentIdentity.current !== identity) return
      setEvents(previous => after ? [...previous, ...page.events.filter(row => !previous.some(old => old.id === row.id))] : page.events)
      setCursor(page.nextCursor)
    } catch (cause) {
      if (ticket === request.current && currentIdentity.current === identity) setError(cause instanceof Error ? cause.message : 'Activity could not be loaded.')
    } finally {
      if (ticket === request.current && currentIdentity.current === identity) setLoading(false)
    }
  }, [tenantId, kind, customerKey, searchedKey, identity])

  useEffect(() => {
    setEvents([]); setCursor(null)
    void load()
    const requests = request
    const refresh = () => { void load() }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => { requests.current++; window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh) }
  }, [load, reloadKey])

  return <section className="space-y-4" aria-label={customerKey ? 'Member activity' : 'Loyalty activity'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold text-gray-900">{customerKey ? 'Member activity' : 'Activity'}</h2><p className="text-sm text-gray-600">Earning, claims, and corrections, newest first.</p></div>
      <button type="button" className={button} disabled={loading} onClick={() => void load()}>Refresh</button>
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Activity type" className={field} value={kind} onChange={e => setKind(e.target.value as LoyaltyActivityKind | '')}>
        <option value="">All activity</option>{LOYALTY_ACTIVITY_KINDS.map(value => <option key={value} value={value}>{LOYALTY_ACTIVITY_LABELS[value]}</option>)}
      </select>
      {!customerKey ? <form className="flex flex-wrap gap-2" onSubmit={e => {
        e.preventDefault()
        const normalized = normalizePhoneE164(phone)
        if (phone.trim() && !normalized) { setSearchError('Enter a complete Philippine phone number.'); return }
        setSearchError(null); setSearchedKey(normalized ? `phone:${normalized}` : undefined)
      }}><input type="tel" aria-label="Customer phone" placeholder="Customer phone, e.g. 0917…" value={phone} onChange={e => setPhone(e.target.value)} className={field} /><button className={button} type="submit">Search</button>{searchedKey ? <button className={button} type="button" onClick={() => {setPhone('');setSearchedKey(undefined);setSearchError(null)}}>Clear</button> : null}</form> : null}
    </div>
    {searchError ? <p role="alert" className="text-sm text-red-700">{searchError}</p> : null}
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} <button className={button} onClick={() => void load()}>Retry</button></div> : null}
    {loading ? <p role="status" className="text-sm text-gray-600">Loading activity…</p> : null}
    {!loading && !error && events.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 p-6"><p className="font-medium text-gray-900">{kind || customerKey || searchedKey ? 'No matching activity' : 'No activity yet'}</p><p className="text-sm text-gray-600">Completed earning and reward changes appear here. Try another filter or refresh after a sale.</p></div> : null}
    <ol className="space-y-3">{events.map(event => <li key={event.id} className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-gray-900">{LOYALTY_ACTIVITY_LABELS[event.kind] ?? event.kind}{event.delta !== null ? ` · ${event.delta > 0 ? '+' : ''}${event.delta}` : ''}</h3><time className="text-xs text-gray-600" dateTime={event.occurredAt} title={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'long' })}</time></div>
      <p className="mt-1 text-sm text-gray-900">{event.programName}{event.rewardLabel ? ` · ${event.rewardLabel}` : ''}</p>
      <dl className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
        <div><dt className="font-semibold">Customer</dt><dd className="break-all">{event.customerKey.replace(/^phone:/, '')}</dd></div>
        <div><dt className="font-semibold">Actor</dt><dd className="break-all">{event.actorName ?? event.actorId ?? 'Not recorded'}</dd></div>
        {event.orderId ? <div><dt className="font-semibold">Order reference</dt><dd className="break-all">{event.orderId}</dd></div> : null}
        {event.status ? <div><dt className="font-semibold">Reward status</dt><dd>{event.previousStatus ?? 'Not recorded'} → {event.status}</dd></div> : null}
        {event.note ? <div className="sm:col-span-2"><dt className="font-semibold">Reason</dt><dd>{event.note}</dd></div> : null}
      </dl>
    </li>)}</ol>
    {cursor ? <button type="button" className={button} disabled={loading} onClick={() => void load(cursor)}>Load more</button> : null}
  </section>
}
