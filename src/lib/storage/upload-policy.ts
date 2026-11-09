/**
 * Who may sign an upload into which folder. Pure: `/api/uploads/sign` and
 * `/api/imagekit/auth` both ask here.
 *
 * Store staff get only the folders their screens upload to, with the key that
 * screen is gated on, and always under their OWN store: `<folder>/<tenant id>`.
 * The root stays first because `payment-proofs/…` is matched by prefix when a
 * proof is deleted. Signed responses carry the final key/fields and every
 * client uses them verbatim, so this needs no client change.
 *
 * Superadmins and platform staff work across stores and keep the folder they
 * asked for. A merchant-app build can only send the folders below (git history
 * of webnegosyo-app/lib/product-image-upload.ts); a NEW admin uploader needs a
 * row here or it is refused.
 */

import { hasAnyPermission, type StaffPermissionKey } from '@/lib/staff-permissions'

export interface UploadCaller {
  role: 'admin' | 'superadmin' | 'platform_staff'
  tenantId: string | null
  isOwner: boolean
  permissions: string[] | null
}

const FOLDER_KEYS: Readonly<Record<string, readonly StaffPermissionKey[]>> = {
  // Menu editor, modifier options, app product screen.
  'menu-items': ['menu'],
  'variation-options': ['menu'],
  'modifier-options': ['menu'],
  // Default folder of the shared pickers; Boost Sales' combo photo uploads here.
  tenants: ['analytics', 'menu', 'store_setup'],
  // Hero, Welcome and Page builders.
  'tenants/hero': ['store_setup'],
  // Saved by actions gated on `settings`; shown in Store Setup too.
  'tenants/footer': ['settings', 'store_setup'],
  'tenants/flash-screens': ['settings', 'store_setup'],
  // Branding Studio.
  'promotion-banners': ['store_setup'],
  'page-backgrounds': ['store_setup'],
  outlets: ['store_setup'],
  'payment-qr-codes': ['store_setup'],
  // The register's proof photo (app pos-tender); `orders` also opens it for a placed order.
  'payment-proofs': ['pos', 'orders'],
  // The day-close deposit slip (app day-close).
  'day-close-deposits': ['cash_manage'],
}

export type UploadFolderDecision = { ok: true; folder: string } | { ok: false }

/** `folder` must already be sanitised by `sanitizeUploadFolder`. */
export function authorizeUploadFolder(caller: UploadCaller, folder: string): UploadFolderDecision {
  if (caller.role !== 'admin') return { ok: true, folder }
  if (!caller.tenantId) return { ok: false }

  const suffix = `/${caller.tenantId}`
  const root = folder.endsWith(suffix) ? folder.slice(0, -suffix.length) : folder
  if (!Object.prototype.hasOwnProperty.call(FOLDER_KEYS, root)) return { ok: false }

  const holder = { role: caller.role, is_owner: caller.isOwner, permissions: caller.permissions }
  if (!hasAnyPermission(holder, FOLDER_KEYS[root])) return { ok: false }

  return { ok: true, folder: `${root}${suffix}` }
}

/**
 * Store staff screens only ever pick images. Documents and video stay for
 * platform accounts (University resources). `contentType` is already normalised.
 */
export function isUploadTypeAllowedFor(role: UploadCaller['role'], contentType: string): boolean {
  return role !== 'admin' || contentType.startsWith('image/')
}
