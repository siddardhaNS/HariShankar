import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Banner, Button, Header, T } from '@/components/ui';
import { api, ApiError, setStaffToken } from '@/lib/api';
import { useStaff } from '@/lib/staff';
import { fonts, useColors } from '@/lib/theme';
import type { StaffLogin } from '@/lib/types';

const WEAK = /^(\d)\1+$/;
const isSequence = (p: string) => '0123456789'.includes(p) || '9876543210'.includes(p);

export default function StaffLoginScreen() {
  const c = useColors();
  const { signIn } = useStaff();
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [again, setAgain] = useState('');
  // Set after a first login: the server wants a new PIN before the scanner opens
  const [pending, setPending] = useState<StaffLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

  const logIn = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<StaffLogin>('/api/admin/auth/login', { method: 'POST', body: { mobile, pin } });
      if (r.user.role === 'super_admin' || !r.theatre) {
        setErr('This login has no theatre. Use a theatre staff login');
      } else if (r.user.must_change_pin) {
        setPending(r);
      } else {
        await signIn(r);
        router.replace('/staff');
      }
    } catch (e) {
      setErr(message(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const pinProblem =
    newPin.length < 4 ? null
      : WEAK.test(newPin) ? "PIN can't be the same digit repeated"
        : isSequence(newPin) ? "PIN can't be a simple sequence like 1234"
          : newPin === pin ? 'New PIN must be different'
            : again.length >= newPin.length && again !== newPin ? "PINs don't match"
              : null;

  const changePin = async () => {
    if (!pending) return;
    setErr(null);
    setBusy(true);
    try {
      // Uses the token from the first login, once, then keeps the new one
      const res = await fetchWithToken(pending.access_token, { current_pin: pin, new_pin: newPin });
      await signIn(res);
      router.replace('/staff');
    } catch (e) {
      setErr(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Theatre staff" subtitle="Gate scanner" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!pending ? (
          <>
            <T v="small">Log in with the mobile number and PIN the owner gave you. The same login works on the admin website.</T>
            <View style={[styles.field, { borderColor: c.field, backgroundColor: c.card }]}>
              <T style={{ color: c.muted, fontSize: 18 }}>+91</T>
              <TextInput
                value={mobile}
                onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(-10))}
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
                placeholder="Mobile number"
                placeholderTextColor={c.muted}
                accessibilityLabel="Mobile number"
                style={[styles.input, { color: c.ink }]}
              />
            </View>
            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="PIN"
              placeholderTextColor={c.muted}
              accessibilityLabel="PIN"
              onSubmitEditing={logIn}
              style={[styles.pin, { borderColor: c.field, backgroundColor: c.card, color: c.ink }]}
            />
            {err && <Banner kind="error">{err}</Banner>}
            <Button title="Log in" onPress={logIn} loading={busy} disabled={!/^[6-9]\d{9}$/.test(mobile) || pin.length < 4} />
          </>
        ) : (
          <>
            <T v="title">Hi {pending.user.name}, choose your own PIN</T>
            <T v="small">4 to 6 digits. Don&apos;t use 1234 or 1111. Only you should know it.</T>
            <TextInput
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              placeholder="New PIN"
              placeholderTextColor={c.muted}
              accessibilityLabel="New PIN"
              style={[styles.pin, { borderColor: c.field, backgroundColor: c.card, color: c.ink }]}
            />
            <TextInput
              value={again}
              onChangeText={(t) => setAgain(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="New PIN again"
              placeholderTextColor={c.muted}
              accessibilityLabel="New PIN again"
              style={[styles.pin, { borderColor: c.field, backgroundColor: c.card, color: c.ink }]}
            />
            {(pinProblem || err) && <Banner kind="error">{pinProblem ?? err ?? ''}</Banner>}
            <Button
              title="Save PIN and open scanner"
              onPress={changePin}
              loading={busy}
              disabled={newPin.length < 4 || again !== newPin || !!pinProblem}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

async function fetchWithToken(token: string, body: { current_pin: string; new_pin: string }): Promise<StaffLogin> {
  setStaffToken(token);
  try {
    return await api<StaffLogin>('/api/admin/auth/change-pin', { method: 'POST', body, as: 'staff' });
  } catch (e) {
    setStaffToken(null);
    throw e;
  }
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, height: 58 },
  input: { flex: 1, fontSize: 20, fontFamily: fonts.medium, letterSpacing: 1 },
  pin: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, height: 58, fontSize: 20, fontFamily: fonts.medium },
});
