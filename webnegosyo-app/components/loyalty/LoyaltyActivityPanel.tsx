import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { onlineManager } from '@tanstack/query-core';
import { colors, typography, spacing, radius } from '../../theme/colors';
import { normalizePhoneE164 } from '../../lib/phone';
import { useRefetchOnScreenFocus } from '../../lib/query/use-screen-focus';
import { LOYALTY_ACTIVITY_KINDS, LOYALTY_ACTIVITY_LABELS, type LoyaltyActivityEvent, type LoyaltyActivityKind } from '../../lib/loyalty/activity';
import { fetchLoyaltyActivity } from '../../lib/loyalty/activity-repo';

export function LoyaltyActivityPanel({ tenantId, customerKey, reloadKey = 0 }: { tenantId: string | null; customerKey?: string; reloadKey?: number }) {
  const [kind, setKind] = useState<LoyaltyActivityKind | ''>('');
  const [phone, setPhone] = useState('');
  const [searchedKey, setSearchedKey] = useState<string | undefined>();
  const [searchError, setSearchError] = useState<string | null>(null);
  const [events, setEvents] = useState<LoyaltyActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const identity = `${tenantId}:${customerKey ?? searchedKey ?? ''}:${kind}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const load = useCallback(async (after?: string) => {
    const ticket = ++request.current;
    if (!tenantId) { setEvents([]); setCursor(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const page = await fetchLoyaltyActivity(tenantId, { kind, customerKey: customerKey ?? searchedKey, cursor: after });
      if (ticket !== request.current || currentIdentity.current !== identity) return;
      setEvents(previous => after ? [...previous, ...page.events.filter(row => !previous.some(old => old.id === row.id))] : page.events);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (ticket === request.current && currentIdentity.current === identity) setError(cause instanceof Error ? cause.message : 'Activity could not be loaded.');
    } finally {
      if (ticket === request.current && currentIdentity.current === identity) setLoading(false);
    }
  }, [tenantId, kind, customerKey, searchedKey, identity]);
  const refresh = useCallback(() => load(), [load]);
  useRefetchOnScreenFocus({ enabled: Boolean(tenantId), staleMs: 0, dataUpdatedAt: 0, isFetching: loading, refetch: refresh });
  useEffect(() => {
    setEvents([]); setCursor(null); void load();
    const requests = request;
    const app = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const offOnline = onlineManager.subscribe(online => { if (online) void load(); });
    return () => { requests.current++; app.remove(); offOnline(); };
  }, [load, reloadKey]);

  return <View style={styles.panel}>
    <View style={styles.row}><Text style={styles.title}>{customerKey ? 'Member activity' : 'Activity'}</Text><TouchableOpacity accessibilityRole="button" disabled={loading} onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>Refresh</Text></TouchableOpacity></View>
    <Text style={styles.muted}>Earning, claims, and corrections, newest first.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {(['', ...LOYALTY_ACTIVITY_KINDS] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} style={[styles.button, kind === value && styles.selected]} onPress={() => setKind(value)}><Text style={[styles.buttonText, kind === value && styles.selectedText]}>{value ? LOYALTY_ACTIVITY_LABELS[value] : 'All activity'}</Text></TouchableOpacity>)}
    </ScrollView>
    {!customerKey ? <View style={styles.panel}><TextInput style={styles.input} keyboardType="phone-pad" accessibilityLabel="Customer phone" placeholder="Customer phone, e.g. 0917…" placeholderTextColor={colors.textSecondary} value={phone} onChangeText={setPhone} /><View style={styles.row}><TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
      const normalized = normalizePhoneE164(phone);
      if (phone.trim() && !normalized) { setSearchError('Enter a complete Philippine phone number.'); return; }
      setSearchError(null); setSearchedKey(normalized ? `phone:${normalized}` : undefined);
    }}><Text style={styles.buttonText}>Search</Text></TouchableOpacity>{searchedKey ? <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {setPhone('');setSearchedKey(undefined);setSearchError(null);}}><Text style={styles.buttonText}>Clear</Text></TouchableOpacity> : null}</View></View> : null}
    {searchError ? <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text> : null}
    {error ? <View style={styles.panel}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void load()}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity></View> : null}
    {loading ? <Text style={styles.muted}>Loading activity…</Text> : null}
    {!loading && !error && !events.length ? <View style={styles.card}><Text style={styles.eventTitle}>{kind || customerKey || searchedKey ? 'No matching activity' : 'No activity yet'}</Text><Text style={styles.muted}>Completed earning and reward changes appear here. Try another filter or refresh after a sale.</Text></View> : null}
    {events.map(event => <View key={event.id} style={styles.card}>
      <Text style={styles.eventTitle}>{LOYALTY_ACTIVITY_LABELS[event.kind] ?? event.kind}{event.delta !== null ? ` · ${event.delta > 0 ? '+' : ''}${event.delta}` : ''}</Text>
      <Text style={styles.body}>{event.programName}{event.rewardLabel ? ` · ${event.rewardLabel}` : ''}</Text>
      <Text style={styles.muted}>{new Date(event.occurredAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'long' })}</Text>
      <Text selectable style={styles.body}>Customer: {event.customerKey.replace(/^phone:/, '')}</Text>
      <Text selectable style={styles.muted}>Actor: {event.actorName ?? event.actorId ?? 'Not recorded'}</Text>
      {event.orderId ? <Text selectable style={styles.muted}>Order: {event.orderId}</Text> : null}
      {event.status ? <Text style={styles.muted}>Status: {event.previousStatus ?? 'Not recorded'} → {event.status}</Text> : null}
      {event.note ? <Text style={styles.body}>Reason: {event.note}</Text> : null}
    </View>)}
    {cursor ? <TouchableOpacity accessibilityRole="button" disabled={loading} style={styles.button} onPress={() => void load(cursor)}><Text style={styles.buttonText}>Load more</Text></TouchableOpacity> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  eventTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  body: { ...typography.caption, color: colors.textPrimary },
  muted: { ...typography.small, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  card: { padding: spacing.md, gap: spacing.xs, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, borderRadius: radius.md },
  filters: { gap: spacing.xs, paddingVertical: spacing.xs },
  input: { ...typography.body, padding: spacing.sm, color: colors.textPrimary, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator, borderRadius: radius.md },
  button: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.card, minHeight: 44, justifyContent: 'center' },
  buttonText: { ...typography.caption, fontWeight: '600', color: colors.textPrimary },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedText: { color: colors.textOnDark },
});
