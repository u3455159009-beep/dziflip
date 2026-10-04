import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '../../ui/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textFaint,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: t.scheme === 'dark' ? 'rgba(16,22,43,0.96)' : 'rgba(255,255,255,0.97)',
          borderTopColor: t.border,
          height: Platform.OS === 'ios' ? 86 : 68,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Budíky', tabBarIcon: ({ color, size }) => <Ionicons name="alarm-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Hudba', tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Ráno', tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Nastavení', tabBarIcon: ({ color, size }) => <Ionicons name="options-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
