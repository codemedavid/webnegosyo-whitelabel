import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { TeamManager, type TeamListMember } from '@/components/superadmin/team/team-manager'
import { listTeamMembersAction } from '@/app/actions/platform-staff'
import { getConsoleCaller } from '@/lib/platform-staff/guard'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  // The middleware already keeps platform staff out; this is the page's own
  // check so the route never depends on it alone.
  const caller = await getConsoleCaller()
  if (caller?.appUser.role !== 'superadmin') redirect('/superadmin')

  const result = await listTeamMembersAction()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Team"
        subtitle="Give people access to only the parts of the console they need — view, create, edit or delete, section by section."
      />
      {result.success ? (
        <TeamManager members={(result.data ?? []) as TeamListMember[]} currentUserId={caller.user.id} />
      ) : (
        <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-sm text-red-300">
          Could not load the team: {result.error}
        </p>
      )}
    </div>
  )
}
