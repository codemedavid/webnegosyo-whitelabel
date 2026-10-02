// AI offer ideas for the Growth tab. The AI reads the store's menu and what
// customers actually order together, then drafts combos, upgrades, pairings and
// a cart add-on row; one tap on "Create it" puts an idea live. The engine,
// quota and writes all live on the web app (`/api/boost/ai`) — the same ones
// Boost Sales uses on the web — so an idea created here is managed there too.
// This component only renders the state from `useBoostAi`.

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  BOOST_IDEA_KIND_META,
  createButtonLabel,
  generateButtonLabel,
  quotaLine,
  sortIdeasForDisplay,
  type BoostIdeaView,
} from "../lib/boost-ai";
import type { UseBoostAiResult } from "../lib/query/use-boost-ai";
import { formatCount } from "../lib/format";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";

interface BoostIdeasCardProps {
  boost: UseBoostAiResult;
  isDemo: boolean;
}

interface IdeaRowProps {
  idea: BoostIdeaView;
  boostEnabled: boolean;
  busyAction: "create" | "dismiss" | null;
  isLocked: boolean;
  onCreate: (id: string) => void;
  onDismiss: (id: string) => void;
}

function IdeaRow({ idea, boostEnabled, busyAction, isLocked, onCreate, onDismiss }: IdeaRowProps) {
  const meta = BOOST_IDEA_KIND_META[idea.kind];
  const isLive = idea.status === "applied";

  return (
    <View style={[styles.idea, isLive && styles.ideaLive]}>
      <View style={styles.ideaChips}>
        <View style={styles.kindChip}>
          <Text style={styles.kindChipText}>
            {meta.label} · {meta.moment}
          </Text>
        </View>
        {isLive && (
          <View style={styles.liveChip}>
            <Text style={styles.liveChipText}>✓ Live</Text>
          </View>
        )}
      </View>
      <Text style={styles.ideaTitle}>{idea.title}</Text>
      <Text style={styles.ideaDetail}>{idea.detail}</Text>
      <Text style={styles.ideaReason}>{idea.reason}</Text>

      {!isLive && (
        <View style={styles.ideaActions}>
          <TouchableOpacity
            style={[styles.createButton, isLocked && styles.disabled]}
            onPress={() => onCreate(idea.id)}
            disabled={isLocked}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${createButtonLabel(boostEnabled)}: ${idea.title}`}
          >
            {busyAction === "create" ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <Text style={styles.createButtonText}>{createButtonLabel(boostEnabled)}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dismissButton, isLocked && styles.disabled]}
            onPress={() => onDismiss(idea.id)}
            disabled={isLocked}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss: ${idea.title}`}
          >
            {busyAction === "dismiss" ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Text style={styles.dismissButtonText}>Not now</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export function BoostIdeasCard({ boost, isDemo }: BoostIdeasCardProps) {
  const { state, isLoading, loadError, refetch, busy, notice, actionError } = boost;
  const isLocked = busy !== null;
  const isGenerating = busy?.action === "generate";
  const ideas = state ? sortIdeasForDisplay(state.proposals) : [];
  const hasOpenIdeas = ideas.some((idea) => idea.status !== "applied");
  const latest = state?.latest ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>AI</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Offer ideas from your orders</Text>
          <Text style={styles.subtitle}>
            AI reads what your customers order together and drafts combos, upgrades and add-ons.
            Tap Create and it goes live.
          </Text>
        </View>
      </View>

      {isDemo ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>Sign in with a merchant account to get offer ideas.</Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : loadError || !state ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError ?? "Offer ideas are unavailable right now."}</Text>
          <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.7}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {!state.boostEnabled && hasOpenIdeas && (
            <View style={styles.offBanner}>
              <Text style={styles.offBannerText}>
                Boost Sales is off, so customers won’t see these offers yet. Creating one turns it on.
              </Text>
              <TouchableOpacity
                onPress={() => void boost.enable()}
                disabled={isLocked}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                {busy?.action === "enable" ? (
                  <ActivityIndicator color={colors.statusPending.text} />
                ) : (
                  <Text style={styles.offBannerAction}>Turn on now</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.generateButton, (isLocked || state.quota.left === 0) && styles.disabled]}
            onPress={() => void boost.generate()}
            disabled={isLocked || state.quota.left === 0}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {isGenerating ? (
              <View style={styles.generatingRow}>
                <ActivityIndicator color={colors.textOnDark} />
                <Text style={styles.generateButtonText}>Reading your orders…</Text>
              </View>
            ) : (
              <Text style={styles.generateButtonText}>{generateButtonLabel(state)}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.quota}>
            {isGenerating ? "This can take up to a minute." : quotaLine(state.quota)}
          </Text>

          {notice && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          )}
          {actionError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{actionError}</Text>
            </View>
          )}

          {latest?.status === "failed" && latest.error && !actionError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Last run didn’t finish (not counted): {latest.error}</Text>
            </View>
          )}

          {latest?.status === "succeeded" && latest.summary && (
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>
                {latest.ordersAnalyzed > 0
                  ? `What the AI saw in ${formatCount(latest.ordersAnalyzed)} orders`
                  : "Built from your menu (no order history yet)"}
              </Text>
              <Text style={styles.summaryText}>{latest.summary}</Text>
            </View>
          )}

          {ideas.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              boostEnabled={state.boostEnabled}
              busyAction={
                busy?.proposalId === idea.id && (busy.action === "create" || busy.action === "dismiss")
                  ? busy.action
                  : null
              }
              isLocked={isLocked}
              onCreate={(id) => void boost.create(id)}
              onDismiss={(id) => void boost.dismiss(id)}
            />
          ))}

          {ideas.length > 0 && (
            <Text style={styles.footnote}>
              Pause or edit anything you create under Boost Sales on the web dashboard.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.separator,
    ...shadow.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg, gap: spacing.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...typography.heading, fontSize: 14, color: colors.textOnDark, fontWeight: "800" },
  headerText: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.small, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },

  loader: { marginVertical: spacing.lg },
  disabled: { opacity: 0.5 },

  note: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
  },
  noteText: { ...typography.caption, color: colors.textSecondary },

  offBanner: {
    backgroundColor: colors.statusPending.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  offBannerText: { ...typography.caption, color: colors.statusPending.text },
  offBannerAction: { ...typography.caption, fontWeight: "800", color: colors.statusPending.text },

  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  generatingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  generateButtonText: { ...typography.heading, color: colors.textOnDark, fontWeight: "800" },
  quota: { ...typography.small, color: colors.textTertiary, textAlign: "center", marginTop: spacing.xs },

  noticeBox: {
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.success },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  errorText: { ...typography.caption, color: colors.danger },
  retryText: { ...typography.caption, fontWeight: "800", color: colors.danger },

  summary: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  summaryLabel: { ...typography.small, fontWeight: "700", color: colors.textSecondary, marginBottom: 2 },
  summaryText: { ...typography.body, color: colors.textPrimary, lineHeight: 20 },

  idea: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  ideaLive: { backgroundColor: colors.surfaceSubtle },
  ideaChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  kindChip: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  kindChipText: { ...typography.small, fontWeight: "700", color: colors.accent },
  liveChip: {
    backgroundColor: colors.successLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  liveChipText: { ...typography.small, fontWeight: "700", color: colors.success },
  ideaTitle: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
  ideaDetail: { ...typography.body, color: colors.textPrimary, marginTop: 2, lineHeight: 20 },
  ideaReason: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  ideaActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  createButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: "center",
  },
  createButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "800" },
  dismissButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  dismissButtonText: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },

  footnote: { ...typography.small, color: colors.textTertiary, marginTop: spacing.md },
});
