'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Shuffle, Trash2, UserPlus, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  STAFF_PERMISSION_LABELS,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'
import type { RosterStaff } from '@/lib/outlets/branch-roster'
import {
  createStaffAction,
  removeStaffAction,
  resetStaffPasswordAction,
  updateStaffBranchAction,
  updateStaffPermissionsAction,
} from '@/app/actions/staff'
import {
  BranchRadioGroup,
  PermissionCheckboxes,
  branchLabel,
  togglePermission,
  type StaffOutlet,
} from './staff-fields'

export interface StaffRosterProps {
  tenantId: string
  tenantSlug: string
  members: readonly RosterStaff[]
  /** Every branch the store has — for the move dialog and the branch badges. */
  outlets: readonly StaffOutlet[]
  /**
   * The branch these members are posted to. Null means the store-wide pool, and
   * is the only case where the add dialog asks which branch: on a branch's own
   * page the answer is already on screen.
   */
  scopeOutlet: StaffOutlet | null
  addLabel: string
  emptyText: string
  /** Print each member's branch. Off inside a branch, where it is redundant. */
  showBranchLabel?: boolean
  /** Offer reassigning a member to another branch. */
  canMove?: boolean
  seatsRemaining: number
  seatsLabel: string
  seatsTestId: string
}

const EMPTY_FORM = {
  displayName: '',
  email: '',
  password: '',
  permissions: [] as string[],
  /** '' means the whole store; `resolveStaffOutletId` reads it as null. */
  outletId: '',
}

function displayNameOf(member: RosterStaff): string {
  return member.display_name || member.email || 'Unnamed account'
}

/**
 * A list of staff accounts and everything that can be done to them.
 *
 * One component serves the branch team panel and the store-wide People card,
 * because the difference between them is data, not behaviour: which branch a
 * new account lands in, and whether a member's branch is worth printing beside
 * their name. Two near-identical rosters would have drifted the moment one of
 * them grew a control.
 *
 * Every write goes through the existing server actions, which re-check the
 * caller's own branch authority — this component decides what to offer, never
 * what is allowed.
 */
export function StaffRoster({
  tenantId,
  tenantSlug,
  members,
  outlets,
  scopeOutlet,
  addLabel,
  emptyText,
  showBranchLabel = false,
  canMove = false,
  seatsRemaining,
  seatsLabel,
  seatsTestId,
}: StaffRosterProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)

  const [editTarget, setEditTarget] = useState<RosterStaff | null>(null)
  const [editPermissions, setEditPermissions] = useState<string[]>([])

  const [passwordTarget, setPasswordTarget] = useState<RosterStaff | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [moveTarget, setMoveTarget] = useState<RosterStaff | null>(null)
  const [moveOutletId, setMoveOutletId] = useState('')

  const [removeTarget, setRemoveTarget] = useState<RosterStaff | null>(null)

  const handleCreate = async () => {
    setIsSaving(true)
    const result = await createStaffAction(tenantId, tenantSlug, {
      ...addForm,
      // On a branch page the branch is not a question the owner should be asked
      // twice; the page they are standing on is the answer.
      outletId: scopeOutlet ? scopeOutlet.id : addForm.outletId,
    })
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${addForm.displayName} added`)
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

  const handleMove = async () => {
    if (!moveTarget) return
    setIsSaving(true)
    // '' is the "All branches" option; the action takes null for the whole store.
    const result = await updateStaffBranchAction(
      tenantId,
      tenantSlug,
      moveTarget.user_id,
      moveOutletId === '' ? null : moveOutletId
    )
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${displayNameOf(moveTarget)} moved to ${branchLabel(moveOutletId, outlets)}`)
    setMoveTarget(null)
    router.refresh()
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge data-testid={seatsTestId} variant="secondary" className="font-normal">
          {seatsLabel}
        </Badge>
        <Button size="sm" onClick={() => setIsAddOpen(true)} disabled={seatsRemaining <= 0}>
          <UserPlus className="mr-2 h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-3">
          {members.map((member) => (
            <li
              key={member.user_id}
              data-testid={`staff-row-${member.user_id}`}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{displayNameOf(member)}</p>
                <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {member.permissions == null ? (
                    <Badge variant="outline" className="text-xs">
                      Full access
                    </Badge>
                  ) : (
                    member.permissions.map((key) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {STAFF_PERMISSION_LABELS[key as StaffPermissionKey]?.label ?? key}
                      </Badge>
                    ))
                  )}
                  {showBranchLabel && (
                    <Badge variant="secondary" className="text-xs">
                      {branchLabel(member.outlet_id, outlets)}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditTarget(member)
                    setEditPermissions(member.permissions ?? [])
                  }}
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  Permissions
                </Button>
                {canMove && (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Move ${displayNameOf(member)}`}
                    onClick={() => {
                      setMoveTarget(member)
                      setMoveOutletId(member.outlet_id ?? '')
                    }}
                  >
                    <Shuffle className="mr-2 h-4 w-4" />
                    Move
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPasswordTarget(member)
                    setNewPassword('')
                  }}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Reset password
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(member)}>
                  <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {seatsRemaining <= 0 && (
        <p className="text-xs text-muted-foreground">
          Seat limit reached. Remove or move a member to add someone new.
        </p>
      )}

      {/* Add */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {scopeOutlet ? `Add someone to ${scopeOutlet.name}` : 'Add staff member'}
            </DialogTitle>
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
            {scopeOutlet === null && outlets.length > 0 && (
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
                  setAddForm({
                    ...addForm,
                    permissions: togglePermission(addForm.permissions, key),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? 'Adding…' : 'Add staff'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Permissions — {editTarget ? displayNameOf(editTarget) : ''}
            </DialogTitle>
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
              {isSaving ? 'Saving…' : 'Save permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move branch */}
      <Dialog open={moveTarget !== null} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Move {moveTarget ? displayNameOf(moveTarget) : ''}</DialogTitle>
            <DialogDescription>
              A branch account sees only that branch&apos;s orders and sales. All branches gives
              them the whole store.
            </DialogDescription>
          </DialogHeader>
          <BranchRadioGroup
            idPrefix="move-staff"
            outlets={outlets}
            value={moveOutletId}
            onChange={setMoveOutletId}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleMove} disabled={isSaving}>
              {isSaving ? 'Moving…' : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(open) => !open && setPasswordTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reset password — {passwordTarget ? displayNameOf(passwordTarget) : ''}
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
              {isSaving ? 'Saving…' : 'Set password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget ? displayNameOf(removeTarget) : ''}?
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
    </div>
  )
}
