const TZ = "Asia/Kolkata";

/** ₹300 or ₹347.20, Indian digit grouping */
export function rupees(paise: number) {
  const r = paise / 100;
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function time(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
    .format(new Date(iso))
    .toUpperCase();
}

export function dayLong(isoOrDate: string) {
  const d = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00+05:30`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(d);
}

export function dateTime(iso: string) {
  return `${dayLong(iso)}, ${time(iso)}`;
}

/** YYYY-MM-DD in IST */
export function istDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function addDays(dateKey: string, n: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}
