import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { BRAND, LogoGlyph, MARK, Wordmark } from '@/components/Logo';
import { Banner, Button, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fonts, useColors } from '@/lib/theme';
import type { Customer } from '@/lib/types';

type OtpOut = { sent: boolean; expires_in: number; dev_hint: string | null };
type AuthOut = { token: string; customer: Customer; is_new: boolean };

const RESEND_AFTER = 30;
const CODE_LENGTH = 6;

/** 9876543210 -> 98765 43210 */
const pretty = (m: string) => (m.length > 5 ? `${m.slice(0, 5)} ${m.slice(5)}` : m);

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
  const [focused, setFocused] = useState(false);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // With the keyboard up, the hero shrinks to the logo so the field and button fit
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
    if (value.length !== CODE_LENGTH) return;
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
    <View style={{ flex: 1, backgroundColor: BRAND.deep }}>
      <StatusBar style="light" />
      <Backdrop />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Hero */}
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 28 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              hitSlop={12}
              style={[styles.close, { backgroundColor: 'rgba(255,255,255,0.14)' }]}
            >
              <T style={{ color: '#fff', fontSize: 20, lineHeight: 22 }}>×</T>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 }}>
              <LogoGlyph size={56} />
              <Wordmark color="#FFFFFF" size={22} />
            </View>

            {!keyboard && (
              <>
                <T style={styles.headline}>{step === 'mobile' ? 'Your seat\nis waiting.' : 'Almost\nthere.'}</T>
                <T style={styles.tagline}>
                  {step === 'mobile'
                    ? 'Pick your seats, pay by UPI, and walk in with the QR on your phone.'
                    : 'One code and your tickets are a tap away.'}
                </T>
              </>
            )}
          </View>

          {/* Sheet */}
          <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 24 }]}>
            {step === 'mobile' ? (
              <>
                <T v="title">Log in or sign up</T>
                <T v="small" style={{ marginTop: 4 }}>We&apos;ll send a 6-digit code by SMS. No password to remember.</T>

                <View
                  style={[
                    styles.field,
                    { borderColor: focused ? c.brand : c.field, backgroundColor: c.bg },
                    focused && { shadowColor: c.brand, shadowOpacity: 0.18, shadowRadius: 8, elevation: 2 },
                  ]}
                >
                  <View style={[styles.cc, { borderRightColor: c.line }]}>
                    <T style={{ fontSize: 17 }}>🇮🇳</T>
                    <T style={{ fontFamily: fonts.medium, fontSize: 17, color: c.ink }}>+91</T>
                  </View>
                  <TextInput
                    value={pretty(mobile)}
                    onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(-10))}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    keyboardType="number-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    maxLength={11}
                    autoFocus
                    placeholder="98765 43210"
                    placeholderTextColor={c.muted}
                    accessibilityLabel="Mobile number"
                    style={[styles.mobileInput, { color: c.ink }]}
                    onSubmitEditing={() => valid && sendCode()}
                  />
                  {valid && <T style={{ color: c.ok, fontSize: 18, paddingRight: 14 }}>✓</T>}
                </View>

                {err && <View style={{ marginTop: 14 }}><Banner kind="error">{err}</Banner></View>}
                <Button title="Get code" onPress={sendCode} disabled={!valid} loading={busy} style={{ marginTop: 18, minHeight: 54 }} />
                <T v="small" style={{ fontSize: 12, textAlign: 'center', marginTop: 12 }}>
                  Your number is only used for your tickets, and for offers if you turn them on.
                </T>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/staff/gate')}
                  style={[styles.staff, { borderTopColor: c.line }]}
                >
                  <T v="small">Theatre staff?</T>
                  <T v="label" style={{ color: c.brand, fontSize: 14 }}>Open the gate scanner →</T>
                </Pressable>
              </>
            ) : (
              <>
                <T v="title">Enter the code</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                  <T v="small">Sent to +91 {pretty(mobile)} · </T>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setStep('mobile'); setErr(null); }}>
                    <T v="small" style={{ color: c.brand, fontFamily: fonts.bold }}>Change</T>
                  </Pressable>
                </View>

                <Pressable onPress={() => codeRef.current?.focus()} style={styles.boxes} accessible={false}>
                  {Array.from({ length: CODE_LENGTH }, (_, i) => {
                    const ch = code[i];
                    const active = i === Math.min(code.length, CODE_LENGTH - 1) && !busy;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.box,
                          {
                            backgroundColor: c.bg,
                            borderColor: err ? c.brand : active ? c.ink : ch ? c.field : c.line,
                            borderWidth: active ? 2 : 1.5,
                          },
                        ]}
                      >
                        <T style={{ fontFamily: fonts.bold, fontSize: 26, color: c.ink }}>{ch ?? ''}</T>
                      </View>
                    );
                  })}
                  {/* One real input under the boxes: paste and SMS autofill work */}
                  <TextInput
                    ref={codeRef}
                    value={code}
                    onChangeText={(t) => {
                      const v = t.replace(/\D/g, '').slice(0, CODE_LENGTH);
                      setCode(v);
                      setErr(null);
                      if (v.length === CODE_LENGTH) void verify(v);
                    }}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                    maxLength={CODE_LENGTH}
                    caretHidden
                    accessibilityLabel="One-time code"
                    style={styles.hiddenInput}
                  />
                </Pressable>

                {hint && <T v="small" style={{ marginTop: 10, color: c.warnInk }}>{hint}</T>}
                {err && <View style={{ marginTop: 14 }}><Banner kind="error">{err}</Banner></View>}
                <Button
                  title="Log in"
                  onPress={() => verify()}
                  disabled={code.length !== CODE_LENGTH}
                  loading={busy}
                  style={{ marginTop: 18, minHeight: 54 }}
                />
                <Button
                  title={wait > 0 ? `Send a new code in 0:${String(wait).padStart(2, '0')}` : 'Send a new code'}
                  kind="ghost"
                  disabled={wait > 0 || busy}
                  onPress={sendCode}
                  style={{ marginTop: 4 }}
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Brand gradient with the arch drawn large and faint behind the hero. */
function Backdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 200" preserveAspectRatio="xMidYMin slice">
      <Defs>
        <LinearGradient id="loginBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BRAND.red} />
          <Stop offset="1" stopColor={BRAND.deep} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="200" fill="url(#loginBg)" />
      <Path
        d={MARK.arch}
        transform="translate(38 -6) scale(1.1)"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.08}
        strokeWidth={7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  close: { alignSelf: 'flex-end', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: 'RobotoCondensed_700Bold', fontSize: 44, lineHeight: 46, color: '#FFFFFF', marginTop: 34, textTransform: 'uppercase' },
  tagline: { fontFamily: 'Roboto_400Regular', fontSize: 16, lineHeight: 23, color: 'rgba(255,255,255,0.86)', marginTop: 10, maxWidth: 320 },
  sheet: { flexGrow: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 28 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, height: 60, marginTop: 22, overflow: 'hidden' },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: '100%', borderRightWidth: 1 },
  mobileInput: { flex: 1, fontSize: 20, fontFamily: 'Roboto_500Medium', letterSpacing: 1, paddingHorizontal: 14 },
  staff: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  box: { width: 48, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent', fontSize: 1 },
});
