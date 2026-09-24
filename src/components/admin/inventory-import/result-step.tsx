'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Download, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ImportOutcome, RowProblem } from '@/components/admin/inventory-import/use-ingredient-import'

const LISTED_PROBLEMS = 5
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`

function SuccessMark() {
  const isReduced = useReducedMotion()
  return (
    <motion.span
      className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-[0_12px_32px_-8px_rgb(16_185_129/0.55)]"
      initial={isReduced ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 18 }}
    >
      <svg viewBox="0 0 24 24" className="h-12 w-12 text-white" fill="none" aria-hidden>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={isReduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.18, duration: 0.45, ease: EASE_OUT_EXPO }}
        />
      </svg>
    </motion.span>
  )
}

function ProblemList({ title, problems }: { title: string; problems: readonly RowProblem[] }) {
  if (problems.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{title}</p>
      <ul className="space-y-1">
        {problems.slice(0, LISTED_PROBLEMS).map((problem) => (
          <li key={problem.rowNumber} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Row {problem.rowNumber}</span> · {problem.name} —{' '}
            {problem.message}
          </li>
        ))}
        {problems.length > LISTED_PROBLEMS && (
          <li className="text-xs text-muted-foreground">and {problems.length - LISTED_PROBLEMS} more</li>
        )}
      </ul>
    </div>
  )
}

interface ResultStepProps {
  outcome: ImportOutcome
  canDownloadRowsToFix: boolean
  onDownloadRowsToFix: () => void
}

export function ResultStep({ outcome, canDownloadRowsToFix, onDownloadRowsToFix }: ResultStepProps) {
  const saved = outcome.created + outcome.updated
  const leftBehind = outcome.failed.length + outcome.skipped
  const summary = [
    outcome.created > 0 ? `${outcome.created.toLocaleString()} added` : null,
    outcome.updated > 0 ? `${outcome.updated.toLocaleString()} updated` : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      {saved > 0 ? (
        <SuccessMark />
      ) : (
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          <X className="h-11 w-11" strokeWidth={2.5} />
        </span>
      )}

      <div className="space-y-1.5">
        <h3 className="text-2xl font-bold tracking-tight text-balance">
          {saved > 0 ? `${plural(saved, 'ingredient')} imported` : 'Nothing was imported'}
        </h3>
        <p className="text-muted-foreground">
          {saved > 0 ? `${summary.join(' · ')}. They’re in your list now.` : 'None of the rows could be saved.'}
        </p>
      </div>

      {(leftBehind > 0 || outcome.stockProblems.length > 0) && (
        <div className="w-full space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-left dark:border-amber-900 dark:bg-amber-950/20">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            {leftBehind > 0
              ? `${plural(leftBehind, 'row')} still ${leftBehind === 1 ? 'needs' : 'need'} fixing`
              : 'Some stock counts didn’t save'}
          </p>
          {outcome.skipped > 0 && (
            <p className="text-sm">
              {plural(outcome.skipped, 'row')} held back on the review — they had problems to fix first.
            </p>
          )}
          <ProblemList title="Couldn’t be saved" problems={outcome.failed} />
          <ProblemList title="Saved, but stock wasn’t counted" problems={outcome.stockProblems} />
          {canDownloadRowsToFix && (
            <div className="flex flex-wrap items-center gap-3 border-t border-amber-200 pt-4 dark:border-amber-900">
              <Button type="button" variant="outline" className="bg-background max-sm:h-11 max-sm:w-full" onClick={onDownloadRowsToFix}>
                <Download className="mr-2 h-4 w-4" />
                Download rows to fix
              </Button>
              <p className="text-xs text-muted-foreground">Each row says what’s wrong. Fix them and import that file.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
