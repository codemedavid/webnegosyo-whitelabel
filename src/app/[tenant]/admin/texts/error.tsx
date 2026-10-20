'use client'

import { MessageSquareText } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'

export default function TextsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-5xl py-8">
      <EmptyState
        icon={MessageSquareText}
        title="Couldn't load your texts"
        description="Something went wrong on our side. Nothing was sent or changed."
        actionLabel="Try again"
        onAction={reset}
      />
    </div>
  )
}
