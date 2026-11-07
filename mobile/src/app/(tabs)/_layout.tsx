import { Tabs } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';

import { fonts, useColors } from '@/lib/theme';

function MoviesIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Rect x={3} y={5} width={18} height={14} rx={2} />
      <Path d="M3 9h18M7 5v4M12 5v4M17 5v4" />
    </Svg>
  );
}

function TicketIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <Path d="M14 5v12" strokeDasharray="2 2" />
    </Svg>
  );
}

export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Movies', tabBarIcon: ({ color }) => <MoviesIcon color={String(color)} /> }} />
      <Tabs.Screen name="tickets" options={{ title: 'My tickets', tabBarIcon: ({ color }) => <TicketIcon color={String(color)} /> }} />
    </Tabs>
  );
}
