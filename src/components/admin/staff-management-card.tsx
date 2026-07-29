'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MAX_STAFF_PER_TENANT,
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'
import type { StaffRecord } from '@/lib/staff-service'
import {
  createStaffAction,
  removeStaffAction,
  resetStaffPasswordAction,
  updateStaffPermissionsAction,
} from '@/app/actions/staff'

/** A branch as this card needs to show and offer it. */
interface StaffOutlet {
  id: string
  name: string
}

interface StaffManagementCardProps {
  tenantId: string
  tenantSlug: string
  staff: StaffRecord[]
  /**
   * The store's branches. Empty (the default) for every single-location
   * tenant, which is the signal to render exactly the card that exists today —
   * no branch control and no branch column.
   */
  outlets?: StaffOutlet[]
}

const ALL_BRANCHES_LABEL = 'All branches'

const EMPTY_FORM = {
  displayName: '',
  email: '',
  password: '',
  permissions: [] as string[],
  /** '' means the whole store; `resolveStaffOutletId` reads it as null. */
  outletId: '',
}

/**
 * The branch a member covers, named rather than identified.
 *
 * A branch that no longer exists still has to render as words: deleting a
 * branch sets the column to NULL, but between that write and the next fetch a
 * stale row would otherwise print a raw uuid into the merchant's staff list.
 */
function branchLabel(outletId: string | null | undefined, outlets: StaffOutlet[]): string {
  if (!outletId) return ALL_BRANCHES_LABEL
  return outlets.find((outlet) => outlet.id === outletId)?.name ?? 'Unknown branch'
}

/**
 * Native radios rather than the Select primitive: the choice is short, always
 * fully visible, and stays operable by keyboard and by test without pointer
 * emulation.
 */
function BranchRadioGroup({
  outlets,
  value,
  onChange,
  idPrefix,
}: {
  outlets: StaffOutlet[]
  value: string
  onChange: (outletId: string) => void
  idPrefix: string
}) {
  const options = [{ id: '', name: ALL_BRANCHES_LABEL }, ...outlets]

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.id || 'all'}
          htmlFor={`${idPrefix}-branch-${option.id || 'all'}`}
          className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
        >
          <input
            type="radio"
            id={`${idPrefix}-branch-${option.id || 'all'}`}
            name={`${idPrefix}-branch`}
            className="h-4 w-4"
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span className="text-sm font-medium leading-none">{option.name}</span>
        </label>
      ))}
    </div>
  )
}

function PermissionCheckboxes({
  selected,
  onToggle,
  idPrefix,
}: {
  selected: string[]
  onToggle: (key: StaffPermissionKey) => void
  idPrefix: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {STAFF_PERMISSION_KEYS.map((key) => (
        <label
          key={key}
          htmlFor={`${idPrefix}-${key}`}
          className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
        >
          <Checkbox
            id={`${idPrefix}-${key}`}
            checked={selected.includes(key)}
            onCheckedChange={() => onToggle(key)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium leading-none">
              {STAFF_PERMISSION_LABELS[key].label}
            </span>
            <span className="block text-xs text-muted-foreground">
              {STAFF_PERMISSION_LABELS[key].description}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

export function StaffManagementCard({
  tenantId,
  tenantSlug,
  staff,
  outlets = [],
}: StaffManagementCardProps) {
  const hasBranches = outlets.length > 0
  const router = useRouter()
  const members = staff.filter((s) => !s.is_owner)
  const [isSaving, setIsSaving] = useState(false)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)

  const [editTarget, setEditTarget] = useState<StaffRecord | null>(null)
  const [editPermissions, setEditPermissions] = useState<string[]>([])

  const [passwordTarget, setPasswordTarget] = useState<StaffRecord | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [removeTarget, setRemoveTarget] = useState<StaffRecord | null>(null)

  const togglePermission = (list: string[], key: StaffPermissionKey): string[] =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key]

  const handleCreate = async () => {
    setIsSaving(true)
    const result = await createStaffAction(tenantId, tenantSlug, addForm)
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${addForm.displayName} added to your staff`)
    setAddForm(EMPTY_FORM)
    setIsAddOpen(false)
    router.refresh()
  }

  const handleUpdatePermissions = async () => {
    if (!editTarget) return
    setIsSaving(true)
    const result = await updateStaffPermissionsAction(
      tenantId,
      tenantSlug,
      editTarget.user_id,
      editPermissions
    )
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Permissions updated')
    setEditTarget(null)
    router.refresh()
  }

  const handleResetPassword = async () => {
    if (!passwordTarget) return
    setIsSaving(true)
    const result = await resetStaffPasswordAction(tenantId, passwordTarget.user_id, newPassword)
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Password updated')
    setPasswordTarget(null)
    setNewPassword('')
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setIsSaving(true)
    const result = await removeStaffAction(tenantId, tenantSlug, removeTarget.user_id)
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Staff member removed')
    setRemoveTarget(null)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Staff & Permissions</CardTitle>
            <CardDescription>
              Give your team access to only the features they need — on the web admin, the
              merchant app, and the POS.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {members.length} of {MAX_STAFF_PER_TENANT} staff
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No staff accounts yet. Add up to {MAX_STAFF_PER_TENANT} team members.
          </p>
        )}

        {members.map((member) => (
          <div
            key={member.user_id}
            className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{member.display_name || member.email}</p>
              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(member.permissions ?? []).map((key) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {STAFF_PERMISSION_LABELS[key as StaffPermissionKey]?.label ?? key}
                  </Badge>
                ))}
                {member.permissions == null && (
                  <Badge variant="outline" className="text-xs">Full access</Badge>
                )}
                {hasBranches && (
                  <Badge variant="secondary" className="text-xs">
                    {branchLabel(member.outlet_id, outlets)}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditTarget(member)
                  setEditPermissions(member.permissions ?? [])
                }}
              >
                Permissions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPasswordTarget(member)
                  setNewPassword('')
                }}
              >
                Reset Password
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setRemoveTarget(member)}>
                Remove
              </Button>
            </div>
          </div>
        ))}

        <Button
          onClick={() => setIsAddOpen(true)}
          disabled={members.length >= MAX_STAFF_PER_TENANT}
        >
          Add Staff Member
        </Button>
        {members.length >= MAX_STAFF_PER_TENANT && (
          <p className="text-xs text-muted-foreground">
            Staff limit reached. Remove a member to add a new one.
          </p>
        )}
      </CardContent>

      {/* Add staff dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>
              They log in with this email and password on the web admin, merchant app, and POS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-name">Name</Label>
              <Input
                id="staff-name"
                value={addForm.displayName}
                onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })}
                placeholder="e.g. Maria Santos"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="staff@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                placeholder="At least 8 characters"
              />
            </div>
            {hasBranches && (
              <div className="space-y-2">
                <Label>Works at</Label>
                <BranchRadioGroup
                  idPrefix="add-staff"
                  outlets={outlets}
                  value={addForm.outletId}
                  onChange={(outletId) => setAddForm({ ...addForm, outletId })}
                />
                <p className="text-xs text-muted-foreground">
                  A branch account sees only that branch&apos;s orders and sales.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Can access</Label>
              <PermissionCheckboxes
                idPrefix="add-staff"
                selected={addForm.permissions}
                onToggle={(key) =>
                  setAddForm({ ...addForm, permissions: togglePermission(addForm.permissions, key) })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? 'Adding…' : 'Add Staff'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit permissions dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Permissions — {editTarget?.display_name || editTarget?.email}</DialogTitle>
            <DialogDescription>Changes apply the next time they open the app.</DialogDescription>
          </DialogHeader>
          <PermissionCheckboxes
            idPrefix="edit-staff"
            selected={editPermissions}
            onToggle={(key) => setEditPermissions(togglePermission(editPermissions, key))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePermissions} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(open) => !open && setPasswordTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reset Password — {passwordTarget?.display_name || passwordTarget?.email}
            </DialogTitle>
            <DialogDescription>Set a new password for this staff member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="staff-new-password">New password</Label>
            <Input
              id="staff-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Set Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget?.display_name || removeTarget?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their account is deleted and they immediately lose access to the web admin, the
              merchant app, and the POS. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isSaving}>
              {isSaving ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
