'use client'

/**
 * "Text me a code first" — shown on the rewards page of a store that turned
 * verification on, before any stamp card or reward is visible.
 *
 * Presentation only: the page owns the requests, timers and session.
 */

const button =
  'rounded-xl bg-[var(--brand-button-primary,var(--primary))] px-5 py-3 text-sm font-semibold text-[var(--brand-button-primary-text,var(--primary-foreground))] disabled:opacity-50'
const input =
  'w-full rounded-xl border border-[var(--brand-border,var(--border))] bg-[var(--brand-cards,var(--card))] px-4 py-3 text-base text-[var(--brand-text-primary,var(--foreground))]'
const muted = 'text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]'

export interface WalletVerifyStepProps {
  phone: string
  /** null until a code has been requested for this number. */
  challenge: { expires: number; resend: number } | null
  code: string
  now: number
  busy: boolean
  onCodeChange: (code: string) => void
  onSendCode: () => void
  onVerify: () => void
  onChangeNumber: () => void
}

export function WalletVerifyStep({
  phone,
  challenge,
  code,
  now,
  busy,
  onCodeChange,
  onSendCode,
  onVerify,
  onChangeNumber,
}: WalletVerifyStepProps) {
  const resendSeconds = challenge ? Math.max(0, Math.ceil((challenge.resend - now) / 1000)) : 0
  const isExpired = challenge !== null && now >= challenge.expires
  return (
    <section className="space-y-4 rounded-2xl border border-[var(--brand-cards-border,var(--border))] bg-[var(--brand-cards,var(--card))] p-5">
      <h2 className="text-lg font-semibold">Verify it&apos;s you</h2>
      {challenge ? (
        <p className={muted}>
          If {phone} has rewards here, a 6-digit code is on its way by SMS. Codes expire after five minutes.
          Only numbers that have collected stamps at this store get a text.
        </p>
      ) : (
        <p className={muted}>
          This store keeps rewards private. We&apos;ll text a code to {phone} before showing them.
        </p>
      )}
      {challenge ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            onVerify()
          }}
        >
          <label htmlFor="loyalty-wallet-code" className="block text-sm font-medium">
            SMS code
          </label>
          <input
            id="loyalty-wallet-code"
            className={input}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            maxLength={6}
            onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ''))}
            disabled={busy}
          />
          <button className={button} disabled={busy || code.length !== 6 || isExpired}>
            {busy ? 'Checking…' : 'Show my rewards'}
          </button>
        </form>
      ) : (
        <button type="button" className={button} disabled={busy} onClick={onSendCode}>
          {busy ? 'Sending…' : 'Text me a code'}
        </button>
      )}
      {isExpired ? <p role="status">The code has expired. Send a new one below.</p> : null}
      {challenge ? (
        <button
          type="button"
          className="block text-sm underline disabled:opacity-50"
          disabled={busy || resendSeconds > 0}
          onClick={onSendCode}
        >
          {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
        </button>
      ) : null}
      <button type="button" className="text-sm underline" disabled={busy} onClick={onChangeNumber}>
        Use another number
      </button>
    </section>
  )
}
