import { MenuItemEditorSkeleton } from '@/components/admin/menu-skeleton'

/**
 * The edit page's own skeleton. Without it this route inherited the menu
 * list's skeleton, so opening a dish flashed a list, then blanked, then
 * rendered a form.
 */
export default function EditMenuItemLoading() {
  return <MenuItemEditorSkeleton />
}
