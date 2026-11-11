'use client'

import { Printer } from 'lucide-react'
import { PRIMARY_BUTTON } from './settings-ui'

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={PRIMARY_BUTTON}>
      <Printer className="size-4" aria-hidden />
      {label}
    </button>
  )
}
