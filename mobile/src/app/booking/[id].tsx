import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Rect } from 'react-native-svg';

import { BRAND, LogoMark, Wordmark } from '@/components/Logo';
import { Poster } from '@/components/Poster';
import { Banner, Button, Card, Chip, ErrorState, Header, Loading, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
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

        {(b.can_rate || b.rating) && <RateCard b={b} onSaved={reload} />}

        <View style={[styles.ticket, { backgroundColor: c.card, borderColor: c.line }]}>
          {/* Header band: the theatre, and how many this ticket lets in */}
          <View style={[styles.band, { backgroundColor: BRAND.house }]}>
            <LogoMark size={36} />
            <View style={{ flex: 1 }}>
              <Wordmark color="#FFFFFF" size={15} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 10, letterSpacing: 2, color: BRAND.gold }}>ADMIT</T>
              <T style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: BRAND.gold }}>{b.seats.length}</T>
            </View>
          </View>
          <Valance />

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

          {/* Tear line with punched notches, like a paper ticket */}
          <View style={styles.tear}>
            <View style={[styles.notch, { left: -13, backgroundColor: c.bg, borderColor: c.line }]} />
            <View style={[styles.perforation, { borderColor: c.field }]} />
            <View style={[styles.notch, { right: -13, backgroundColor: c.bg, borderColor: c.line }]} />
          </View>

          <View style={{ alignItems: 'center', paddingBottom: 20 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 10, letterSpacing: 3, color: c.muted, marginBottom: 10 }}>
              SCAN AT THE GATE
            </T>
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
            <T v="small" style={{ marginTop: 6, fontSize: 12 }}>Turn your screen brightness up. Works even if the gate has no internet.</T>
          </View>
        </View>

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
            Gates open an hour before the show. Keep this ticket handy at the gate.
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

const STAR_WORDS = ['', "Didn't like it", 'It was okay', 'Good', 'Very good', 'Loved it'];

/** After the show: stars for the movie, and a few words if they like. */
function RateCard({ b, onSaved }: { b: Booking; onSaved: () => void }) {
  const c = useColors();
  const [stars, setStars] = useState(b.rating?.stars ?? 0);
  const [comment, setComment] = useState(b.rating?.comment ?? '');
  const [editing, setEditing] = useState(!b.rating);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api(`/api/app/bookings/${b.id}/rating`, { method: 'PUT', body: { stars, comment: comment.trim() } });
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!editing && b.rating) {
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T v="label">You rated {b.show.movie.title}</T>
          <T style={{ color: c.brand, fontSize: 20, lineHeight: 26, letterSpacing: 2, marginTop: 2 }}>
            {'★'.repeat(b.rating.stars)}{'☆'.repeat(5 - b.rating.stars)}
          </T>
          {b.rating.comment ? <T v="small" style={{ marginTop: 4 }}>“{b.rating.comment}”</T> : null}
        </View>
        {b.can_rate && (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setEditing(true)}>
            <T v="label" style={{ color: c.brand }}>Change</T>
          </Pressable>
        )}
      </Card>
    );
  }

  return (
    <Card style={{ gap: 10 }}>
      <T v="title">How was {b.show.movie.title}?</T>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            accessibilityState={{ checked: stars === n }}
            hitSlop={4}
            onPress={() => setStars(n)}
          >
            <T style={{ fontSize: 38, lineHeight: 44, color: n <= stars ? c.brand : c.field }}>{n <= stars ? '★' : '☆'}</T>
          </Pressable>
        ))}
      </View>
      {stars > 0 && <T v="small">{STAR_WORDS[stars]}</T>}
      {stars > 0 && (
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="A few words for the theatre (optional)"
          placeholderTextColor={c.muted}
          maxLength={300}
          multiline
          accessibilityLabel="Comment"
          style={[styles.comment, { borderColor: c.field, color: c.ink, backgroundColor: c.card }]}
        />
      )}
      {err && <Banner kind="error">{err}</Banner>}
      <Button title="Send rating" onPress={save} loading={busy} disabled={stars === 0} />
      <T v="small" style={{ fontSize: 12 }}>Only the theatre sees your words. Your name isn&apos;t shown with them.</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  comment: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 70, fontSize: 15, fontFamily: fonts.regular, textAlignVertical: 'top' },
  ticket: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  band: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  tear: { marginVertical: 18, justifyContent: 'center' },
  notch: { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 1 },
  perforation: { borderTopWidth: 2, borderStyle: 'dashed', marginHorizontal: 22 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
});

/** Red scalloped valance with a gold edge, under the ticket header. */
function Valance() {
  return (
    <Svg width="100%" height={12} viewBox="0 0 100 12" preserveAspectRatio="none">
      <Path
        d="M0 0H100V5Q93.75 12 87.5 5Q81.25 12 75 5Q68.75 12 62.5 5Q56.25 12 50 5Q43.75 12 37.5 5Q31.25 12 25 5Q18.75 12 12.5 5Q6.25 12 0 5Z"
        fill={BRAND.red}
      />
      <Rect width="100" height="1.2" fill={BRAND.gold} />
    </Svg>
  );
}
