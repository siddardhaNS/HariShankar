import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { BRAND, StageScene } from '@/components/Logo';
import { Button } from '@/components/ui';
import { useMaintenance } from '@/lib/maintenance';
import { fonts } from '@/lib/theme';

/** Shown instead of the customer app while the theatre has it closed for maintenance */
export function MaintenanceScreen() {
  const insets = useSafeAreaInsets();
  const { message, checking, check } = useMaintenance();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.middle}>
        <Svg width={140} height={140} viewBox="0 0 100 100">
          <StageScene id="mt" />
        </Svg>
        <Text style={styles.eyebrow}>BACK SOON</Text>
        <Text style={styles.title}>Hari Shankar{'\n'}Picture Palace</Text>
        <Text style={styles.message}>{message || 'The app is down for maintenance. Please check back soon.'}</Text>
        <Button title={checking ? 'Checking…' : 'Try again'} onPress={() => void check()} loading={checking} style={{ minWidth: 180, marginTop: 8 }} />
      </View>

      {/* Gate staff still scan tickets during maintenance */}
      <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.push('/staff/login')}>
        <Text style={styles.staff}>Theatre staff</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: BRAND.house, alignItems: 'center', paddingHorizontal: 28 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  eyebrow: { color: BRAND.gold, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2.4, marginTop: 8 },
  title: { color: '#FFFFFF', fontFamily: fonts.display, fontSize: 30, lineHeight: 34, textAlign: 'center', textTransform: 'uppercase' },
  message: { color: '#D3D7F2', fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 340 },
  staff: { color: '#9A9FBB', fontFamily: fonts.medium, fontSize: 13, textDecorationLine: 'underline' },
});
