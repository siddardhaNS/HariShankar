import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poster } from '@/components/Poster';
import { Button, Card, Chip, ErrorState, Loading, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dayName, dayParts, runtime, time } from '@/lib/format';
import { fonts, useColors, type Colors } from '@/lib/theme';
import type { Home, MovieShows, ShowTime } from '@/lib/types';
import { useApi } from '@/lib/useApi';

function availabilityText(s: ShowTime) {
  switch (s.availability) {
    case 'sold_out':
      return 'Sold out';
    case 'almost_full':
      return `${s.seats_left} left`;
    case 'filling_fast':
      return 'Filling fast';
    default:
      return 'Available';
  }
}

function availabilityColor(s: ShowTime, c: Colors) {
  return s.availability === 'sold_out' ? c.muted : s.availability === 'available' ? c.ok : '#C77700';
}

/** "today", "tomorrow" or "Mon" */
function bookDayWord(dateKey: string) {
  const d = dayName(dateKey);
  return d === 'Today' || d === 'Tomorrow' ? d.toLowerCase() : d.split(',')[0];
}

function openShow(show: ShowTime) {
  if (show.availability !== 'sold_out') router.push({ pathname: '/show/[id]', params: { id: show.id } });
}

function ShowPill({ show }: { show: ShowTime }) {
  const c = useColors();
  const soldOut = show.availability === 'sold_out';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${show.label} ${time(show.starts_at)}, ${availabilityText(show)}`}
      disabled={soldOut}
      onPress={() => openShow(show)}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: c.field, backgroundColor: c.card, opacity: soldOut ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <T v="label" style={{ fontSize: 14 }}>{time(show.starts_at)}</T>
      <T v="small" style={{ fontSize: 11, color: availabilityColor(show, c) }}>{availabilityText(show)}</T>
    </Pressable>
  );
}

function MovieRow({ item }: { item: MovieShows }) {
  const c = useColors();
  const m = item.movie;
  return (
    <Card style={{ flexDirection: 'row', gap: 14 }}>
      <Poster movie={m} width={84} />
      <View style={{ flex: 1 }}>
        <T v="title">{m.title}</T>
        <T v="small" style={{ marginTop: 2 }}>
          {[m.language, m.certificate, runtime(m.runtime_min), m.genre].filter(Boolean).join(' · ')}
        </T>
        {m.synopsis ? <T v="small" numberOfLines={2} style={{ marginTop: 6, color: c.ink2 }}>{m.synopsis}</T> : null}
        <View style={styles.pills}>
          {item.shows.map((s) => <ShowPill key={s.id} show={s} />)}
        </View>
      </View>
    </Card>
  );
}

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { customer } = useAuth();
  const [date, setDate] = useState<string | null>(null);
  const { data, error, loading, refreshing, reload } = useApi<Home>(`/api/app/home${date ? `?date=${date}` : ''}`);

  if (loading) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const featured = data.featured;
  const nextShow = featured?.shows.find((s) => s.availability !== 'sold_out');

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32, paddingHorizontal: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} colors={[c.brand]} />}
    >
      <View style={styles.top}>
        <View style={[styles.logo, { backgroundColor: c.brand }]}>
          <T style={{ color: '#fff', fontFamily: fonts.display, fontSize: 18 }}>HS</T>
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 21, letterSpacing: 0.5 }} numberOfLines={2}>
            {data.theatre.name.toUpperCase()}
          </T>
          <T v="small" style={{ fontSize: 12 }}>{data.theatre.address || data.theatre.city}</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={customer ? 'Profile' : 'Log in'}
          onPress={() => router.push(customer ? '/profile' : '/login')}
          style={[styles.avatar, { backgroundColor: c.chip }]}
        >
          <T v="label" style={{ color: c.ink2 }}>{customer ? (customer.name || 'Me').slice(0, 1).toUpperCase() : '→'}</T>
        </Pressable>
      </View>

      {featured && (
        <Card style={{ backgroundColor: c.brandSoft, borderColor: 'transparent', padding: 18 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T v="eyebrow">Now showing</T>
              <T style={{ fontFamily: fonts.display, fontSize: 36, lineHeight: 36, marginTop: 6 }}>
                {featured.movie.title.toUpperCase()}
              </T>
            </View>
            <Poster movie={featured.movie} width={92} />
          </View>
          <View style={[styles.pills, { marginTop: 12 }]}>
            {[featured.movie.language, featured.movie.certificate, runtime(featured.movie.runtime_min), featured.movie.genre]
              .filter(Boolean)
              .map((x) => <Chip key={x} label={x} style={{ backgroundColor: c.card }} />)}
          </View>
          {featured.movie.synopsis ? (
            <T style={{ color: c.ink2, marginTop: 12 }}>{featured.movie.synopsis}</T>
          ) : null}
          {nextShow && (
            <>
              <Button
                title={`Book ${bookDayWord(data.date)}, ${time(nextShow.starts_at)}`}
                onPress={() => openShow(nextShow)}
                style={{ marginTop: 16, alignSelf: 'flex-start' }}
              />
              <T v="small" style={{ marginTop: 8 }}>
                {nextShow.seats_left} seats left · {availabilityText(nextShow)}
              </T>
            </>
          )}
        </Card>
      )}

      <T v="display" style={{ marginTop: 8 }}>Pick your show day</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {data.days.map((d) => {
          const p = dayParts(d.date);
          const sel = d.date === data.date;
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              accessibilityState={{ selected: sel, disabled: !d.has_shows }}
              disabled={!d.has_shows}
              onPress={() => setDate(d.date)}
              style={[
                styles.day,
                { backgroundColor: sel ? c.ink : c.card, borderColor: sel ? c.ink : c.line, opacity: d.has_shows ? 1 : 0.4 },
              ]}
            >
              <T v="small" style={{ fontSize: 12, color: sel ? '#ffffffb0' : c.muted }}>{p.dow}</T>
              <T style={{ fontFamily: fonts.bold, fontSize: 20, color: sel ? '#fff' : c.ink }}>{p.day}</T>
              <T v="small" style={{ fontSize: 11, color: sel ? '#ffffffb0' : c.muted }}>{p.month}</T>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
        <T v="display">Now showing</T>
        <T v="small">{dayName(data.date)}</T>
      </View>
      {data.now_showing.length === 0 ? (
        <Card><T v="small">No shows on this day yet. Try another day.</T></Card>
      ) : (
        data.now_showing.map((item) => <MovieRow key={item.movie.id} item={item} />)
      )}

      {data.coming_soon.length > 0 && (
        <>
          <T v="display" style={{ marginTop: 8 }}>Coming soon</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {data.coming_soon.map((m) => (
              <View key={m.id} style={{ width: 120 }}>
                <Poster movie={m} width={120} />
                <T v="label" numberOfLines={1} style={{ marginTop: 8 }}>{m.title}</T>
                <T v="small" style={{ fontSize: 12 }}>
                  {m.release_date ? `From ${dayName(m.release_date)}` : 'Date to be announced'}
                </T>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 86 },
  day: { width: 58, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
});
