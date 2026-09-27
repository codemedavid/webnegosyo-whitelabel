import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setStatusBarStyle } from "expo-status-bar";
import { colors, spacing, typography } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";
import { hasPermission } from "../../lib/staff-permissions";
import { blockLabel } from "../../lib/receipt-editor";
import { describeMode, type StudioAction } from "../../lib/receipt-studio";
import { useReceiptStudio, type ReceiptStudio } from "../../hooks/useReceiptStudio";
import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ReceiptPaper } from "../../components/receipt/ReceiptPaper";
import { BlockInspector } from "../../components/receipt/BlockInspector";
import { AddBlockSheet } from "../../components/receipt/AddBlockSheet";
import { TemplateSheet } from "../../components/receipt/TemplateSheet";
import { PaperStyleSheet } from "../../components/receipt/PaperStyleSheet";
import { StudioHeader, type HeaderStatus } from "../../components/receipt/StudioHeader";
import { StudioDock } from "../../components/receipt/StudioDock";
import { StudioNoticeBar } from "../../components/receipt/StudioNoticeBar";
import { studio } from "../../components/receipt/studio-theme";

/**
 * Receipt editor — design the store's printed receipt on the phone.
 *
 * The paper IS the editor. It hangs from a printer slot on the studio's dark
 * ink, drawn by the exact engine the counter prints with; the merchant taps
 * the line they want to change and its controls rise from the bottom while
 * the paper stays live above them. Nothing is a list of settings to map back
 * onto a receipt in your head.
 *
 * Built for the counter, one-handed: every destructive step is undoable, the
 * arrange controls sit under the thumb, "Test print" puts the draft on real
 * paper before anything is published, and leaving with unsaved changes asks
 * first. Behaviour lives in hooks/useReceiptStudio.ts and the pure reducer in
 * lib/receipt-studio.ts; this file only lays it out.
 */

type OpenSheet = "add" | "templates" | "style" | null;

/** The paper never grows past a real roll's proportions on a tablet. */
const MAX_PAPER_WIDTH = 420;
const CANVAS_GUTTER = 22;
/** Room kept above a block scrolled into view, so its tag is not under the bar. */
const SCROLL_HEADROOM = 72;
const FEED_DISTANCE = 56;
/** The inspector may take at most this share of the screen; the paper keeps the rest. */
const INSPECTOR_MAX_RATIO = 0.56;

const UNREADABLE_NOTE =
  "Your receipt was designed on the web with blocks this app version can't show yet, so you're seeing the Modern template. Update the app to edit your design here.";

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));
}

function headerStatus(s: ReceiptStudio): HeaderStatus {
  const design = describeMode(s.state.draft.mode);
  if (s.isDemo) return { text: "Demo store · changes aren't saved", tone: "muted" };
  if (s.publishStatus === "publishing") return { text: "Publishing…", tone: "dirty" };
  if (s.isDirty) return { text: `Unsaved · ${design}`, tone: "dirty" };
  if (!s.isReadable) return { text: "Designed on the web · update the app to edit", tone: "muted" };
  if (s.isSyncing) return { text: "Checking for changes…", tone: "muted" };
  return { text: `Live · ${design}`, tone: "live" };
}

export default function ReceiptEditorScreen() {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const tenantId = useAuthStore((s) => s.tenantId);
  if (!hasPermission({ role, isOwner, permissions }, "store_setup")) return <NoAccess />;
  // Keyed on the store: this tab screen never unmounts, so without the key a
  // draft (and its undo history) from one account would outlive a sign-in to
  // another — and Publish would write it over the new store's receipt.
  return <ReceiptStudioScreen key={tenantId ?? "no-store"} />;
}

function NoAccess() {
  return (
    <View style={styles.noAccess}>
      <BackHeader title="Receipt" />
      <EmptyState
        icon="printer"
        title="Ask the owner"
        message="Changing the store's receipt needs the Store setup permission."
      />
    </View>
  );
}

function ReceiptStudioScreen() {
  const s = useReceiptStudio();
  const { height: windowHeight } = useWindowDimensions();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [hasTapped, setHasTapped] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const paperTop = useRef(0);
  const blockFrames = useRef(new Map<string, { y: number; height: number }>());
  const feed = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // The inspector's cap is a share of the space the keyboard leaves, not of
  // the whole window — or its last rows end up under a tall keyboard.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const shown = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const insets = useSafeAreaInsets();
  const { selectedId, draft } = s.state;
  const selectedIndex = draft.drafts.findIndex((d) => d.id === selectedId);
  const selected = selectedIndex >= 0 ? draft.drafts[selectedIndex]! : null;
  const paperWidth = Math.min(MAX_PAPER_WIDTH, Math.max(0, canvasWidth - CANVAS_GUTTER * 2));
  const isLocked = s.publishStatus === "publishing";

  // The one authored moment: the receipt feeds out of the slot when the
  // editor first opens.
  useEffect(() => {
    Animated.spring(feed, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 120, mass: 1 }).start();
  }, [feed]);

  // Tab screens stay mounted, so focus — not mount — is when to look for a
  // design published elsewhere and to put the status bar on the dark studio.
  const refreshRef = useRef(s.refresh);
  useEffect(() => {
    refreshRef.current = s.refresh;
  }, [s.refresh]);
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      void refreshRef.current();
      return () => setStatusBarStyle("dark");
    }, []),
  );

  const dispatchAnimated = (action: StudioAction) => {
    animateLayout();
    s.edit(action);
  };

  const select = (id: string | null) => {
    if (id !== null) setHasTapped(true);
    if ((id === null) !== (selectedId === null)) animateLayout();
    s.edit({ type: "select", id });
  };

  const leave = () => {
    if (!s.isDirty) {
      router.back();
      return;
    }
    Alert.alert("Leave without publishing?", "Your changes haven't reached the printer yet.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard changes",
        style: "destructive",
        onPress: () => {
          s.discard();
          router.back();
        },
      },
    ]);
  };

  /** Android's back button: put the block down first, then ask before losing work. */
  const handleHardwareBack = () => {
    if (selectedId !== null) select(null);
    else leave();
  };
  const hardwareBackRef = useRef(handleHardwareBack);
  useEffect(() => {
    hardwareBackRef.current = handleHardwareBack;
  });
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        hardwareBackRef.current();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  const publish = () => {
    if (s.isReadable) {
      void s.publish();
      return;
    }
    Alert.alert(
      "Replace the web design?",
      "Your store's receipt was designed on the web with blocks this app version can't show. Publishing replaces it with what you see here.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Replace it", style: "destructive", onPress: () => void s.publish() },
      ],
    );
  };

  // Bring the selected block into the space above the inspector. Waits a frame
  // so the inspector has taken its height and the block its new position.
  useEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => {
      const box = blockFrames.current.get(selectedId);
      if (!box) return;
      const top = paperTop.current + box.y;
      const bottom = top + box.height;
      const visibleTop = scrollY.current + SCROLL_HEADROOM / 2;
      const visibleBottom = scrollY.current + viewportHeight.current - spacing.lg;
      if (top >= visibleTop && bottom <= visibleBottom) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, top - SCROLL_HEADROOM), animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, selectedIndex]);

  const placement = selected ? `below ${blockLabel(selected.block.kind)}` : "at the end of the receipt";
  const problemHere = s.problem && s.problem.blockId === selectedId ? s.problem.message : null;

  return (
    <View style={styles.screen}>
      <StudioHeader
        status={headerStatus(s)}
        canUndo={s.canUndo && !isLocked}
        canPublish={s.isDirty && !isLocked}
        publishStatus={s.publishStatus}
        onBack={leave}
        onUndo={() => {
          animateLayout();
          s.undo();
        }}
        onPublish={publish}
      />

      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View
          style={styles.canvas}
          onLayout={(event) => {
            setCanvasWidth(event.nativeEvent.layout.width);
            viewportHeight.current = event.nativeEvent.layout.height;
          }}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={32}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Pressable style={styles.stage} onPress={() => select(null)} accessible={false}>
              {!s.isReadable && !s.isDirty ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{UNREADABLE_NOTE}</Text>
                </View>
              ) : null}

              <Text style={styles.hint}>
                {hasTapped ? " " : "Tap any line on the receipt to change it"}
              </Text>

              <View style={[styles.slot, { width: paperWidth + 20 }]}>
                <View style={styles.slotMouth} />
              </View>

              {paperWidth > 0 ? (
                <View
                  style={styles.feedWindow}
                  onLayout={(event) => {
                    paperTop.current = event.nativeEvent.layout.y;
                  }}
                >
                  <Animated.View
                    style={{
                      opacity: feed,
                      transform: [{ translateY: feed.interpolate({ inputRange: [0, 1], outputRange: [-FEED_DISTANCE, 0] }) }],
                    }}
                  >
                    {s.previewBlocks.length > 0 ? (
                      <ReceiptPaper
                        blocks={s.previewBlocks}
                        columns={s.preview.columns}
                        width={paperWidth}
                        selectedId={selectedId}
                        onSelectBlock={select}
                        onBlockLayout={(id, y, height) => blockFrames.current.set(id, { y, height })}
                      />
                    ) : (
                      <View style={[styles.emptyPaper, { width: paperWidth }]}>
                        <Text style={styles.emptyTitle}>Nothing on the receipt</Text>
                        <Text style={styles.emptyText}>Add a block, or start again from a template.</Text>
                      </View>
                    )}
                  </Animated.View>
                </View>
              ) : null}

              <Text style={styles.footnote}>
                Sample order · {s.paperWidth} mm roll · {s.preview.columns} letters a line
              </Text>
            </Pressable>
          </ScrollView>

          <StudioNoticeBar notice={s.notice} onDismiss={s.dismissNotice} />
        </View>

        {selected ? (
          <View style={styles.inspector}>
            <ScrollView
              style={{ maxHeight: (windowHeight - keyboardHeight) * INSPECTOR_MAX_RATIO }}
              contentContainerStyle={[styles.inspectorContent, { paddingBottom: insets.bottom + spacing.md }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <BlockInspector
                block={selected.block}
                theme={draft.theme}
                columns={s.preview.columns}
                isFirst={selectedIndex === 0}
                isLast={selectedIndex === draft.drafts.length - 1}
                hasLogo={s.preview.logoUrl !== null}
                problem={problemHere}
                onChange={(block, field) => s.edit({ type: "updateBlock", id: selected.id, block, field })}
                onMove={(offset) => dispatchAnimated({ type: "move", id: selected.id, offset })}
                onDuplicate={() => dispatchAnimated({ type: "duplicate", id: selected.id })}
                onAddBelow={() => setOpenSheet("add")}
                onRemove={() => {
                  animateLayout();
                  s.removeBlock(selected.id);
                }}
                onSplit={() => {
                  animateLayout();
                  s.splitOrderMeta(selected.id);
                }}
                onDone={() => select(null)}
              />
            </ScrollView>
          </View>
        ) : (
          <StudioDock
            templateLabel="Template"
            isPrinting={s.printStatus === "printing"}
            isLocked={isLocked}
            onTemplates={() => setOpenSheet("templates")}
            onPaperStyle={() => setOpenSheet("style")}
            onPrintSample={() => void s.printSample(() => router.push("/(main)/printer-settings"))}
            onAdd={() => setOpenSheet("add")}
          />
        )}
      </KeyboardAvoidingView>

      <AddBlockSheet
        isVisible={openSheet === "add"}
        placement={placement}
        onAdd={(kind) => {
          setOpenSheet(null);
          setHasTapped(true);
          dispatchAnimated({ type: "insertBlock", kind });
        }}
        onClose={() => setOpenSheet(null)}
      />
      <TemplateSheet
        isVisible={openSheet === "templates"}
        current={draft.mode}
        preview={s.preview}
        onPick={(name) => {
          setOpenSheet(null);
          animateLayout();
          s.pickTemplate(name);
        }}
        onClose={() => setOpenSheet(null)}
      />
      <PaperStyleSheet
        isVisible={openSheet === "style"}
        theme={draft.theme}
        isBold={draft.isBold}
        paperWidth={s.paperWidth}
        printerPaperWidth={s.printerPaperWidth}
        onTheme={(theme) => s.edit({ type: "setTheme", theme })}
        onBold={(isBold) => s.edit({ type: "setBold", isBold })}
        onPaperWidth={s.setPaperWidth}
        onClose={() => setOpenSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: studio.canvas },
  noAccess: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  canvas: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  stage: { flexGrow: 1, alignItems: "center", paddingBottom: spacing.xxl * 2 },
  banner: {
    marginHorizontal: CANVAS_GUTTER,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    backgroundColor: studio.canvasRaised,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  bannerText: { ...typography.caption, lineHeight: 19, color: studio.canvasText },
  hint: { ...typography.caption, color: studio.canvasMuted, marginTop: spacing.md, marginBottom: spacing.md },
  slot: {
    height: 16,
    borderRadius: 8,
    backgroundColor: studio.slotLip,
    justifyContent: "flex-end",
    paddingHorizontal: 6,
    paddingBottom: 4,
    zIndex: 2,
  },
  slotMouth: { height: 4, borderRadius: 2, backgroundColor: studio.slot },
  // Clips the paper at the slot, so on open it feeds out rather than sliding in.
  feedWindow: { marginTop: -6, paddingTop: 0, overflow: "hidden", paddingBottom: 18 },
  emptyPaper: {
    backgroundColor: studio.paper,
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: studio.paperInk },
  emptyText: { ...typography.caption, color: studio.paperFaint, marginTop: 4, textAlign: "center" },
  footnote: { ...typography.small, color: studio.canvasMuted, marginTop: spacing.xs },
  inspector: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  inspectorContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
});
