import { useMemo } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { HomeBlock } from '@/components/home/home-block'
import { HomeHeader } from '@/components/home/home-header'
import { MemberCard } from '@/components/home/member-card'
import { useAppConfig, useCatalog } from '@/lib/data/hooks'
import { greetingFor } from '@/lib/home/greeting'
import { visibleBlocks } from '@/lib/home/visible-blocks'
import { firstName, useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

const STAGGER_MS = 60

export default function HomeScreen() {
  const { colors, space } = useTokens()
  const { data: config, refetch, isRefetching } = useAppConfig()
  const { data: catalog } = useCatalog()
  const session = useSession()
  const isMember = session.status === 'member'

  const blocks = useMemo(
    () => (config ? visibleBlocks(config.home.blocks, { isMember, features: config.features }) : []),
    [config, isMember],
  )
  if (!config) return null

  const memberBlock = blocks.find((block) => block.type === 'memberCard')
  // Members get a time-of-day greeting by name; guests get the store's own line.
  const greeting = isMember ? greetingFor(new Date(), firstName(session.profile)) : config.copy.greeting

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: space.xxxl * 2 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.onPrimary} />}
    >
      <HomeHeader greeting={greeting} storeName={config.tenant.name} hasOverlap={memberBlock !== undefined} />
      {memberBlock ? (
        <MemberCard isMember={isMember} joinTitle={config.copy.guestJoinTitle} joinBody={config.copy.guestJoinBody} />
      ) : (
        <View style={{ height: space.lg }} />
      )}
      <View style={{ gap: space.xxl, marginTop: space.xl }}>
        {blocks
          .filter((block) => block.type !== 'memberCard')
          .map((block, index) => (
            <Animated.View key={block.id} entering={FadeInDown.delay(index * STAGGER_MS).springify().damping(20)}>
              <HomeBlock block={block} catalog={catalog} />
            </Animated.View>
          ))}
      </View>
    </ScrollView>
  )
}
