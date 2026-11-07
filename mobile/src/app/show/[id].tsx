import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SeatLegend, SeatMap } from '@/components/SeatMap';
import { SeatView } from '@/components/SeatView';
import { Banner, Button, Card, Chip, ErrorState, Header, Loading, T } from '@/components/ui';
import { dayName, istDateKey, ordinal, rupees, time } from '@/lib/format';
import { fonts, useColors } from '@/lib/theme';
import type { Seat, SeatGroup, SeatMap as SeatMapData } from '@/lib/types';
import { useApi } from '@/lib/useApi';

/** ["H8","H9"] -> "H8–9" (seats side by side share a row) */
function groupLabel(labels: string[]) {
  if (labels.length < 2) return labels[0] ?? '';
  return `${labels[0]}–${labels[labels.length - 1].replace(/^D+/, '')}`;
}

function sideText(offset: number) {
  const a = Math.abs(offset);
  if (a < 0.25) return 'Centred';
  if (a < 0.6) return offset < 0 ? 'Slightly left' : 'Slightly right';
  return offset < 0 ? 'Left side' : 'Right side';
}

export default function PickSeats() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id, preselect, moved } = useLocalSearchParams<{ id: string; preselect?: string; moved?: string }>();
  const { data, error, loading, reload } = useApi<SeatMapData>(`/api/app/shows/${id}/seats`);

  const initial = useMemo(() => (preselect ? preselect.split(',').filter(Boolean) : []), [preselect]);
  const [picked, setPicked] = useState<string[]>(initial);
  const [groupSize, setGroupSize] = useState(Math.max(1, initial.length || 2));
  const [focusId, setFocusId] = useState<string | null>(initial[0] ?? null);
  const [limitHit, setLimitHit] = useState(false);
  const best = useApi<SeatGroup[]>(`/api/app/shows/${id}/best-seats?n=${groupSize}`);

  const seatById = useMemo(() => new Map((data?.seats ?? []).map((s) => [s.id, s])), [data]);
  // Seats sold since they were picked drop out of the selection
  const selected = useMemo(
    () => picked.filter((sid) => seatById.get(sid)?.state === 'free'),
    [picked, seatById],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  if (loading) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const priceOf = new Map(data.classes.map((k) => [k.id, k.price_paise ?? 0]));
  const classOf = new Map(data.classes.map((k) => [k.id, k.name]));
  const total = selected.reduce((sum, sid) => sum + (priceOf.get(seatById.get(sid)!.class_id) ?? 0), 0);

  const toggle = (seat: Seat) => {
    setLimitHit(false);
    setFocusId(seat.id);
    setPicked((cur) => {
      const valid = cur.filter((sid) => seatById.get(sid)?.state === 'free');
      if (valid.includes(seat.id)) return valid.filter((x) => x !== seat.id);
      if (valid.length >= data.max_seats) {
        setLimitHit(true);
        return valid;
      }
      return [...valid, seat.id];
    });
  };

  const takeGroup = (g: SeatGroup) => {
    setPicked(g.seat_ids);
    setFocusId(g.seat_ids[Math.floor(g.seat_ids.length / 2)]);
    setLimitHit(false);
  };

  // View from the focused seat (or the best suggestion before anything is picked)
  const focusSeat = (focusId && seatById.get(focusId)) || seatById.get(best.data?.[0]?.seat_ids[0] ?? '') || null;
  const rowsSorted = [...new Set(data.seats.map((s) => s.r))].sort((a, b) => a - b);
  const rowLetters = [...new Set([...data.seats].sort((a, b) => a.r - b.r).map((s) => s.row))];
  let view = null;
  if (focusSeat) {
    const rowSeats = data.seats.filter((s) => s.r === focusSeat.r);
    const minC = Math.min(...rowSeats.map((s) => s.c));
    const maxC = Math.max(...rowSeats.map((s) => s.c));
    const offset = maxC === minC ? 0 : ((focusSeat.c - minC) / (maxC - minC)) * 2 - 1;
    const rowIndex = rowsSorted.indexOf(focusSeat.r);
    const rowNumber = rowLetters.indexOf(focusSeat.row) + 1;
    const depth = rowIndex / Math.max(1, rowsSorted.length - 1);
    view = { seat: focusSeat, offset, rowIndex, rowNumber, sweet: depth > 0.35 && depth < 0.8 && Math.abs(offset) < 0.5 };
  }

  const show = data.show;
  const selectedLabels = selected.map((sid) => {
    const s = seatById.get(sid)!;
    return `${s.row}${s.number}`;
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        title={show.movie.title}
        subtitle={`${dayName(istDateKey(show.starts_at))} · ${time(show.starts_at)} · ${show.label}`}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        {moved ? (
          <Banner kind="info" title={`Moved you to ${moved.split(',').join(' and ')}`}>
            Someone else paid first for the seats you had. These are the closest free seats side by side. Tap a seat to change.
          </Banner>
        ) : null}

        {view && (
          <Card style={{ padding: 12 }}>
            <SeatView rowIndex={view.rowIndex} rowCount={rowsSorted.length} offset={view.offset} title={show.movie.title} />
            <View style={{ paddingHorizontal: 4, paddingTop: 12 }}>
              <T v="eyebrow">View from your seat</T>
              <T v="display" style={{ marginTop: 4 }}>Row {view.seat.row} · Seat {view.seat.number}</T>
              <T v="small" style={{ marginTop: 4 }}>
                {classOf.get(view.seat.class_id)} · {rupees(priceOf.get(view.seat.class_id) ?? 0)} · {ordinal(view.rowNumber)} row from the screen
              </T>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {view.sweet && <Chip label="Best balance of size and comfort" />}
                <Chip label={sideText(view.offset)} />
              </View>
              <T v="small" style={{ marginTop: 10, fontSize: 12 }}>Tap a seat to pick it and see the screen from there.</T>
            </View>
          </Card>
        )}

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="label">Best seats left</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T v="small">Seats for</T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer seats"
                onPress={() => setGroupSize((n) => Math.max(1, n - 1))}
                style={[styles.step, { borderColor: c.field }]}
              >
                <T v="label">−</T>
              </Pressable>
              <T v="label" style={{ minWidth: 16, textAlign: 'center' }}>{groupSize}</T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More seats"
                onPress={() => setGroupSize((n) => Math.min(data.max_seats, n + 1))}
                style={[styles.step, { borderColor: c.field }]}
              >
                <T v="label">+</T>
              </Pressable>
            </View>
          </View>
          <View style={{ gap: 8, marginTop: 12 }}>
            {(best.data ?? []).map((g, i) => {
              const isCurrent = g.seat_ids.length === selected.length && g.seat_ids.every((x) => selectedSet.has(x));
              return (
                <Pressable
                  key={g.seat_ids.join()}
                  accessibilityRole="button"
                  onPress={() => takeGroup(g)}
                  style={[
                    styles.group,
                    i === 0
                      ? { backgroundColor: c.warnSoft, borderColor: '#E3B341' }
                      : { backgroundColor: c.card, borderColor: c.line },
                    isCurrent && { borderColor: c.brand },
                  ]}
                >
                  <View>
                    <T style={{ fontFamily: 'monospace', fontWeight: '700', color: c.ink }}>{groupLabel(g.labels)}</T>
                    <T v="small" style={{ fontSize: 12 }}>{g.class_name} · {rupees(g.total_paise)}</T>
                  </View>
                  <T style={{ color: c.brand, fontFamily: fonts.bold, fontSize: 13 }}>
                    {isCurrent ? 'Selected' : i === 0 ? 'Best pick · Take these' : 'Take these'}
                  </T>
                </Pressable>
              );
            })}
            {best.data && best.data.length === 0 && (
              <T v="small">No {groupSize} seats left side by side. Pick seats on the map.</T>
            )}
          </View>
        </Card>

        <Card style={{ paddingHorizontal: 8 }}>
          <SeatLegend />
          <View style={{ height: 12 }} />
          <SeatMap seats={data.seats} classes={data.classes} selected={selectedSet} onToggle={toggle} />
          <T v="small" style={{ textAlign: 'center', marginTop: 12 }}>
            {data.seats_left} of {data.seats.length} seats left · up to {data.max_seats} per booking
          </T>
        </Card>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: c.card, borderTopColor: c.line, paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flex: 1 }}>
          <T v="label">
            {selected.length ? `${selected.length} seat${selected.length > 1 ? 's' : ''} · ${rupees(total)}` : 'No seats picked'}
          </T>
          <T v="small" numberOfLines={1} style={{ fontSize: 12, color: limitHit ? c.brand : c.muted }}>
            {limitHit ? `Up to ${data.max_seats} seats per booking` : selectedLabels.join(', ') || 'Tap seats on the map'}
          </T>
        </View>
        <Button
          title="Continue"
          disabled={!selected.length}
          onPress={() =>
            router.push({ pathname: '/checkout', params: { showId: show.id, seatIds: selected.join(',') } })
          }
          style={{ minWidth: 140 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
