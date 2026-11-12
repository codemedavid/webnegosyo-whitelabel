import Link from 'next/link'
import { Bot, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/** The way into Messenger automations from the Messenger settings page. */
export function AutomationsEntryCard({ tenantSlug }: { tenantSlug: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Link
          href={`/${tenantSlug}/admin/settings/messenger/automations`}
          className="flex items-center gap-4 rounded-xl p-5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bot className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Automations</span>
            <span className="block text-sm text-muted-foreground">Auto-replies in your Page’s chat: menu, categories, dishes, hours, your own words.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
