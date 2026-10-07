/**
 * Every assistant tool, in a FIXED order: the tool schemas are part of the
 * cached prompt prefix, so reordering them throws the cache away.
 */

import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import { getSalesOverviewTool } from '@/lib/assistant/tools/reads/sales-overview'
import { getMenuInsightsTool } from '@/lib/assistant/tools/reads/menu-insights'
import { searchMenuTool } from '@/lib/assistant/tools/reads/search-menu'
import { getBestTimesTool } from '@/lib/assistant/tools/reads/best-times'
import { getItemPairsTool } from '@/lib/assistant/tools/reads/item-pairs'
import { getCustomersTool } from '@/lib/assistant/tools/reads/customers'
import { getInventoryTool } from '@/lib/assistant/tools/reads/inventory'
import { getBoostIdeasTool } from '@/lib/assistant/tools/reads/boost-ideas'
import { getStaffActivityTool } from '@/lib/assistant/tools/reads/staff-activity'
import { proposeOfferTool } from '@/lib/assistant/tools/propose/offer'
import { proposeMenuItemTool } from '@/lib/assistant/tools/propose/menu-item'
import { proposeStockAdjustmentTool } from '@/lib/assistant/tools/propose/stock'
import { calcPromoBreakevenTool, suggestPromotionsTool } from '@/lib/assistant/tools/reads/promotions'
import { proposeSmsCampaignTool } from '@/lib/assistant/tools/propose/sms'
import { proposeVoucherTool } from '@/lib/assistant/tools/propose/voucher'
import { getOrdersNowTool } from '@/lib/assistant/tools/reads/orders-now'
import { getLiveOffersTool } from '@/lib/assistant/tools/reads/live-offers'
import { getLoyaltyTool } from '@/lib/assistant/tools/reads/loyalty'
import { getSmsCampaignsTool } from '@/lib/assistant/tools/reads/campaigns'
import { getVouchersTool } from '@/lib/assistant/tools/reads/vouchers'
import { proposeOfferChangeTool } from '@/lib/assistant/tools/propose/offer-change'
import { proposeCartLastCallTool } from '@/lib/assistant/tools/propose/last-call'
import { proposeLoyaltyProgramTool, proposeLoyaltyStatusTool } from '@/lib/assistant/tools/propose/loyalty'
import { proposePauseSmsCampaignTool } from '@/lib/assistant/tools/propose/campaign-status'
import { proposeVoucherStatusTool } from '@/lib/assistant/tools/propose/voucher-status'
import { proposeMenuItemChangeTool } from '@/lib/assistant/tools/propose/menu-item-change'
import { proposeMenuFromPhotoTool, proposeMenuImportEditTool } from '@/lib/assistant/tools/propose/menu-photo'

export const ASSISTANT_TOOLS: readonly AssistantToolDef[] = [
  getSalesOverviewTool,
  getMenuInsightsTool,
  searchMenuTool,
  getBestTimesTool,
  getItemPairsTool,
  getCustomersTool,
  getInventoryTool,
  getBoostIdeasTool,
  getStaffActivityTool,
  calcPromoBreakevenTool,
  suggestPromotionsTool,
  proposeOfferTool,
  proposeMenuItemTool,
  proposeStockAdjustmentTool,
  proposeSmsCampaignTool,
  proposeVoucherTool,
  // Managing what already exists. Appended, so the older prefix stays stable.
  getOrdersNowTool,
  getLiveOffersTool,
  getLoyaltyTool,
  getSmsCampaignsTool,
  getVouchersTool,
  proposeOfferChangeTool,
  proposeCartLastCallTool,
  proposeLoyaltyProgramTool,
  proposeLoyaltyStatusTool,
  proposePauseSmsCampaignTool,
  proposeVoucherStatusTool,
  proposeMenuItemChangeTool,
  // Menu photos → dishes.
  proposeMenuFromPhotoTool,
  proposeMenuImportEditTool,
] as AssistantToolDef[]
