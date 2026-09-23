'use client'

/**
 * The store's loyalty in one place: who is collecting, and what they collect on.
 *
 * Two halves, in the same order as the merchant app's Rewards screen, because a
 * merchant opens this for two different reasons. MEMBERS is the daily one — who
 * can claim now, who is one visit away, who has gone quiet — so it opens first.
 * PROGRAMMES is the setup, visited once and then rarely.
 */

import { useState } from 'react'
import { LoyaltyMembersPanel } from './loyalty-members-panel'
import { LoyaltyProgramsManagement } from './loyalty-programs-management'

type Section = 'members' | 'programs'

const TABS: readonly { label: string; value: Section }[] = [
  { label: 'Members', value: 'members' },
  { label: 'Programmes', value: 'programs' },
]

export function LoyaltyWorkspace({
  tenantId,
  tenantSlug,
}: {
  tenantId: string
  tenantSlug: string
}) {
  const [section, setSection] = useState<Section>('members')

  return (
    <div className="space-y-6">
      <div
        className="inline-flex rounded-lg border border-gray-300 bg-white p-1"
        role="tablist"
        aria-label="Loyalty"
      >
        {TABS.map((tab) => {
          const isActive = tab.value === section
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSection(tab.value)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Both stay mounted: flipping back to a list that has to re-fetch every
          time makes comparing a member against the rules a chore. */}
      <div hidden={section !== 'members'}>
        <LoyaltyMembersPanel tenantId={tenantId} />
      </div>
      <div hidden={section !== 'programs'}>
        <LoyaltyProgramsManagement tenantId={tenantId} tenantSlug={tenantSlug} />
      </div>
    </div>
  )
}
