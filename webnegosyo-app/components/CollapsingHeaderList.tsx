import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  type FlatListProps,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInput,
  type ViewStyle,
} from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { Icon } from "./Icon";
import {
  STICKY_TOOLBAR_INDICES,
  buildCollapsingRows,
  collapsingRowKey,
  isHeaderCollapsed,
  shouldRealignAfterFilter,
  snapOffsetsFor,
  type CollapsingRow,
} from "../lib/collapsing-list";

/**
 * A list whose big header scrolls away and whose filters stay.
 *
 * At the top the screen reads as before: title, actions, the search field.
 * Scroll down and the header leaves with the content, the filter row docks
 * under the status bar, and a search button fades in at its right end — tap it
 * to come back to the top with the field focused. Let go half-way and the list
 * settles open or docked, so a title is never left sliced.
 *
 * The caller clears the notch ABOVE this list (`useScreenTopInset`): the
 * toolbar docks at the list's own top edge.
 */

/** Room the docked search button takes at the toolbar's right end; give the
 *  toolbar's horizontal rail this much trailing padding so its last chip can
 *  scroll clear of the button. */
export const DOCKED_SEARCH_CLEARANCE = 56;

const SEARCH_BUTTON_SIZE = 40;
const DOCK_TRANSITION_MS = 180;
/** Long enough for the scroll back to the top to land before the keyboard rises. */
const FOCUS_AFTER_SCROLL_MS = 260;

type CollapsingListPassThrough<T> = Omit<
  FlatListProps<CollapsingRow<T>>,
  | "data"
  | "renderItem"
  | "keyExtractor"
  | "ListHeaderComponent"
  | "ListEmptyComponent"
  | "stickyHeaderIndices"
  | "onScroll"
  | "snapToOffsets"
>;

interface CollapsingHeaderListProps<T> extends CollapsingListPassThrough<T> {
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  /** Scrolls away: title and actions, the search field, status lines. */
  header: React.ReactElement;
  /** Docks under the status bar: the filter chips. */
  toolbar: React.ReactElement;
  /** Shown under the toolbar when `data` is empty. */
  emptyComponent?: React.ReactElement | null;
  /** Wraps every row and the empty state, e.g. the screen's side padding. */
  itemStyle?: StyleProp<ViewStyle>;
  /** Focused by the docked search button. Without it there is no button. */
  searchInputRef?: React.RefObject<TextInput | null>;
  /** Marks the docked search button while a search is narrowing the list. */
  isSearchActive?: boolean;
  /**
   * Changes whenever the filters change. A docked list then jumps to its first
   * result instead of staying deep inside a list that was just replaced.
   */
  filterKey?: string;
}

interface DockState {
  toolbar: React.ReactElement;
  emptyComponent: React.ReactElement | null;
  isCollapsed: boolean;
  progress: Animated.Value;
  hasSearch: boolean;
  isSearchActive: boolean;
  onSearchPress: () => void;
}

// The docked row and the empty row read their content from context so the
// list's renderItem — and with it every visible row — does not change identity
// when a caller passes a fresh toolbar or empty-state element each render.
const DockContext = createContext<DockState | null>(null);

export function CollapsingHeaderList<T>({
  data,
  renderItem,
  keyExtractor,
  header,
  toolbar,
  emptyComponent = null,
  itemStyle,
  searchInputRef,
  isSearchActive = false,
  filterKey,
  ...listProps
}: CollapsingHeaderListProps<T>) {
  const listRef = useRef<FlatList<CollapsingRow<T>>>(null);
  const offsetRef = useRef(0);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isCollapsed, setCollapsed] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isCollapsed ? 1 : 0,
      duration: DOCK_TRANSITION_MS,
      useNativeDriver: true,
    }).start();
  }, [isCollapsed, progress]);

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    [],
  );

  // Only a change of filter realigns; the first render has nothing to realign.
  const lastFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKeyRef.current === filterKey) return;
    lastFilterKeyRef.current = filterKey;
    if (shouldRealignAfterFilter(offsetRef.current, headerHeight)) {
      listRef.current?.scrollToOffset({ offset: headerHeight, animated: false });
    }
  }, [filterKey, headerHeight]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      offsetRef.current = offsetY;
      const next = isHeaderCollapsed(offsetY, headerHeight);
      setCollapsed((current) => (current === next ? current : next));
    },
    [headerHeight],
  );

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setHeaderHeight((current) => (current === height ? current : height));
  }, []);

  const handleSearchPress = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => searchInputRef?.current?.focus(), FOCUS_AFTER_SCROLL_MS);
  }, [searchInputRef]);

  const rows = useMemo(() => buildCollapsingRows(data), [data]);

  const renderRow = useCallback<ListRenderItem<CollapsingRow<T>>>(
    (info) => {
      const row = info.item;
      if (row.kind === "toolbar") return <DockedToolbar />;
      if (row.kind === "empty") return <DockedEmpty style={itemStyle} />;
      return (
        <View style={itemStyle}>
          {renderItem({ ...info, item: row.item, index: row.index })}
        </View>
      );
    },
    [renderItem, itemStyle],
  );

  const rowKey = useCallback(
    (row: CollapsingRow<T>) => collapsingRowKey(row, keyExtractor),
    [keyExtractor],
  );

  const hasSearch = searchInputRef !== undefined;
  const dock = useMemo<DockState>(
    () => ({
      toolbar,
      emptyComponent,
      isCollapsed,
      progress,
      hasSearch,
      isSearchActive,
      onSearchPress: handleSearchPress,
    }),
    [toolbar, emptyComponent, isCollapsed, progress, hasSearch, isSearchActive, handleSearchPress],
  );

  return (
    <DockContext.Provider value={dock}>
      <FlatList
        {...listProps}
        ref={listRef}
        data={rows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        ListHeaderComponent={<View onLayout={handleHeaderLayout}>{header}</View>}
        stickyHeaderIndices={STICKY_TOOLBAR_INDICES}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        snapToOffsets={snapOffsetsFor(headerHeight)}
        snapToEnd={false}
      />
    </DockContext.Provider>
  );
}

function DockedEmpty({ style }: { style?: StyleProp<ViewStyle> }) {
  const dock = useContext(DockContext);
  return <View style={style}>{dock?.emptyComponent ?? null}</View>;
}

function DockedToolbar() {
  const dock = useContext(DockContext);
  if (!dock) return null;
  const { toolbar, isCollapsed, progress, hasSearch, isSearchActive, onSearchPress } = dock;
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View style={styles.dock}>
      {toolbar}
      {/* A soft edge only once rows scroll beneath the dock. */}
      <Animated.View pointerEvents="none" style={[styles.dockEdge, { opacity: progress }]} />
      {hasSearch && (
        <Animated.View
          pointerEvents={isCollapsed ? "box-none" : "none"}
          style={[styles.searchSlot, { opacity: progress }]}
          accessibilityElementsHidden={!isCollapsed}
          importantForAccessibility={isCollapsed ? "auto" : "no-hide-descendants"}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
              onPress={onSearchPress}
              activeOpacity={0.7}
              style={[styles.searchButton, isSearchActive && styles.searchButtonActive]}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Icon
                name="search"
                size={18}
                color={isSearchActive ? colors.textOnDark : colors.textPrimary}
              />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { backgroundColor: colors.background, justifyContent: "center" },
  dockEdge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  // Solid ground behind the button so chips scrolling under it stay legible.
  searchSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: DOCKED_SEARCH_CLEARANCE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingRight: spacing.sm,
  },
  searchButton: {
    width: SEARCH_BUTTON_SIZE,
    height: SEARCH_BUTTON_SIZE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  searchButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
