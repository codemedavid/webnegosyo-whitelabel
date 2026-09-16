'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import type { LoyaltyWallet } from '@/lib/loyalty/wallet'

async function post(path: string, body: unknown) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`/api/loyalty/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok)
      throw new Error(data.error || 'Could not complete this request.')
    return data
  } finally {
    clearTimeout(timeout)
  }
}
const button =
  'rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50'
const input =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900'

export function LoyaltyWalletPage({
  tenantId,
  tenantSlug,
  storeName,
}: {
  tenantId: string
  tenantSlug: string
  storeName: string
}) {
  const [phone, setPhone] = useState('')
  const [wallet, setWallet] = useState<LoyaltyWallet | null>(null)
  const [selected, setSelected] = useState<
    LoyaltyWallet['rewards'][number] | null
  >(null)
  const [challenge, setChallenge] = useState<{
    id: string
    expires: number
    resend: number
  } | null>(null)
  const [claim, setClaim] = useState<{
    token: string
    expiresAt: string
  } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const generation = useRef(0)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const reset = () => {
    generation.current++
    setPhone('')
    setWallet(null)
    setSelected(null)
    setChallenge(null)
    setClaim(null)
    setCode('')
    setError(null)
  }
  const lookup = () =>
    run(async () => {
      const current = generation.current
      const result = await post('wallet', { tenantId, phone })
      if (current === generation.current) setWallet(result)
    })
  const requestCode = (reward: LoyaltyWallet['rewards'][number]) =>
    run(async () => {
      const current = generation.current
      const data = await post('claims/request', {
        tenantId,
        phone,
        entitlementId: reward.id,
      })
      if (current !== generation.current) return
      setSelected(reward)
      setCode('')
      setClaim(null)
      setChallenge({
        id: data.challengeId,
        expires: Date.now() + 300000,
        resend: Date.now() + 60000,
      })
    })
  const verify = () =>
    run(async () => {
      if (!challenge) return
      const current = generation.current
      // No automatic retries: a lost verification response may have committed.
      try {
        const data = await post('claims/verify', {
          tenantId,
          phone,
          challengeId: challenge.id,
          code,
        })
        if (current === generation.current) {
          setClaim(data)
          setCode('')
        }
      } catch (e) {
        throw new Error(
          `${e instanceof Error ? e.message : 'Verification could not be confirmed.'} If no QR appeared, request a new code when the resend timer ends.`,
        )
      }
    })
  const claimSeconds = claim
    ? Math.max(0, Math.ceil((Date.parse(claim.expiresAt) - now) / 1000))
    : 0
  const resendSeconds = challenge
    ? Math.max(0, Math.ceil((challenge.resend - now) / 1000))
    : 0
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-6 px-5 py-10">
      <Link href={`/${tenantSlug}/menu`} className="text-sm text-gray-600">
        ← {storeName}
      </Link>
      <header>
        <p className="text-sm font-medium text-gray-500">
          A little thank-you for coming back
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-950">Your rewards</h1>
        <p className="mt-3 text-gray-600">
          Use the mobile number on your orders. No account needed.
        </p>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {!wallet ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void lookup()
          }}
        >
          <label htmlFor="loyalty-phone" className="block text-sm font-medium">
            Mobile number
          </label>
          <input
            id="loyalty-phone"
            className={input}
            type="tel"
            autoComplete="tel"
            value={phone}
            maxLength={32}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="09XX XXX XXXX"
            required
            disabled={busy}
          />
          <button className={button} disabled={busy}>
            {busy ? 'Checking…' : 'Check my rewards'}
          </button>
          <p className="text-xs text-gray-500">
            This lookup shows loyalty progress and rewards only.
          </p>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="text-sm underline"
            disabled={busy}
            onClick={reset}
          >
            Use another number
          </button>
          {claim ? (
            <section
              className="space-y-4 rounded-2xl border p-6 text-center"
              aria-live="polite"
            >
              <h2 className="text-xl font-semibold">
                {claimSeconds > 0
                  ? 'Show this at the counter'
                  : 'Your claim QR has expired'}
              </h2>
              <p>{selected?.label}</p>
              {claimSeconds > 0 ? (
                <>
                  <div className="inline-block rounded-xl bg-white p-4">
                    <QRCodeSVG
                      value={claim.token}
                      size={220}
                      title="Single-use reward claim"
                    />
                  </div>
                  <p className="text-sm">
                    Valid for {claimSeconds} seconds. Ask the cashier to scan
                    before payment.
                  </p>
                  <p className="text-xs text-gray-500">
                    This QR claims one reward and can be used once.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  Request a new code to claim your reward.
                </p>
              )}
              {selected ? (
                <button
                  className={button}
                  disabled={busy || resendSeconds > 0}
                  onClick={() => void requestCode(selected)}
                >
                  Request new code
                </button>
              ) : null}
            </section>
          ) : challenge && selected ? (
            <section className="space-y-4 rounded-2xl border p-5">
              <h2 className="text-lg font-semibold">
                Verify to claim {selected.label}
              </h2>
              <p className="text-sm text-gray-600">
                If this reward is eligible, an SMS code will arrive on your
                phone. Codes expire after five minutes.
              </p>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void verify()
                }}
              >
                <label
                  htmlFor="loyalty-code"
                  className="block text-sm font-medium"
                >
                  SMS code
                </label>
                <input
                  id="loyalty-code"
                  className={input}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  maxLength={6}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ''))
                  }
                />
                <button
                  className={button}
                  disabled={
                    busy || code.length !== 6 || now >= challenge.expires
                  }
                >
                  {busy ? 'Verifying…' : 'Verify code'}
                </button>
              </form>
              {now >= challenge.expires ? (
                <p role="status">
                  The code has expired. Request a new one below.
                </p>
              ) : null}
              <button
                className="block text-sm underline disabled:opacity-50"
                disabled={busy || resendSeconds > 0}
                onClick={() => void requestCode(selected)}
              >
                {resendSeconds > 0
                  ? `Resend in ${resendSeconds}s`
                  : 'Resend code'}
              </button>
              <button
                className="text-sm underline"
                disabled={busy}
                onClick={() => {
                  setChallenge(null)
                  setSelected(null)
                  setCode('')
                }}
              >
                Choose another reward
              </button>
            </section>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Ready to claim</h2>
                {wallet.rewards.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    No rewards ready yet. Keep using the same number when you
                    order.
                  </p>
                ) : null}
                {wallet.rewards.map((reward) => (
                  <article
                    key={reward.id}
                    className="space-y-3 rounded-2xl border bg-white p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {reward.programName}
                    </p>
                    <h3 className="text-xl font-semibold">{reward.label}</h3>
                    <p className="text-sm text-gray-600">
                      {reward.branchName
                        ? `At ${reward.branchName}`
                        : 'At any branch'}
                      {reward.expiresAt
                        ? ` · Expires ${new Date(reward.expiresAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`
                        : ' · No expiry'}
                    </p>
                    {reward.freeItem ? (
                      <p className="text-xs text-gray-500">
                        One base item; upgrades and add-ons are payable. Subject
                        to item availability.
                      </p>
                    ) : null}
                    {wallet.claimsAvailable ? (
                      <button
                        className={button}
                        aria-label={`Claim ${reward.label}`}
                        disabled={busy}
                        onClick={() => void requestCode(reward)}
                      >
                        Claim reward
                      </button>
                    ) : (
                      <p className="text-sm text-gray-600">
                        Your reward is saved. Claiming is not available at this
                        store yet.
                      </p>
                    )}
                  </article>
                ))}
              </section>
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Your progress</h2>
                {wallet.programs.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    There are no active programs to show.
                  </p>
                ) : null}
                {wallet.programs.map((program) => (
                  <article
                    key={program.id}
                    className="space-y-3 rounded-2xl border p-5"
                  >
                    <h3 className="font-semibold">{program.name}</h3>
                    <p className="text-sm">
                      {program.balance} / {program.threshold}{' '}
                      {program.earnMode === 'stamp' ? 'stamps' : 'points'}{' '}
                      toward {program.rewardLabel}
                    </p>
                    <progress
                      className="h-2 w-full accent-gray-900"
                      aria-label={`${program.name} progress`}
                      value={Math.max(0, program.balance)}
                      max={program.threshold}
                    />
                    <p className="text-xs text-gray-500">
                      {program.branchName || 'All branches'}
                      {program.minSpend
                        ? ` · Orders of ₱${program.minSpend} or more`
                        : ''}
                      {program.status === 'paused' ? ' · Earning paused' : ''}
                    </p>
                  </article>
                ))}
              </section>
              <button
                className="text-sm underline"
                disabled={busy}
                onClick={() => void lookup()}
              >
                Refresh rewards
              </button>
            </>
          )}
        </>
      )}
    </main>
  )
}
