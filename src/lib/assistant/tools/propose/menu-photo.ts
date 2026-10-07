/**
 * Menu photos → dishes on the menu, in two tools.
 *
 * - propose_menu_from_photo reads the photos attached to THIS message with the
 *   menu parser (a vision model; the chat model never sees the image) and
 *   files ONE proposal with every new dish.
 * - propose_menu_import_edit applies the owner's corrections ("drop the
 *   drinks", "Adobo is ₱180") to that proposal and files a fresh one in its
 *   place. The dishes live in the stored proposal, never in the model's
 *   output, so a 30-dish menu costs a few refs, not 30 dishes of tokens.
 */

import { z } from 'zod'
import { PHOTO_TOOL_TIMEOUT_MS } from '@/lib/assistant/config'
import { parseMenuWithAi } from '@/lib/menu-import/parse-menu-ai'
import { readAssistantCategories, readAssistantMenu } from '@/lib/assistant/data/menu'
import { cancelOtherPending, loadAction } from '@/lib/assistant/actions/store'
import {
  applyImportEdits,
  buildImportDraft,
  importCardLines,
  importFacts,
  importWarning,
  type ImportDraft,
  type StoreMenuNames,
} from '@/lib/assistant/insights/menu-import'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { MenuImportPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

/** The parser's own deadline, inside the tool's so a slow model fails cleanly. */
const PARSE_DEADLINE_MS = PHOTO_TOOL_TIMEOUT_MS - 5_000

async function readStoreMenuNames(ctx: AssistantToolContext): Promise<StoreMenuNames> {
  const [categories, menu] = await Promise.all([
    readAssistantCategories(ctx.tenantId),
    ctx.memo('menu', () => readAssistantMenu(ctx.tenantId)),
  ])
  return { categories, itemNames: menu.map((item) => item.name) }
}

function dishRef(ctx: AssistantToolContext, actionId: string, index: number): string {
  return ctx.refs.refFor('draft', `${actionId}#${index}`)
}

/** Files the import as the ONLY confirmable one in this chat: earlier import cards are cancelled. */
async function fileImport(ctx: AssistantToolContext, draft: Pick<ImportDraft, 'payload'> & Partial<ImportDraft>): Promise<ToolResult> {
  const { payload } = draft
  const count = payload.items.length
  const result = await fileProposal(ctx, {
    kind: 'menu_import',
    payload,
    summary: `Add ${count} dish${count === 1 ? '' : 'es'} from a menu photo`,
    title: `Add ${count} dish${count === 1 ? '' : 'es'} to your menu`,
    lines: importCardLines(payload),
    warning: importWarning(payload),
  })
  if (result.card?.type !== 'confirm') return result
  const actionId = result.card.actionId
  await cancelOtherPending({ tenantId: ctx.tenantId, conversationId: ctx.conversationId, userId: ctx.caller.userId, kind: 'menu_import', keepId: actionId })
  return {
    ...result,
    facts: {
      ...result.facts,
      import: ctx.refs.refFor('import', actionId),
      ...importFacts(draft, (index) => dishRef(ctx, actionId, index)),
      earlierCards: 'Any earlier dish-import card in this chat is now cancelled; only this one can be confirmed.',
    },
  }
}

const photoInput = z.object({
  note: z.string().trim().max(300).nullable().describe('What the owner said about the photo, e.g. "only the drinks"'),
})
type PhotoInput = z.infer<typeof photoInput>

export const proposeMenuFromPhotoTool: AssistantToolDef<PhotoInput> = {
  name: 'propose_menu_from_photo',
  description: 'Read the menu photo(s) attached to this message and propose adding the dishes found. The user must confirm.',
  access: { permission: 'menu' },
  timeoutMs: PHOTO_TOOL_TIMEOUT_MS,
  input: photoInput,
  async run(ctx, request) {
    if (ctx.photos.length === 0) return refused('No photo is attached to this message. Ask the owner to attach one with the photo button.')

    const [parsed, store] = await Promise.all([
      parseMenuWithAi(
        { text: request.note ?? '', images: [...ctx.photos] },
        { fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(PARSE_DEADLINE_MS) }) },
      ),
      readStoreMenuNames(ctx),
    ])
    if (!parsed.ok) {
      return refused(parsed.status < 500 ? parsed.error : 'The photo could not be read right now. Ask the owner to try again in a moment.')
    }

    const draft = buildImportDraft(parsed.data, store)
    if (draft.payload.items.length === 0) {
      return refused(draft.alreadyOnMenu.length > 0 ? 'Every dish in the photo is already on the menu.' : 'No dishes could be read from the photo. A sharper, closer photo helps.')
    }
    return fileImport(ctx, draft)
  },
}

const change = z.object({
  dish: z.string().describe('Dish ref from the import'),
  name: z.string().trim().min(2).max(80).nullable(),
  price: z.number().min(0).max(100_000).nullable(),
  category: z.string().trim().min(2).max(80).nullable().describe('Existing or new category name'),
})

const editInput = z.object({
  import: z.string().describe('Import ref from propose_menu_from_photo'),
  remove: z.array(z.string()).max(40).nullable().describe('Dish refs to leave out'),
  changes: z.array(change).max(40).nullable(),
})
type EditInput = z.infer<typeof editInput>

/** The dish's position in the import, or null when the ref belongs elsewhere. */
function dishIndex(ctx: AssistantToolContext, actionId: string, ref: string): number | null {
  const id = ctx.refs.resolve(ref, 'draft')
  if (!id?.startsWith(`${actionId}#`)) return null
  const index = Number(id.slice(actionId.length + 1))
  return Number.isInteger(index) ? index : null
}

export const proposeMenuImportEditTool: AssistantToolDef<EditInput> = {
  name: 'propose_menu_import_edit',
  description: 'Correct a photo import before it is confirmed: leave dishes out, or fix a name, price or category. Replaces its card.',
  access: { permission: 'menu' },
  input: editInput,
  async run(ctx, request) {
    const actionId = ctx.refs.resolve(request.import, 'import')
    const action = actionId ? await loadAction(ctx.tenantId, actionId) : null
    if (!actionId || !action || action.kind !== 'menu_import' || action.conversationId !== ctx.conversationId || action.createdBy !== ctx.caller.userId) {
      return refused('Unknown import ref. Read the photo again with propose_menu_from_photo.')
    }
    if (action.status === 'applied' || action.status === 'executing') {
      return refused('Those dishes were already added. Change a dish with propose_menu_item_change instead.')
    }

    const remove = (request.remove ?? []).map((ref) => dishIndex(ctx, actionId, ref))
    const changes = (request.changes ?? []).map((c) => ({ index: dishIndex(ctx, actionId, c.dish), name: c.name, price: c.price, category: c.category }))
    if ([...remove, ...changes.map((c) => c.index)].some((index) => index === null)) {
      return refused('One of those dish refs is not part of this import.')
    }

    const edited = applyImportEdits(
      action.payload as MenuImportPayload,
      { remove: remove as number[], changes: changes as Array<{ index: number; name: string | null; price: number | null; category: string | null }> },
      await readStoreMenuNames(ctx),
    )
    if (typeof edited === 'string') return refused(edited)

    // A cancelled or expired import can still be corrected: the new card is a fresh proposal.
    return fileImport(ctx, { payload: edited })
  },
}
