import { supabase } from './supabase'

/** A stalled token refresh must not leave Convex authentication pending forever. */
export async function fetchConvexToken(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 5000)
  })
  try {
    const token = supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null)
    return await Promise.race([token, expiry])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
