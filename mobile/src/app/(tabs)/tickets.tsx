import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poster } from '@/components/Poster';
import { Button, Card, Chip, ErrorState, Loading, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dayName, istDateKey, rupees, time } from '@/lib/format';
import { useColors } from '@/lib/theme';
import type { Booking } from '@/lib/types';
import { useApi } from '@/lib/useApi';

/** A show is "coming up" until it ends (start + running time + interval). */
function splitTickets(all: Booking[]) {
  const now = Date.now();
  const ends = (b: Booking) => new Date(b.show.starts_at).getTime() + (b.show.movie.runtime_min + 15) * 60_000;
  const upcoming = all.filter((b) => ends(b) > now && (b.status === 'confirmed' || b.status === 'payment_review')).reverse();
  const refunded = all.filter((b) => b.status === 'refunded' || b.status === 'cancelled');
  return { upcoming, refunded, past: all.filter((b) => !upcoming.includes(b) && !refunded.includes(b)) };
}

function TicketRow({ b, past }: { b: Booking; past?: boolean }) {
  const c = useColors();
  const checking = b.status === 'payment_review';
  const refunded = b.status !== 'confirmed' && !checking;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ flexDirection: 'row', gap: 14, opacity: past ? 0.75 : 1 }}>
        <Poster movie={b.show.movie} width={58} radius={8} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T v="label" style={{ flex: 1 }} numberOfLines={1}>{b.show.movie.title}</T>
            <Chip
              label={checking ? 'Checking payment' : refunded ? 'Refunded' : past ? 'Watched' : 'Confirmed'}
              style={
                checking ? { backgroundColor: c.warnSoft }
                  : refunded ? { backgroundColor: c.brandSoft }
                    : !past ? { backgroundColor: c.okSoft } : undefined
              }
            />
          </View>
          <T v="small" style={{ marginTop: 2 }}>
            {dayName(istDateKey(b.show.starts_at))} · {time(b.show.starts_at)} · {b.show.label}
          </T>
          <T v="small" style={{ marginTop: 2 }}>
            {b.seats.map((s) => s.label).join(', ')} · {refunded ? `${rupees(b.refund_paise)} refunded` : rupees(b.price.total_paise)}
          </T>
          <T style={{ fontFamily: 'monospace', fontWeight: '700', color: c.ink2, marginTop: 4 }}>{b.code}</T>
        </View>
      </Card>
    </Pressable>
  );
}

export default function MyTickets() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { customer } = useAuth();
  const { data, error, loading, refreshing, reload } = useApi<Booking[]>(customer ? '/api/app/bookings' : null);

  const top = { paddingTop: insets.top + 20 };

  if (!customer) {
    return (
      <View style={[{ flex: 1, padding: 20, backgroundColor: c.bg }, top]}>
        <T v="display" style={{ fontSize: 30, lineHeight: 32 }}>My tickets</T>
        <Card style={{ marginTop: 20 }}>
          <T v="label">Log in to see your tickets</T>
          <T v="small" style={{ marginTop: 4 }}>Every ticket booked on your mobile number shows up here.</T>
          <Button title="Log in" onPress={() => router.push('/login')} style={{ marginTop: 14 }} />
        </Card>
      </View>
    );
  }
  if (loading) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const { upcoming, refunded, past } = splitTickets(data ?? []);

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[{ padding: 20, gap: 12, paddingBottom: 40 }, top]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} colors={[c.brand]} />}
    >
      <T v="display" style={{ fontSize: 30, lineHeight: 32 }}>My tickets</T>
      <T v="display" style={{ marginTop: 12 }}>Coming up</T>
      {upcoming.length ? (
        upcoming.map((b) => <TicketRow key={b.id} b={b} />)
      ) : (
        <Card>
          <T v="small">No upcoming shows booked.</T>
          <Button title="Find a show" kind="secondary" onPress={() => router.navigate('/')} style={{ marginTop: 12 }} />
        </Card>
      )}
      {past.length > 0 && (
        <>
          <T v="display" style={{ marginTop: 16 }}>Already watched</T>
          {past.map((b) => <TicketRow key={b.id} b={b} past />)}
        </>
      )}
      {refunded.length > 0 && (
        <>
          <T v="display" style={{ marginTop: 16 }}>Refunded</T>
          {refunded.map((b) => <TicketRow key={b.id} b={b} past />)}
        </>
      )}
    </ScrollView>
  );
}
