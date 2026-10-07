import React from "react";
import { StyleSheet, View } from "react-native";
import { useAuthStore } from "../../stores/auth-store";
import { hasPermission } from "../../lib/staff-permissions";
import { colors } from "../../theme/colors";
import { BackHeader } from "../BackHeader";
import { EmptyState } from "../EmptyState";

interface CustomersAccessGateProps {
  /** Header shown on the refusal, so the screen still reads as itself. */
  title: string;
  children: React.ReactNode;
}

/**
 * Renders `children` only for an account holding the `customers` grant.
 *
 * The tab bar hides guest-list screens from an ungranted staffer, but a route is
 * still reachable by deep link, a notification tap or restored navigation state.
 * RLS is the real boundary (the guest list reads nothing without the grant);
 * this makes the screen say so instead of rendering an error. A wrapper rather
 * than an early return because hook rules forbid returning before the wrapped
 * screen's hooks — and an unmounted screen never issues its reads at all.
 */
export function CustomersAccessGate({ title, children }: CustomersAccessGateProps) {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);

  if (hasPermission({ role, isOwner, permissions }, "customers")) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <BackHeader title={title} />
      <EmptyState title="No access" message="Your account cannot see the customer list." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
