import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Card, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { payMethodLabel, rupees } from '@/lib/format';
import { fonts, useColors } from '@/lib/theme';
import type { Booking } from '@/lib/types';

/**
 * Stand-in for the payment gateway's checkout while the gateway isn't chosen.
 * "Pay" runs the same server-side confirmation a real webhook will.
 * When Razorpay (or another gateway) is added, this screen opens its checkout
 * with the order ID instead, and the webhook confirms the booking.
 */
export default function TestPayment() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { bookingId, amount, method, gateway } = useLocalSearchParams<{
    bookingId: string;
    amount: string;
    method: string;
    gateway: string;
  }>();
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
      if (b.status === 'failed') {
        router.back();
        return;
      }
      router.dismissAll();
      router.push({ pathname: '/booking/[id]', params: { id: b.id, fresh: '1' } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  if (gateway !== 'fake') {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: c.bg }}>
        <T v="title">Payments aren&apos;t set up yet</T>
        <T v="small" style={{ marginTop: 6 }}>The {gateway} checkout will open here.</T>
        <Button title="Back" kind="secondary" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }}>
      <T v="eyebrow" style={{ color: c.brand }}>Test payment</T>
      <T v="display" style={{ marginTop: 6 }}>No real money</T>
      <T v="small" style={{ marginTop: 6 }}>
        The payment gateway isn&apos;t connected yet. Choose what happens, and the server handles it the same way it will for a real payment.
      </T>

      <Card style={{ marginTop: 24, alignItems: 'center', paddingVertical: 28 }}>
        <T v="small">Amount</T>
        <T style={{ fontFamily: fonts.bold, fontSize: 40, color: c.ink, marginTop: 4 }}>{rupees(Number(amount))}</T>
        <T v="small" style={{ marginTop: 4 }}>{payMethodLabel(method)}</T>
      </Card>

      {err && <View style={{ marginTop: 16 }}><Banner kind="error">{err}</Banner></View>}

      <View style={{ flex: 1 }} />
      <Button title="Payment succeeds" onPress={() => finish('pay')} loading={busy === 'pay'} disabled={busy !== null} />
      <Button
        title="Payment fails"
        kind="secondary"
        onPress={() => finish('fail')}
        loading={busy === 'fail'}
        disabled={busy !== null}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}
