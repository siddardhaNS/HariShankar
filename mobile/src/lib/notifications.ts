// App notifications: booking messages, show reminders and the theatre's offers.
//
// After login the app asks to allow notifications (Android 13+ asks once) and
// sends this phone's Expo push token to the server. On logout the token is
// removed, so the next person on the phone doesn't get the last one's tickets.
//
// Notifications need a development or store build made with EAS (it sets the
// project id below); they don't work in Expo Go. Without a project id this
// quietly does nothing, so development without EAS still works.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';

let currentToken: string | null = null;

// While the app is open, still show the notification at the top
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Ask for permission (once) and register this phone. Safe to call on every start. */
export async function registerForNotifications(): Promise<void> {
  try {
    if (!Device.isDevice || !projectId()) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tickets and offers',
        importance: AndroidImportance.HIGH,
        lightColor: '#D7263D',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return; // The customer said no: WhatsApp still works

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await api('/api/app/push-tokens', { method: 'POST', body: { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    currentToken = data;
  } catch {
    // No internet or no Google Play services: try again next start
  }
}

/** Call before the login token is cleared. */
export async function unregisterNotifications(): Promise<void> {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  await api('/api/app/push-tokens/remove', { method: 'POST', body: { token }, timeoutMs: 5000 }).catch(() => {});
}

/** Tapping a notification about a booking opens that ticket, also when the app was closed. */
export function useNotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = (last.notification.request.content.data as { booking_id?: unknown } | null)?.booking_id;
    if (typeof id === 'string') router.push({ pathname: '/booking/[id]', params: { id } });
  }, [last]);
}
