'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Job {
  id: string
  settlement_id: string
  status: string
}
export function LoyaltySyncStatus({ tenantId }: { tenantId: string }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(
    async (jobId?: string) => {
      setBusy(true)
      try {
        const { data } = await createClient().auth.getSession()
        if (!data.session) throw new Error('Sign in to check sale syncing.')
        const headers = {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        }
        if (jobId) {
          const retry = await fetch('/api/loyalty/projections', {
            method: 'POST',
            headers,
            body: JSON.stringify({ tenantId, jobId }),
          })
          if (!retry.ok)
            throw new Error('Could not schedule sync. Please retry.')
        }
        const response = await fetch(
          `/api/loyalty/projections?tenantId=${encodeURIComponent(tenantId)}`,
          { headers, cache: 'no-store' },
        )
        if (!response.ok) throw new Error('Sale sync status is unavailable.')
        const result = await response.json()
        setJobs(result.jobs)
        setError('')
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Sale sync status is unavailable.',
        )
      } finally {
        setBusy(false)
      }
    },
    [tenantId],
  )
  useEffect(() => {
    void load()
  }, [load])
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <div className="flex justify-between gap-4">
        <h2 className="font-semibold">Reward sale syncing</h2>
        <button
          className="text-sm underline"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : jobs.length ? (
        <>
          <p className="text-sm text-gray-600">
            These sales are paid. Do not collect payment again. Showing up to 50
            orders awaiting sync.
          </p>
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                Receipt {job.settlement_id} ·{' '}
                {job.status === 'failed' ? 'Needs attention' : 'Syncing'}
              </span>
              {job.status === 'failed' ? (
                <button
                  disabled={busy}
                  className="underline"
                  onClick={() => void load(job.id)}
                >
                  Retry sync
                </button>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <p className="text-sm text-gray-600">
          {busy ? 'Checking sales…' : 'All reward sales have synced.'}
        </p>
      )}
    </section>
  )
}
