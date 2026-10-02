'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/superadmin/ui/primitives'
import {
  DIALOG_CANCEL_BUTTON,
  DIALOG_FIELD,
  DIALOG_HINT,
  DIALOG_LABEL,
  DIALOG_PRIMARY_BUTTON,
} from '@/components/superadmin/ui/dialog-tokens'
import { PermissionMatrix, StoreFeaturePicker } from '@/components/superadmin/team/permission-matrix'
import { createTeamMemberAction, updateTeamMemberAction } from '@/app/actions/platform-staff'

export interface EditableMember {
  user_id: string
  email: string | null
  display_name: string | null
  platform_permissions: string[] | null
  permissions: string[] | null
}

interface MemberEditorProps {
  /** Null when adding a new member. */
  member: EditableMember | null
  onClose: () => void
  onSaved: () => void
}

export function MemberEditor({ member, onClose, onSaved }: MemberEditorProps) {
  const isNew = member === null
  const [name, setName] = useState(member?.display_name ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [grants, setGrants] = useState<string[]>(member?.platform_permissions ?? [])
  const [features, setFeatures] = useState<string[] | null>(member?.permissions ?? null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const hasStoreAccess = grants.includes('stores.view')

  const handleSave = () => {
    setError(null)
    const grantInput = { display_name: name, platform_permissions: grants, store_features: features }
    startTransition(async () => {
      const result = isNew
        ? await createTeamMemberAction({ ...grantInput, email, password })
        : await updateTeamMemberAction({ ...grantInput, user_id: member.user_id })

      if (!result.success) {
        setError(result.error)
        return
      }
      toast.success(isNew ? 'Team member added' : 'Access updated')
      onSaved()
    })
  }

  return (
    <Panel className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">
          {isNew ? 'Add a team member' : `Edit ${member.display_name || member.email || 'team member'}`}
        </h2>
        <p className="mt-1 text-sm text-white/55">
          Tick only what this person needs. Changes apply on their next page load.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className={DIALOG_LABEL}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={DIALOG_FIELD} />
        </label>
        {isNew ? (
          <>
            <label className="block text-sm">
              <span className={DIALOG_LABEL}>Email</span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={DIALOG_FIELD}
              />
            </label>
            <label className="block text-sm">
              <span className={DIALOG_LABEL}>Temporary password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={DIALOG_FIELD}
              />
            </label>
          </>
        ) : (
          <div className="text-sm sm:col-span-2">
            <span className={DIALOG_LABEL}>Email</span>
            <p className="mt-2 text-white/80">{member.email ?? '—'}</p>
          </div>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white/85">Console access</h3>
        <PermissionMatrix grants={grants} onChange={setGrants} disabled={isPending} />
        <p className={DIALOG_HINT}>
          Viewing restaurants or the dashboard includes their sales figures. Team management always stays with
          superadmins.
        </p>
      </section>

      {hasStoreAccess ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white/85">Inside store dashboards</h3>
          <p className="text-xs text-white/45">
            Which parts of a restaurant’s own admin they may open. Their View/Create/Edit/Delete ticks above still
            apply there.
          </p>
          <StoreFeaturePicker features={features} onChange={setFeatures} disabled={isPending} />
        </section>
      ) : null}

      {error ? <p className="rounded-lg border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isPending} className={DIALOG_CANCEL_BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={isPending} className={DIALOG_PRIMARY_BUTTON}>
          {isPending ? 'Saving…' : isNew ? 'Add member' : 'Save access'}
        </button>
      </div>
    </Panel>
  )
}
