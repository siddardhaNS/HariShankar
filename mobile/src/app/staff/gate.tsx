import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, Vibration, View } from 'react-native';

import { Banner, Button, Card, Header, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { time } from '@/lib/format';
import * as offlineGate from '@/lib/gateOffline';
import { useStaff } from '@/lib/staff';
import { fonts, useColors, type Colors } from '@/lib/theme';
import type { GateShow, GateTicket, GateVerdict, ScannedTicket } from '@/lib/types';

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
  const [tab, setTab] = useState<'scan' | 'scanned'>('scan');
  // The camera only opens when the staff member taps Start scanning
  const [scanning, setScanning] = useState(false);
  // Offline: no internet, tickets checked against today's list saved on the phone
  const [offline, setOffline] = useState(false);
  const [listAt, setListAt] = useState<string | null>(() => offlineGate.load().list?.generated_at ?? null);
  const [waiting, setWaiting] = useState(() => offlineGate.pendingCount());
  const [checkedOffline, setCheckedOffline] = useState(false);
  const [syncProblems, setSyncProblems] = useState<string[]>([]);

  const goOffline = useCallback(() => {
    setOffline(true);
    const list = offlineGate.offlineShows();
    if (list.length) {
      setShows(list);
      setShowId((cur) => (cur && list.some((s) => s.id === cur) ? cur : pickShow(list)));
    }
  }, []);

  const loadShows = useCallback(async () => {
    try {
      const list = await api<GateShow[]>('/api/gate/shows', { as: 'staff', timeoutMs: 8_000 });
      setShows(list);
      setShowId((cur) => (cur && list.some((s) => s.id === cur) ? cur : pickShow(list)));
      setOffline(false);
    } catch (e) {
      if (offlineGate.isNetworkError(e)) goOffline();
      else setErr(e instanceof ApiError ? e.message : "Couldn't load today's shows");
    }
  }, [goOffline]);

  /** Send entries made offline, then refresh today's list. Quiet when there's no internet. */
  const syncAndRefresh = useCallback(async () => {
    try {
      const report = await offlineGate.sync();
      if (report.problems.length) setSyncProblems((p) => [...p, ...report.problems]);
      const list = await offlineGate.refresh();
      setListAt(list.generated_at);
      setOffline(false);
    } catch (e) {
      if (offlineGate.isNetworkError(e)) goOffline();
    } finally {
      setWaiting(offlineGate.pendingCount());
    }
  }, [goOffline]);

  useFocusEffect(
    useCallback(() => {
      void loadShows();
      void syncAndRefresh();
      const every = setInterval(() => {
        void syncAndRefresh().then(loadShows);
      }, 60_000);
      return () => {
        clearInterval(every);
        setScanning(false); // leaving the screen turns the camera off
      };
    }, [loadShows, syncAndRefresh]),
  );

  if (!staff) return <Redirect href="/staff/login" />;

  const show = shows?.find((s) => s.id === showId) ?? null;

  const showResult = (t: GateTicket, fromPhone: boolean) => {
    setResult(t);
    setCount(t.seats_left);
    setJustIn(null);
    setTyped('');
    setCheckedOffline(fromPhone);
    Vibration.vibrate(t.verdict === 'ok' ? 80 : [0, 250, 120, 250]);
  };

  const check = async (scan: string) => {
    if (handling.current) return;
    handling.current = true;
    setErr(null);
    // Known to be offline: answer at once from the phone; the minute timer finds the internet again
    if (offline) {
      showResult(offlineGate.lookup(scan, showId), true);
      return;
    }
    setBusy(true);
    try {
      const t = await api<GateTicket>('/api/gate/lookup', {
        method: 'POST', body: { scan, show_id: showId }, as: 'staff', timeoutMs: 5_000,
      });
      showResult(t, false);
    } catch (e) {
      if (offlineGate.isNetworkError(e)) {
        goOffline();
        showResult(offlineGate.lookup(scan, showId), true);
      } else {
        setErr(e instanceof ApiError ? e.message : 'Something went wrong');
        handling.current = false;
      }
    } finally {
      setBusy(false);
    }
  };

  const admitOnPhone = (bookingId: string, code: string | null) => {
    offlineGate.admit(bookingId, count);
    setWaiting(offlineGate.pendingCount());
    const t = offlineGate.lookup(code ?? '', showId);
    setResult(t);
    setJustIn(count);
    setCount(t.seats_left);
    setCheckedOffline(true);
    goOffline();
  };

  const admit = async () => {
    if (!result?.booking_id) return;
    setErr(null);
    if (checkedOffline) {
      admitOnPhone(result.booking_id, result.code);
      return;
    }
    setBusy(true);
    try {
      const t = await api<GateTicket>(`/api/gate/bookings/${result.booking_id}/admit`, {
        method: 'POST',
        body: { count, show_id: showId },
        as: 'staff',
        timeoutMs: 5_000,
      });
      setResult(t);
      setJustIn(count);
      setCount(t.seats_left);
      void loadShows();
    } catch (e) {
      // Internet dropped between the scan and the tap: save it on the phone instead
      if (offlineGate.isNetworkError(e) && offlineGate.load().list?.bookings.some((b) => b.id === result.booking_id)) {
        admitOnPhone(result.booking_id, result.code);
      } else {
        setErr(e instanceof ApiError ? e.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  };

  const undo = async (entryId: string) => {
    setErr(null);
    // Not synced yet: just forget it on the phone
    if (offlineGate.undo(entryId)) {
      setWaiting(offlineGate.pendingCount());
      const t = offlineGate.lookup(result?.code ?? '', showId);
      setResult(t);
      setJustIn(null);
      setCount(t.seats_left);
      return;
    }
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
      setErr(offlineGate.isNetworkError(e)
        ? "No internet. Entries already synced can be undone once it's back"
        : e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const startScanning = async () => {
    setErr(null);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        setErr(p.canAskAgain
          ? 'The camera is needed to scan tickets. Tap Start scanning to ask again'
          : 'Camera is turned off for this app. Turn it on in phone Settings, or type the booking ID below');
        return;
      }
    }
    handling.current = false;
    setScanning(true);
  };

  const next = () => {
    setResult(null);
    setJustIn(null);
    setErr(null);
    setCheckedOffline(false);
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
              if (offlineGate.pendingCount() > 0) {
                setErr(`${offlineGate.pendingCount()} let in on this phone haven't synced yet. Log out once the internet is back`);
                return;
              }
              offlineGate.clear();
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

        <View style={[styles.tabs, { backgroundColor: c.chip }]} accessibilityRole="tablist">
          {([['scan', 'Scan'], ['scanned', show ? `Scanned · ${show.seats_admitted}` : 'Scanned']] as const).map(([k, label]) => {
            const on = tab === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setTab(k);
                  if (k === 'scanned') setScanning(false);
                }}
                style={[styles.tab, on && { backgroundColor: c.card }]}
              >
                <T v="label" style={{ color: on ? c.ink : c.muted }}>{label}</T>
              </Pressable>
            );
          })}
        </View>

        <OfflineStatus offline={offline} listAt={listAt} waiting={waiting} />
        {syncProblems.length > 0 && (
          <Banner kind="error" title="Synced, with problems to check">
            <T v="small" style={{ color: c.brandInk, marginTop: 3 }}>{syncProblems.join('\n')}</T>
            <Pressable accessibilityRole="button" onPress={() => setSyncProblems([])} style={{ marginTop: 8 }}>
              <T v="label" style={{ color: c.brand }}>OK</T>
            </Pressable>
          </Banner>
        )}

        {err && <Banner kind="error">{err}</Banner>}

        {tab === 'scanned' ? (
          <ScannedList key={showId ?? "none"} showId={showId} offline={offline} admitted={show?.seats_admitted ?? 0} sold={show?.seats_sold ?? 0} />
        ) : !result ? (
          <>
            {!scanning ? (
              <View style={[styles.ready, { backgroundColor: c.navy }]}>
                <View style={styles.readyFrame} />
                <T style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: '#FFFFFF', textAlign: 'center' }}>
                  READY TO SCAN
                </T>
                <T v="small" style={{ color: '#C9CCDC', textAlign: 'center' }}>
                  {show ? `${show.label} · ${time(show.starts_at)} · ${show.movie_title}` : 'Pick a show above'}
                </T>
                <Button title="Start scanning" onPress={startScanning} style={{ minWidth: 220, marginTop: 6 }} />
              </View>
            ) : (
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
            <Button title="Stop scanning" kind="secondary" onPress={() => setScanning(false)} />
            </>
            )}

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
            fromPhone={checkedOffline}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Tickets people have entered on for the chosen show, latest first */
function ScannedList({ showId, offline, admitted, sold }: { showId: string | null; offline: boolean; admitted: number; sold: number }) {
  const c = useColors();
  const [rows, setRows] = useState<ScannedTicket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [find, setFind] = useState('');

  const load = useCallback(async () => {
    if (!showId) return;
    setErr(null);
    if (offline) {
      setRows(offlineGate.scannedOffline(showId));
      return;
    }
    setLoading(true);
    try {
      setRows(await api<ScannedTicket[]>(`/api/gate/shows/${showId}/scanned`, { as: 'staff', timeoutMs: 8_000 }));
    } catch (e) {
      if (offlineGate.isNetworkError(e)) setRows(offlineGate.scannedOffline(showId));
      else setErr(e instanceof ApiError ? e.message : "Couldn't load the scanned tickets");
    } finally {
      setLoading(false);
    }
  }, [showId, offline]);

  // Load when the tab opens or the show changes, then keep it fresh while it's open
  useFocusEffect(
    useCallback(() => {
      void load();
      const every = setInterval(() => void load(), 30_000);
      return () => clearInterval(every);
    }, [load]),
  );

  if (!showId) return <Banner kind="info" title="No show picked">Pick a show above to see who&apos;s in.</Banner>;

  const q = find.trim().toUpperCase();
  const shown = (rows ?? []).filter(
    (r) => !q || r.code.includes(q) || r.seats.some((s) => s === q || s.startsWith(q)) || r.customer_name.toUpperCase().includes(q),
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <T style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: c.ink }}>{admitted} / {sold}</T>
          <T v="small">seats in · {rows ? `${rows.length} ticket${rows.length === 1 ? '' : 's'} scanned` : 'loading…'}</T>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void load()} disabled={loading} hitSlop={10}>
          <T v="label" style={{ color: c.brand }}>{loading ? 'Refreshing…' : 'Refresh'}</T>
        </Pressable>
      </View>
      {offline && <T v="small" style={{ fontSize: 12 }}>No internet: showing today&apos;s saved list and this phone&apos;s scans.</T>}
      {err && <Banner kind="error">{err}</Banner>}

      <TextInput
        value={find}
        onChangeText={setFind}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Find a seat, booking ID or name"
        placeholderTextColor={c.muted}
        accessibilityLabel="Find a seat, booking ID or name"
        style={[styles.search, { borderColor: c.field, color: c.ink, backgroundColor: c.card }]}
      />

      {rows && rows.length === 0 && <Banner kind="info" title="Nobody in yet">Tickets show up here once people are let in.</Banner>}
      {rows && rows.length > 0 && shown.length === 0 && <T v="small">Nothing matches {find.trim()}.</T>}

      {shown.map((r) => {
        const done = r.seats_admitted >= r.seats_total;
        const problem = r.entries.find((e) => e.problem)?.problem;
        return (
          <Card key={r.booking_id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T v="label" numberOfLines={1}>{r.customer_name || 'Customer'}</T>
                <T v="small" style={{ fontSize: 12 }}>{r.code} · Mobile ending {r.mobile_last4}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: done ? c.ok : c.warnInk }}>
                  {r.seats_admitted}/{r.seats_total}
                </T>
                <T v="small" style={{ fontSize: 12 }}>{done ? 'all in' : 'in'}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {r.seats.map((s) => (
                <View key={s} style={[styles.seat, { backgroundColor: done ? c.okSoft : c.chip }]}>
                  <T v="label" style={{ fontSize: 14, color: done ? c.ok : c.ink }}>{s}</T>
                </View>
              ))}
            </View>
            {r.entries.map((e) => (
              <T key={e.id} v="small" style={{ fontSize: 12 }}>
                {e.count} in at {time(e.at)} by {e.by}{e.offline && !e.by.startsWith('this phone') ? ' (no internet)' : ''}
              </T>
            ))}
            {problem && <T v="small" style={{ fontSize: 12, color: c.brand }}>{problem}</T>}
          </Card>
        );
      })}
    </View>
  );
}

function OfflineStatus({ offline, listAt, waiting }: { offline: boolean; listAt: string | null; waiting: number }) {
  const c = useColors();
  if (offline) {
    return (
      <View style={[styles.offline, { backgroundColor: c.warnSoft }]}>
        <T v="label" style={{ color: c.warnInk }}>No internet</T>
        <T v="small" style={{ color: c.warnInk, marginTop: 2 }}>
          {listAt
            ? `Checking tickets against today's list from ${time(listAt)}.`
            : "Today's list isn't on this phone yet, so tickets can't be checked until the internet is back."}
          {waiting > 0 ? ` ${waiting} let in on this phone will sync when it's back.` : ''}
        </T>
      </View>
    );
  }
  return (
    <T v="small" style={{ fontSize: 12 }}>
      {waiting > 0 ? `Syncing ${waiting} let in without internet…` : listAt ? `Ready for no internet: today's list saved at ${time(listAt)}` : "Saving today's list for no internet…"}
    </T>
  );
}

function Result({ t, count, setCount, justIn, busy, onAdmit, onUndo, onNext, fromPhone }: {
  t: GateTicket;
  count: number;
  setCount: (n: number) => void;
  justIn: number | null;
  busy: boolean;
  onAdmit: () => void;
  onUndo: (entryId: string) => void;
  onNext: () => void;
  fromPhone: boolean;
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
        {fromPhone && <T style={{ fontSize: 12, lineHeight: 16, color: fg, marginTop: 6, opacity: 0.85 }}>Checked on this phone (no internet)</T>}
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
          <Button title={count === t.seats_left && count > 1 ? `Let all ${count} in` : `Let ${count} in`} onPress={onAdmit} loading={busy} />
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
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  ready: { borderRadius: 18, padding: 24, alignItems: 'center', gap: 10 },
  readyFrame: { width: 88, height: 88, borderRadius: 14, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed', marginBottom: 6 },
  search: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 16, fontFamily: fonts.medium },
  camera: { height: 320, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 220, height: 220, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  torch: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  codeInput: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 20, fontFamily: fonts.bold, letterSpacing: 3 },
  verdict: { borderRadius: 18, padding: 20 },
  offline: { borderRadius: 12, padding: 12 },
  seat: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  step: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
