'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import type { LoyaltyWallet } from '@/lib/loyalty/wallet'
import Image from 'next/image'
import { StampTrack } from '@/components/customer/order-tracking/stamp-track'
import { RewardLadder } from '@/components/customer/order-tracking/reward-ladder'
import { RewardBurst } from '@/components/customer/order-tracking/reward-burst'
import { cardSteps } from '@/lib/loyalty/card-progress'
import { forgetWalletSession, readStoredWalletSession, storeWalletSession } from '@/lib/loyalty/wallet-session-storage'
import { WalletVerifyStep } from '@/components/customer/loyalty-wallet-verify'

type RequestError = Error & { reason?: string; retryAfterSeconds?: number }

/** The server's machine-readable reason (e.g. `verification_required`), if any. */
function reasonOf(error: unknown): string | undefined {
  return error instanceof Error ? (error as RequestError).reason : undefined
}

/** Seconds the server asked us to wait before sending another code, if any. */
function retryAfterOf(error: unknown): number | undefined {
  const seconds = error instanceof Error ? (error as RequestError).retryAfterSeconds : undefined
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

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
      throw Object.assign(new Error(data.error || 'Could not complete this request.'), {
        reason: typeof data.reason === 'string' ? data.reason : undefined,
        retryAfterSeconds: typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
      })
    return data
  } finally {
    clearTimeout(timeout)
  }
}
const button =
  'rounded-xl bg-[var(--brand-button-primary,var(--primary))] px-5 py-3 text-sm font-semibold text-[var(--brand-button-primary-text,var(--primary-foreground))] disabled:opacity-50'
const input =
  'w-full rounded-xl border border-[var(--brand-border,var(--border))] bg-[var(--brand-cards,var(--card))] px-4 py-3 text-base text-[var(--brand-text-primary,var(--foreground))]'

type LoyaltyWalletPageProps = { tenantId: string; tenantSlug: string; storeName: string; logoUrl?: string | null }

export function LoyaltyWalletPage(props: LoyaltyWalletPageProps) {
  return <WalletSession key={props.tenantId} {...props} />
}

function WalletSession({
  tenantId,
  tenantSlug,
  storeName,
  logoUrl,
}: {
  tenantId: string
  tenantSlug: string
  storeName: string
  logoUrl?: string | null
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
  // Verify-first stores: the session a correct SMS code bought, and the
  // in-progress check before it. Rewards stay hidden until the session exists.
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [walletChallenge, setWalletChallenge] = useState<{
    id: string
    expires: number
    resend: number
  } | null>(null)
  const [walletCode, setWalletCode] = useState('')
  const pendingRestore = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const generation = useRef(0)
  const running = useRef(false)
  const invalidateSession = useCallback(() => { generation.current++ }, [])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      invalidateSession()
      clearInterval(timer)
    }
  }, [invalidateSession])
  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return
    const current = generation.current
    running.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      if (current === generation.current) {
        running.current = false
        setBusy(false)
      }
    }
  }, [])
  const reset = () => {
    generation.current++
    running.current = false
    forgetWalletSession(tenantId)
    setSessionToken(null)
    setIsVerifying(false)
    setWalletChallenge(null)
    setWalletCode('')
    setBusy(false)
    setPhone('')
    setWallet(null)
    setSelected(null)
    setChallenge(null)
    setClaim(null)
    setCode('')
    setError(null)
  }
  const fetchWallet = useCallback(
    (token: string | null) => post('wallet', { tenantId, phone, ...(token ? { sessionToken: token } : {}) }),
    [phone, tenantId],
  )
  const sendWalletCode = useCallback(async (current: number) => {
    const data = await post('wallet/code', { tenantId, phone })
    if (current !== generation.current) return
    setWalletCode('')
    setWalletChallenge({ id: data.challengeId, expires: Date.now() + 300000, resend: Date.now() + 60000 })
  }, [phone, tenantId])
  // `initiated` = the customer pressed a button. Only then is a code texted
  // automatically; a background refresh that finds the session gone just
  // shows the verify step and waits.
  const lookup = useCallback((initiated = false) =>
    run(async () => {
      const current = generation.current
      try {
        const result = await fetchWallet(sessionToken)
        if (current === generation.current) setWallet(result)
      } catch (e) {
        if (reasonOf(e) !== 'verification_required') throw e
        if (current !== generation.current) return
        forgetWalletSession(tenantId)
        setSessionToken(null)
        setWallet(null)
        setSelected(null)
        setChallenge(null)
        setClaim(null)
        setIsVerifying(true)
        if (initiated) await sendWalletCode(current)
      }
    }), [fetchWallet, sessionToken, sendWalletCode, tenantId, run])
  const requestWalletCode = () =>
    run(async () => {
      const current = generation.current
      try {
        await sendWalletCode(current)
      } catch (e) {
        // Rate limited: keep the code already sent usable, and hold the resend
        // button for as long as the server will refuse a new one.
        const retryAfter = reasonOf(e) === 'rate_limited' ? retryAfterOf(e) : undefined
        if (retryAfter && current === generation.current) {
          setWalletChallenge(previous => previous && { ...previous, resend: Date.now() + retryAfter * 1000 })
        }
        // The store switched verification off in the meantime: just show it.
        if (reasonOf(e) !== 'not_required') throw e
        const result = await fetchWallet(null)
        if (current !== generation.current) return
        setIsVerifying(false)
        setWallet(result)
      }
    })
  const verifyWalletCode = () =>
    run(async () => {
      if (!walletChallenge) return
      const current = generation.current
      const data = await post('wallet/verify', { tenantId, phone, challengeId: walletChallenge.id, code: walletCode })
      if (current !== generation.current) return
      storeWalletSession(tenantId, { phone, token: data.sessionToken, expiresAt: data.expiresAt })
      setSessionToken(data.sessionToken)
      const result = await fetchWallet(data.sessionToken)
      if (current !== generation.current) return
      setIsVerifying(false)
      setWalletChallenge(null)
      setWalletCode('')
      setWallet(result)
    })
  // A reload inside the session's 30 minutes goes straight back to the rewards.
  useEffect(() => {
    const stored = readStoredWalletSession(tenantId, Date.now())
    if (!stored) return
    pendingRestore.current = true
    setPhone(stored.phone)
    setSessionToken(stored.token)
  }, [tenantId])
  useEffect(() => {
    if (!pendingRestore.current || !sessionToken || !phone) return
    pendingRestore.current = false
    void lookup()
  }, [sessionToken, phone, lookup])
  useEffect(() => {
    if (!wallet) return
    const refresh = () => { void lookup() }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [wallet, lookup])
  useEffect(() => {
    if (!claim) return
    let checks = 0
    // Six checks over three minutes fit within the public wallet quotas. Stop
    // once the QR expires; focus/reconnect and manual refresh remain available.
    const timer = setInterval(() => {
      if (++checks > 6 || Date.now() >= Date.parse(claim.expiresAt)) {
        clearInterval(timer)
        return
      }
      if (document.visibilityState === 'visible') void lookup()
    }, 30000)
    return () => clearInterval(timer)
  }, [claim, lookup])
  useEffect(() => {
    if (wallet && selected && !wallet.rewards.some(reward => reward.id === selected.id)) {
      setSelected(null)
      setChallenge(null)
      setClaim(null)
      setCode('')
    }
  }, [wallet, selected])
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
    <main className="mx-auto min-h-screen max-w-lg space-y-6 px-5 py-10 text-[var(--brand-text-primary,var(--foreground))]">
      <Link href={`/${tenantSlug}/menu`} className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
        ← {storeName}
      </Link>
      <header>
        <p className="text-sm font-medium text-[var(--brand-text-muted,var(--muted-foreground))]">
          A little thank-you for coming back
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--brand-text-primary,var(--foreground))]">Your rewards</h1>
        <p className="mt-3 text-[var(--brand-text-secondary,var(--muted-foreground))]">
          {wallet
            ? 'Your next visit brings another reward closer.'
            : isVerifying
              ? 'We text a code first so only you can see your rewards.'
              : 'Use the mobile number on your orders. No account needed.'}
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
      {!wallet && isVerifying ? (
        <WalletVerifyStep
          phone={phone}
          challenge={walletChallenge}
          code={walletCode}
          now={now}
          busy={busy}
          onCodeChange={setWalletCode}
          onSendCode={() => void requestWalletCode()}
          onVerify={() => void verifyWalletCode()}
          onChangeNumber={reset}
        />
      ) : !wallet ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void lookup(true)
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
          <p className="text-xs text-[var(--brand-text-muted,var(--muted-foreground))]">
            This lookup shows loyalty progress and rewards only.
          </p>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="text-sm underline"
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
                  : 'Your reward QR has expired'}
              </h2>
              <p>{selected?.label}</p>
              {claimSeconds > 0 ? (
                <>
                  <div className="inline-block rounded-xl bg-white p-4">
                    <QRCodeSVG
                      value={claim.token}
                      size={220}
                      title="Single-use reward QR"
                    />
                  </div>
                  <p className="text-sm">
                    Valid for {claimSeconds} seconds. Ask the cashier to scan
                    before payment.
                  </p>
                  <p className="text-xs text-[var(--brand-text-muted,var(--muted-foreground))]">
                    Your reward is used only when the cashier applies it to your order. This QR can be used once.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
                  If your reward is still available, request a new code to get another QR.
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
                Verify to use {selected.label}
              </h2>
              <p className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
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
                <h2 className="text-xl font-semibold">Ready to use</h2>
                {wallet.rewards.length === 0 ? (
                  <p className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
                    No rewards ready yet. Keep using the same number when you
                    order.
                  </p>
                ) : null}
                {wallet.rewards.map((reward, index) => (
                  <article
                    key={reward.id}
                    className="relative space-y-3 rounded-2xl border border-[var(--brand-cards-border,var(--border))] bg-[var(--brand-cards,var(--card))] p-5"
                  >
                    {index === 0 && <RewardBurst emoji={reward.emoji} />}
                    <div className="flex items-center gap-4">
                      <RewardTile emoji={reward.emoji ?? '🎁'} imageUrl={reward.imageUrl ?? null} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted,var(--muted-foreground))]">
                          {reward.programName}
                        </p>
                        <h3 className="text-xl font-semibold">{reward.label}</h3>
                      </div>
                    </div>
                    <p className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
                      {reward.branchName
                        ? `At ${reward.branchName}`
                        : 'At any branch'}
                      {reward.expiresAt
                        ? ` · Expires ${new Date(reward.expiresAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`
                        : ' · No expiry'}
                    </p>
                    {reward.freeItem ? (
                      <p className="text-xs text-[var(--brand-text-muted,var(--muted-foreground))]">
                        One base item; upgrades and add-ons are payable. Subject
                        to item availability.
                      </p>
                    ) : null}
                    {wallet.claimsAvailable ? (
                      <button
                        className={button}
                        aria-label={`Get QR for ${reward.label}`}
                        disabled={busy}
                        onClick={() => void requestCode(reward)}
                      >
                        Get reward QR
                      </button>
                    ) : (
                      <p className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
                        Your reward is saved. Reward QR codes are not available at this
                        store yet.
                      </p>
                    )}
                  </article>
                ))}
              </section>
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Your next reward</h2>
                <p className="text-sm text-[var(--brand-text-muted,var(--muted-foreground))]">Keep collecting while your reward is ready. Using it keeps your next-card progress.</p>
                {wallet.programs.length === 0 ? (
                  <p className="text-sm text-[var(--brand-text-secondary,var(--muted-foreground))]">
                    There are no active programs to show.
                  </p>
                ) : null}
                {wallet.programs.map((program) => (
                  <article
                    key={program.id}
                    className="space-y-3 rounded-2xl border border-[var(--brand-cards-border,var(--border))] bg-[var(--brand-cards,var(--card))] p-5"
                  >
                    <h3 className="font-semibold">{program.name}</h3>
                    <p className="text-sm">
                      {program.balance} / {program.threshold}{' '}
                      {program.earnMode === 'stamp' ? 'stamps' : 'points'}{' '}
                      toward {program.rewardLabel}
                    </p>
                    {program.balance < 0 && <p className="text-xs text-[var(--brand-text-muted,var(--muted-foreground))]">Your balance includes an adjustment. New earnings first cover the {Math.abs(program.balance)} {program.earnMode === 'stamp' ? 'stamps' : 'points'} adjustment.</p>}
                    <StampTrack threshold={program.threshold} filled={Math.max(0, program.balance)} earnMode={program.earnMode} nextIsLive={program.status === 'active'} logoUrl={logoUrl} steps={cardSteps(program.rewardSteps, program.threshold, program.rewardLabel)} />
                    <RewardLadder steps={cardSteps(program.rewardSteps, program.threshold, program.rewardLabel)} balance={program.balance} earnMode={program.earnMode} showHeadline={program.status === 'active'} />
                    <p className="text-xs text-[var(--brand-text-muted,var(--muted-foreground))]">
                      {program.branchName || 'All branches'}
                      {program.minSpend
                        ? ` · Orders of ₱${program.minSpend} or more`
                        : ''}
                      {program.status === 'paused' ? ' · Earning paused' : program.status === 'ended' ? ' · Program ended' : ''}
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

/** A ready reward's face: the menu photo of the free item, or its emoji. */
function RewardTile({ emoji, imageUrl }: { emoji: string; imageUrl: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-3xl"
      style={{ backgroundColor: 'var(--trk-accent-soft)', boxShadow: '0 0 0 3px var(--trk-accent-tint)' }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={56} height={56} unoptimized className="h-full w-full object-cover" />
      ) : (
        emoji
      )}
    </span>
  )
}
