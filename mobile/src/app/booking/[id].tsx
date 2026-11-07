import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Poster } from '@/components/Poster';
import { Banner, Button, Card, Chip, ErrorState, Header, Loading, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dayName, istDateKey, payMethodLabel, rupees, time } from '@/lib/format';
import { fonts, useColors } from '@/lib/theme';
import type { Booking } from '@/lib/types';
import { useApi } from '@/lib/useApi';

export default function BookingScreen() {
  const c = useColors();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { customer } = useAuth();
  const { data: b, error, loading, reload } = useApi<Booking>(`/api/app/bookings/${id}`);

  if (loading) return <Loading />;
  if (error && !b) return <ErrorState message={error} onRetry={reload} />;
  if (!b) return null;

  if (b.status === 'refunded' || b.status === 'cancelled') return <Refunded b={b} />;
  if (b.status === 'payment_review') return <Checking b={b} reload={reload} />;

  const classes = [...new Set(b.seats.map((s) => s.class_name))].join(', ');
  const askProfile = fresh && customer && !customer.gender && !customer.age_group;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Your ticket" subtitle={`${b.show.movie.title} · ${b.code}`} onBack={() => router.dismissTo('/tickets')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {fresh ? (
          <Banner kind="ok" title="That's a wrap. Booking confirmed">
            Your ticket is below and in My tickets.
          </Banner>
        ) : null}

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', gap: 14, padding: 16 }}>
            <Poster movie={b.show.movie} width={76} />
            <View style={{ flex: 1 }}>
              <T v="title">{b.show.movie.title}</T>
              <T v="small" style={{ marginTop: 2 }}>
                {[b.show.movie.language, b.show.movie.certificate].join(' · ')}
              </T>
              <T v="small" style={{ marginTop: 2 }}>{b.show.theatre.name}, {b.show.theatre.city}</T>
            </View>
          </View>

          <View style={{ paddingHorizontal: 16 }}>
            <T v="eyebrow">{dayName(istDateKey(b.show.starts_at))} · {b.show.label}</T>
            <T style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 48, color: c.ink }}>{time(b.show.starts_at)}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {b.seats.map((s) => <Chip key={s.label} label={s.label} selected />)}
            </View>
          </View>

          <View style={[styles.perforation, { borderColor: c.line }]} />

          <View style={{ alignItems: 'center', paddingBottom: 20 }}>
            {b.qr ? (
              <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                <QRCode value={b.qr} size={196} backgroundColor="#FFFFFF" color="#12152B" />
              </View>
            ) : (
              <T v="small">The QR code shows once payment is confirmed.</T>
            )}
            <T style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: 22, letterSpacing: 3, marginTop: 12, color: c.ink }}>
              {b.code}
            </T>
            <T v="small" style={{ marginTop: 2 }}>
              {b.seats.length} × {classes} · {b.seats.map((s) => s.label).join(', ')}
            </T>
            <T v="small" style={{ marginTop: 6, fontSize: 12 }}>Show this at the gate. Turn your screen brightness up.</T>
          </View>
        </Card>

        <Card>
          <Detail label="Booking ID" value={b.code} mono />
          <Detail label="Name" value={b.customer_name} />
          <Detail label="Seats" value={b.seats.map((s) => s.label).join(', ')} />
          <Detail label="Class" value={classes} />
          <Detail label="Paid" value={`${rupees(b.price.total_paise)} · ${payMethodLabel(b.payment_method)}`} />
          {b.price.discount_paise > 0 && <Detail label="Discount" value={rupees(b.price.discount_paise)} />}
        </Card>

        <Card style={{ backgroundColor: c.warnSoft, borderColor: 'transparent' }}>
          <T v="label" style={{ color: c.warnInk }}>Before the show</T>
          <T v="small" style={{ color: c.warnInk, marginTop: 4 }}>
            Gates open 30 minutes before the show. Keep this ticket handy at the gate.
          </T>
        </Card>

        {askProfile ? (
          <Card>
            <T v="label">Help us plan better shows</T>
            <T v="small" style={{ marginTop: 4 }}>
              Tell us your gender and age group. It&apos;s optional and only ever counted in totals.
            </T>
            <Button title="Add in profile" kind="secondary" onPress={() => router.push('/profile')} style={{ marginTop: 12 }} />
          </Card>
        ) : null}

        <Button title="Book another show" kind="ghost" onPress={() => router.dismissTo('/')} />
      </ScrollView>
    </View>
  );
}

function Refunded({ b }: { b: Booking }) {
  const c = useColors();
  const reason =
    b.failure_reason === 'seat_clash'
      ? `Someone else's payment for ${b.seats.length > 1 ? 'these seats' : 'this seat'} went through at the same moment as yours, and theirs reached us first. We've cancelled your booking and sent back your full refund.`
      : b.failure_reason === 'show_cancelled'
        ? 'This show was cancelled. We have sent back your full refund.'
        : b.failure_reason === 'manual_refund'
          ? 'The theatre has cancelled this booking and sent back your full refund.'
          :"Your payment went through but the booking couldn't be completed. We've sent back your full refund.";
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Payment refunded" subtitle={`${b.show.movie.title} · ${time(b.show.starts_at)}`} onBack={() => router.dismissTo('/')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ padding: 20 }}>
          <T v="eyebrow" style={{ color: c.brand }}>
            {b.failure_reason === 'seat_clash' ? 'Just a photo finish' : 'Refund on its way'}
          </T>
          <T v="display" style={{ fontSize: 30, lineHeight: 32, marginTop: 6 }}>Your money is on its way back</T>
          <T style={{ marginTop: 10, color: c.ink2 }}>{reason}</T>
          <View style={{ marginTop: 16 }}>
            <Detail label="Refund" value={`${rupees(b.refund_paise)} in full`} />
            <Detail label="Back to" value={payMethodLabel(b.payment_method)} />
            <Detail label="Usually takes" value={b.gateway === 'upi' ? 'Within a day' : '5 to 7 working days'} />
            {b.refund_pending ? (
              <Detail label="Status" value="Theatre is sending it" />
            ) : (
              b.refund_id && <Detail label="Refund ID" value={b.refund_id} mono />
            )}
          </View>
        </Card>
        {b.failure_reason === 'seat_clash' && (
          <Button
            title="Pick other seats"
            onPress={() => router.replace({ pathname: '/show/[id]', params: { id: b.show.id } })}
          />
        )}
        <Button title="Back to movies" kind="ghost" onPress={() => router.dismissTo('/')} />
      </ScrollView>
    </View>
  );
}

/** Direct UPI: seats are held while the theatre checks the payment arrived. */
function Checking({ b, reload }: { b: Booking; reload: () => void }) {
  const c = useColors();
  useEffect(() => {
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Checking payment" subtitle={`${b.show.movie.title} · ${b.code}`} onBack={() => router.dismissTo('/tickets')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ padding: 20 }}>
          <T v="eyebrow" style={{ color: c.warnInk }}>Seats held for you</T>
          <T v="display" style={{ fontSize: 30, lineHeight: 32, marginTop: 6 }}>We&apos;re checking your payment</T>
          <T style={{ marginTop: 10, color: c.ink2 }}>
            The theatre is matching your UPI reference with the payment it received. Your QR ticket appears here as soon as
            it&apos;s confirmed, usually within a few minutes. This page refreshes by itself.
          </T>
          <View style={{ marginTop: 16 }}>
            <Detail label="Booking ID" value={b.code} mono />
            <Detail label="Show" value={`${dayName(istDateKey(b.show.starts_at))}, ${time(b.show.starts_at)}`} />
            <Detail label="Seats" value={b.seats.map((s) => s.label).join(', ')} />
            <Detail label="Paid" value={rupees(b.price.total_paise)} />
            {b.upi_ref && <Detail label="UPI reference" value={b.upi_ref} mono />}
          </View>
        </Card>
        <Button title="Check now" kind="secondary" onPress={reload} />
        <Button title="Back to movies" kind="ghost" onPress={() => router.dismissTo('/')} />
      </ScrollView>
    </View>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.detail}>
      <T v="small">{label}</T>
      <T style={mono ? { fontFamily: 'monospace', fontWeight: '700', color: c.ink } : { color: c.ink }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  perforation: { borderTopWidth: 2, borderStyle: 'dashed', marginVertical: 18, marginHorizontal: 16 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
});
