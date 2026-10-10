import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/superadmin/ui/primitives'
import { listOnboardingInvitesAction } from '@/app/actions/onboarding-invites'
import { SignupLinkCreate } from './components/signup-link-create'
import { SignupLinksTable } from './components/signup-links-table'

// Operational data behind superadmin auth: render per request so the
// production build never has to reach Supabase to prerender this page.
export const dynamic = 'force-dynamic'

export default async function SignupLinksPage() {
  const { invites, error } = await listOnboardingInvitesAction()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Smart Menu"
        title="Sign-up links"
        subtitle="One-time links for customers who paid outside the funnel. They type in their own details and set up their store."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/superadmin/checkout-leads">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to Leads
            </Link>
          </Button>
        }
      />
      <SignupLinkCreate />
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : <SignupLinksTable invites={invites} />}
    </div>
  )
}
