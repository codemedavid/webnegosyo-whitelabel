import { create } from 'zustand'

export interface MemberProfile {
  name: string | null
  phoneE164: string
}

interface SessionState {
  status: 'guest' | 'member'
  profile: MemberProfile | null
  /** Prototype stand-in for OTP verify; Phase 3 stores the server session token. */
  signIn: (profile: MemberProfile) => void
  /** Prototype: the name step and Account edits. Phase 3 PATCHes /me. */
  setName: (name: string | null) => void
  signOut: () => void
}

export const useSession = create<SessionState>((set) => ({
  status: 'guest',
  profile: null,
  signIn: (profile) => set({ status: 'member', profile }),
  setName: (name) =>
    set((state) => (state.profile ? { profile: { ...state.profile, name: name?.trim() ? name.trim() : null } } : state)),
  signOut: () => set({ status: 'guest', profile: null }),
}))

/** "Angelo" from "Angelo David"; null when the member never gave a name. */
export function firstName(profile: MemberProfile | null): string | null {
  const first = profile?.name?.trim().split(/\s+/)[0]
  return first ? first : null
}
