import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniHall, SeatView } from '@/components/SeatView';
import { Button } from '@/components/ui';
import { rupees } from '@/lib/format';
import { type HallGeo, rowFloor, rowZ, seatMetrics, type Vec3 } from '@/lib/hall';
import { fonts } from '@/lib/theme';
import type { Seat } from '@/lib/types';

const INK = '#F1F2F8';
const MUTED = '#9A9FBB';

export function sideWords(m: ReturnType<typeof seatMetrics>) {
  return m.side === 'centre' ? 'centred' : `${m.side} of centre`;
}

/** The three numbers under the view: distance, how wide the screen looks, how far off centre */
export function SeatStats({ seat, geo, compact }: { seat: Seat; geo: HallGeo; compact?: boolean }) {
  const m = seatMetrics(seat, geo);
  const stats = [
    { v: `${m.toScreen.toFixed(1)} m`, k: 'to the screen' },
    { v: `${Math.round(m.fov)}°`, k: 'screen fills' },
    { v: m.side === 'centre' ? 'Centre' : `${m.offCentre.toFixed(1)} m`, k: sideWords(m) },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {stats.map((s) => (
        <View key={s.k} style={[styles.stat, compact && { paddingVertical: 8 }]}>
          <Text style={styles.statV}>{s.v}</Text>
          <Text style={styles.statK}>{s.k}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Full-screen "view from your seat", opened when a seat is picked. The
 * camera flies in from the back of the hall and settles at the seat.
 */
export function SeatPreview({
  geo,
  seat,
  picked,
  className,
  pricePaise,
  poster,
  title,
  onClose,
  onChange,
  onPick,
}: {
  geo: HallGeo;
  seat: Seat | null;
  picked: Set<string>;
  className: string;
  pricePaise: number;
  poster: string | null;
  title: string;
  onClose: () => void;
  onChange: () => void; // drop this seat and go back to the map
  onPick: () => void; // pick a seat that was only being looked at
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  if (!seat) return null;

  const m = seatMetrics(seat, geo);
  const isPicked = picked.has(seat.id);
  const lastR = Math.max(...geo.seats.map((s) => s.r));
  const flyFrom: Vec3 = [geo.centreX, rowFloor(lastR, geo) + 3.2, rowZ(lastR, geo) + 4];
  const viewH = Math.min(height * 0.52, width * 1.05);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to the seat map" onPress={onClose} style={styles.back}>
            <Text style={{ color: INK, fontSize: 22, marginTop: -2 }}>‹</Text>
          </Pressable>
          <View style={styles.pill}>
            <View style={styles.dot} />
            <Text style={styles.pillText}>View from {seat.row}{seat.number}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <SeatView
          key={seat.id}
          geo={geo}
          seat={seat}
          picked={picked}
          poster={poster}
          title={title}
          width={width}
          height={viewH}
          flyFrom={flyFrom}
          id="pv"
        />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grab} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{m.label.toUpperCase()}</Text>
              <Text style={styles.title}>Row {seat.row}, Seat {seat.number}</Text>
              <Text style={styles.sub}>{className} · {rupees(pricePaise)}</Text>
            </View>
            <MiniHall seats={geo.seats} seat={seat} />
          </View>
          <View style={{ marginTop: 14 }}>
            <SeatStats seat={seat} geo={geo} />
          </View>
          <Text style={styles.note}>Distances are approximate.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable
              accessibilityRole="button"
              onPress={isPicked ? onChange : onClose}
              style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: INK, fontFamily: fonts.bold, fontSize: 15 }}>{isPicked ? 'Change seat' : 'Close'}</Text>
            </Pressable>
            <Button
              title={isPicked ? `Keep seat · ${rupees(pricePaise)}` : `Pick seat · ${rupees(pricePaise)}`}
              onPress={isPicked ? onClose : onPick}
              style={[styles.btn, { flex: 1.4 }]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060B' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1B1E33', alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1B1E33', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CC27F' },
  pillText: { color: INK, fontFamily: fonts.medium, fontSize: 13 },
  sheet: { flex: 1, marginTop: -18, backgroundColor: '#12142A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#3A3F5C', marginBottom: 12 },
  eyebrow: { color: '#4CC27F', fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: INK, fontFamily: fonts.display, fontSize: 26, marginTop: 4 },
  sub: { color: MUTED, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  stat: { flex: 1, backgroundColor: '#1B1E33', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 12 },
  statV: { color: INK, fontFamily: fonts.bold, fontSize: 18 },
  statK: { color: MUTED, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  note: { color: MUTED, fontFamily: fonts.regular, fontSize: 11, marginTop: 10 },
  btn: { flex: 1 },
  ghost: { borderRadius: 12, borderWidth: 1, borderColor: '#3A3F5C', backgroundColor: '#1B1E33', alignItems: 'center', justifyContent: 'center', minHeight: 48 },
});
