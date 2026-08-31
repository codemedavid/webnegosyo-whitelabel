import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadSuperadminConsent } from '@/lib/mcp/superadmin-consent'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ authorization_id?: string }>
}

export default async function SuperadminMcpAuthorizePage({ searchParams }: Props) {
  const { authorization_id: authorizationId = '' } = await searchParams
  const view = await loadSuperadminConsent(await createClient(), authorizationId)

  if (view.kind === 'login' || view.kind === 'redirect') redirect(view.href)

  if (view.kind === 'forbidden' || view.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-semibold">Connection unavailable</h1>
          <p className="mt-2 text-sm text-white/60">
            {view.kind === 'forbidden'
              ? 'This account cannot authorize the superadmin MCP connection.'
              : view.message}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">
          SmartMenu MCP
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Authorize {view.clientName}</h1>
        <p className="mt-2 text-sm text-white/60">
          This gives the client access to SmartMenu superadmin tools.
        </p>
        <dl className="mt-6 space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          <div>
            <dt className="text-white/45">Returns to</dt>
            <dd className="mt-1 break-all">{new URL(view.redirectUri).host}</dd>
          </div>
          <div>
            <dt className="text-white/45">Requested scopes</dt>
            <dd className="mt-1">{view.scopes.join(', ') || 'No named scopes'}</dd>
          </div>
        </dl>
        <form action="/api/mcp/supabase/decision" method="post" className="mt-6 flex gap-3">
          <input type="hidden" name="authorization_id" value={view.authorizationId} />
          <button
            className="flex-1 rounded-lg border border-white/15 px-4 py-2 text-sm"
            name="decision"
            value="deny"
          >
            Deny
          </button>
          <button
            className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            name="decision"
            value="approve"
          >
            Approve
          </button>
        </form>
      </section>
    </main>
  )
}
