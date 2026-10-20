import type { OwlState } from '@/components/mascot/owl-markup'

interface AssistantMoodInput {
  hasError: boolean
  isBusy: boolean
  /** True for a moment after the owner confirms a change. */
  isCheering: boolean
}

/** What the owl in the assistant's header is doing right now. */
export function assistantOwlState({ hasError, isBusy, isCheering }: AssistantMoodInput): OwlState {
  if (hasError) return 'sorry'
  if (isBusy) return 'thinking'
  if (isCheering) return 'happy'
  return 'idle'
}
