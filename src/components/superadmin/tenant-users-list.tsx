'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, UserPlus } from 'lucide-react'
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Admin Users</CardTitle>
              <CardDescription>
                Manage administrators who can access {tenantName}
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No admin users assigned to this tenant</p>
              <p className="text-sm mt-2">Click &quot;Add User&quot; to create the first admin</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{user.email}</p>
                        <p className="text-sm text-muted-foreground">
                          Added {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{user.role}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setUserToDelete(user)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{userToDelete?.email}</strong> from {tenantName}?
              <br />
              <br />
              This will delete their account and they will lose access to the admin panel.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && handleDeleteUser(userToDelete)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
