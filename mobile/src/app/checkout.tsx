import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poster } from '@/components/Poster';
import { Banner, Button, Card, Chip, ErrorState, Header, Loading, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayName, istDateKey, rupees, time } from '@/lib/format';
import { fonts, useColors } from '@/lib/theme';
import type { BookingStart, Offer, PayMethod, PromoApplied, SeatMap, SeatsTakenBody } from '@/lib/types';
import { useApi } from '@/lib/useApi';

const METHODS: { key: PayMethod; label: string }[] = [
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'netbanking', label: 'Net banking' },
];
const UPI_APPS = ['PhonePe', 'Google Pay', 'Paytm', 'BHIM'];

export default function Checkout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { customer } = useAuth();
  const { showId, seatIds } = useLocalSearchParams<{ showId: string; seatIds: string }>();
  const ids = (seatIds ?? '').split(',').filter(Boolean);
  const { data, error, loading, reload } = useApi<SeatMap>(`/api/app/shows/${showId}/seats`);
  const { data: offers } = useApi<Offer[]>(`/api/app/shows/${showId}/offers`);

  const [name, setName] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>('upi');
  const [upiApp, setUpiApp] = useState('PhonePe');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [promo, setPromo] = useState<PromoApplied | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const nameValue = name ?? customer?.name ?? '';
  const seats = ids.map((id) => data.seats.find((s) => s.id === id)).filter((s) => s !== undefined);
  const priceOf = new Map(data.classes.map((k) => [k.id, k.price_paise ?? 0]));
  const byClass = new Map<string, { name: string; count: number; total: number }>();
  for (const s of seats) {
    const k = data.classes.find((x) => x.id === s.class_id)!;
    const cur = byClass.get(k.id) ?? { name: k.name, count: 0, total: 0 };
    byClass.set(k.id, { ...cur, count: cur.count + 1, total: cur.total + (priceOf.get(k.id) ?? 0) });
  }
  // Preview only; the server works out the real amount when you tap Pay
  const tickets = [...byClass.values()].reduce((a, b) => a + b.total, 0);
  const fee = data.booking_fee_paise * seats.length;
  const gst = Math.round((fee * data.gst_rate_bp) / 10_000);
  const total = promo ? promo.price.total_paise : tickets + fee + gst;
  const show = data.show;
  const upiOnly = data.payment_gateway === 'upi'; // direct UPI: no cards or net banking yet

  const applyCode = async (code: string) => {
    setPromoErr(null);
    if (!customer) {
      router.push('/login');
      return;
    }
    setApplying(code);
    try {
      setPromo(await api<PromoApplied>('/api/app/promotions/apply', {
        method: 'POST',
        body: { show_id: show.id, seat_ids: ids, code },
      }));
      setCodeInput('');
    } catch (e) {
      setPromoErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setApplying(null);
    }
  };

  const pay = async () => {
    setErr(null);
    if (!customer) {
      router.push('/login');
      return;
    }
    if (!nameValue.trim()) {
      setErr('Enter the name for the booking');
      return;
    }
    setBusy(true);
    try {
      const res = await api<BookingStart>('/api/app/bookings', {
        method: 'POST',
        body: { show_id: show.id, seat_ids: ids, name: nameValue.trim(), promo_code: promo?.code },
      });
      router.push({
        pathname: '/pay',
        params: {
          bookingId: res.booking_id,
          code: res.code,
          amount: String(res.price.total_paise),
          method: upiOnly ? 'upi' : method,
          gateway: res.order.gateway,
          upiUrl: res.order.upi_url ?? '',
          payeeId: res.order.payee_upi_id ?? '',
          payeeName: res.order.payee_name ?? '',
        },
      });
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as SeatsTakenBody | null) : null;
      if (body?.code === 'seats_taken') {
        router.replace({
          pathname: '/seats-taken',
          params: {
            showId: show.id,
            picked: seats.map((s) => `${s.row}${s.number}`).join(','),
            taken: body.taken.join(','),
            suggestIds: body.suggestion.seat_ids.join(','),
            suggestLabels: body.suggestion.labels.join(','),
          },
        });
      } else if (promo && e instanceof ApiError && e.status === 409) {
        // The code stopped working between applying and paying (e.g. fully used)
        setPromo(null);
        setPromoErr(e.message);
      } else {
        setErr(e instanceof ApiError ? e.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <Header title="Review and pay" subtitle={`${show.movie.title} · ${dayName(istDateKey(show.starts_at))}, ${time(show.starts_at)}`} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Banner kind="info" title="First come, first screened">
          Seats go to whoever pays first. If someone beats you to them, you won&apos;t be charged and we&apos;ll find you the next best seats.
        </Banner>

        <Card>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Poster movie={show.movie} width={68} />
            <View style={{ flex: 1 }}>
              <T v="title">{show.movie.title}</T>
              <T v="small" style={{ marginTop: 2 }}>{dayName(istDateKey(show.starts_at))} · {time(show.starts_at)} · {show.label}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {seats.map((s) => <Chip key={s.id} label={`${s.row}${s.number}`} />)}
              </View>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          {[...byClass.values()].map((k) => (
            <Row key={k.name} label={`${k.name} × ${k.count}`} value={rupees(k.total)} />
          ))}
          {promo && <Row label={`Offer ${promo.code}`} value={`- ${rupees(promo.discount_paise)}`} color={c.ok} />}
          <Row label={`Booking fee (${rupees(data.booking_fee_paise)} × ${seats.length})`} value={rupees(fee)} />
          <Row label="GST on booking fee" value={rupees(gst)} />
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          <View style={styles.row}>
            <T style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 }}>Total</T>
            <T style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 }}>{rupees(total)}</T>
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <T v="label">Offers</T>
          {promo ? (
            <View style={[styles.applied, { backgroundColor: c.okSoft }]}>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ color: c.ok }}>{promo.code} applied</T>
                <T v="small" style={{ color: c.ok }}>{promo.title}. You save {rupees(promo.discount_paise)}</T>
              </View>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setPromo(null)}>
                <T v="label" style={{ color: c.brand }}>Remove</T>
              </Pressable>
            </View>
          ) : (
            <>
              {(offers ?? []).map((o) => (
                <View key={o.code} style={[styles.offer, { borderColor: c.line }]}>
                  <View style={{ flex: 1 }}>
                    <T v="label">{o.title}</T>
                    <T v="small" style={{ fontSize: 12 }}>{o.code} · {o.details}</T>
                  </View>
                  <Button title="Apply" kind="secondary" loading={applying === o.code} disabled={applying !== null} onPress={() => applyCode(o.code)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={codeInput}
                  onChangeText={(t) => setCodeInput(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20))}
                  placeholder="Have a promo code?"
                  placeholderTextColor={c.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Promo code"
                  onSubmitEditing={() => codeInput.length >= 3 && applyCode(codeInput)}
                  style={[styles.input, { flex: 1, borderColor: c.field, color: c.ink, backgroundColor: c.card }]}
                />
                <Button title="Apply" kind="secondary" loading={applying === codeInput && codeInput !== ''} disabled={codeInput.length < 3 || applying !== null} onPress={() => applyCode(codeInput)} style={{ minWidth: 90 }} />
              </View>
            </>
          )}
          {promoErr && <T v="small" style={{ color: c.brandInk }}>{promoErr}</T>}
        </Card>

        <Card style={{ gap: 12 }}>
          <View>
            <T v="small" style={{ marginBottom: 6 }}>Name</T>
            <TextInput
              value={nameValue}
              onChangeText={setName}
              placeholder="Name on the booking"
              placeholderTextColor={c.muted}
              autoComplete="name"
              maxLength={80}
              style={[styles.input, { borderColor: c.field, color: c.ink, backgroundColor: c.card }]}
            />
          </View>
          <View>
            <T v="small" style={{ marginBottom: 6 }}>Mobile number</T>
            {customer ? (
              <View style={[styles.input, { borderColor: c.line, backgroundColor: c.bg, justifyContent: 'center' }]}>
                <T>+91 {customer.mobile}</T>
              </View>
            ) : (
              <Button title="Log in with your mobile number" kind="secondary" onPress={() => router.push('/login')} />
            )}
            <T v="small" style={{ fontSize: 12, marginTop: 6 }}>Your tickets are saved to this number.</T>
          </View>
        </Card>

        <Card>
          <T v="label">Pay with</T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {(upiOnly ? METHODS.slice(0, 1) : METHODS).map((m) => (
              <Chip key={m.key} label={m.label} selected={upiOnly || method === m.key} onPress={() => setMethod(m.key)} />
            ))}
          </View>
          {upiOnly && (
            <T v="small" style={{ marginTop: 8, fontSize: 12 }}>Cards and net banking are coming soon.</T>
          )}
          {!upiOnly && method === 'upi' && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              {UPI_APPS.map((app) => (
                <Pressable
                  key={app}
                  accessibilityRole="button"
                  accessibilityState={{ selected: upiApp === app }}
                  onPress={() => setUpiApp(app)}
                  style={[
                    styles.upi,
                    { borderColor: upiApp === app ? c.brand : c.line, backgroundColor: upiApp === app ? c.brandSoft : c.card },
                  ]}
                >
                  <View style={[styles.upiDot, { backgroundColor: c.ink }]}>
                    <T style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 13 }}>{app[0]}</T>
                  </View>
                  <T v="small" style={{ fontSize: 11, color: c.ink2 }}>{app}</T>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {err && <Banner kind="error">{err}</Banner>}
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: c.card, borderTopColor: c.line, paddingBottom: insets.bottom + 12 }]}>
        <Button title={customer ? `Pay ${rupees(total)}` : 'Log in to pay'} onPress={pay} loading={busy} disabled={!seats.length} />
        <T v="small" style={{ textAlign: 'center', fontSize: 12, marginTop: 6 }}>
          We check your seats are still free before charging
        </T>
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = useColors();
  return (
    <View style={[styles.row, { marginTop: 8 }]}>
      <T style={{ color: color ?? c.ink2 }}>{label}</T>
      <T style={{ color: color ?? c.ink2 }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, marginVertical: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 50, fontSize: 16, fontFamily: fonts.regular },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  upi: { flex: 1, alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  upiDot: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
