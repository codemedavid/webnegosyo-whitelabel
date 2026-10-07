import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { router, useSegments } from "expo-router";
import { useAuthStore } from "../../stores/auth-store";
import { shadow } from "../../theme/colors";
import { getWebAppUrl } from "../../lib/web-app-url";
import { resolveOwlLink } from "../../lib/assistant/links";
import { isOwlAvailable, shouldShowOwlButton } from "../../lib/assistant/visibility";
import { hintForRoute, screenKeyOf, shouldOfferOwlHint } from "../../lib/assistant/owl-hints";
import { useOwlHintState } from "../../lib/assistant/use-owl-hint-state";
import type { AssistantLink } from "../../lib/assistant/types";
import { AssistantPanel, type PendingPrompt } from "./AssistantPanel";
import { OwlHintBubble } from "./OwlHintBubble";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OWL = require("../../assets/assistant/owl.png");

/** Diameter of the floating owl (web: 56px on phones). */
const OWL_SIZE = 56;
/** Gap between the owl and the tab bar / screen edge. */
const OWL_MARGIN = 16;
/** Gap between the owl and its speech bubble. */
const BUBBLE_GAP = 6;
/** The bubble never grows past this, even on a tablet. */
const BUBBLE_MAX_WIDTH = 300;

type Props = {
  /** Height of the tab bar, so the owl floats just above it. */
  bottomOffset: number;
};

/**
 * The floating owl (web: AssistantLauncher). The chat mounts on first open and
 * then stays mounted while hidden, so closing it keeps the thread — the same
 * as the web panel. Until the owner knows it, a speech bubble says what Owl
 * can do on the current screen (lib/assistant/owl-hints.ts).
 */
export function OwlLauncher({ bottomOffset }: Props) {
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemo = useAuthStore((s) => s.isDemo);
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const assistantEnabled = useAuthStore((s) => s.assistantEnabled === true);
  const outletId = useAuthStore((s) => s.outletId);
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [hintScreenKey, setHintScreenKey] = useState<string | null>(null);
  const hints = useOwlHintState();
  const { width: screenWidth } = useWindowDimensions();

  const access = { isAuthenticated, isDemo, tenantId, assistantEnabled, outletId };
  const isAvailable = isOwlAvailable(access) && tenantId !== null;
  const isButtonVisible = isAvailable && !isOpen && shouldShowOwlButton({ ...access, routeSegments: segments });
  const screenKey = screenKeyOf(segments);
  const canOfferHint = isButtonVisible && shouldOfferOwlHint({ ...hints, screenKey });
  const { markSeen } = hints;

  useEffect(() => {
    if (!canOfferHint) return;
    markSeen(screenKey);
    setHintScreenKey(screenKey);
  }, [canOfferHint, markSeen, screenKey]);

  if (!isAvailable || !tenantId) return null;
  const isHintVisible = isButtonVisible && hintScreenKey === screenKey;
  const hint = hintForRoute(segments);

  const openOwl = (prompt: string | null) => {
    hints.recordOpen();
    setHintScreenKey(null);
    if (prompt) setPendingPrompt({ id: Date.now(), text: prompt });
    setHasOpened(true);
    setIsOpen(true);
  };

  const openLink = (link: AssistantLink) => {
    const destination = resolveOwlLink(link.path, tenantSlug, getWebAppUrl());
    if (!destination) return;
    if (destination.kind === "app") {
      router.push(destination.href as never);
      return;
    }
    Linking.openURL(destination.url).catch(() => {
      // No browser to hand it to; the chat stays where it was.
    });
  };

  return (
    <>
      {hasOpened ? (
        <AssistantPanel
          tenantId={tenantId}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onOpenLink={openLink}
          pendingPrompt={pendingPrompt}
          onPendingPromptHandled={() => setPendingPrompt(null)}
        />
      ) : null}
      {isHintVisible ? (
        <OwlHintBubble
          key={screenKey}
          hint={hint}
          bottom={bottomOffset + OWL_MARGIN}
          right={OWL_MARGIN + OWL_SIZE + BUBBLE_GAP}
          maxWidth={Math.min(BUBBLE_MAX_WIDTH, screenWidth - OWL_SIZE - OWL_MARGIN * 3)}
          onAsk={() => openOwl(hint.prompt)}
          onDismiss={() => {
            hints.dismiss();
            setHintScreenKey(null);
          }}
          onDone={() => setHintScreenKey(null)}
        />
      ) : null}
      {isButtonVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask Owl, your store assistant"
          onPress={() => openOwl(null)}
          style={({ pressed }) => [styles.button, { bottom: bottomOffset + OWL_MARGIN }, pressed && styles.pressed]}
        >
          <Image source={OWL} style={styles.owl} alt="" accessibilityIgnoresInvertColors />
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: OWL_MARGIN,
    width: OWL_SIZE,
    height: OWL_SIZE,
    borderRadius: OWL_SIZE / 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    zIndex: 40,
    ...shadow.md,
    elevation: 8,
  },
  pressed: { transform: [{ scale: 0.95 }] },
  owl: { width: "100%", height: "100%", borderRadius: OWL_SIZE / 2 },
});
