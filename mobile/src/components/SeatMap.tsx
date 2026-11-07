import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { BRAND } from '@/components/Logo';
import { rupees } from '@/lib/format';
import { fonts } from '@/lib/theme';
import type { Seat, SeatClass } from '@/lib/types';

type Props = {
  seats: Seat[];
  classes: SeatClass[];
  selected: Set<string>;
  onToggle: (seat: Seat) => void;
  footer?: ReactNode;
};

// The hall is always dark, like the real one with the lights down
const HALL = {
  bg: BRAND.house,
  free: '#323874',
  freeEdge: '#7178B8',
  freeText: '#D3D7F2',
  taken: '#1B1E3B',
  label: '#7E84B3',
  gold: BRAND.gold,
};

function Chair({ size, state, number }: { size: number; state: 'free' | 'taken' | 'selected'; number?: number }) {
  const back = Math.round(size * 0.74);
  const base = Math.max(3, Math.round(size * 0.16));
  const fill = state === 'selected' ? BRAND.red : state === 'taken' ? HALL.taken : HALL.free;
  const edge = state === 'selected' ? '#FF6B7D' : state === 'taken' ? HALL.taken : HALL.freeEdge;
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: size - 2,
          height: back,
          backgroundColor: fill,
          borderColor: edge,
          borderWidth: 1.2,
          borderTopLeftRadius: size * 0.32,
          borderTopRightRadius: size * 0.32,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {number != null && size >= 20 && state !== 'taken' && (
          <Text style={{ fontSize: 9, fontFamily: fonts.bold, color: state === 'selected' ? '#FFFFFF' : HALL.freeText }}>{number}</Text>
        )}
      </View>
      <View
        style={{
          width: size,
          height: base,
          marginTop: 1,
          borderRadius: 2,
          backgroundColor: state === 'selected' ? BRAND.deep : state === 'taken' ? HALL.taken : HALL.freeEdge,
        }}
      />
    </View>
  );
}

/** The screen at the front: a glowing curve between red curtains, under a valance. */
function Screen({ width }: { width: number }) {
  const h = 64;
  const curtain = Math.max(18, width * 0.08);
  const scallops = 8;
  const sw = width / scallops;
  let valance = `M0 0H${width}V9`;
  for (let i = scallops; i > 0; i--) valance += `Q${(i - 0.5) * sw} 17 ${(i - 1) * sw} 9`;
  valance += 'Z';
  return (
    <Svg width={width} height={h}>
      <Defs>
        <LinearGradient id="seatCurtain" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRAND.red} />
          <Stop offset="1" stopColor={BRAND.deep} />
        </LinearGradient>
        <LinearGradient id="seatScreen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#DDE3FF" stopOpacity={0.75} />
        </LinearGradient>
      </Defs>
      <Path d={`M0 0h${curtain}c-2 20-1 40 3 ${h}H0Z`} fill="url(#seatCurtain)" />
      <Path d={`M${width} 0h-${curtain}c2 20 1 40-3 ${h}H${width}Z`} fill="url(#seatCurtain)" />
      <Path d={valance} fill={BRAND.red} />
      <Rect x={0} y={0} width={width} height={2.5} fill={HALL.gold} />
      <Path
        d={`M${curtain + 8} 46 Q ${width / 2} 26 ${width - curtain - 8} 46`}
        stroke="url(#seatScreen)"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The hall drawn from the seat grid: each seat sits at (r, c); empty grid
 * columns are aisles and empty rows are the gaps between classes. The screen
 * is at the top, so row A is nearest the screen.
 */
export const SeatMap = memo(function SeatMap({ seats, classes, selected, onToggle, footer }: Props) {
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
          <View style={[styles.rule, { backgroundColor: 'rgba(246,196,83,0.25)' }]} />
          <Text style={[styles.classText, { color: HALL.gold }]}>
            {k?.name.toUpperCase()}{k?.price_paise != null ? `  ·  ${rupees(k.price_paise)}` : ''}
          </Text>
          <View style={[styles.rule, { backgroundColor: 'rgba(246,196,83,0.25)' }]} />
        </View>,
      );
      lastClass = classId;
    }
    const byCol = new Map(rowSeats.map((s) => [s.c, s]));
    const label = rowSeats[0].row;
    out.push(
      <View key={r} style={[styles.row, { height: cell }]}>
        <Text style={[styles.rowLabel, { width: labelW, color: HALL.label }]}>{label}</Text>
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
              <Chair size={seatSize} state={taken ? 'taken' : isSel ? 'selected' : 'free'} number={seat.number} />
            </Pressable>
          );
        })}
        <Text style={[styles.rowLabel, { width: labelW, color: HALL.label }]}>{label}</Text>
      </View>,
    );
  }

  const screenW = cell * cols + labelW * 2;
  return (
    <View style={[styles.hall, { backgroundColor: HALL.bg }]}>
      {/* Light from the screen falling on the seats */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#DDE3FF" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#DDE3FF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d="M30 4 L70 4 L100 70 L0 70 Z" fill="url(#beam)" />
      </Svg>
      <Screen width={screenW} />
      <Text style={[styles.classText, { color: HALL.label, marginTop: -4, marginBottom: 2 }]}>SCREEN THIS WAY</Text>
      <SeatLegend />
      <View style={{ alignItems: 'center' }}>{out}</View>
      {footer}
    </View>
  );
});

export function SeatLegend() {
  const item = (label: string, state: 'free' | 'selected' | 'taken') => (
    <View style={styles.legendItem}>
      <Chair size={14} state={state} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: HALL.freeText }}>{label}</Text>
    </View>
  );
  return (
    <View style={styles.legend}>
      {item('Available', 'free')}
      {item('Yours', 'selected')}
      {item('Booked', 'taken')}
    </View>
  );
}

const styles = StyleSheet.create({
  hall: { borderRadius: 18, overflow: 'hidden', alignItems: 'center', paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { textAlign: 'center', fontSize: 11, fontFamily: fonts.medium },
  classHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 6, alignSelf: 'stretch', paddingHorizontal: 16 },
  rule: { flex: 1, height: 1 },
  classText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4 },
  legend: { flexDirection: 'row', gap: 18, justifyContent: 'center', marginTop: 10, marginBottom: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
