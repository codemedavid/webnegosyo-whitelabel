'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  countAnnouncementRecipientsAction,
  sendAnnouncementPushAction,
} from '@/app/actions/announcements'
import type { AnnouncementRecord } from '@/lib/announcements/service'
import type { AnnouncementSendResult } from '@/lib/push/send-announcement'

/**
 * What actually happened, in one line. A refusal has to be readable here:
 * Expo accepts every message and then declines to deliver it when the build's
 * Firebase project and the FCM key on EAS disagree, so "sent to N devices"
 * alone can mean nobody was reached.
 */
function describeSendResult(result: AnnouncementSendResult): string {
  const parts = [`${result.deliveredCount} of ${result.recipientCount} devices reached`]
  if (result.pendingCount > 0) parts.push(`${result.pendingCount} still pending at Expo`)
  for (const cause of result.failureCauses) parts.push(`${cause.count} refused: ${cause.error}`)
  if (result.failedChunks > 0) parts.push(`${result.failedChunks} batches failed to send`)
  return parts.join(' · ')
}

interface Props {
  announcement: Pick<AnnouncementRecord, 'id' | 'title' | 'status' | 'audienceTenantIds' | 'pushSentAt'>
  onSent: (recipientCount: number) => void
  /** `md` matches the editor header buttons; `sm` (default) fits list rows. */
  size?: 'sm' | 'md'
}

/**
 * "Send notification" with a confirm step that shows how many devices the
 * push will reach right now — the number every operator wants to see before
 * ringing every merchant's phone, and the number that tells them whether the
 * app build that registers devices has rolled out yet.
 */
export function SendPushButton({ announcement, onSent, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const isPublished = announcement.status === 'published'

  const openDialog = () => {
    setOpen(true)
    setRecipientCount(null)
    startTransition(async () => {
      try {
        setRecipientCount(await countAnnouncementRecipientsAction(announcement.audienceTenantIds))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not count devices')
      }
    })
  }

  const send = () => {
    startTransition(async () => {
      try {
        const result = await sendAnnouncementPushAction(announcement.id)
        onSent(result.deliveredCount + result.pendingCount)
        setOpen(false)
        toast[result.failureCount > 0 ? 'warning' : 'success'](describeSendResult(result))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to send')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!isPublished || isPending}
        title={isPublished ? undefined : 'Publish first'}
        className={
          size === 'md'
            ? 'inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-emerald-300 disabled:opacity-40'
            : 'inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-40'
        }
      >
        <Send className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        {announcement.pushSentAt ? 'Send again' : 'Send notification'}
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notify merchants?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipientCount === null
                ? 'Counting registered devices…'
                : `“${announcement.title}” will be pushed to ${recipientCount} registered ${recipientCount === 1 ? 'device' : 'devices'}.`}
              {announcement.pushSentAt ? ' This announcement has already been sent once.' : ''}
              {recipientCount === 0
                ? ' No devices are registered yet — merchants register the first time they open an app build that supports What’s New.'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={send} disabled={isPending || !recipientCount}>
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
