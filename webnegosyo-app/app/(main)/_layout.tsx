import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme/colors";

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{symbol}</Text>;
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 0.5,
          height: 85,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => <TabIcon symbol="⊞" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ color }) => <TabIcon symbol="☰" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          tabBarLabel: "Analytics",
          tabBarIcon: ({ color }) => <TabIcon symbol="◔" color={color} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          tabBarLabel: "Trends",
          tabBarIcon: ({ color }) => <TabIcon symbol="⬈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="product-analytics"
        options={{
          tabBarLabel: "Products",
          tabBarIcon: ({ color }) => <TabIcon symbol="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{ href: null, title: "Scan QR" }}
      />
      <Tabs.Screen
        name="order/[orderId]"
        options={{ href: null, title: "Order Detail" }}
      />
      <Tabs.Screen
        name="printer-settings"
        options={{ href: null, title: "Printer Settings" }}
      />
    </Tabs>
  );
}
