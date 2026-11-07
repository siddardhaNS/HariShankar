import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fonts, useColors } from '@/lib/theme';
import type { Customer } from '@/lib/types';

type OtpOut = { sent: boolean; expires_in: number; dev_hint: string | null };
type AuthOut = { token: string; customer: Customer; is_new: boolean };

const RESEND_AFTER = 30;

export default function Login() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const valid = /^[6-9]\d{9}$/.test(mobile);

  const sendCode = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<OtpOut>('/api/app/auth/otp', { method: 'POST', body: { mobile } });
      setHint(r.dev_hint);
      setStep('code');
      setCode('');
      setWait(RESEND_AFTER);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await api<AuthOut>('/api/app/auth/verify', { method: 'POST', body: { mobile, code: value } });
      await signIn(r.token, r.customer);
      router.back();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, padding: 24, paddingTop: insets.top + 28 }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-end' }}>
          <T v="label" style={{ color: c.muted }}>Close</T>
        </Pressable>

        <View style={[styles.logo, { backgroundColor: c.brand }]}>
          <T style={{ color: '#fff', fontFamily: fonts.display, fontSize: 22 }}>HS</T>
        </View>

        {step === 'mobile' ? (
          <>
            <T v="display" style={{ fontSize: 32, lineHeight: 34, marginTop: 20 }}>Log in with your mobile</T>
            <T v="small" style={{ marginTop: 8 }}>
              We&apos;ll send a one-time code by SMS. No password. Your tickets stay with this number.
            </T>
            <View style={[styles.mobileRow, { borderColor: valid ? c.brand : c.field, backgroundColor: c.card }]}>
              <T style={{ color: c.muted, fontSize: 18 }}>+91</T>
              <TextInput
                value={mobile}
                onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(-10))}
                keyboardType="number-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={10}
                autoFocus
                placeholder="98765 43210"
                placeholderTextColor={c.muted}
                accessibilityLabel="Mobile number"
                style={[styles.mobileInput, { color: c.ink }]}
                onSubmitEditing={() => valid && sendCode()}
              />
            </View>
            {err && <View style={{ marginTop: 14 }}><Banner kind="error">{err}</Banner></View>}
            <Button title="Send code" onPress={sendCode} disabled={!valid} loading={busy} style={{ marginTop: 20 }} />
            <Button title="Theatre staff? Open the gate scanner" kind="ghost" onPress={() => router.replace('/staff/gate')} style={{ marginTop: 18 }} />
          </>
        ) : (
          <>
            <T v="display" style={{ fontSize: 32, lineHeight: 34, marginTop: 20 }}>Enter the code</T>
            <T v="small" style={{ marginTop: 8 }}>
              Sent to +91 {mobile}.{' '}
              <T v="small" style={{ color: c.brand }} onPress={() => setStep('mobile')}>Change</T>
            </T>
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={c.muted}
              accessibilityLabel="One-time code"
              style={[styles.code, { borderColor: c.field, color: c.ink, backgroundColor: c.card }]}
            />
            {hint && <T v="small" style={{ marginTop: 8, color: c.warnInk }}>{hint}</T>}
            {err && <View style={{ marginTop: 14 }}><Banner kind="error">{err}</Banner></View>}
            <Button title="Log in" onPress={() => verify()} disabled={code.length !== 6} loading={busy} style={{ marginTop: 20 }} />
            <Button
              title={wait > 0 ? `Send again in ${wait}s` : 'Send code again'}
              kind="ghost"
              disabled={wait > 0 || busy}
              onPress={sendCode}
              style={{ marginTop: 6 }}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  mobileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, height: 58, marginTop: 24 },
  mobileInput: { flex: 1, fontSize: 20, fontFamily: fonts.medium, letterSpacing: 1 },
  code: { borderWidth: 1.5, borderRadius: 12, height: 62, marginTop: 24, textAlign: 'center', fontSize: 28, letterSpacing: 12, fontFamily: fonts.bold },
});
