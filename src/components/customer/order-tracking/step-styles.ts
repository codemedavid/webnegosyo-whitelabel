import type { CSSProperties } from 'react'

/** A step's bubble in the owner's timeline colours: done, current (with a soft ring) or still to come. */
export function stepBubbleStyle(isCompleted: boolean, isCurrent: boolean): CSSProperties {
  if (isCompleted) return { backgroundColor: 'var(--trk-step-done)', borderColor: 'var(--trk-step-done)', color: 'var(--trk-on-step-done)' }
  if (isCurrent) return { backgroundColor: 'var(--trk-step-current)', borderColor: 'var(--trk-step-current)', color: 'var(--trk-on-step-current)', boxShadow: '0 0 0 6px var(--trk-step-current-soft)' }
  return { backgroundColor: 'transparent', borderColor: 'var(--trk-step-upcoming)', color: 'var(--trk-text-faint)' }
}

/** A step's name: current in the current colour, done in the done colour, the rest soft. */
export function stepTitleColor(isCompleted: boolean, isCurrent: boolean): string {
  if (isCurrent) return 'var(--trk-step-current)'
  return isCompleted ? 'var(--trk-step-done)' : 'var(--trk-text-muted)'
}
