import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AppTheme } from '@/lib/contract'
import { buildTokens, type Tokens } from '@/lib/theme/tokens'

const TokensContext = createContext<Tokens | null>(null)

export function ThemeProvider({ theme, children }: { theme: AppTheme; children: ReactNode }) {
  const tokens = useMemo(() => buildTokens(theme), [theme])
  return <TokensContext.Provider value={tokens}>{children}</TokensContext.Provider>
}

export function useTokens(): Tokens {
  const tokens = useContext(TokensContext)
  if (!tokens) throw new Error('useTokens must be used inside <ThemeProvider>')
  return tokens
}
