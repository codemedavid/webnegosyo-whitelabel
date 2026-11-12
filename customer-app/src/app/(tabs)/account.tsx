import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Bell, CircleHelp, CircleUser, LogOut, Receipt, Trash2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Linking, ScrollView, Switch, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DeleteAccountSheet } from '@/components/account/delete-account-sheet'
import { ListGroup, ListRow } from '@/components/account/list-row'
import { ProfileCard } from '@/components/account/profile-card'
import { SavedAddresses } from '@/components/account/saved-addresses'
import { SignInPrompt } from '@/components/auth/sign-in-prompt'
import { AppText } from '@/components/ui/app-text'
import { AppApiError } from '@/lib/api/app-client'
import { deleteAccount, signOut } from '@/lib/auth/account-actions'
import { useAppConfig } from '@/lib/data/hooks'
import { appClientFromEnv } from '@/lib/data/live-source'
import { useIsAppActive } from '@/lib/hooks/use-is-app-active'
import { loadPushState, refreshPushPermission, turnOffNotifications, turnOnNotifications, usePush } from '@/lib/push/push-actions'
import { accountRow } from '@/lib/push/push-state'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

const HELP_URL = 'https://www.webnegosyo.com/support'

/**
 * Saved addresses are a prototype stand-in (no /me/addresses yet): a real
 * store's build must not show a customer someone else's sample addresses.
 */
const SHOWS_PROTOTYPE_ROWS = appClientFromEnv() === null

/** Account → Notifications → Order updates: the phone's permission and this phone's choice (P7). */
function OrderUpdatesRow() {
  const { colors } = useTokens()
  const push = usePush()
  const isAppActive = useIsAppActive()
  const [isBusy, setIsBusy] = useState(false)
  useEffect(() => {
    void loadPushState()
  }, [])
  // Back from the phone's Settings: the permission may have changed.
  useEffect(() => {
    if (isAppActive) void refreshPushPermission()
  }, [isAppActive])
  if (!push.isLoaded) return null
  const row = accountRow(push)
  const toggle = async (isOn: boolean) => {
    setIsBusy(true)
    try {
      if (isOn) await turnOnNotifications()
      else await turnOffNotifications()
    } finally {
      setIsBusy(false)
    }
  }
  if (row.kind === 'settings') return <ListRow Icon={Bell} label="Order updates" detail={row.detail} onPress={() => void Linking.openSettings()} />
  if (row.kind === 'unavailable') return <ListRow Icon={Bell} label="Order updates" detail={row.detail} />
  return (
    <ListRow
      Icon={Bell}
      label="Order updates"
      detail={row.detail}
      trailing={
        <Switch
          value={row.isOn}
          disabled={isBusy}
          onValueChange={(isOn) => void toggle(isOn)}
          trackColor={{ true: colors.primary, false: colors.border }}
          accessibilityLabel="Order update notifications"
        />
      }
    />
  )
}

function HelpGroup() {
  return (
    <ListGroup title="Help">
      <ListRow Icon={CircleHelp} label="Help & support" onPress={() => void WebBrowser.openBrowserAsync(HELP_URL)} />
    </ListGroup>
  )
}

function MemberAccount({ storeName }: { storeName: string }) {
  const { space } = useTokens()
  const profile = useSession((state) => state.profile)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const confirmDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
      setIsConfirming(false)
    } catch (error) {
      setDeleteError(error instanceof AppApiError && error.code !== 'internal' ? error.message : 'We couldn’t delete your account. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }
  if (!profile) return null
  return (
    <View style={{ gap: space.xl }}>
      <ProfileCard profile={profile} onEditName={() => router.push('/edit-name')} />
      <ListGroup title="Orders">
        <ListRow Icon={Receipt} label="Order history" detail="Track, view receipts and reorder" onPress={() => router.push('/orders')} />
      </ListGroup>
      {SHOWS_PROTOTYPE_ROWS ? <SavedAddresses /> : null}
      <ListGroup title="Notifications">
        <OrderUpdatesRow />
      </ListGroup>
      <HelpGroup />
      <ListGroup>
        <ListRow Icon={LogOut} label="Sign out" onPress={() => void signOut()} />
        <ListRow Icon={Trash2} label="Delete account" tone="danger" onPress={() => setIsConfirming(true)} />
      </ListGroup>
      <DeleteAccountSheet
        isVisible={isConfirming}
        storeName={storeName}
        isDeleting={isDeleting}
        error={deleteError}
        onClose={() => {
          setIsConfirming(false)
          setDeleteError(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  )
}

export default function AccountScreen() {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const { data: config } = useAppConfig()
  const isMember = useSession((state) => state.status === 'member')
  if (!config) return null
  const version = Constants.expoConfig?.version
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl * 2 }}
      showsVerticalScrollIndicator={false}
    >
      <AppText variant="display" accessibilityRole="header" style={{ paddingHorizontal: space.lg, marginBottom: space.lg }}>
        Account
      </AppText>
      {isMember ? (
        <MemberAccount storeName={config.tenant.name} />
      ) : (
        <View style={{ gap: space.xl }}>
          <SignInPrompt
            Icon={CircleUser}
            title="Sign in to order faster"
            body="Save your details, track every order, and collect rewards."
          />
          <HelpGroup />
        </View>
      )}
      {version ? (
        <AppText variant="caption" color="textMuted" align="center" style={{ marginTop: space.xxl }}>
          {config.tenant.name} · Version {version}
        </AppText>
      ) : null}
    </ScrollView>
  )
}
