import { create } from 'zustand'

export interface MemberProfile {
  name: string | null
  phoneE164: string
}

interface SessionState {
  /** `restoring` while a saved session is being checked at launch. */
  status: 'restoring' | 'guest' | 'member'
  profile: MemberProfile | null
  /** The opaque `cs1.…` session for this store's API; null for guests. */
  token: string | null
  setMember: (token: string, profile: MemberProfile) => void
  setProfile: (profile: MemberProfile) => void
  setGuest: () => void
}

/** Plain state only — sign-in, sign-out and account changes go through `lib/auth/account-actions`. */
export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  profile: null,
  token: null,
  setMember: (token, profile) => set({ status: 'member', token, profile }),
  setProfile: (profile) => set((state) => (state.status === 'member' ? { profile } : state)),
  setGuest: () => set({ status: 'guest', token: null, profile: null }),
}))

/** "Angelo" from "Angelo David"; null when the member never gave a name. */
export function firstName(profile: MemberProfile | null): string | null {
  const first = profile?.name?.trim().split(/\s+/)[0]
  return first ? first : null
}
