'use client'

import { Plus, X } from 'lucide-react'
import { heroTemplates } from '@/lib/hero-designer-templates'
import { createBlankDesign } from '@/lib/hero-designer-defaults'
import type { HeroDesign } from '@/types/hero-designer'

interface TemplatePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectTemplate: (design: HeroDesign) => void
}

export function TemplatePicker({ isOpen, onClose, onSelectTemplate }: TemplatePickerProps) {
  if (!isOpen) return null

  function handleSelect(design: HeroDesign) {
    if (window.confirm('This will replace your current design. Continue?')) {
      onSelectTemplate(design)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Choose a Template</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {heroTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelect(template.design)}
              className="group rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-300 hover:shadow-md"
            >
              <div
                className="h-32 w-full rounded-lg"
                style={{ background: template.thumbnail }}
              />
              <p className="mt-2 font-medium">{template.name}</p>
              <p className="text-sm text-gray-500">{template.description}</p>
            </button>
          ))}

          {/* Blank template */}
          <button
            onClick={() => handleSelect(createBlankDesign())}
            className="group rounded-lg border border-dashed border-gray-300 p-3 text-left transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex h-32 w-full items-center justify-center rounded-lg bg-gray-50">
              <Plus className="h-8 w-8 text-gray-400 group-hover:text-blue-500" />
            </div>
            <p className="mt-2 font-medium">Start Blank</p>
            <p className="text-sm text-gray-500">Begin with an empty canvas.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
