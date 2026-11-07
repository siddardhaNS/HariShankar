import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Card, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { payMethodLabel, rupees } from '@/lib/format';
import { fonts, useColors } from '@/lib/theme';
import type { Booking } from '@/lib/types';

type Params = {
  bookingId: string;
  code: string;
  amount: string;
  method: string;
  gateway: string;
  upiUrl?: string;
  payeeId?: string;
  payeeName?: string;
};

function openTicket(b: Booking) {
  router.dismissAll();
  router.push({ pathname: '/booking/[id]', params: { id: b.id, fresh: '1' } });
}

export default function Pay() {
  const p = useLocalSearchParams<Params>();
  if (p.gateway === 'upi') return <UpiPay {...p} />;
  if (p.gateway === 'fake') return <TestPay {...p} />;
  return <NotSetUp gateway={p.gateway} />;
}

/**
 * Direct UPI, no gateway: open the customer's UPI app with the theatre's UPI ID
 * and the exact amount, then take the 12-digit UPI reference. Staff check the
 * money arrived before the QR ticket is issued.
 */
function UpiPay({ bookingId, code, amount, upiUrl, payeeId, payeeName }: Params) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState(false);
  const [noApp, setNoApp] = useState(false);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const openUpi = async () => {
    setErr(null);
    try {
      await Linking.openURL(upiUrl!);
      setOpened(true);
    } catch {
      setNoApp(true);
    }
  };

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const b = await api<Booking>(`/api/app/bookings/${bookingId}/upi-ref`, { method: 'POST', body: { utr } });
      openTicket(b);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <T v="eyebrow" style={{ color: c.brand }}>Pay by UPI</T>
        <T v="display">Booking {code}</T>

        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <T v="small">Pay exactly</T>
          <T style={{ fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: c.ink, marginTop: 2 }}>
            {rupees(Number(amount))}
          </T>
          <T v="small" style={{ marginTop: 6 }}>to {payeeName}</T>
          <T style={{ fontFamily: 'monospace', fontWeight: '700', color: c.ink2, marginTop: 2 }}>{payeeId}</T>
        </Card>

        <View style={styles.step}>
          <StepDot n={1} done={opened} />
          <View style={{ flex: 1 }}>
            <T v="label">Pay in your UPI app</T>
            <T v="small" style={{ marginTop: 2 }}>PhonePe, Google Pay, Paytm, BHIM or your bank&apos;s app. The amount is filled in.</T>
            <Button title={opened || noApp ? 'Open UPI app again' : 'Open UPI app'} onPress={openUpi}
              kind={opened || noApp ? 'secondary' : 'primary'} style={{ marginTop: 10 }} />
            {noApp && (
              <T v="small" style={{ marginTop: 8, color: c.warnInk }}>
                No UPI app opened. Pay {rupees(Number(amount))} to the UPI ID above from any UPI app, then come back here.
              </T>
            )}
          </View>
        </View>

        <View style={styles.step}>
          <StepDot n={2} done={false} />
          <View style={{ flex: 1 }}>
            <T v="label">Enter the UPI reference</T>
            <T v="small" style={{ marginTop: 2 }}>
              The 12-digit number on the payment success screen, called UPI Ref No., UTR or Transaction ID.
            </T>
            <TextInput
              value={utr}
              onChangeText={(t) => setUtr(t.replace(/\D/g, '').slice(0, 12))}
              keyboardType="number-pad"
              maxLength={12}
              placeholder="12-digit UPI reference"
              placeholderTextColor={c.muted}
              accessibilityLabel="UPI reference number"
              returnKeyType="done"
              onSubmitEditing={() => utr.length === 12 && !busy && submit()}
              style={[styles.input, { borderColor: utr.length === 12 ? c.brand : c.field, color: c.ink, backgroundColor: c.card }]}
            />
            {err && <View style={{ marginTop: 10 }}><Banner kind="error">{err}</Banner></View>}
            <Button title="I've paid" onPress={submit} loading={busy} disabled={utr.length !== 12} style={{ marginTop: 12 }} />
          </View>
        </View>

        <T v="small" style={{ textAlign: 'center' }}>
          Your seats are held once you enter the reference. The theatre checks the payment and your QR ticket appears in My tickets.
        </T>
        <Button title="Cancel" kind="ghost" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.dot, { backgroundColor: done ? c.ok : c.ink }]}>
      <T style={{ color: '#fff', fontFamily: fonts.bold }}>{done ? '✓' : n}</T>
    </View>
  );
}

/** Development only: instant test payments that run the real confirmation code. */
function TestPay({ bookingId, amount, method }: Params) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'pay' | 'fail' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const finish = async (outcome: 'pay' | 'fail') => {
    setBusy(outcome);
    setErr(null);
    try {
      const b = await api<Booking>(`/api/app/dev/bookings/${bookingId}/${outcome}`, {
        method: 'POST',
        body: outcome === 'pay' ? { method } : undefined,
      });
      if (b.status === 'failed') router.back();
      else openTicket(b);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }}>
      <T v="eyebrow" style={{ color: c.brand }}>Test payment</T>
      <T v="display" style={{ marginTop: 6 }}>No real money</T>
      <T v="small" style={{ marginTop: 6 }}>
        Development mode. Choose what happens, and the server handles it the same way it will for a real payment.
      </T>
      <Card style={{ marginTop: 24, alignItems: 'center', paddingVertical: 28 }}>
        <T v="small">Amount</T>
        <T style={{ fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: c.ink, marginTop: 4 }}>{rupees(Number(amount))}</T>
        <T v="small" style={{ marginTop: 4 }}>{payMethodLabel(method)}</T>
      </Card>
      {err && <View style={{ marginTop: 16 }}><Banner kind="error">{err}</Banner></View>}
      <View style={{ flex: 1 }} />
      <Button title="Payment succeeds" onPress={() => finish('pay')} loading={busy === 'pay'} disabled={busy !== null} />
      <Button title="Payment fails" kind="secondary" onPress={() => finish('fail')} loading={busy === 'fail'}
        disabled={busy !== null} style={{ marginTop: 10 }} />
    </View>
  );
}

function NotSetUp({ gateway }: { gateway: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: c.bg }}>
      <T v="title">Payments aren&apos;t set up yet</T>
      <T v="small" style={{ marginTop: 6 }}>The {gateway} checkout will open here.</T>
      <Button title="Back" kind="secondary" onPress={() => router.back()} style={{ marginTop: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 14 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  input: { borderWidth: 1.5, borderRadius: 12, height: 54, marginTop: 10, paddingHorizontal: 14, fontSize: 20,
    letterSpacing: 2, fontFamily: fonts.medium },
});
