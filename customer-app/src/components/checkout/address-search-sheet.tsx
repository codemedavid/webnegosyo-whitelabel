import { MapPin, Search, SearchX, WifiOff, X } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { PressableScale } from '@/components/ui/pressable-scale'
import { Skeleton } from '@/components/ui/skeleton'
import { AppApiError } from '@/lib/api/app-client'
import { PLACE_SEARCH_DEBOUNCE_MS, placeRowLabel, placeSearchQuery, placeSearchState } from '@/lib/checkout/places'
import { APP_PLACE_QUERY_MAX, type AppPlace } from '@/lib/contract'
import { usePlaces } from '@/lib/data/hooks'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useTokens } from '@/theme/theme-context'

interface AddressSearchSheetProps {
  /** The branch the delivery leaves from (biases results); null = the store's own pin. */
  outletId: string | null
  onPick: (place: AppPlace) => void
  onClose: () => void
}

const SEARCH_FAILED = 'We couldn’t search right now. Check your connection and try again.'

function searchErrorMessage(error: unknown): string {
  if (!(error instanceof AppApiError)) return SEARCH_FAILED
  if (error.code === 'unauthorized') return 'Sign in to search for your address.'
  if (error.code === 'rate_limited' || error.code === 'refused') return error.message
  return SEARCH_FAILED
}

function PlaceRow({ place, onPick }: { place: AppPlace; onPick: () => void }) {
  const { colors, space, radius } = useTokens()
  const { title, subtitle } = placeRowLabel(place)
  return (
    <PressableScale
      haptic="selection"
      scaleTo={0.985}
      onPress={onPick}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      accessibilityHint="Deliver here"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm, paddingHorizontal: space.lg }}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <MapPin size={18} color={colors.onPrimarySoft} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  )
}

function Message({ Icon, title, body, action }: { Icon: typeof Search; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const { colors, space } = useTokens()
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxl, gap: space.sm }}>
      <Icon size={28} color={colors.textMuted} />
      <AppText variant="headline" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="callout" color="textMuted" align="center">
          {body}
        </AppText>
      ) : null}
      {action ? <Button variant="secondary" label={action.label} onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  )
}

function LoadingRows() {
  const { space } = useTokens()
  return (
    <View accessibilityLabel="Searching" style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md }}>
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} height={52} />
      ))}
    </View>
  )
}

/** Address type-ahead: results appear ~300 ms after typing stops, from 3 characters. A pick is the only way to set a delivery place. */
export function AddressSearchSheet({ outletId, onPick, onClose }: AddressSearchSheetProps) {
  const { colors, space, radius, type } = useTokens()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const query = placeSearchQuery(text)
  const debounced = useDebouncedValue(query, query, PLACE_SEARCH_DEBOUNCE_MS)
  const places = usePlaces(debounced.value, outletId)
  const state = placeSearchState({
    query,
    settledQuery: debounced.isSettled && !places.isPlaceholderData ? debounced.value : null,
    places: places.data,
    isFetching: places.isFetching || !debounced.isSettled,
    error: places.isError ? searchErrorMessage(places.error) : null,
  })

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Math.max(insets.top, space.lg) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: space.md }}>
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Delivery address
        </AppText>
        <PressableScale onPress={onClose} accessibilityLabel="Close" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <X size={22} color={colors.text} />
        </PressableScale>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          marginHorizontal: space.lg,
          paddingHorizontal: space.md,
          minHeight: 50,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          maxLength={APP_PLACE_QUERY_MAX}
          placeholder="Street, building or landmark"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoComplete="street-address"
          textContentType="fullStreetAddress"
          returnKeyType="search"
          accessibilityLabel="Search for your delivery address"
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
        />
        {text !== '' ? (
          <PressableScale onPress={() => setText('')} accessibilityLabel="Clear search" style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      {state.kind === 'results' ? (
        <FlatList
          data={state.places}
          keyExtractor={(place, index) => place.id ?? `${place.lat},${place.lng},${index}`}
          renderItem={({ item }) => <PlaceRow place={item} onPick={() => onPick(item)} />}
          // The first tap with the keyboard up must pick the place, not just close the keyboard.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: space.lg + 36 + space.md }} />}
          contentContainerStyle={{ paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.lg) }}
          accessibilityLabel={`${state.places.length} ${state.places.length === 1 ? 'place' : 'places'} found`}
        />
      ) : null}
      {state.kind === 'loading' ? <LoadingRows /> : null}
      {state.kind === 'idle' ? (
        <Message Icon={Search} title="Where should we deliver?" body="Type at least 3 letters of your street, building or a landmark nearby." />
      ) : null}
      {state.kind === 'empty' ? (
        <Message Icon={SearchX} title={`No places match “${state.query}”`} body="Try a street name, barangay or a landmark nearby." />
      ) : null}
      {state.kind === 'error' ? (
        <Message Icon={WifiOff} title="Search isn’t working" body={state.message} action={{ label: 'Try again', onPress: () => void places.refetch() }} />
      ) : null}
    </View>
  )
}
