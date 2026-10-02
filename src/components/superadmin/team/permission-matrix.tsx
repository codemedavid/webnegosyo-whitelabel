'use client'

import { cn } from '@/lib/utils'
import {
  PLATFORM_ACTIONS,
  PLATFORM_SECTIONS,
  PLATFORM_SECTION_KEYS,
  platformPermission,
  type PlatformAction,
  type PlatformSectionKey,
} from '@/lib/platform-staff/permissions'
import { readOnlyGrants, toggleGrant } from '@/lib/platform-staff/grant-editing'
import { STAFF_PERMISSION_KEYS, STAFF_PERMISSION_LABELS } from '@/lib/staff-permissions'

const ACTION_LABELS: Record<PlatformAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
}

interface PermissionMatrixProps {
  grants: string[]
  onChange: (grants: string[]) => void
  disabled?: boolean
}

/** Sections × View/Create/Edit/Delete. A dash marks a verb the section does not have. */
export function PermissionMatrix({ grants, onChange, disabled }: PermissionMatrixProps) {
  const toggle = (section: PlatformSectionKey, action: PlatformAction, checked: boolean) =>
    onChange(toggleGrant(grants, section, action, checked))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-white/45">Quick set:</span>
        <button type="button" disabled={disabled} onClick={() => onChange(readOnlyGrants())} className={PRESET_BUTTON}>
          View everything
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange([])} className={PRESET_BUTTON}>
          Clear all
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/45">
              <th className="px-4 py-2.5 font-medium">Section</th>
              {PLATFORM_ACTIONS.map((action) => (
                <th key={action} className="w-20 px-2 py-2.5 text-center font-medium">
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {PLATFORM_SECTION_KEYS.map((section) => (
              <MatrixRow key={section} section={section} grants={grants} onToggle={toggle} disabled={disabled} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface MatrixRowProps {
  section: PlatformSectionKey
  grants: string[]
  onToggle: (section: PlatformSectionKey, action: PlatformAction, checked: boolean) => void
  disabled?: boolean
}

function MatrixRow({ section, grants, onToggle, disabled }: MatrixRowProps) {
  const definition = PLATFORM_SECTIONS[section]
  const offered: readonly PlatformAction[] = definition.actions
  const hints: Partial<Record<PlatformAction, string>> =
    'actionHints' in definition ? definition.actionHints : {}

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-white/90">{definition.label}</div>
        <div className="text-xs text-white/45">{definition.description}</div>
      </td>
      {PLATFORM_ACTIONS.map((action) => {
        if (!offered.includes(action)) {
          return (
            <td key={action} className="px-2 py-3 text-center text-white/20" aria-hidden>
              —
            </td>
          )
        }
        const permission = platformPermission(section, action)
        const label = `${ACTION_LABELS[action]} ${definition.label}`
        return (
          <td key={action} className="px-2 py-3 text-center">
            <input
              type="checkbox"
              aria-label={label}
              title={hints[action] ?? label}
              checked={grants.includes(permission)}
              disabled={disabled}
              onChange={(event) => onToggle(section, action, event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-white disabled:cursor-not-allowed"
            />
          </td>
        )
      })}
    </tr>
  )
}

interface StoreFeaturePickerProps {
  /** null = every store feature. */
  features: string[] | null
  onChange: (features: string[] | null) => void
  disabled?: boolean
}

/** Which parts of a store's admin the account may open — the tenant staff list. */
export function StoreFeaturePicker({ features, onChange, disabled }: StoreFeaturePickerProps) {
  const isAll = features === null
  const toggle = (key: string, checked: boolean) => {
    const current = features ?? []
    onChange(checked ? [...current, key] : current.filter((feature) => feature !== key))
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 p-4">
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={isAll}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? null : [])}
          className="h-4 w-4 accent-white"
        />
        Every store feature
      </label>
      {!isAll ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {STAFF_PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={features.includes(key)}
                disabled={disabled}
                onChange={(event) => toggle(key, event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-white"
              />
              <span>
                <span className="text-white/85">{STAFF_PERMISSION_LABELS[key].label}</span>
                <span className="block text-xs text-white/40">{STAFF_PERMISSION_LABELS[key].description}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const PRESET_BUTTON = cn(
  'rounded-full border border-white/15 px-3 py-1 text-white/70 transition-colors',
  'hover:border-white/30 hover:text-white disabled:opacity-50'
)
