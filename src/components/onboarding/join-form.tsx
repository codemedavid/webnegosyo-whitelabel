'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { redeemSignupLinkAction } from '@/app/actions/signup-link'
import { ErrorNote, Field, INPUT_CLASS, OB, PrimaryButton, StepHeading } from './onboarding-ui'

interface JoinFields {
  name: string
  business_name: string
  email: string
  phone: string
}

const EMPTY: JoinFields = { name: '', business_name: '', email: '', phone: '' }

const FIELDS: ReadonlyArray<{ key: keyof JoinFields; label: string; hint?: string; type: string; autoComplete: string; placeholder: string }> = [
  { key: 'business_name', label: 'Business name', type: 'text', autoComplete: 'organization', placeholder: "Juan's Kitchen" },
  { key: 'name', label: 'Your name', type: 'text', autoComplete: 'name', placeholder: 'Juan dela Cruz' },
  { key: 'email', label: 'Email', hint: 'This becomes your login.', type: 'email', autoComplete: 'email', placeholder: 'juan@example.com' },
  { key: 'phone', label: 'Mobile number', type: 'tel', autoComplete: 'tel', placeholder: '0917 123 4567' },
]

/** One screen in front of the set-up wizard: who you are, then straight in. */
export function JoinForm({ code }: { code: string }) {
  const [form, setForm] = useState<JoinFields>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const result = await redeemSignupLinkAction(code, form)
      if (result.error !== null) {
        setError(result.error)
        setIsSaving(false)
        return
      }
      // Full navigation: the wizard page is rendered per request on the server.
      window.location.assign(result.path)
    } catch (submitError) {
      console.error('[signup-link] submit failed', submitError)
      setError('Something went wrong. Check your connection and try again.')
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-8 px-5 pb-16 pt-8 sm:pt-16">
      <StepHeading title="Let's set up your store" lede="Tell us who you are. Next, you'll build your menu and store in about 5 minutes." />
      <div className="space-y-6">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint}>
            <input
              type={field.type}
              required
              autoComplete={field.autoComplete}
              placeholder={field.placeholder}
              className={INPUT_CLASS}
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
            />
          </Field>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <PrimaryButton type="submit" isDisabled={isSaving} isFull>
        {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Start setting up
      </PrimaryButton>
      <p className="text-center text-[13px] leading-relaxed" style={{ color: OB.muted }}>This link works once and is just for you.</p>
    </form>
  )
}
