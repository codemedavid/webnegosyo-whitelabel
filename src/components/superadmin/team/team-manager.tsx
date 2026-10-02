'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Panel } from '@/components/superadmin/ui/primitives'
import { DIALOG_FIELD, DIALOG_PRIMARY_BUTTON } from '@/components/superadmin/ui/dialog-tokens'
import { MemberEditor, type EditableMember } from '@/components/superadmin/team/member-editor'
import { removeTeamMemberAction, resetTeamMemberPasswordAction } from '@/app/actions/platform-staff'
import {
  PLATFORM_SECTIONS,
  PLATFORM_SECTION_KEYS,
  platformPermission,
  type PlatformAction,
} from '@/lib/platform-staff/permissions'

export interface TeamListMember extends EditableMember {
  role: 'superadmin' | 'platform_staff'
}

interface TeamManagerProps {
  members: TeamListMember[]
  currentUserId: string
}

type EditorState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; member: TeamListMember }

export function TeamManager({ members, currentUserId }: TeamManagerProps) {
  const router = useRouter()
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })

  const handleSaved = () => {
    setEditor({ mode: 'closed' })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {editor.mode === 'closed' ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => setEditor({ mode: 'new' })} className={DIALOG_PRIMARY_BUTTON}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add team member
            </span>
          </button>
        </div>
      ) : (
        <MemberEditor
          key={editor.mode === 'edit' ? editor.member.user_id : 'new'}
          member={editor.mode === 'edit' ? editor.member : null}
          onClose={() => setEditor({ mode: 'closed' })}
          onSaved={handleSaved}
        />
      )}

      <Panel padding="p-0">
        <div className="divide-y divide-white/5">
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              isSelf={member.user_id === currentUserId}
              onEdit={() => setEditor({ mode: 'edit', member })}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      </Panel>
    </div>
  )
}

interface MemberRowProps {
  member: TeamListMember
  isSelf: boolean
  onEdit: () => void
  onChanged: () => void
}

function MemberRow({ member, isSelf, onEdit, onChanged }: MemberRowProps) {
  const isStaff = member.role === 'platform_staff'
  const Icon = isStaff ? UserCog : ShieldCheck

  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-white/50" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-white">
            {member.display_name || member.email || 'Unnamed'}
          </span>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">
            {isStaff ? 'Limited access' : 'Superadmin · full access'}
          </span>
          {isSelf ? <span className="text-[11px] text-white/40">(you)</span> : null}
        </div>
        {member.display_name && member.email ? <p className="mt-0.5 text-xs text-white/45">{member.email}</p> : null}
        {isStaff ? <GrantSummary grants={member.platform_permissions ?? []} /> : null}
      </div>
      {isStaff ? (
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit} className={ICON_BUTTON} aria-label="Edit access" title="Edit access">
            <Pencil className="h-4 w-4" />
          </button>
          <ResetPasswordButton member={member} />
          <RemoveButton member={member} onRemoved={onChanged} />
        </div>
      ) : null}
    </div>
  )
}

const VERB_ORDER: readonly PlatformAction[] = ['create', 'edit', 'delete']

/** "Restaurants: view, edit" per granted section. */
function GrantSummary({ grants }: { grants: string[] }) {
  const lines = PLATFORM_SECTION_KEYS.filter((section) => grants.includes(platformPermission(section, 'view'))).map(
    (section) => {
      const verbs = VERB_ORDER.filter((action) => grants.includes(platformPermission(section, action)))
      return { section, text: verbs.length > 0 ? `view, ${verbs.join(', ')}` : 'view only' }
    }
  )

  if (lines.length === 0) {
    return <p className="mt-2 text-xs text-amber-300/80">No access yet — they can only change their password.</p>
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {lines.map(({ section, text }) => (
        <li key={section} className="rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-white/65">
          <span className="text-white/85">{PLATFORM_SECTIONS[section].label}:</span> {text}
        </li>
      ))}
    </ul>
  )
}

function ResetPasswordButton({ member }: { member: TeamListMember }) {
  const [isOpen, setIsOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleReset = () =>
    startTransition(async () => {
      const result = await resetTeamMemberPasswordAction({ user_id: member.user_id, password })
      if (!result.success) {
        toast.error(result.error ?? 'Could not reset the password')
        return
      }
      toast.success('Password changed — share it with them securely')
      setPassword('')
      setIsOpen(false)
    })

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <button type="button" className={ICON_BUTTON} aria-label="Reset password" title="Reset password">
          <KeyRound className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Set a new password</AlertDialogTitle>
          <AlertDialogDescription>
            For {member.email ?? 'this team member'}. At least 8 characters.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={DIALOG_FIELD}
          aria-label="New password"
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || password.length < 8}
            onClick={(event) => {
              event.preventDefault()
              handleReset()
            }}
          >
            {isPending ? 'Saving…' : 'Set password'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RemoveButton({ member, onRemoved }: { member: TeamListMember; onRemoved: () => void }) {
  const [isPending, startTransition] = useTransition()

  const handleRemove = () =>
    startTransition(async () => {
      const result = await removeTeamMemberAction(member.user_id)
      if (!result.success) {
        toast.error(result.error ?? 'Could not remove this team member')
        return
      }
      toast.success('Team member removed')
      onRemoved()
    })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className={`${ICON_BUTTON} hover:text-red-400`}
          aria-label="Remove team member"
          title="Remove team member"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member.display_name || member.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their login is deleted and they lose access immediately. This cannot be undone — add them again to
            restore access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRemove} className="bg-red-500 text-white hover:bg-red-600">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const ICON_BUTTON =
  'rounded-lg p-2 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50'
