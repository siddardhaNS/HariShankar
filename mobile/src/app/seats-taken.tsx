import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Chip, T } from '@/components/ui';
import { useColors } from '@/lib/theme';

/** Mockup 3a: someone paid first for one of the seats. Nothing was charged. */
export default function SeatsTaken() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { showId, picked, taken, suggestIds, suggestLabels } = useLocalSearchParams<{
    showId: string;
    picked: string;
    taken: string;
    suggestIds?: string;
    suggestLabels?: string;
  }>();
  const takenList = (taken ?? '').split(',').filter(Boolean);
  const takenSet = new Set(takenList);
  const pickedList = (picked ?? '').split(',').filter(Boolean);
  const suggestion = (suggestLabels ?? '').split(',').filter(Boolean);

  const headline =
    takenList.length === 1 ? `${takenList[0]} was just booked` : `${takenList.length} of your seats were just booked`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 20 }}>
      <Card style={{ padding: 20 }}>
        <T v="eyebrow" style={{ color: c.brand }}>Paid first</T>
        <T v="display" style={{ marginTop: 6, fontSize: 30, lineHeight: 32 }}>{headline}</T>
        <T style={{ marginTop: 10, color: c.ink2 }}>
          Someone else paid for {takenList.length === 1 ? 'it' : 'them'} first. You haven&apos;t been charged.
        </T>

        <View style={{ marginTop: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T v="small" style={{ width: 90 }}>You picked</T>
            {pickedList.map((l) => (
              <Chip
                key={l}
                label={l}
                style={takenSet.has(l) ? { backgroundColor: c.brandSoft } : undefined}
              />
            ))}
            {takenList.length > 0 && <T v="small" style={{ color: c.brand }}>{takenList.join(', ')} gone</T>}
          </View>
          {suggestion.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <T v="small" style={{ width: 90 }}>New seats</T>
              {suggestion.map((l) => <Chip key={l} label={l} selected />)}
              <T v="small" style={{ fontSize: 12 }}>Side by side · closest free</T>
            </View>
          )}
        </View>
      </Card>

      <View style={{ flex: 1 }} />
      {suggestion.length > 0 ? (
        <Button
          title="See my new seats"
          onPress={() =>
            router.replace({
              pathname: '/show/[id]',
              params: { id: showId, preselect: suggestIds ?? '', moved: suggestLabels ?? '' },
            })
          }
        />
      ) : (
        <T v="small" style={{ textAlign: 'center', marginBottom: 10 }}>
          No {pickedList.length} seats are left side by side.
        </T>
      )}
      <Button
        title="I'll pick seats myself"
        kind="ghost"
        onPress={() => router.replace({ pathname: '/show/[id]', params: { id: showId } })}
        style={{ marginTop: 6 }}
      />
    </View>
  );
}
