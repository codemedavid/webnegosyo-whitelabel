import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { sendSms } from './src/native';
import { openAppRepositories } from './src/repositories/sqlite/database';
import type { AppRepositories } from './src/repositories/sqlite/database';
import { TodayScreen } from './src/screens/today/TodayScreen';
import type { UseTodayScreenDeps } from './src/screens/today/useTodayScreen';
import { colors, fontSize, spacing } from './src/ui/theme';

const STAGGER_MS = 3000;

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAndroidStatusBarPadding(): number {
  return Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0;
}

export default function App() {
  const [repositories, setRepositories] = useState<AppRepositories | null>(null);
  const rootStyle = [styles.container, { paddingTop: getAndroidStatusBarPadding() }];

  useEffect(() => {
    openAppRepositories().then(setRepositories);
  }, []);

  if (!repositories) {
    return (
      <View testID="app-root" style={[rootStyle, styles.loadingContainer]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  const deps: UseTodayScreenDeps = {
    contactsRepository: repositories.contacts,
    templatesRepository: repositories.templates,
    sendLogRepository: repositories.sendLog,
    sendSms,
    generateId,
    getToday,
    now: () => new Date().toISOString(),
    wait,
    staggerMs: STAGGER_MS,
  };

  return (
    <View testID="app-root" style={rootStyle}>
      <TodayScreen deps={deps} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
});
