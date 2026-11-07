// The theatre is in India (IST, UTC+5:30, no daylight saving), so times are
// shifted by a fixed offset rather than relying on Intl time zone support.
const IST_MS = 330 * 60 * 1000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ist(iso: string | Date) {
  return new Date(new Date(iso).getTime() + IST_MS);
}

/** ₹300 or ₹347.20 */
export function rupees(paise: number) {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const whole = String(Math.floor(abs / 100));
  // Indian grouping: 1,23,456
  const grouped =
    whole.length > 3 ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}` : whole;
  const p = abs % 100;
  return `${neg ? '−' : ''}₹${grouped}${p ? `.${String(p).padStart(2, '0')}` : ''}`;
}

/** 9:30 PM */
export function time(iso: string) {
  const d = ist(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** YYYY-MM-DD of an instant, in IST */
export function istDateKey(iso: string | Date) {
  return ist(iso).toISOString().slice(0, 10);
}

/** For a YYYY-MM-DD: Today / Tomorrow / Mon, 26 Oct */
export function dayName(dateKey: string) {
  const today = istDateKey(new Date());
  const tomorrow = istDateKey(new Date(Date.now() + 86_400_000));
  if (dateKey === today) return 'Today';
  if (dateKey === tomorrow) return 'Tomorrow';
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Day chip parts for the date picker */
export function dayParts(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return { dow: DAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

/** Mon, 26 Oct · 9:30 PM, with Today/Tomorrow where it fits */
export function when(iso: string) {
  return `${dayName(istDateKey(iso))} · ${time(iso)}`;
}

export function runtime(min: number) {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function payMethodLabel(m: string | null) {
  return m === 'upi' ? 'UPI' : m === 'card' ? 'Card' : m === 'netbanking' ? 'Net banking' : '—';
}
