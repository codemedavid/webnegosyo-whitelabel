import { canDuplicateNode, canRemoveNode } from '@/lib/page-designer/design-blocks'

import type { NodePolicy } from './use-hero-builder'

/** Page Designer: required blocks stay, and no page block is ever doubled. */
export const PAGE_NODE_POLICY: NodePolicy = { canRemove: canRemoveNode, canDuplicate: canDuplicateNode }
