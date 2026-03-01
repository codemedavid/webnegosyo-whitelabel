import { View, Text, StyleSheet } from "react-native";

export default function OrdersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      <Text>Real-time orders will appear here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
});
