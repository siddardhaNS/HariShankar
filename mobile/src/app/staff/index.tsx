import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, Vibration, View } from 'react-native';

import { Banner, Button, Card, Header, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { time } from '@/lib/format';
import { useStaff } from '@/lib/staff';
import { fonts, useColors, type Colors } from '@/lib/theme';
import type { GateShow, GateTicket, GateVerdict } from '@/lib/types';

const HEADLINE: Record<GateVerdict, string> = {
  ok: 'Let in',
  all_in: 'Already in',
  not_paid: 'Not paid',
  cancelled: 'Not valid',
  other_show: 'Wrong show',
  too_early: 'Too early',
  show_over: 'Show over',
  not_found: 'Not found',
  fake: 'Fake ticket',
};

function tone(v: GateVerdict, c: Colors) {
  if (v === 'ok') return { bg: c.ok, fg: '#FFFFFF' };
  if (v === 'all_in' || v === 'too_early' || v === 'other_show' || v === 'show_over') return { bg: c.warnSoft, fg: c.warnInk };
  return { bg: c.brand, fg: '#FFFFFF' };
}

/** Show the gate is letting in: the one open now, else the next one, else the last. */
function pickShow(shows: GateShow[]): string | null {
  const live = shows.filter((s) => s.status === 'scheduled');
  const now = Date.now();
  return (
    live.find((s) => s.gate_open)?.id ??
    live.find((s) => new Date(s.ends_at).getTime() > now)?.id ??
    live.at(-1)?.id ??
    null
  );
}

export default function GateScreen() {
  const c = useColors();
  const { staff, signOut } = useStaff();
  const [permission, requestPermission] = useCameraPermissions();
  const [shows, setShows] = useState<GateShow[] | null>(null);
  const [showId, setShowId] = useState<string | null>(null);
  const [result, setResult] = useState<GateTicket | null>(null);
  const [count, setCount] = useState(1);
  const [justIn, setJustIn] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handling = useRef(false); // the camera fires many times a second for one QR

  const loadShows = useCallback(async () => {
    try {
      const list = await api<GateShow[]>('/api/gate/shows', { as: 'staff' });
      setShows(list);
      setShowId((cur) => (cur && list.some((s) => s.id === cur) ? cur : pickShow(list)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't load today's shows");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadShows();
    }, [loadShows]),
  );

  if (!staff) return <Redirect href="/staff/login" />;

  const show = shows?.find((s) => s.id === showId) ?? null;

  const check = async (scan: string) => {
    if (handling.current) return;
    handling.current = true;
    setErr(null);
    setBusy(true);
    try {
      const t = await api<GateTicket>('/api/gate/lookup', { method: 'POST', body: { scan, show_id: showId }, as: 'staff' });
      setResult(t);
      setCount(t.seats_left);
      setJustIn(null);
      setTyped('');
      Vibration.vibrate(t.verdict === 'ok' ? 80 : [0, 250, 120, 250]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
      handling.current = false;
    } finally {
      setBusy(false);
    }
  };

  const admit = async () => {
    if (!result?.booking_id) return;
    setErr(null);
    setBusy(true);
    try {
      const t = await api<GateTicket>(`/api/gate/bookings/${result.booking_id}/admit`, {
        method: 'POST',
        body: { count, show_id: showId },
        as: 'staff',
      });
      setResult(t);
      setJustIn(count);
      setCount(t.seats_left);
      void loadShows();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const undo = async (entryId: string) => {
    setErr(null);
    setBusy(true);
    try {
      const t = await api<GateTicket>(`/api/gate/entries/${entryId}`, { method: 'DELETE', as: 'staff' });
      // Undo answers without a show; ask again so a wrong-show ticket stays marked
      setResult(t.code ? await api<GateTicket>('/api/gate/lookup', {
        method: 'POST', body: { scan: t.code, show_id: showId }, as: 'staff',
      }) : t);
      setJustIn(null);
      setCount(t.seats_left);
      void loadShows();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setResult(null);
    setJustIn(null);
    setErr(null);
    handling.current = false;
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        title="Gate"
        subtitle={`${staff.user.name} · ${staff.theatre?.name ?? ''}`}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        right={
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={async () => {
              await signOut();
              router.replace('/');
            }}
            style={{ marginTop: 6 }}
          >
            <T v="label" style={{ color: c.brand }}>Log out</T>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Show picker */}
        {shows && shows.length === 0 && <Banner kind="info" title="No shows today">Tickets for other days can&apos;t be let in.</Banner>}
        {shows && shows.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {shows.map((s) => {
              const on = s.id === showId;
              const off = s.status === 'cancelled';
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setShowId(s.id)}
                  style={[styles.showChip, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.ink : c.card }]}
                >
                  <T v="label" style={{ color: on ? c.bg : c.ink }}>{s.label} · {time(s.starts_at)}</T>
                  <T v="small" style={{ color: on ? c.bg : c.muted, fontSize: 12 }}>
                    {off ? 'Cancelled' : `${s.seats_admitted} of ${s.seats_sold} in${s.gate_open ? ' · gate open' : ''}`}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {show && <T v="small" numberOfLines={1}>{show.movie_title}</T>}

        {err && <Banner kind="error">{err}</Banner>}

        {!result ? (
          <>
            <View style={[styles.camera, { backgroundColor: c.navy }]}>
              {permission?.granted ? (
                <>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    enableTorch={torch}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={busy ? undefined : ({ data }) => void check(data)}
                  />
                  <View pointerEvents="none" style={styles.frame} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={torch ? 'Torch off' : 'Torch on'}
                    onPress={() => setTorch((t) => !t)}
                    style={styles.torch}
                  >
                    <T v="label" style={{ color: '#fff' }}>{torch ? 'Torch off' : 'Torch on'}</T>
                  </Pressable>
                </>
              ) : (
                <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                  <T v="label" style={{ color: '#fff', textAlign: 'center' }}>Allow the camera to scan ticket QR codes</T>
                  {permission && !permission.canAskAgain ? (
                    <T v="small" style={{ color: '#C9CCDC', textAlign: 'center' }}>
                      Camera is turned off for this app. Turn it on in phone Settings, or type the booking ID below.
                    </T>
                  ) : (
                    <Button title="Allow camera" onPress={requestPermission} style={{ minWidth: 180 }} />
                  )}
                </View>
              )}
            </View>
            <T v="small" style={{ textAlign: 'center' }}>Point at the QR on the customer&apos;s phone</T>

            <Card style={{ gap: 10 }}>
              <T v="label">No QR? Type the booking ID</T>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={typed}
                  onChangeText={(t) => setTyped(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="H57K2X"
                  placeholderTextColor={c.muted}
                  accessibilityLabel="Booking ID"
                  onSubmitEditing={() => typed.length >= 4 && check(typed)}
                  style={[styles.codeInput, { borderColor: c.field, color: c.ink, backgroundColor: c.bg }]}
                />
                <Button title="Check" onPress={() => check(typed)} loading={busy} disabled={typed.length < 4} style={{ minWidth: 96 }} />
              </View>
            </Card>
          </>
        ) : (
          <Result
            t={result}
            count={count}
            setCount={setCount}
            justIn={justIn}
            busy={busy}
            onAdmit={admit}
            onUndo={undo}
            onNext={next}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Result({ t, count, setCount, justIn, busy, onAdmit, onUndo, onNext }: {
  t: GateTicket;
  count: number;
  setCount: (n: number) => void;
  justIn: number | null;
  busy: boolean;
  onAdmit: () => void;
  onUndo: (entryId: string) => void;
  onNext: () => void;
}) {
  const c = useColors();
  const shown: GateVerdict = justIn !== null && t.seats_left === 0 ? 'ok' : t.verdict;
  const { bg, fg } = tone(shown, c);
  const headline = justIn !== null ? `${justIn} let in` : HEADLINE[t.verdict];
  const message = justIn !== null
    ? t.seats_left === 0 ? `All ${t.seats_total} on this ticket are in` : `${t.seats_left} more can come in later on this ticket`
    : t.message;

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.verdict, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
        <T style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 46, color: fg, textTransform: 'uppercase' }}>{headline}</T>
        <T style={{ fontFamily: fonts.medium, fontSize: 17, lineHeight: 22, color: fg, marginTop: 4 }}>{message}</T>
      </View>

      {t.booking_id && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T v="title" numberOfLines={1}>{t.customer_name || 'Customer'}</T>
              <T v="small">Mobile ending {t.mobile_last4} · {t.code}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: c.ink }}>
                {t.seats_admitted}/{t.seats_total}
              </T>
              <T v="small" style={{ fontSize: 12 }}>in</T>
            </View>
          </View>
          <T v="small" numberOfLines={1}>
            {t.movie_title} · {t.show_label}{t.starts_at ? ` · ${time(t.starts_at)}` : ''}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {t.seats.map((s) => (
              <View key={s} style={[styles.seat, { backgroundColor: c.chip }]}>
                <T v="label" style={{ fontSize: 14 }}>{s}</T>
              </View>
            ))}
          </View>
          {t.entries.length > 0 && (
            <View style={{ gap: 6, marginTop: 4 }}>
              {t.entries.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T v="small" style={{ flex: 1 }}>{e.count} in at {time(e.at)} by {e.by}</T>
                  {e.can_undo && (
                    <Pressable accessibilityRole="button" hitSlop={10} disabled={busy} onPress={() => onUndo(e.id)}>
                      <T v="label" style={{ color: c.brand, fontSize: 14 }}>Undo</T>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {t.verdict === 'ok' && t.seats_left > 0 && (
        <Card style={{ gap: 12 }}>
          <T v="label">How many are coming in now?</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            <Stepper label="−" a11y="One fewer" disabled={count <= 1} onPress={() => setCount(count - 1)} />
            <T style={{ fontFamily: fonts.display, fontSize: 48, lineHeight: 52, color: c.ink, minWidth: 60, textAlign: 'center' }}>
              {count}
            </T>
            <Stepper label="+" a11y="One more" disabled={count >= t.seats_left} onPress={() => setCount(count + 1)} />
          </View>
          <Button title={count === t.seats_left ? `Let all ${count} in` : `Let ${count} in`} onPress={onAdmit} loading={busy} />
        </Card>
      )}

      <Button title="Scan next ticket" kind={t.verdict === 'ok' && t.seats_left > 0 ? 'secondary' : 'primary'} onPress={onNext} />
    </View>
  );
}

function Stepper({ label, a11y, disabled, onPress }: { label: string; a11y: string; disabled: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, { borderColor: c.field, backgroundColor: c.card, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <T style={{ fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: c.ink }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  showChip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  camera: { height: 320, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 220, height: 220, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  torch: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  codeInput: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 20, fontFamily: fonts.bold, letterSpacing: 3 },
  verdict: { borderRadius: 18, padding: 20 },
  seat: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  step: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
