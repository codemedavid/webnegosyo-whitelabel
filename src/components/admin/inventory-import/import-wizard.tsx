'use client'

import { useRef, type ReactNode } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { missingRequiredFields } from '@/lib/inventory/import/column-matching'
import { exportFileName } from '@/lib/inventory/import/export-table'
import { CSV_TYPE, downloadFile } from '@/components/admin/inventory-import/download-file'
import { MatchStep } from '@/components/admin/inventory-import/match-step'
import { ResultStep } from '@/components/admin/inventory-import/result-step'
import { ReviewStep } from '@/components/admin/inventory-import/review-step'
import { UploadStep } from '@/components/admin/inventory-import/upload-step'
import { useIngredientImport, type ImportStep } from '@/components/admin/inventory-import/use-ingredient-import'
import type { SpreadsheetFormat } from '@/components/admin/inventory-import/use-ingredient-spreadsheets'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

/** How far along the top track each step sits. */
const STEP_PROGRESS: Record<ImportStep, number> = {
  upload: 0.08,
  match: 0.4,
  review: 0.72,
  importing: 0.88,
  done: 1,
}

interface ImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  storeName: string
  ingredients: readonly InventoryItem[]
  units: readonly InventoryUnitRow[]
  branches: readonly { id: string; name: string }[]
  isTemplatePending: boolean
  onDownloadTemplate: (format: SpreadsheetFormat) => void
  onImported: (items: InventoryItem[]) => void
}

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`

export function ImportWizard({
  open,
  onOpenChange,
  tenantId,
  storeName,
  ingredients,
  units,
  branches,
  isTemplatePending,
  onDownloadTemplate,
  onImported,
}: ImportWizardProps) {
  const wizard = useIngredientImport({ tenantId, ingredients, units, branches, onImported })
  const { step, plan, progress } = wizard
  const bodyRef = useRef<HTMLDivElement>(null)
  const isImporting = step === 'importing'

  const goTo = (next: ImportStep) => {
    wizard.setStep(next)
    bodyRef.current?.scrollTo({ top: 0 })
  }

  const handleOpenChange = (next: boolean) => {
    // Closing mid-import would abandon the batches still to send.
    if (!next && isImporting) return
    onOpenChange(next)
    if (!next) wizard.reset()
  }

  const downloadRowsToFix = () => {
    const csv = wizard.buildRowsToFix()
    if (!csv) return
    downloadFile(csv, exportFileName('ingredients', 'csv', `${storeName} rows to fix`, new Date()), CSV_TYPE)
  }

  const importCount = plan ? plan.summary.create + plan.summary.update : 0
  const heading = {
    upload: { title: 'Import ingredients', description: 'Add or update your whole pantry from one spreadsheet.' },
    match: { title: 'Match your columns', description: `Tell us what each column in ${wizard.fileName} holds.` },
    review: {
      title: 'Check before you import',
      description: plan
        ? `${plural(plan.summary.total, 'row')} in ${wizard.fileName}. Nothing is saved until you import.`
        : '',
    },
    importing: { title: 'Importing…', description: 'Keep this window open until it finishes.' },
    done: { title: 'Import finished', description: 'Here’s what changed.' },
  }[step]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isImporting}
        onInteractOutside={(event) => isImporting && event.preventDefault()}
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl max-sm:h-[100dvh] max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none"
      >
        <div className="space-y-4 px-6 pt-6 pb-4">
          <div
            className="mr-8 h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(STEP_PROGRESS[step] * 100)}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${STEP_PROGRESS[step] * 100}%` }}
            />
          </div>
          <DialogHeader className={cn('text-left', step === 'done' && 'sr-only')}>
            <DialogTitle className="text-xl tracking-tight">{heading.title}</DialogTitle>
            <DialogDescription>{heading.description}</DialogDescription>
          </DialogHeader>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {step === 'upload' && (
            <UploadStep
              isReading={wizard.isReading}
              error={wizard.readError}
              isTemplatePending={isTemplatePending}
              onFile={wizard.openFile}
              onDownloadTemplate={onDownloadTemplate}
            />
          )}
          {step === 'match' && wizard.sheet && (
            <MatchStep
              sheet={wizard.sheet}
              mapping={wizard.mapping}
              onChange={wizard.setMapping}
            />
          )}
          {step === 'review' && plan && (
            <ReviewStep
              plan={plan}
              mapping={wizard.mapping}
              units={wizard.units}
              branches={branches}
              wasAutoMatched={wizard.wasAutoMatched}
              updateExistingStock={wizard.updateExistingStock}
              outletId={wizard.outletId}
              onPickUnit={wizard.pickUnit}
              onUpdateExistingStock={wizard.setUpdateExistingStock}
              onOutletChange={wizard.setOutletId}
              onEditColumns={() => goTo('match')}
            />
          )}
          {isImporting && <ImportingState done={progress.done} total={progress.total} />}
          {step === 'done' && wizard.outcome && (
            <ResultStep
              outcome={wizard.outcome}
              canDownloadRowsToFix={wizard.outcome.failed.length + wizard.outcome.skipped > 0}
              onDownloadRowsToFix={downloadRowsToFix}
            />
          )}
        </div>

        {step === 'match' && (
          <Footer>
            <Button type="button" variant="ghost" className="max-sm:h-11" onClick={wizard.reset}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Different file
            </Button>
            <Button
              type="button"
              className="max-sm:h-11 max-sm:flex-1"
              disabled={missingRequiredFields(wizard.mapping).length > 0}
              onClick={() => goTo('review')}
            >
              Continue
            </Button>
          </Footer>
        )}

        {step === 'review' && plan && (
          <Footer
            note={
              plan.summary.error > 0
                ? `${plural(plan.summary.error, 'row')} ${plan.summary.error === 1 ? 'needs' : 'need'} fixing and will be skipped.`
                : undefined
            }
          >
            <Button type="button" variant="ghost" className="max-sm:h-11" onClick={wizard.reset}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Different file
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700 max-sm:h-11 max-sm:flex-1"
              disabled={importCount === 0}
              onClick={wizard.runImport}
            >
              {importCount === 0 ? 'Nothing to import' : `Import ${plural(importCount, 'ingredient')}`}
            </Button>
          </Footer>
        )}

        {step === 'done' && (
          <Footer>
            <Button type="button" variant="ghost" className="max-sm:h-11" onClick={wizard.reset}>
              Import another file
            </Button>
            <Button type="button" className="max-sm:h-11 max-sm:flex-1" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </Footer>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Footer({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="border-t bg-muted/30 px-6 py-4">
      {note && <p className="mb-3 text-xs text-muted-foreground sm:hidden">{note}</p>}
      <div className="flex items-center justify-between gap-3">
        {note && <p className="hidden text-sm text-muted-foreground sm:block">{note}</p>}
        <div className="ml-auto flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {children}
        </div>
      </div>
    </div>
  )
}

function ImportingState({ done, total }: { done: number; total: number }) {
  const share = total === 0 ? 0 : done / total
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      <p className="text-3xl font-bold tracking-tight tabular-nums">
        {done.toLocaleString()} <span className="text-muted-foreground">of {total.toLocaleString()}</span>
      </p>
      <div className="h-3 w-full max-w-sm overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.max(share, 0.04) * 100}%` }}
        />
      </div>
    </div>
  )
}
