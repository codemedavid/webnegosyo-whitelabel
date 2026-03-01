import { View, Text, StyleSheet } from "react-native";

export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WebNegosyo Admin</Text>
      <Text>Redirecting...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
});
