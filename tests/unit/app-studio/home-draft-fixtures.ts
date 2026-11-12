export * from '@/lib/app-studio/home-draft'
import { BLOCK_LABELS } from '@/lib/app-studio/home-draft'
import type { AppHomeBlockType } from '@/lib/app-contract'

export const APP_HOME_BLOCK_TYPES_FOR_TEST = Object.keys(BLOCK_LABELS) as AppHomeBlockType[]
