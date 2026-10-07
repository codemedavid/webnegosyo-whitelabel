import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "../Modal";
import { Icon, type IconName } from "../Icon";
import { colors } from "../../theme/colors";
import { listConversations, type ConversationSummary } from "../../lib/assistant/api";
import { collectChips, MAX_INPUT_CHARS, MAX_PHOTOS_PER_MESSAGE, STARTERS } from "../../lib/assistant/presentation";
import { pickMenuPhotos, type PickMenuPhotosOutcome } from "../../lib/assistant/menu-photos";
import { useAssistantChat } from "../../lib/assistant/use-assistant-chat";
import { useVoiceNote } from "../../lib/assistant/use-voice-note";
import { joinTranscript } from "../../lib/assistant/voice";
import type { AssistantLink } from "../../lib/assistant/types";
import { AssistantMessageView } from "./AssistantMessageView";
import { PastChatsList } from "./PastChatsList";
import { VoiceRecordingBar } from "./VoiceRecordingBar";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OWL_SMALL = require("../../assets/assistant/owl-small.png");

/** The panel's warm canvas (web: bg-[#FBFAF7]). */
const PANEL_BACKGROUND = "#FBFAF7";

const PHOTO_NOTICES: Readonly<Record<Exclude<PickMenuPhotosOutcome["status"], "picked" | "canceled">, string>> = {
  "permission-denied": "Allow photo access in Settings to send a menu photo.",
  unavailable: "Sending photos needs the latest app update.",
  "too-large": "That photo is too large. Try fewer at a time.",
};

/** A question asked from outside the panel (the owl's hint bubble). */
export type PendingPrompt = { id: number; text: string };

type Props = {
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenLink: (link: AssistantLink) => void;
  pendingPrompt?: PendingPrompt | null;
  onPendingPromptHandled?: () => void;
};

function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function PromptChip({ label, onPress, isSmall = false }: { label: string; onPress: () => void; isSmall?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <Text style={isSmall ? styles.chipTextSmall : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/** Full-screen Owl chat — the web panel's phone layout, on a native modal. */
export function AssistantPanel({ tenantId, isOpen, onClose, onOpenLink, pendingPrompt = null, onPendingPromptHandled }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const { messages, status, error, isBusy, send, stop, startOver, reopen } = useAssistantChat(tenantId);
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // The transcript lands in the composer: the owner checks it before sending.
  const voice = useVoiceNote(tenantId, (text) => setDraft((current) => joinTranscript(current, text)));
  const { cancel: cancelVoice } = voice;

  useEffect(() => {
    if (!isOpen) cancelVoice();
  }, [isOpen, cancelVoice]);

  const submit = (text: string) => {
    if ((!text.trim() && photos.length === 0) || isBusy) return;
    setDraft("");
    setPhotos([]);
    setPhotoNotice(null);
    send(text, photos);
  };

  const addPhotos = async () => {
    setPhotoNotice(null);
    try {
      const outcome = await pickMenuPhotos(photos, MAX_PHOTOS_PER_MESSAGE - photos.length);
      if (outcome.status === "picked") {
        setPhotos((current) => [...current, ...outcome.photos].slice(0, MAX_PHOTOS_PER_MESSAGE));
        if (outcome.isTrimmed) setPhotoNotice(PHOTO_NOTICES["too-large"]);
      } else if (outcome.status !== "canceled") {
        setPhotoNotice(PHOTO_NOTICES[outcome.status]);
      }
    } catch {
      setPhotoNotice("That photo could not be added.");
    }
  };

  // A hint-bubble question is asked as soon as the panel opens. If an answer
  // is still streaming it waits in the composer instead of being dropped.
  const pendingPromptId = pendingPrompt?.id;
  useEffect(() => {
    if (!isOpen || !pendingPrompt) return;
    setIsHistoryOpen(false);
    if (isBusy) {
      setDraft(pendingPrompt.text);
    } else {
      send(pendingPrompt.text);
    }
    onPendingPromptHandled?.();
    // Only a new prompt (or the panel opening on one) should fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPromptId]);

  const openHistory = async () => {
    setIsHistoryOpen(true);
    setHistory(null);
    setHistoryError(null);
    try {
      setHistory(await listConversations(tenantId));
    } catch (failure) {
      setHistoryError(failure instanceof Error ? failure.message : "Could not load your chats.");
    }
  };

  const openChat = async (conversationId: string) => {
    setHistoryError(null);
    try {
      await reopen(conversationId);
      setIsHistoryOpen(false);
    } catch (failure) {
      setHistoryError(failure instanceof Error ? failure.message : "Could not open that chat.");
    }
  };

  const newChat = () => {
    startOver();
    setIsHistoryOpen(false);
  };

  const followLink = (link: AssistantLink) => {
    onClose();
    onOpenLink(link);
  };

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const chips = !isBusy && lastAssistant ? collectChips(lastAssistant) : [];
  const canSend = draft.trim().length > 0 || photos.length > 0;

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Image source={OWL_SMALL} style={styles.headerOwl} alt="" accessibilityIgnoresInvertColors />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Owl</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Your store assistant
            </Text>
          </View>
          <HeaderButton icon="clock" label="Past chats" onPress={() => void openHistory()} />
          <HeaderButton icon="plus" label="New chat" onPress={newChat} />
          <HeaderButton icon="close" label="Close assistant" onPress={onClose} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {isHistoryOpen ? (
            <PastChatsList chats={history} error={historyError} onOpen={(id) => void openChat(id)} onBack={() => setIsHistoryOpen(false)} />
          ) : messages.length === 0 ? (
            <View style={styles.welcome}>
              <View style={styles.welcomeText}>
                <Text style={styles.welcomeTitle}>Hi! What would you like to know?</Text>
                <Text style={styles.welcomeSubtitle}>
                  I read your real sales and menu, then suggest what to do next. Send a photo of a menu and I’ll add its dishes.
                </Text>
              </View>
              {STARTERS.map((group) => (
                <View key={group.title} style={styles.starterGroup}>
                  <Text style={styles.starterTitle}>{group.title.toUpperCase()}</Text>
                  <View style={styles.chipRow}>
                    {group.prompts.map((prompt) => (
                      <PromptChip key={prompt} label={prompt} onPress={() => submit(prompt)} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            messages.map((message) => <AssistantMessageView key={message.id} message={message} tenantId={tenantId} onOpenLink={followLink} />)
          )}
          {!isHistoryOpen && status === "submitted" ? <Text style={styles.thinking}>Thinking…</Text> : null}
          {!isHistoryOpen && error ? <Text style={styles.error}>{error}</Text> : null}
          {!isHistoryOpen && chips.length > 0 ? (
            <View style={styles.chipRow}>
              {chips.map((chip) => (
                <PromptChip key={chip.prompt} label={chip.label} onPress={() => submit(chip.prompt)} isSmall />
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {photos.length > 0 || photoNotice ? (
            <View style={styles.photoTray}>
              {photos.length > 0 ? (
                <View style={styles.photoRow}>
                  {photos.map((photo, index) => (
                    <View key={index}>
                      <Image source={{ uri: photo }} style={styles.photoThumb} alt={`Photo ${index + 1}`} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove photo ${index + 1}`}
                        hitSlop={8}
                        onPress={() => setPhotos((current) => current.filter((_, other) => other !== index))}
                        style={styles.photoRemove}
                      >
                        <Icon name="close" size={12} color={colors.textOnDark} strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              {photoNotice ? <Text style={styles.photoNotice}>{photoNotice}</Text> : null}
            </View>
          ) : null}
          {voice.error ? <Text style={styles.voiceError}>{voice.error}</Text> : null}
          <View style={styles.composer}>
            {voice.state === "recording" ? (
              <VoiceRecordingBar onFinish={voice.finish} />
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a menu photo"
                  accessibilityState={{ disabled: isBusy || photos.length >= MAX_PHOTOS_PER_MESSAGE }}
                  disabled={isBusy || photos.length >= MAX_PHOTOS_PER_MESSAGE}
                  onPress={() => void addPhotos()}
                  style={({ pressed }) => [styles.photoButton, pressed && styles.pressed, (isBusy || photos.length >= MAX_PHOTOS_PER_MESSAGE) && styles.sendDisabled]}
                >
                  <Icon name="photo" size={22} color={colors.textSecondary} />
                </Pressable>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => submit(draft)}
                  submitBehavior="submit"
                  returnKeyType="send"
                  multiline
                  maxLength={MAX_INPUT_CHARS}
                  editable={voice.state !== "transcribing"}
                  placeholder={
                    voice.state === "transcribing"
                      ? "Turning your voice into text…"
                      : photos.length > 0
                        ? "Add a note, or just send"
                        : "Ask about sales, menu, customers…"
                  }
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Message Owl"
                  style={styles.input}
                />
                <ComposerAction
                  isBusy={isBusy}
                  isTranscribing={voice.state === "transcribing"}
                  canSend={canSend}
                  onStop={stop}
                  onTalk={() => void voice.start()}
                  onSend={() => submit(draft)}
                />
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type ComposerActionProps = {
  isBusy: boolean;
  isTranscribing: boolean;
  canSend: boolean;
  onStop: () => void;
  onTalk: () => void;
  onSend: () => void;
};

/** The composer's one round button: stop an answer, wait for a transcript, talk, or send. */
function ComposerAction({ isBusy, isTranscribing, canSend, onStop, onTalk, onSend }: ComposerActionProps) {
  if (isBusy) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={onStop} style={styles.sendButton}>
        <View style={styles.stopSquare} />
      </Pressable>
    );
  }
  if (isTranscribing) {
    return (
      <View accessibilityLabel="Turning your voice into text" style={styles.sendButton}>
        <ActivityIndicator color={colors.textOnDark} />
      </View>
    );
  }
  // An empty composer offers the mic, like a messaging app; typing turns it into Send.
  if (!canSend) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Talk to Owl" onPress={onTalk} style={styles.sendButton}>
        <Icon name="mic" size={20} color={colors.textOnDark} strokeWidth={2} />
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={onSend} style={styles.sendButton}>
      <Text style={styles.sendArrow}>↑</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PANEL_BACKGROUND },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  headerOwl: { width: 32, height: 32, borderRadius: 16 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.1, color: colors.textPrimary },
  headerSubtitle: { fontSize: 11, color: colors.textSecondary },
  headerButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pressed: { backgroundColor: colors.primaryLight },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
  welcome: { gap: 16 },
  welcomeText: { gap: 4 },
  welcomeTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  welcomeSubtitle: { fontSize: 14, color: colors.textSecondary },
  starterGroup: { gap: 6 },
  starterTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, color: colors.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.card, borderRadius: 9999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 14, color: colors.textPrimary },
  chipTextSmall: { fontSize: 13, fontWeight: "500", color: colors.textPrimary },
  thinking: { fontSize: 13, color: colors.textSecondary },
  error: { fontSize: 14, color: "#8C2A1E", backgroundColor: colors.dangerLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: "hidden" },
  composerWrap: { paddingHorizontal: 12, paddingTop: 12, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  photoButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  photoTray: { gap: 6, marginBottom: 10 },
  photoRow: { flexDirection: "row", gap: 10 },
  photoThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceSubtle },
  photoRemove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  photoNotice: { fontSize: 13, color: "#8C2A1E" },
  input: { flex: 1, minHeight: 42, maxHeight: 128, backgroundColor: colors.surfaceSubtle, borderRadius: 20, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 15, color: colors.textPrimary },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.3 },
  sendArrow: { fontSize: 20, fontWeight: "700", color: colors.textOnDark, marginTop: -2 },
  voiceError: { fontSize: 13, color: "#8C2A1E", marginBottom: 8 },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.textOnDark },
});
