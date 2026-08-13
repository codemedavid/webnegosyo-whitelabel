import React from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AddContactForm } from '../contacts/AddContactForm';
import type { TodayContactPreview } from './computeTodayViewModel';
import type { FollowUpSendResult } from './runFollowUps';
import { useTodayScreen } from './useTodayScreen';
import type { UseTodayScreenDeps } from './useTodayScreen';
import { colors, fontSize, radius, spacing } from '../../ui/theme';

export interface TodayScreenProps {
  deps: UseTodayScreenDeps;
}

export function TodayScreen({ deps }: TodayScreenProps): React.JSX.Element {
  const { isLoading, isSending, viewModel, results, runFollowUps, addContact } = useTodayScreen(deps);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (viewModel.emptyStateMessage) {
    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headerTitle}>Today</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{viewModel.emptyStateMessage}</Text>
        </View>
        <AddContactForm onSubmit={addContact} />
      </ScrollView>
    );
  }

  const sentCount = results?.filter((result) => result.status === 'sent').length ?? 0;
  const hasFailures = results?.some((result) => result.status === 'failed') ?? false;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.scrollContent}
      data={viewModel.previews}
      keyExtractor={(item) => item.contact.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Today</Text>
          <Text style={styles.headerSubtitle}>{viewModel.dueContacts.length} follow-ups due today</Text>
        </View>
      }
      renderItem={({ item }) => {
        const sendResult = results?.find((result) => result.contactId === item.contact.id);
        return (
          <View style={styles.card}>
            <Text style={styles.cardName}>{item.contact.name}</Text>
            <Text style={styles.cardPhone}>{item.contact.phone}</Text>
            <Text style={[styles.cardMessage, statusTextStyle(item, sendResult)]}>
              {describeContactStatus(item, sendResult)}
            </Text>
          </View>
        );
      }}
      ListFooterComponent={
        <View style={styles.footer}>
          <Pressable
            onPress={runFollowUps}
            disabled={isSending}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.runButton,
              isSending && styles.runButtonDisabled,
              pressed && !isSending && styles.runButtonPressed,
            ]}
          >
            <Text style={styles.runButtonText}>{isSending ? 'Sending...' : 'Run Follow-ups'}</Text>
          </Pressable>
          {results && (
            <View style={[styles.summaryBanner, hasFailures ? styles.summaryBannerWarning : styles.summaryBannerSuccess]}>
              <Text style={styles.summaryBannerText}>
                Sent {sentCount} of {results.length}
              </Text>
            </View>
          )}
          <AddContactForm onSubmit={addContact} />
        </View>
      }
    />
  );
}

function describeContactStatus(item: TodayContactPreview, sendResult: FollowUpSendResult | undefined): string {
  if (!sendResult) {
    return item.error ? `Error: ${item.error}` : item.message;
  }
  if (sendResult.status === 'failed') {
    return `Failed: ${sendResult.errorMessage}`;
  }
  if (sendResult.status === 'skipped') {
    return `Skipped: ${sendResult.errorMessage}`;
  }
  return 'Sent';
}

function statusTextStyle(item: TodayContactPreview, sendResult: FollowUpSendResult | undefined) {
  if (!sendResult) {
    return item.error ? styles.textDanger : styles.textSecondary;
  }
  if (sendResult.status === 'failed') {
    return styles.textDanger;
  }
  if (sendResult.status === 'skipped') {
    return styles.textWarning;
  }
  return styles.textSuccess;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  list: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardPhone: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  cardMessage: {
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  textSecondary: {
    color: colors.textSecondary,
  },
  textSuccess: {
    color: colors.success,
  },
  textDanger: {
    color: colors.danger,
  },
  textWarning: {
    color: colors.warning,
  },
  footer: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  runButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  runButtonDisabled: {
    backgroundColor: colors.primaryDisabled,
  },
  runButtonPressed: {
    opacity: 0.85,
  },
  runButtonText: {
    color: colors.onPrimary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  summaryBanner: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  summaryBannerSuccess: {
    backgroundColor: colors.successBg,
  },
  summaryBannerWarning: {
    backgroundColor: colors.warningBg,
  },
  summaryBannerText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
