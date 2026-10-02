'use client'

import { memo } from 'react'
import { Pencil } from 'lucide-react'

interface AdminEditPencilProps {
    visible: boolean
    onClick: () => void
    label: string
    className?: string
}

export const AdminEditPencil = memo(function AdminEditPencil({ visible, onClick, label, className }: AdminEditPencilProps) {
    if (!visible) return null

    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900 ${className || ''}`}
        >
            <Pencil className="h-3.5 w-3.5" />
        </button>
    )
})

