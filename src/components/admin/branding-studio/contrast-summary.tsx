'use client'

/**
 * Global Brand's store-wide readability check: every text colour that is
 * hard to read on the colour behind it, each with a one-tap Fix, and a
 * Fix all. Fixes are ordinary draft edits, so Undo reverses them.
 */

import type { TenantContrastIssue } from '@/lib/branding-studio/tenant-contrast'

interface ContrastSummaryProps {
    issues: readonly TenantContrastIssue[]
    onFix: (fieldId: string, color: string) => void
    onFixAll: () => void
}

export function ContrastSummary({ issues, onFix, onFixAll }: ContrastSummaryProps) {
    if (issues.length === 0) {
        return (
            <div className="border-b border-[#E5E0D6] px-[18px] py-3 text-[12px] font-semibold text-emerald-800">
                ✓ Everything on your store is easy to read.
            </div>
        )
    }
    const count = `${issues.length} ${issues.length === 1 ? 'thing is' : 'things are'} hard to read`
    return (
        <section aria-label="Readability" className="border-b border-[#E5E0D6] bg-amber-50 px-[18px] py-3">
            <div className="flex items-center gap-2">
                <div className="flex-1 text-[12.5px] font-extrabold text-amber-950">{count}</div>
                <button type="button" onClick={onFixAll} className="rounded-full bg-amber-900 px-3 py-1 text-[11.5px] font-bold text-white hover:bg-amber-800">
                    Fix all
                </button>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
                {issues.map((issue) => (
                    <li key={issue.fieldId} className="flex items-center gap-2 text-[12px] text-amber-950">
                        <span className="min-w-0 flex-1 truncate">{issue.label}</span>
                        <span className="font-mono text-[11px] text-amber-800">{issue.ratio.toFixed(1)}:1</span>
                        <button
                            type="button"
                            onClick={() => onFix(issue.fieldId, issue.fix)}
                            aria-label={`Fix ${issue.label}`}
                            className="rounded px-2 py-0.5 text-[11px] font-bold text-amber-900 underline hover:bg-amber-100"
                        >
                            Fix
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    )
}
