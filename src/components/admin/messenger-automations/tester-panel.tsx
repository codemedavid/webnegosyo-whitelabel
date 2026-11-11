'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createMessengerTesterCodeAction, readMessengerTesterAction } from '@/app/actions/messenger-automations'

interface TesterPanelProps {
  tenantId: string
  isLinked: boolean
  onLinkedChange: (isLinked: boolean) => void
}

/** Link the owner's own Messenger, so "Send test" can reach their phone. */
export function TesterPanel({ tenantId, isLinked, onLinkedChange }: TesterPanelProps) {
  const [code, setCode] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const getCode = () => startTransition(async () => {
    const result = await createMessengerTesterCodeAction(tenantId)
    if (result.ok) setCode(result.code)
    else toast.error(result.error)
  })

  const check = () => startTransition(async () => {
    const result = await readMessengerTesterAction(tenantId)
    if (!result.ok) { toast.error(result.error); return }
    onLinkedChange(result.isLinked)
    if (result.isLinked) { setCode(null); toast.success('Your Messenger is linked') }
    else toast.message('Not linked yet. Send the code to your Page, then check again.')
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test on your phone</CardTitle>
        <CardDescription>Send a reply to your own Messenger before customers see it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLinked ? (
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Your Messenger is linked. Use “Send test” in any automation.</p>
        ) : null}
        {code ? (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm">From your own Facebook account, message your Page:</p>
            <p className="font-mono text-2xl font-semibold tracking-wider" aria-live="polite">{code}</p>
            <p className="text-xs text-muted-foreground">The code works once, for 10 minutes.</p>
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={check}>I sent it</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" disabled={isPending} onClick={getCode}>
            {isLinked ? 'Link a different Messenger' : 'Get a test code'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
