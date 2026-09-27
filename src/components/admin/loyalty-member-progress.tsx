import type { LoyaltyMemberProgress } from '@/lib/loyalty/members'

export function nextCardPercent(progress: LoyaltyMemberProgress): number | null {
  return progress.threshold > 0 ? Math.max(0, Math.min(100, progress.balance / progress.threshold * 100)) : null
}
export function nextCardLabel(progress: LoyaltyMemberProgress): string {
  if (progress.threshold <= 0) return 'Next reward: progress unavailable'
  const remaining = Math.max(0, progress.threshold - progress.balance)
  const unit = progress.earnMode === 'points' ? 'point' : 'visit'
  return remaining === 0 ? 'Next card complete' : `Next reward: ${remaining} more ${unit}${remaining === 1 ? '' : 's'}`
}
export function LoyaltyMemberProgress({ progress }: { progress: LoyaltyMemberProgress }) {
  const percent = nextCardPercent(progress)
  return <div className="space-y-1">
    {progress.rewardsAvailable > 0 ? <p className="text-xs font-semibold text-emerald-700">{progress.rewardsAvailable} reward{progress.rewardsAvailable === 1 ? '' : 's'} ready</p> : null}
    <div className="h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-label="Next card progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? 'Progress unavailable' : undefined}>
      {percent === null ? null : <div className="h-2 rounded-full bg-orange-500" style={{ width: `${percent}%` }} />}
    </div>
    <p className="text-xs text-gray-600">{progress.balance}{progress.threshold > 0 ? ` / ${progress.threshold}` : ''} · {nextCardLabel(progress)}</p>
  </div>
}
