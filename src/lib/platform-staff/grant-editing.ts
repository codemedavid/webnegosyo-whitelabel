import {
  PLATFORM_SECTIONS,
  PLATFORM_SECTION_KEYS,
  platformPermission,
  type PlatformAction,
  type PlatformSectionKey,
} from '@/lib/platform-staff/permissions'

/**
 * Pure edits for the Team page's permission matrix. `view` travels with every
 * other verb — the same rule `normalizePlatformPermissions` enforces on save —
 * so the checkboxes never show a state the server would rewrite.
 */

export function toggleGrant(
  grants: readonly string[],
  section: PlatformSectionKey,
  action: PlatformAction,
  checked: boolean
): string[] {
  const offered: readonly PlatformAction[] = PLATFORM_SECTIONS[section].actions
  if (!offered.includes(action)) return [...grants]

  const prefix = `${section}.`
  if (!checked) {
    return action === 'view'
      ? grants.filter((grant) => !grant.startsWith(prefix))
      : grants.filter((grant) => grant !== platformPermission(section, action))
  }

  const additions = [platformPermission(section, 'view'), platformPermission(section, action)]
  return [...grants, ...additions.filter((grant, index) => !grants.includes(grant) && additions.indexOf(grant) === index)]
}

/** View on every section: the "read-only" preset. */
export function readOnlyGrants(): string[] {
  return PLATFORM_SECTION_KEYS.map((section) => platformPermission(section, 'view'))
}
