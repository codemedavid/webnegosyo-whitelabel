'use client'

/**
 * The thank-you page's blocks for a published Page Designer design: the same
 * parts the standard page renders, fed from ConfirmationBlocksContext and
 * worded by the block's text slots. Keyed by block id
 * (src/lib/page-designer/blocks-confirmation.ts).
 */

import type { ReactNode } from 'react'

import type { PageBlockRenderer, PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'

import { BlockColors, buttonShapeClass, designOf } from './block-look'
import { useConfirmationBlocks } from './confirmation-context'
import { StatusHero, type StatusDesign } from './designs-status'
import { SummaryDesigned, type SummaryDesign } from './designs-summary'
import { ConfirmationKioskCard, ConfirmationTrackButtons, type ActionsCopy, type ActionsLayout } from './parts-actions'
import { ConfirmationMessageBox, ConfirmationMessengerCard, type MessengerCopy } from './parts-messenger'
import { ConfirmationCustomerCard, ConfirmationPaymentCard, type DetailsLook } from './parts-order'
import { ConfirmationFailureNotice } from './parts-status'

/** In the editor a block that doesn't apply right now says so instead of vanishing. */
function NotNow({ isEditor, children }: { isEditor: boolean; children: ReactNode }) {
  if (!isEditor) return null
  return (
    <p className="rounded-xl border border-dashed border-[color:var(--co-border)] px-4 py-3 text-center text-xs text-[color:var(--co-muted)]">
      {children}
    </p>
  )
}

function StatusBlock(block: PageBlockRenderProps) {
  const { text, option } = block
  return (
    <BlockColors block={block}>
      <div className="space-y-6">
        <StatusHero
          design={designOf<StatusDesign>(block, 'centered')}
          showIcon={option('show_icon') !== false}
          copy={{ title: text('title'), subtitle: text('subtitle'), failedTitle: text('failed_title'), failedSubtitle: text('failed_subtitle') }}
        />
        <ConfirmationFailureNotice
          copy={{ refusedHelp: text('refused_help'), messengerHelp: text('messenger_help'), contactHelp: text('contact_help') }}
        />
      </div>
    </BlockColors>
  )
}

function messengerCopy(text: PageBlockRenderProps['text']): MessengerCopy {
  return {
    countdown: text('countdown'), opened: text('opened'), button: text('button'), or: text('or'),
    copyLink: text('copy_link'), noPage: text('no_page'), copyButton: text('copy_button'),
    messageTitle: text('message_title'), messageHint: text('message_hint'),
  }
}

/** Messenger card + order message — only when Messenger is on for this order (never on a kiosk). */
function MessengerBlock(block: PageBlockRenderProps) {
  const { text, isEditor } = block
  const b = useConfirmationBlocks()
  if (!b) return null
  if (b.isKiosk || !b.isMessengerEnabled) {
    return <NotNow isEditor={isEditor}>Messenger shows here when Messenger ordering is on.</NotNow>
  }
  const copy = messengerCopy(text)
  const shape = buttonShapeClass(block)
  return (
    <BlockColors block={block}>
      <div className="space-y-6">
        <ConfirmationMessengerCard copy={copy} shape={shape} />
        <ConfirmationMessageBox copy={copy} shape={shape} />
      </div>
    </BlockColors>
  )
}

function ActionsBlock(block: PageBlockRenderProps) {
  const { text, option } = block
  const b = useConfirmationBlocks()
  if (!b) return null
  const copy: ActionsCopy = {
    track: text('track'), back: text('back'), countdown: text('countdown'), stay: text('stay'),
    kioskSent: text('kiosk_sent'), kioskFailed: text('kiosk_failed'),
    kioskReturning: text('kiosk_returning'), kioskButton: text('kiosk_button'),
  }
  const shape = buttonShapeClass(block)
  return (
    <BlockColors block={block}>
      {b.isKiosk ? (
        <ConfirmationKioskCard copy={copy} shape={shape} />
      ) : (
        <ConfirmationTrackButtons
          copy={copy}
          showBack={option('show_back') !== false}
          layout={designOf<ActionsLayout>(block, 'stacked')}
          shape={shape}
        />
      )}
    </BlockColors>
  )
}

function SummaryBlock(block: PageBlockRenderProps) {
  const { text, option } = block
  return (
    <BlockColors block={block}>
      <SummaryDesigned
        design={designOf<SummaryDesign>(block, 'standard')}
        showOrderType={option('show_order_type') !== false}
        copy={{
          title: text('title'), scheduled: text('scheduled'), addons: text('addons'), note: text('note'),
          subtotal: text('subtotal'), delivery: text('delivery'), service: text('service'), total: text('total'),
        }}
      />
    </BlockColors>
  )
}

function CustomerBlock(block: PageBlockRenderProps) {
  const b = useConfirmationBlocks()
  if (!b) return null
  if (b.order.formFields.length === 0) return <NotNow isEditor={block.isEditor}>Shows what the customer filled in at checkout.</NotNow>
  return (
    <BlockColors block={block}>
      <ConfirmationCustomerCard title={block.text('title')} look={designOf<DetailsLook>(block, 'card')} />
    </BlockColors>
  )
}

function PaymentBlock(block: PageBlockRenderProps) {
  const b = useConfirmationBlocks()
  if (!b) return null
  if (!b.order.paymentMethodName) return <NotNow isEditor={block.isEditor}>Shows the payment method once one is chosen.</NotNow>
  return (
    <BlockColors block={block}>
      <ConfirmationPaymentCard title={block.text('title')} look={designOf<DetailsLook>(block, 'card')} />
    </BlockColors>
  )
}

export const CONFIRMATION_LIVE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = {
  'confirmation.status': StatusBlock,
  'confirmation.messenger': MessengerBlock,
  'confirmation.actions': ActionsBlock,
  'confirmation.summary': SummaryBlock,
  'confirmation.customer': CustomerBlock,
  'confirmation.payment': PaymentBlock,
}
