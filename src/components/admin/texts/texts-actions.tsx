'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  archiveCampaignAction,
  automationsAction,
  deleteCampaignDraftAction,
  disconnectPhoneAction,
  duplicateCampaignAction,
  getCampaignReportAction,
  pauseCampaignAction,
  previewCampaignAudienceAction,
  renamePhoneAction,
  resumeCampaignAction,
  saveCampaignAction,
  scheduleCampaignAction,
  sendCampaignNowAction,
  sendTestTextAction,
  switchToAutomaticAction,
  unarchiveCampaignAction,
  writeCampaignMessagesAction,
} from '@/app/actions/texts'

/** Every server call the Texts page makes, in one place. */
export const SERVER_TEXTS_ACTIONS = {
  archiveCampaignAction,
  automationsAction,
  deleteCampaignDraftAction,
  disconnectPhoneAction,
  duplicateCampaignAction,
  getCampaignReportAction,
  pauseCampaignAction,
  previewCampaignAudienceAction,
  renamePhoneAction,
  resumeCampaignAction,
  saveCampaignAction,
  scheduleCampaignAction,
  sendCampaignNowAction,
  sendTestTextAction,
  switchToAutomaticAction,
  unarchiveCampaignAction,
  writeCampaignMessagesAction,
}

export type TextsActions = typeof SERVER_TEXTS_ACTIONS

const TextsActionsContext = createContext<TextsActions>(SERVER_TEXTS_ACTIONS)

/**
 * The real Server Actions by default. Only a local preview harness ever
 * provides anything else, so production behaviour does not depend on it.
 */
export function TextsActionsProvider({ actions, children }: { actions?: TextsActions; children: ReactNode }) {
  return <TextsActionsContext.Provider value={actions ?? SERVER_TEXTS_ACTIONS}>{children}</TextsActionsContext.Provider>
}

export function useTextsActions(): TextsActions {
  return useContext(TextsActionsContext)
}
