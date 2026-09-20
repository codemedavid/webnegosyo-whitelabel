'use client'

import { useState } from 'react'
import { toast } from 'sonner'
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
import { createStaffAction } from '@/app/actions/staff'
import { selectableDefaultScreens, validateDefaultTab } from '@/lib/staff-default-screen'
import {
  BranchRadioGroup,
  DefaultScreenRadioGroup,
  PermissionCheckboxes,
  togglePermission,
  type StaffOutlet,
} from './staff-fields'

/**
 * One form for adding a colleague, wherever the owner happens to be standing.
 *
 * Extracted so Settings, a branch's Team tab and the Staff directory cannot
 * drift into asking different questions — the screen-pinning rule in
 * particular (a pinned screen must survive the permissions being edited in
 * the same submission) is easy to get subtly wrong twice.
 */

export interface AddStaffDialogProps {
  tenantId: string
  tenantSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every branch the store has, for the "Works at" choice. */
  outlets: readonly StaffOutlet[]
  /**
   * The branch being added to. Non-null suppresses the branch question: on a
   * branch's own page, the page they are standing on is the answer.
   */
  scopeOutlet: StaffOutlet | null
  onCreated: () => void
}

const EMPTY_FORM = {
  displayName: '',
  email: '',
  password: '',
  permissions: [] as string[],
  /** '' means the whole store; `resolveStaffOutletId` reads it as null. */
  outletId: '',
  /** '' means no preference — the app opens where it always has. */
  defaultTab: '',
}

export function AddStaffDialog({
  tenantId,
  tenantSlug,
  open,
  onOpenChange,
  outlets,
  scopeOutlet,
  onCreated,
}: AddStaffDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)

  const handleCreate = async () => {
    setIsSaving(true)
    const result = await createStaffAction(tenantId, tenantSlug, {
      ...form,
      outletId: scopeOutlet ? scopeOutlet.id : form.outletId,
      // '' is the "No preference" option; the service takes null for it.
      defaultTab: form.defaultTab === '' ? null : form.defaultTab,
    })
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${form.displayName} added`)
    setForm(EMPTY_FORM)
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="e.g. Maria Santos"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="staff@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">Password</Label>
            <Input
              id="staff-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 8 characters"
            />
          </div>
          {scopeOutlet === null && outlets.length > 0 && (
            <div className="space-y-2">
              <Label>Works at</Label>
              <BranchRadioGroup
                idPrefix="add-staff"
                outlets={outlets}
                value={form.outletId}
                onChange={(outletId) => setForm({ ...form, outletId })}
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
              selected={form.permissions}
              onToggle={(key) => {
                const permissions = togglePermission(form.permissions, key)
                setForm({
                  ...form,
                  permissions,
                  // Dropping a permission drops any screen it was the key to.
                  // Left alone, the form would submit a choice the service is
                  // about to reject, and the owner would never learn it did
                  // not stick.
                  defaultTab: validateDefaultTab(form.defaultTab, permissions) ?? '',
                })
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Opens on</Label>
            <DefaultScreenRadioGroup
              idPrefix="add-staff"
              options={selectableDefaultScreens({
                permissions: form.permissions,
                isBranchScoped: Boolean(scopeOutlet) || form.outletId !== '',
                branchCount: outlets.length,
              })}
              value={form.defaultTab}
              onChange={(defaultTab) => setForm({ ...form, defaultTab })}
            />
            <p className="text-xs text-muted-foreground">
              The screen this account sees first in the merchant app.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isSaving}>
            {isSaving ? 'Adding…' : 'Add staff'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
