'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
  removeStaffAction,
  resetStaffPasswordAction,
  updateStaffBranchAction,
  updateStaffDefaultScreenAction,
  updateStaffPermissionsAction,
} from '@/app/actions/staff'
import { selectableDefaultScreens } from '@/lib/staff-default-screen'
import type { StaffPermissionKey } from '@/lib/staff-permissions'
import {
  BranchRadioGroup,
  DefaultScreenRadioGroup,
  PermissionCheckboxes,
  togglePermission,
  type StaffOutlet,
} from './staff-fields'

/**
 * Everything that can be done TO this account, on the page about them.
 *
 * Inline sections rather than the roster's dialogs: on a profile there is
 * nothing to interrupt, and a dialog per field would make changing two things
 * a four-click errand. The rules are not restated here — every save goes
 * through the same server actions the roster uses, which re-check the caller's
 * branch and grant authority server-side. This component decides what to
 * offer, never what is allowed.
 */

export interface StaffAccessCardProps {
  tenantId: string
  tenantSlug: string
  userId: string
  name: string
  permissions: string[] | null
  outletId: string | null
  defaultTab: string | null
  outlets: readonly StaffOutlet[]
  /** Where to send the browser once the account no longer exists. */
  afterRemoveHref: string
}

const MIN_PASSWORD_LENGTH = 8

export function StaffAccessCard({
  tenantId,
  tenantSlug,
  userId,
  name,
  permissions,
  outletId,
  defaultTab,
  outlets,
  afterRemoveHref,
}: StaffAccessCardProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  const [draftPermissions, setDraftPermissions] = useState<string[]>(permissions ?? [])
  const [draftScreen, setDraftScreen] = useState(defaultTab ?? '')
  const [draftOutlet, setDraftOutlet] = useState(outletId ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [isRemoveOpen, setIsRemoveOpen] = useState(false)

  /** Every save is the same three steps; only the call differs. */
  const run = async (label: string, call: () => Promise<{ success: boolean; error?: string }>) => {
    setIsSaving(true)
    const result = await call()
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error ?? 'Something went wrong. Please try again.')
      return false
    }
    toast.success(label)
    router.refresh()
    return true
  }

  return (
    <div className="space-y-6" data-testid="staff-access-card">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Can access</h3>
          <p className="text-xs text-muted-foreground">
            Applies the next time they open the app or reload the admin.
          </p>
        </div>
        <PermissionCheckboxes
          idPrefix="profile-permissions"
          selected={draftPermissions}
          onToggle={(key: StaffPermissionKey) =>
            setDraftPermissions(togglePermission(draftPermissions, key))
          }
        />
        <Button
          size="sm"
          disabled={isSaving}
          onClick={() =>
            run('Permissions updated', () =>
              updateStaffPermissionsAction(tenantId, tenantSlug, userId, draftPermissions),
            )
          }
        >
          Save permissions
        </Button>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Opens on</h3>
          <p className="text-xs text-muted-foreground">
            The screen the merchant app shows this account first. Only screens their permissions
            already allow are offered.
          </p>
        </div>
        <DefaultScreenRadioGroup
          idPrefix="profile-screen"
          options={selectableDefaultScreens({
            permissions: draftPermissions,
            isBranchScoped: draftOutlet !== '',
            branchCount: outlets.length,
          })}
          value={draftScreen}
          onChange={setDraftScreen}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={isSaving}
          onClick={() =>
            run('Default screen updated', () =>
              updateStaffDefaultScreenAction(
                tenantId,
                tenantSlug,
                userId,
                draftScreen === '' ? null : draftScreen,
              ),
            )
          }
        >
          Save screen
        </Button>
      </section>

      {outlets.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Works at</h3>
              <p className="text-xs text-muted-foreground">
                A branch account sees only that branch&apos;s orders and sales.
              </p>
            </div>
            <BranchRadioGroup
              idPrefix="profile-branch"
              outlets={outlets}
              value={draftOutlet}
              onChange={setDraftOutlet}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={() =>
                run('Branch updated', () =>
                  updateStaffBranchAction(
                    tenantId,
                    tenantSlug,
                    userId,
                    draftOutlet === '' ? null : draftOutlet,
                  ),
                )
              }
            >
              Save branch
            </Button>
          </section>
        </>
      )}

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Password</h3>
          <p className="text-xs text-muted-foreground">
            Sets a new password immediately — tell them what it is.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-2">
            <Label htmlFor="profile-new-password">New password</Label>
            <Input
              id="profile-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isSaving || newPassword.length < MIN_PASSWORD_LENGTH}
            onClick={async () => {
              const ok = await run('Password updated', () =>
                resetStaffPasswordAction(tenantId, userId, newPassword),
              )
              if (ok) setNewPassword('')
            }}
          >
            Set password
          </Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-destructive">Remove access</h3>
          <p className="text-xs text-muted-foreground">
            Deletes the account. Their past orders and shifts stay on the record.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={isSaving} onClick={() => setIsRemoveOpen(true)}>
          Remove {name}
        </Button>
      </section>

      <AlertDialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account is deleted and they immediately lose access to the web admin, the
              merchant app, and the POS. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={async () => {
                setIsSaving(true)
                const result = await removeStaffAction(tenantId, tenantSlug, userId)
                setIsSaving(false)
                if (!result.success) {
                  toast.error(result.error)
                  return
                }
                toast.success('Staff member removed')
                router.push(afterRemoveHref)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
