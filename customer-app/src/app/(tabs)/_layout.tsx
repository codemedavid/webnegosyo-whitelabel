import { Tabs } from 'expo-router'
import { TabBar } from '@/components/navigation/tab-bar'

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="order" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="rewards" />
      <Tabs.Screen name="account" />
    </Tabs>
  )
}
