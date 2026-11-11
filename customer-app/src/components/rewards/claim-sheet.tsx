import { CircleCheck } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, useWindowDimensions, View } from 'react-native'
import { SheetModal } from '@/components/account/sheet-modal'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { QrCode } from '@/components/ui/qr-code'
import type { AppReward } from '@/lib/contract'
import { useClaimReward, useLoyalty } from '@/lib/data/hooks'
import { CLAIM_POLL_MS, SCANNED_CLOSE_MS, claimCountdown, claimDeadline, claimPhase, isRewardRedeemed } from '@/lib/rewards/claim'
import { useTokens } from '@/theme/theme-context'
import { useMaxBrightness } from './use-max-brightness'

const QR_MAX = 240
const SHEET_INSET = 112
/** Scanners need dark-on-light; this plate stays black on white whatever the brand. */
const QR_INK = '#000000'
const QR_PLATE = '#FFFFFF'
const TICK_MS = 1_000
const CLAIM_FAILED = 'We couldn’t get a code. Please try again.'

interface ActiveClaim {
  token: string
  issuedAtMs: number
  deadlineMs: number
}

/** The phone's clock, once a second while `isTicking`. */
function useNow(isTicking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isTicking) return undefined
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [isTicking])
  return now
}

interface ClaimSheetProps {
  reward: AppReward
  onClose: () => void
}

/**
 * "Use now": a single-use QR the register scans to redeem this reward. Mounted
 * per open (state starts fresh). While a code is up the card is re-read every
 * 5 s; once the reward is gone from it, the counter took it → "Scanned" and close.
 */
export function ClaimSheet({ reward, onClose }: ClaimSheetProps) {
  const { colors, space, radius } = useTokens()
  const { width } = useWindowDimensions()
  const qrSize = Math.min(QR_MAX, width - SHEET_INSET)
  const claim = useClaimReward()
  const { mutate } = claim
  const [active, setActive] = useState<ActiveClaim | null>(null)

  const getCode = useCallback(
    () =>
      mutate(reward.id, {
        onSuccess: (result) => {
          // Timed on the phone's clock from when it arrived (see claimDeadline).
          const receivedAtMs = Date.now()
          setActive({ token: result.token, issuedAtMs: receivedAtMs, deadlineMs: claimDeadline(result.expiresAt, receivedAtMs) })
        },
      }),
    [mutate, reward.id],
  )

  // One code on open; later ones only on "Get a new code".
  useEffect(() => {
    getCode()
  }, [getCode])

  const loyalty = useLoyalty({ pollMs: active ? CLAIM_POLL_MS : false })
  const isScanned = active !== null && isRewardRedeemed(reward.id, loyalty.data, loyalty.dataUpdatedAt, active.issuedAtMs)
  const now = useNow(active !== null && !isScanned)
  const phase = claimPhase({
    isScanned,
    isClaiming: claim.isPending,
    hasError: claim.isError,
    deadlineMs: active?.deadlineMs ?? null,
    nowMs: now,
  })
  useMaxBrightness(phase === 'showing')

  useEffect(() => {
    if (!isScanned) return undefined
    const timer = setTimeout(onClose, SCANNED_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [isScanned, onClose])

  const countdown = active ? claimCountdown(active.deadlineMs, now) : null
  const plate = { width: qrSize + space.md * 2, height: qrSize + space.md * 2, borderRadius: radius.lg, backgroundColor: QR_PLATE }

  return (
    <SheetModal isVisible onClose={onClose} accessibilityLabel={`Use ${reward.label}`}>
      <AppText variant="title" align="center" numberOfLines={2}>
        {reward.label}
      </AppText>
      <AppText variant="callout" color="textMuted" align="center" style={{ marginTop: space.xxs }}>
        Show this to the cashier
      </AppText>
      <View style={{ alignItems: 'center', marginVertical: space.xl }}>
        {phase === 'showing' && active ? (
          <View style={[plate, { alignItems: 'center', justifyContent: 'center' }]}>
            <QrCode value={active.token} size={qrSize} color={QR_INK} background={QR_PLATE} accessibilityLabel="Reward QR code" />
          </View>
        ) : (
          <View
            style={[
              plate,
              { alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.background, gap: space.md },
            ]}
          >
            {phase === 'scanned' ? (
              <>
                <CircleCheck size={56} color={colors.success} />
                <AppText variant="title" color="success" align="center">
                  Scanned ✓
                </AppText>
              </>
            ) : phase === 'claiming' ? (
              <ActivityIndicator color={colors.primary} accessibilityLabel="Getting your code" />
            ) : phase === 'expired' ? (
              <AppText variant="headline" color="textMuted" align="center">
                This code has expired
              </AppText>
            ) : (
              <AppText variant="callout" color="danger" align="center" accessibilityLiveRegion="polite">
                {claim.error?.message || CLAIM_FAILED}
              </AppText>
            )}
          </View>
        )}
        {phase === 'showing' && countdown ? (
          <AppText
            variant="callout"
            color={countdown.secondsLeft <= 15 ? 'warning' : 'textMuted'}
            align="center"
            style={{ marginTop: space.md }}
            accessibilityLabel={`Code works for ${countdown.secondsLeft} more seconds`}
          >
            Works for {countdown.label}
          </AppText>
        ) : null}
      </View>
      {phase === 'expired' || phase === 'failed' ? (
        <Button label="Get a new code" onPress={getCode} />
      ) : phase === 'scanned' ? null : (
        <Button label="Close" variant="ghost" onPress={onClose} />
      )}
    </SheetModal>
  )
}
