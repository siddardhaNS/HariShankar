import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { RobotoCondensed_700Bold } from '@expo-google-fonts/roboto-condensed';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth';
import { StaffProvider, useStaff } from '@/lib/staff';
import { useColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const c = useColors();
  const { ready: customerReady } = useAuth();
  const { ready: staffReady } = useStaff();
  const ready = customerReady && staffReady;
  const [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_500Medium, Roboto_700Bold, RobotoCondensed_700Bold });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync();
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="show/[id]" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="pay" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="seats-taken" options={{ gestureEnabled: false }} />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="login" options={{ presentation: 'modal' }} />
      <Stack.Screen name="profile" />
      <Stack.Screen name="staff/index" />
      <Stack.Screen name="staff/login" />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StaffProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <RootStack />
        </StaffProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
