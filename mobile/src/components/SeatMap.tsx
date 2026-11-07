import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { rupees } from '@/lib/format';
import { fonts, useColors } from '@/lib/theme';
import type { Seat, SeatClass } from '@/lib/types';

type Props = {
  seats: Seat[];
  classes: SeatClass[];
  selected: Set<string>;
  onToggle: (seat: Seat) => void;
};

/**
 * The hall drawn from the seat grid: each seat sits at (r, c); empty grid
 * columns are aisles and empty rows are the gaps between classes. The screen
 * is at the top, so row A is nearest the screen.
 */
export const SeatMap = memo(function SeatMap({ seats, classes, selected, onToggle }: Props) {
  const c = useColors();
  const { width } = useWindowDimensions();
  if (!seats.length) return null;

  const minC = Math.min(...seats.map((s) => s.c));
  const maxC = Math.max(...seats.map((s) => s.c));
  const cols = maxC - minC + 1;
  const labelW = 22;
  const cell = Math.min(30, Math.floor((width - 40 - labelW * 2) / cols));
  const seatSize = cell - 4;

  const rows = new Map<number, Seat[]>();
  for (const s of seats) rows.set(s.r, [...(rows.get(s.r) ?? []), s]);
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);
  const className = new Map(classes.map((k) => [k.id, k]));

  const out: React.ReactNode[] = [];
  let lastClass: string | null = null;
  for (const r of rowKeys) {
    const rowSeats = rows.get(r)!;
    const classId = rowSeats[0].class_id;
    if (classId !== lastClass) {
      const k = className.get(classId);
      out.push(
        <View key={`h${r}`} style={styles.classHead}>
          <Text style={[styles.classText, { color: c.muted }]}>{k?.name.toUpperCase()}</Text>
          {k?.price_paise != null && <Text style={[styles.classText, { color: c.ink2 }]}>{rupees(k.price_paise)}</Text>}
        </View>,
      );
      lastClass = classId;
    }
    const byCol = new Map(rowSeats.map((s) => [s.c, s]));
    const label = rowSeats[0].row;
    out.push(
      <View key={r} style={[styles.row, { height: cell }]}>
        <Text style={[styles.rowLabel, { width: labelW, color: c.muted }]}>{label}</Text>
        {Array.from({ length: cols }, (_, i) => {
          const seat = byCol.get(minC + i);
          if (!seat) return <View key={i} style={{ width: cell }} />;
          const isSel = selected.has(seat.id);
          const taken = seat.state !== 'free';
          return (
            <Pressable
              key={i}
              disabled={taken}
              onPress={() => onToggle(seat)}
              accessibilityRole="button"
              accessibilityLabel={`Seat ${seat.row}${seat.number}${taken ? ', not available' : isSel ? ', selected' : ''}`}
              accessibilityState={{ selected: isSel, disabled: taken }}
              hitSlop={2}
              style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={[
                  styles.seat,
                  { width: seatSize, height: seatSize },
                  taken
                    ? { backgroundColor: c.seatTaken, borderColor: c.seatTaken }
                    : isSel
                      ? { backgroundColor: c.brand, borderColor: c.brand }
                      : { backgroundColor: c.seatFree, borderColor: c.field },
                ]}
              >
                {seatSize >= 20 && !taken && (
                  <Text style={{ fontSize: 9, fontFamily: fonts.medium, color: isSel ? '#fff' : c.muted }}>{seat.number}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
        <Text style={[styles.rowLabel, { width: labelW, color: c.muted }]}>{label}</Text>
      </View>,
    );
  }

  const screenW = cell * cols;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={screenW} height={26}>
        <Path d={`M4 22 Q ${screenW / 2} 0 ${screenW - 4} 22`} stroke={c.brand} strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
      <Text style={[styles.classText, { color: c.muted, marginBottom: 6 }]}>SCREEN</Text>
      {out}
    </View>
  );
});

export function SeatLegend() {
  const c = useColors();
  const item = (label: string, style: object) => (
    <View style={styles.legendItem}>
      <View style={[styles.seat, { width: 14, height: 14 }, style]} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: c.muted }}>{label}</Text>
    </View>
  );
  return (
    <View style={styles.legend}>
      {item('Available', { backgroundColor: c.seatFree, borderColor: c.field })}
      {item('Selected', { backgroundColor: c.brand, borderColor: c.brand })}
      {item('Booked', { backgroundColor: c.seatTaken, borderColor: c.seatTaken })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { textAlign: 'center', fontSize: 11, fontFamily: fonts.medium },
  seat: { borderRadius: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  classHead: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 6 },
  classText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  legend: { flexDirection: 'row', gap: 18, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
