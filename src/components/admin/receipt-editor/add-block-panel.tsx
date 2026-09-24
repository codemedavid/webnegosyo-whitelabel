'use client'

/**
 * The block library, grouped. A new block lands right below the selected one
 * (or at the end) and opens selected, ready to edit.
 */

import { Plus, X } from 'lucide-react'
import { BLOCK_GROUPS, BLOCK_PALETTE } from '@/lib/receipt-editor'
import type { ReceiptBlockKind } from '@/lib/receipt-layout'

interface AddBlockPanelProps {
  /** Where the block will land, e.g. "below Business name". */
  placement: string
  onAdd: (kind: ReceiptBlockKind) => void
  onClose: () => void
}

export function AddBlockPanel({ placement, onAdd, onClose }: AddBlockPanelProps) {
  return (
    <div className="rounded-[12px] border border-[#E5E0D6] bg-[#FAF8F4]">
      <div className="flex items-center justify-between border-b border-[#E5E0D6] px-3 py-2">
        <div>
          <div className="text-[12.5px] font-extrabold">Add a block</div>
          <div className="text-[11px] text-[#8B857B]">Adds it {placement}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close block library"
          className="rounded-md p-1 text-[#8B857B] hover:bg-[#EFECE6] hover:text-[#1D1815]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {BLOCK_GROUPS.map((group) => (
        <div key={group} className="px-2 pb-1 pt-2">
          <div className="px-1.5 pb-1 text-[10.5px] font-extrabold uppercase tracking-widest text-[#8B857B]">
            {group}
          </div>
          {BLOCK_PALETTE.filter((entry) => entry.group === group).map((entry) => (
            <button
              key={entry.kind}
              type="button"
              onClick={() => onAdd(entry.kind)}
              className="group flex w-full items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 text-left transition-colors hover:bg-white"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#EFECE6] text-[#8B857B] transition-colors group-hover:bg-[#1D1815] group-hover:text-white">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold">{entry.label}</span>
                <span className="block truncate text-[11px] text-[#8B857B]">{entry.description}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
