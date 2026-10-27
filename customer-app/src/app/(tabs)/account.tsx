import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Bell, CircleHelp, CircleUser, LogOut, Receipt, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, Switch, View } from 'react-native'
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
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

const HELP_URL = 'https://www.webnegosyo.com/support'

function HelpGroup() {
  return (
    <ListGroup title="Help">
      <ListRow Icon={CircleHelp} label="Help & support" onPress={() => void WebBrowser.openBrowserAsync(HELP_URL)} />
    </ListGroup>
  )
}

function MemberAccount({ storeName }: { storeName: string }) {
  const { colors, space } = useTokens()
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
  // Prototype only: Phase 7 stores this per device token.
  const [wantsOrderUpdates, setWantsOrderUpdates] = useState(true)
  if (!profile) return null
  return (
    <View style={{ gap: space.xl }}>
      <ProfileCard profile={profile} onEditName={() => router.push('/edit-name')} />
      <ListGroup title="Orders">
        <ListRow Icon={Receipt} label="Order history" detail="Track, view receipts and reorder" onPress={() => router.push('/orders')} />
      </ListGroup>
      <SavedAddresses />
      <ListGroup title="Notifications">
        <ListRow
          Icon={Bell}
          label="Order updates"
          detail="When your order is confirmed, ready or on the way"
          trailing={
            <Switch
              value={wantsOrderUpdates}
              onValueChange={setWantsOrderUpdates}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel="Order update notifications"
            />
          }
        />
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
            body="Save your details and addresses, track every order, and collect rewards."
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
