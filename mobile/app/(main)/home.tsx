import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, ORDER_TYPE_CARD_OVERRIDES, HOME_BRANDING_OVERRIDES } from '@/theme/provider'
import { useOrderTypes } from '@/lib/queries/use-order-types'
import { useCartStore } from '@/stores/cart-store'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Skeleton } from '@/components/ui/skeleton'
import { setAlpha } from '@/lib/branding-utils'
import type { OrderType, PromotionBanner } from '@/types/database'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const BANNER_WIDTH = SCREEN_WIDTH - 32
const BANNER_HEIGHT = BANNER_WIDTH * 0.55
const AUTO_SCROLL_INTERVAL = 4000

const ORDER_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    pickup: 'bag-handle',
    delivery: 'bicycle',
    dine_in: 'restaurant',
}

const ORDER_TYPE_DISPLAY_NAMES: Record<string, string> = {
    pickup: 'PICKUP',
    delivery: 'DELIVERY',
    dine_in: 'DINE IN',
}

export default function HomeScreen() {
    const { theme, tenant, isLoading: isTenantLoading } = useTheme()
    const { data: orderTypes = [], isLoading: isOrderTypesLoading } = useOrderTypes(tenant?.id)
    const setOrderType = useCartStore(s => s.setOrderType)

    const banners = tenant?.promotion_banners ?? []
    const hasBanners = tenant?.is_promotion_visible && banners.length > 0

    // Auto-scroll for banners
    const flatListRef = useRef<FlatList<PromotionBanner>>(null)
    const currentIndex = useRef(0)
    const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Pagination dots
    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => {
        if (!hasBanners || banners.length <= 1) return

        scrollIntervalRef.current = setInterval(() => {
            currentIndex.current = (currentIndex.current + 1) % banners.length
            flatListRef.current?.scrollToIndex({
                index: currentIndex.current,
                animated: true,
            })
        }, AUTO_SCROLL_INTERVAL)

        return () => {
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current)
        }
    }, [hasBanners, banners.length])

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
            if (viewableItems.length > 0 && viewableItems[0].index != null) {
                setActiveIndex(viewableItems[0].index)
                currentIndex.current = viewableItems[0].index
            }
        },
        []
    )

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current

    const handleOrderTypePress = useCallback(
        (orderType: OrderType) => {
            setOrderType(orderType.id)
            router.push('/(main)/menu')
        },
        [setOrderType]
    )

    const isLoading = isTenantLoading || isOrderTypesLoading
    const showHomeLogo = HOME_BRANDING_OVERRIDES.showLogo ?? true
    const homeHeaderTitle = HOME_BRANDING_OVERRIDES.headerTitle || tenant?.name || 'Welcome'
    const homeHeaderSubtitle = HOME_BRANDING_OVERRIDES.headerSubtitle || tenant?.hero_description
    const homeHeroTitle = HOME_BRANDING_OVERRIDES.heroTitle || tenant?.hero_title
    const homeHeroDescription = HOME_BRANDING_OVERRIDES.heroDescription || tenant?.hero_description
    const orderTypeTitle = HOME_BRANDING_OVERRIDES.orderTypeTitle || 'How would you like to order?'
    const orderTypeSubtitle = HOME_BRANDING_OVERRIDES.orderTypeSubtitle || 'Choose your preferred ordering method'

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { backgroundColor: theme.header }]}>
                    <View style={styles.headerLeft}>
                        {showHomeLogo ? (
                            <Skeleton width={36} height={36} style={{ borderRadius: 8 }} />
                        ) : null}
                        <Skeleton width={150} height={20} />
                    </View>
                </View>
                <View style={styles.loadingContent}>
                    <Skeleton width={BANNER_WIDTH} height={BANNER_HEIGHT} style={{ borderRadius: 16, marginBottom: 24 }} />
                    <Skeleton width={200} height={24} style={{ marginBottom: 16, alignSelf: 'flex-start', marginLeft: 16 }} />
                    <View style={styles.orderTypeGrid}>
                        <Skeleton width={(SCREEN_WIDTH - 48) / 2} height={160} style={{ borderRadius: 16 }} />
                        <Skeleton width={(SCREEN_WIDTH - 48) / 2} height={160} style={{ borderRadius: 16 }} />
                    </View>
                </View>
            </SafeAreaView>
        )
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.header }]}>
                <View style={styles.headerLeft}>
                    {showHomeLogo && tenant?.logo_url ? (
                        <OptimizedImage source={tenant.logo_url} style={styles.logo} contentFit="contain" />
                    ) : null}
                    <View style={styles.headerTextContainer}>
                        <Text style={[styles.headerTitle, { color: theme.menuMainHeaderText }]} numberOfLines={1}>
                            {homeHeaderTitle}
                        </Text>
                        {homeHeaderSubtitle ? (
                            <Text style={[styles.headerSubtitle, { color: theme.menuMainHeaderSubtitle }]} numberOfLines={1}>
                                {homeHeaderSubtitle}
                            </Text>
                        ) : null}
                    </View>
                </View>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero greeting */}
                {homeHeroTitle || homeHeroDescription ? (
                    <View style={styles.heroSection}>
                        {homeHeroTitle ? (
                            <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>
                                {homeHeroTitle}
                            </Text>
                        ) : null}
                        {homeHeroDescription ? (
                            <Text style={[styles.heroDescription, { color: theme.textSecondary }]}>
                                {homeHeroDescription}
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                {/* Promotion Banner Carousel */}
                {hasBanners ? (
                    <View style={styles.bannerSection}>
                        <FlatList
                            ref={flatListRef}
                            data={banners}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={BANNER_WIDTH + 8}
                            decelerationRate="fast"
                            contentContainerStyle={styles.bannerList}
                            onViewableItemsChanged={onViewableItemsChanged}
                            viewabilityConfig={viewabilityConfig}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <View style={[styles.bannerCard, { shadowColor: theme.shadow }]}>
                                    <OptimizedImage
                                        source={item.imageUrl}
                                        style={styles.bannerImage}
                                        contentFit="cover"
                                    />
                                </View>
                            )}
                        />
                        {/* Pagination dots */}
                        {banners.length > 1 ? (
                            <View style={styles.paginationContainer}>
                                {banners.map((_, index) => (
                                    <View
                                        key={index}
                                        style={[
                                            styles.paginationDot,
                                            {
                                                backgroundColor:
                                                    index === activeIndex
                                                        ? theme.primary
                                                        : setAlpha(theme.primary, 0.25),
                                                width: index === activeIndex ? 20 : 8,
                                            },
                                        ]}
                                    />
                                ))}
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {/* Order Type Selection */}
                <View style={styles.orderTypeSection}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                        {orderTypeTitle}
                    </Text>
                    <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                        {orderTypeSubtitle}
                    </Text>

                    <View style={styles.orderTypeGrid}>
                        {orderTypes.map((orderType) => {
                            const iconName = ORDER_TYPE_ICONS[orderType.type] || 'receipt'
                            const displayName = orderType.name || ORDER_TYPE_DISPLAY_NAMES[orderType.type] || orderType.type
                            const OT = ORDER_TYPE_CARD_OVERRIDES

                            return (
                                <TouchableOpacity
                                    key={orderType.id}
                                    style={[
                                        styles.orderTypeCard,
                                        {
                                            backgroundColor: OT.cardBg || theme.cards,
                                            borderColor: OT.cardBorder || setAlpha(theme.primary, 0.12),
                                            shadowColor: theme.shadow,
                                        },
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={() => handleOrderTypePress(orderType)}
                                >
                                    <View style={[styles.orderTypeIconContainer, { backgroundColor: OT.iconBg || setAlpha(theme.primary, 0.12) }]}>
                                        <Ionicons name={iconName} size={36} color={OT.iconColor || theme.primary} />
                                    </View>
                                    <Text
                                        style={[styles.orderTypeName, { color: OT.titleColor || theme.textPrimary }]}
                                        numberOfLines={2}
                                    >
                                        {displayName}
                                    </Text>
                                    {orderType.description ? (
                                        <Text
                                            style={[styles.orderTypeDescription, { color: OT.descriptionColor || theme.textSecondary }]}
                                            numberOfLines={2}
                                        >
                                            {orderType.description.split('\n')[0]}
                                        </Text>
                                    ) : null}
                                    <View style={[styles.orderTypeArrow, { backgroundColor: OT.arrowBg || theme.primary }]}>
                                        <Ionicons name="arrow-forward" size={16} color={OT.arrowColor || theme.buttonPrimaryText} />
                                    </View>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>

                {/* Announcement Banner */}
                {tenant?.is_announcement_visible && tenant?.announcement_text ? (
                    <View
                        style={[
                            styles.announcementBanner,
                            {
                                backgroundColor: tenant.announcement_bg_color || '#FFF4E5',
                                borderColor: setAlpha(tenant.announcement_text_color || '#663C00', 0.2),
                            },
                        ]}
                    >
                        <Ionicons
                            name="megaphone"
                            size={18}
                            color={tenant.announcement_text_color || '#663C00'}
                            style={{ marginRight: 8 }}
                        />
                        <Text
                            style={[
                                styles.announcementText,
                                { color: tenant.announcement_text_color || '#663C00' },
                            ]}
                        >
                            {tenant.announcement_text}
                        </Text>
                    </View>
                ) : null}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 3,
        zIndex: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    logo: {
        width: 40,
        height: 40,
        borderRadius: 10,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 8,
    },
    // Hero
    heroSection: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    heroDescription: {
        fontSize: 14,
        marginTop: 4,
        lineHeight: 20,
    },
    // Banners
    bannerSection: {
        paddingTop: 16,
        paddingBottom: 8,
    },
    bannerList: {
        paddingHorizontal: 16,
    },
    bannerCard: {
        width: BANNER_WIDTH,
        height: BANNER_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 5,
    },
    bannerImage: {
        width: '100%',
        height: '100%',
    },
    paginationContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
        gap: 6,
    },
    paginationDot: {
        height: 8,
        borderRadius: 4,
    },
    // Order Types
    orderTypeSection: {
        paddingHorizontal: 16,
        paddingTop: 24,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    sectionSubtitle: {
        fontSize: 13,
        marginTop: 4,
        marginBottom: 16,
    },
    orderTypeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    orderTypeCard: {
        width: (SCREEN_WIDTH - 44) / 2,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        minHeight: 170,
        justifyContent: 'space-between',
    },
    orderTypeIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    orderTypeName: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.3,
        marginBottom: 4,
    },
    orderTypeDescription: {
        fontSize: 11,
        lineHeight: 15,
        marginBottom: 8,
    },
    orderTypeArrow: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-end',
    },
    // Announcement
    announcementBanner: {
        marginHorizontal: 16,
        marginTop: 20,
        padding: 14,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
    },
    announcementText: {
        fontSize: 13,
        flex: 1,
        lineHeight: 18,
    },
    // Loading
    loadingContent: {
        padding: 16,
        alignItems: 'center',
    },
})
