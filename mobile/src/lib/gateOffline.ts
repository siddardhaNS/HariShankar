/**
 * Gate scanning without internet.
 *
 * While online, the scanner keeps a copy of today's bookings (`/api/gate/offline`)
 * in a file on the phone. Without internet, tickets are checked against that copy
 * with the same results as the server gives, and the people let in are saved as
 * entries waiting to sync. When the internet is back they're sent to
 * `/api/gate/sync`; each has an id chosen here, so sending twice records once.
 *
 * Offline, the QR signature can't be checked (the key stays on the server), so a
 * ticket must match a real booking in the copy. Booking IDs are random, so a
 * typed-up fake won't match.
 */
import { File, Paths } from 'expo-file-system';

import { api, ApiError } from './api';
import type { GateEntry, GateShow, GateTicket, GateVerdict } from './types';

export type OfflineShow = {
  id: string;
  movie_title: string;
  label: string;
  starts_at: string;
  opens_at: string;
  ends_at: string;
  status: 'scheduled' | 'cancelled';
};

export type OfflineBooking = {
  id: string;
  code: string;
  show_id: string;
  state: 'ok' | 'not_paid' | 'cancelled';
  message: string;
  customer_name: string;
  mobile_last4: string;
  seats: string[];
  seats_total: number;
  seats_admitted: number;
};

export type OfflineList = { generated_at: string; theatre_id: string; shows: OfflineShow[]; bookings: OfflineBooking[] };

export type PendingEntry = { id: string; booking_id: string; count: number; scanned_at: string };

type Saved = { list: OfflineList | null; pending: PendingEntry[] };

const FILE_NAME = 'gate-offline.json';
const QR_PREFIX = 'HSPP1.';

let state: Saved = { list: null, pending: [] };
let loaded = false;

function file() {
  return new File(Paths.document, FILE_NAME);
}

function save() {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.writeSync(JSON.stringify(state));
  } catch {
    // Storage full or unavailable: keep working from memory
  }
}

export function load(): Saved {
  if (!loaded) {
    loaded = true;
    try {
      const f = file();
      if (f.exists) state = { list: null, pending: [], ...JSON.parse(f.textSync()) };
    } catch {
      state = { list: null, pending: [] };
    }
  }
  return state;
}

/** Forget everything (staff logged out, or a different theatre). */
export function clear() {
  state = { list: null, pending: [] };
  loaded = true;
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // nothing to remove
  }
}

export function pendingCount() {
  return load().pending.reduce((a, e) => a + e.count, 0);
}

export function isNetworkError(e: unknown) {
  return e instanceof ApiError && e.status === 0;
}

function uuid4() {
  // Random v4 id for an offline entry; collisions are not a practical concern
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

// ---------- Talking to the server ----------

/** Fresh copy of today's bookings. Throws when offline. */
export async function refresh(): Promise<OfflineList> {
  const list = await api<OfflineList>('/api/gate/offline', { as: 'staff', timeoutMs: 10_000 });
  load();
  if (state.list && state.list.theatre_id !== list.theatre_id) state.pending = [];
  state.list = list;
  save();
  return list;
}

export type SyncReport = { sent: number; problems: string[] };

/** Send entries made offline. Throws when offline; keeps them for next time. */
export async function sync(): Promise<SyncReport> {
  const pending = [...load().pending];
  if (!pending.length) return { sent: 0, problems: [] };
  const res = await api<{ results: { id: string; result: string; message: string }[] }>('/api/gate/sync', {
    method: 'POST',
    body: { entries: pending },
    as: 'staff',
    timeoutMs: 15_000,
  });
  const done = new Set(res.results.map((r) => r.id));
  const codes = new Map(state.list?.bookings.map((b) => [b.id, b.code]) ?? []);
  const problems = res.results
    .filter((r) => r.result === 'problem' || r.result === 'rejected')
    .map((r) => {
      const e = pending.find((p) => p.id === r.id);
      return `${(e && codes.get(e.booking_id)) ?? 'A booking'}: ${r.message}`;
    });
  state.pending = state.pending.filter((e) => !done.has(e.id));
  save();
  return { sent: res.results.length, problems };
}

// ---------- Checking tickets on the phone ----------

function admittedHere(bookingId: string) {
  return load().pending.filter((e) => e.booking_id === bookingId).reduce((a, e) => a + e.count, 0);
}

function clock(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    .format(new Date(iso))
    .toUpperCase();
}

/** Today's shows from the copy, shaped like the online show list. */
export function offlineShows(): GateShow[] {
  const list = load().list;
  if (!list) return [];
  const now = Date.now();
  return list.shows.map((s) => {
    // Same as online: seats held by paid bookings and by ones waiting for a payment check
    const bs = list.bookings.filter((b) => b.show_id === s.id && b.state !== 'cancelled');
    return {
      id: s.id,
      movie_title: s.movie_title,
      label: s.label,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: s.status,
      gate_open: s.status === 'scheduled' && new Date(s.opens_at).getTime() <= now && now <= new Date(s.ends_at).getTime(),
      seats_sold: bs.reduce((a, b) => a + b.seats_total, 0),
      seats_admitted: bs.reduce((a, b) => a + b.seats_admitted + admittedHere(b.id), 0),
    };
  });
}

const empty = (verdict: GateVerdict, message: string): GateTicket => ({
  verdict, message, booking_id: null, code: null, customer_name: '', mobile_last4: '', movie_title: '', show_id: null,
  show_label: '', starts_at: null, seats: [], seats_total: 0, seats_admitted: 0, seats_left: 0, entries: [],
});

/** Same answers as the server's lookup, from the copy on the phone. */
export function lookup(scan: string, gateShowId: string | null): GateTicket {
  const list = load().list;
  if (!list) return empty('not_found', "No internet, and today's list hasn't been downloaded on this phone yet");
  const text = scan.trim();
  let code: string;
  if (text.startsWith(QR_PREFIX)) {
    const parts = text.split('.');
    if (parts.length !== 3) return empty('fake', 'This QR is not a real Hari Shankar ticket');
    code = parts[1];
  } else {
    code = text.replace(/[\s-]/g, '').toUpperCase();
  }
  const b = list.bookings.find((x) => x.code === code);
  if (!b) {
    return text.startsWith(QR_PREFIX)
      ? empty('not_found', `${code} isn't in today's list. If it's for another day, check again when online`)
      : empty('not_found', `No booking ${code} in today's list`);
  }
  const show = list.shows.find((s) => s.id === b.show_id)!;
  const local = load().pending.filter((e) => e.booking_id === b.id);
  const admitted = b.seats_admitted + local.reduce((a, e) => a + e.count, 0);
  const left = Math.max(b.seats_total - admitted, 0);
  const now = Date.now();

  let verdict: GateVerdict;
  let message: string;
  if (b.state === 'not_paid') [verdict, message] = ['not_paid', b.message];
  else if (b.state === 'cancelled' || show.status === 'cancelled') [verdict, message] = ['cancelled', b.message || 'This show was cancelled'];
  else if (gateShowId && gateShowId !== b.show_id) [verdict, message] = ['other_show', `Ticket is for the ${show.label.toLowerCase()} today at ${clock(show.starts_at)}`];
  else if (now < new Date(show.opens_at).getTime()) [verdict, message] = ['too_early', `Gate opens at ${clock(show.opens_at)}`];
  else if (now > new Date(show.ends_at).getTime()) [verdict, message] = ['show_over', 'This show has ended'];
  else if (left === 0) [verdict, message] = ['all_in', `All ${b.seats_total} already in`];
  else [verdict, message] = ['ok', admitted === 0 ? `${b.seats_total} on this ticket, none in yet` : `${admitted} already in. ${left} left`];

  const entries: GateEntry[] = local.map((e) => ({ id: e.id, count: e.count, at: e.scanned_at, by: 'this phone, not synced yet', can_undo: true }));
  return {
    verdict, message, booking_id: b.id, code: b.code, customer_name: b.customer_name, mobile_last4: b.mobile_last4,
    movie_title: show.movie_title, show_id: show.id, show_label: show.label, starts_at: show.starts_at, seats: b.seats,
    seats_total: b.seats_total, seats_admitted: admitted, seats_left: left, entries,
  };
}

/** Let people in without internet; synced later. */
export function admit(bookingId: string, count: number) {
  load();
  state.pending.push({ id: uuid4(), booking_id: bookingId, count, scanned_at: new Date().toISOString() });
  save();
}

/** Undo a wrong tap made offline (only entries not yet synced). */
export function undo(entryId: string): boolean {
  load();
  const before = state.pending.length;
  state.pending = state.pending.filter((e) => e.id !== entryId);
  save();
  return state.pending.length < before;
}
