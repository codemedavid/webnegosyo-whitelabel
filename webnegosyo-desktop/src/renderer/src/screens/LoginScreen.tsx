import { useState } from 'react'
import { useAuthStore } from '../stores/auth-store'

export function LoginScreen(): React.JSX.Element {
  const { login, error } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!email || !password || submitting) return
    setSubmitting(true)
    await login(email, password)
    setSubmitting(false)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={(e) => void handleSubmit(e)}>
        <h1>WebNegosyo POS</h1>
        <p className="tag">Sign in with your merchant admin account</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@store.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn primary" type="submit" disabled={submitting || !email || !password}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
