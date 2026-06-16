'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, UserPlus, Users, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { removeTenantUser, type TenantUser } from '@/actions/users'
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
import { AddTenantUserDialog } from '@/components/superadmin/add-tenant-user-dialog'
import { Panel, SectionHeader, EmptyState } from '@/components/superadmin/ui/primitives'

interface TenantUsersListProps {
  tenantId: string
  tenantName: string
  users: TenantUser[]
}

export function TenantUsersList({ tenantId, tenantName, users: initialUsers }: TenantUsersListProps) {
  const [users, setUsers] = useState<TenantUser[]>(initialUsers)
  const [isDeleting, setIsDeleting] = useState(false)
  const [userToDelete, setUserToDelete] = useState<TenantUser | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  const handleDeleteUser = async (user: TenantUser) => {
    setIsDeleting(true)

    // Optimistic: remove from list immediately
    setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id))
    setUserToDelete(null)

    const result = await removeTenantUser(user.user_id, tenantId)

    if (result.error) {
      // Rollback on error
      setUsers((prev) => [...prev, user])
      toast.error(result.error)
    } else {
      toast.success('User removed successfully')
    }
    setIsDeleting(false)
  }

  const handleUserCreated = (newUser: { user_id: string; email: string }) => {
    // Optimistic: add to list immediately
    setUsers((prev) => [
      {
        user_id: newUser.user_id,
        email: newUser.email,
        role: 'admin',
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  return (
    <>
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-white/[0.06] p-6">
          <SectionHeader
            icon={Users}
            title={
              <span className="flex items-center gap-2.5">
                Admin Users
                <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-white/55">
                  {users.length}
                </span>
              </span>
            }
            subtitle={`Administrators who can access ${tenantName}`}
            action={
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                className="rounded-xl bg-white text-black hover:bg-white/90"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            }
          />
        </div>

        <div className="p-6">
          {users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No admin users yet"
              description={`Add the first administrator for ${tenantName}.`}
              action={
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  variant="outline"
                  className="rounded-xl border-white/15 bg-transparent text-white hover:bg-white/10"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-semibold text-white">
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{user.email}</p>
                      <p className="text-xs text-white/45">
                        Added{' '}
                        {new Date(user.created_at).toLocaleDateString('en-US', {
                          timeZone: 'Asia/Manila',
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    <span className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-0.5 text-xs font-medium capitalize text-sky-400">
                      {user.role}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setUserToDelete(user)}
                      disabled={isDeleting}
                      aria-label={`Remove ${user.email}`}
                      className="h-9 w-9 rounded-xl text-white/40 hover:bg-red-400/10 hover:text-red-400 focus-visible:ring-red-400/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-white/10 bg-[#0a0a0a]">
          <AlertDialogHeader>
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10">
              <ShieldAlert className="h-5 w-5 text-red-400" />
            </div>
            <AlertDialogTitle className="text-white">Remove User Access</AlertDialogTitle>
            <AlertDialogDescription className="text-white/55">
              You&apos;re about to remove{' '}
              <span className="font-medium text-white/80">{userToDelete?.email}</span> from {tenantName}.
              This deletes their account and revokes admin-panel access.
              <span className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs font-medium text-red-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className="rounded-xl border-white/15 bg-transparent text-white hover:bg-white/10"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && handleDeleteUser(userToDelete)}
              disabled={isDeleting}
              className="rounded-xl border border-red-400/20 bg-red-400/10 text-red-400 hover:bg-red-400/20"
            >
              {isDeleting ? 'Removing...' : 'Remove User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add User Dialog */}
      <AddTenantUserDialog
        tenantId={tenantId}
        tenantName={tenantName}
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onUserCreated={handleUserCreated}
      />
    </>
  )
}
