/**
 * What saving an idea writes — one mapping shared by the one-tap "Turn on"
 * (client, through server actions) and an approved AI proposal (server).
 * Keeping it in one place is what guarantees both go live the same way.
 */

import type { BundleInput } from '@/lib/bundles-service'
import type { LastCallSaveInput, PairingSaveInput, UpgradeSaveInput } from './writes'
import type { BoostLastCall } from './workspace'
import type { BoostIdea } from './ideas'
import { comboDraftFromIdea, comboDraftToInput, type ComboDraftItem } from './combo-draft'

export type IdeaWrite =
  | { kind: 'combo'; input: BundleInput }
  | { kind: 'upgrade'; input: UpgradeSaveInput }
  | { kind: 'pairing'; input: PairingSaveInput }
  | { kind: 'last_call'; input: LastCallSaveInput; undo: LastCallSaveInput }
  /** The idea cannot go live as-is (e.g. an item has no category) — edit it. */
  | { kind: 'needs-edit' }

const MIN_LAST_CALL_SHOWN = 2
const MAX_LAST_CALL_SHOWN = 8

function clampShown(value: number): number {
  return Math.min(MAX_LAST_CALL_SHOWN, Math.max(MIN_LAST_CALL_SHOWN, value))
}

export function ideaToWrite(
  idea: BoostIdea,
  itemsById: ReadonlyMap<string, ComboDraftItem>,
  lastCall: BoostLastCall
): IdeaWrite {
  switch (idea.kind) {
    case 'combo': {
      const draft = comboDraftToInput(comboDraftFromIdea(idea), itemsById)
      return draft.ok ? { kind: 'combo', input: draft.input } : { kind: 'needs-edit' }
    }
    case 'upgrade':
      return {
        kind: 'upgrade',
        input: {
          sourceId: idea.sourceId,
          targetId: idea.targetId,
          header: idea.header,
          sourceLabel: null,
          targetLabel: null,
          isActive: true,
        },
      }
    case 'pairing':
      return {
        kind: 'pairing',
        input: { previousSourceIds: [], sourceIds: idea.sourceIds, targetIds: idea.targetIds, isActive: true },
      }
    case 'last_call': {
      const previous = {
        title: lastCall.title,
        subtitle: lastCall.subtitle,
        maxItems: clampShown(lastCall.maxItems),
        pickedItemIds: lastCall.pickedItemIds,
      }
      const next = idea.settings
        ? {
            title: idea.settings.title,
            subtitle: idea.settings.subtitle,
            maxItems: clampShown(Math.max(previous.maxItems, idea.settings.pickedItemIds.length)),
            pickedItemIds: idea.settings.pickedItemIds,
          }
        : previous
      return {
        kind: 'last_call',
        input: { ...next, enabled: true },
        undo: { ...previous, enabled: lastCall.enabled },
      }
    }
  }
}
