export type Role = "super_admin" | "owner" | "manager" | "gate";

export type Staff = {
  id: string;
  name: string;
  mobile: string;
  role: Role;
  is_active: boolean;
  must_change_pin: boolean;
  last_login_at: string | null;
  theatre_id: string | null;
};

export type Me = {
  user: Staff;
  theatre: { id: string; name: string; city: string } | null;
};

export type LoginResponse = Me & { access_token: string; expires_in: number };

export type FormState = { error?: string; ok?: string } | undefined;

export type LayoutRow = { label: string; class_name: string; seats: number; aisles_after: number[]; indent: number };
export type Layout = { screen_id: string; rows: LayoutRow[]; total_seats: number; classes: string[] };

export type MovieStatus = "coming_soon" | "now_showing" | "archived";
export type Movie = {
  id: string;
  title: string;
  language: string;
  certificate: string;
  runtime_min: number;
  genre: string;
  synopsis: string;
  poster_url: string | null;
  release_date: string | null;
  status: MovieStatus;
  upcoming_shows: number;
};

export type ShowPrice = { seat_class_id: string; class_name: string; price_paise: number };
export type Show = {
  id: string;
  movie_id: string;
  movie_title: string;
  starts_at: string;
  ends_at: string;
  label: string;
  status: "scheduled" | "cancelled";
  cancel_reason: string | null;
  booking_opens_at: string | null;
  prices: ShowPrice[];
  seats_total: number;
  seats_sold: number;
  seats_blocked: number;
  collection_paise: number;
};

export type AdminSeat = {
  id: string;
  row: string;
  number: number;
  r: number;
  c: number;
  class_id: string;
  state: "free" | "booked" | "blocked";
  block_id: string | null;
  block_reason: string | null;
  block_all_shows: boolean;
  booking_code: string | null;
  booked_by: string | null;
  booking_id: string | null;
};
export type SeatMapBooking = {
  id: string;
  code: string;
  name: string;
  mobile: string;
  seats: string[];
  seats_admitted: number;
  total_paise: number;
  booked_at: string;
};
export type AdminSeatMap = {
  show_id: string | null;
  classes: { id: string; name: string }[];
  seats: AdminSeat[];
  bookings: SeatMapBooking[];
};

export type BookingStatus = "payment_pending" | "payment_review" | "confirmed" | "failed" | "refunded" | "cancelled";
export type AdminBooking = {
  id: string;
  code: string;
  status: BookingStatus;
  failure_reason: string | null;
  customer_name: string;
  mobile: string;
  movie_title: string;
  starts_at: string;
  show_label: string;
  show_status: "scheduled" | "cancelled";
  seats: string[];
  total_paise: number;
  refund_paise: number;
  refund_id: string | null;
  payment_method: string | null;
  gateway: string;
  upi_ref: string | null;
  refund_pending: boolean;
  refunded_at: string | null;
  refund_sent_at: string | null;
  refund_note: string | null;
  seats_admitted: number;
  created_at: string;
};

export type Refunds = {
  start: string;
  end: string;
  state: "to_send" | "done" | "all";
  to_send_count: number;
  to_send_paise: number;
  listed_count: number;
  listed_paise: number;
  by_reason: { reason: string; count: number; paise: number }[];
  refunds: AdminBooking[];
};

export type Today = {
  date: string;
  collection_paise: number;
  tickets_sold: number;
  seats_total: number;
  refunds_paise: number;
  stuck_payments: number;
  payments_to_check: number;
  refunds_to_send: number;
  upi_id: string | null;
  shows: { id: string; movie_title: string; starts_at: string; label: string; status: string; seats_total: number; seats_sold: number; collection_paise: number }[];
  setup: { layout: boolean; movies: boolean; shows: boolean; staff: boolean; upi: boolean };
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  owner: "Owner",
  manager: "Manager",
  gate: "Gate staff",
};

export const ROLE_HINT: Record<Exclude<Role, "super_admin">, string> = {
  owner: "Everything",
  manager: "Movies, shows, prices, blocking",
  gate: "Scanning tickets in the Android app only",
};

export type TheatrePayments = { upi_id: string; upi_name: string };

export type Promotion = {
  id: string;
  code: string;
  title: string;
  kind: "per_ticket" | "percent";
  value: number;
  max_discount_paise: number | null;
  min_tickets: number;
  weekdays: string;
  starts_on: string | null;
  ends_on: string | null;
  max_uses: number | null;
  per_customer: number | null;
  first_booking_only: boolean;
  show_in_app: boolean;
  is_active: boolean;
  details: string;
  uses: number;
  discount_given_paise: number;
  created_at: string;
};

export type ReportTotals = {
  date: string | null;
  shows: number;
  cancelled_shows: number;
  seats_total: number;
  bookings: number;
  seats_sold: number;
  admitted: number;
  tickets_paise: number;
  discount_paise: number;
  fee_paise: number;
  gst_paise: number;
  collected_paise: number;
  refunded_paise: number;
  refunds_to_send: number;
};

export type ReportShow = Omit<ReportTotals, "date" | "shows" | "cancelled_shows"> & {
  id: string;
  date: string;
  starts_at: string;
  label: string;
  movie_title: string;
  status: "scheduled" | "cancelled";
};

export type Report = { start: string; end: string; days: ReportTotals[]; shows: ReportShow[]; totals: ReportTotals };

export type Bar = { label: string; value: number; note: string };

export type Insights = {
  start: string;
  end: string;
  summary: {
    shows: number;
    occupancy: number;
    seats_sold: number;
    bookings: number;
    customers: number;
    new_customers: number;
    repeat_customers: number;
    avg_group: number;
    promo_bookings: number;
    promo_discount_paise: number;
    same_day_bookings: number;
  };
  by_slot: Bar[];
  by_weekday: Bar[];
  lead_time: Bar[];
  group_size: Bar[];
  gender: Bar[];
  age: Bar[];
  movies: { title: string; shows: number; seats_sold: number; occupancy: number; collected_paise: number; rating: number | null; ratings: number }[];
  stars: Bar[];
  comments: { movie_title: string; stars: number; comment: string; at: string }[];
  filters: { movie_id: string | null; slot: string | null; class_id: string | null };
  booking_hour: Bar[];
  booking_weekday: Bar[];
  slot_week: { slot: string; weekday: number; weekend: number; weekday_shows: number; weekend_shows: number; sold_out: number }[];
  sell_outs: { movie_title: string; starts_at: string; label: string; occupancy: number; hours_before: number }[];
  movie_weeks: { title: string; weeks: { week: number; shows: number; seats_sold: number; occupancy: number; collected_paise: number }[] }[];
  class_demand: { name: string; seats: number; occupancy: number; seats_sold: number; median_days_before: number | null }[];
  row_demand: Bar[];
  rarely_sold: { seat: string; sold: number; shows: number }[];
  visits: Bar[];
  regulars: { name: string; mobile_end: string; bookings: number; last_booked: string | null }[];
  lapsed_customers: number;
  offers: { code: string; title: string; bookings: number; seats: number; discount_paise: number; collected_paise: number }[];
  campaigns: { title: string; channel: Channel; send_after: string; recipients: number; reached: number; led_to_booking: number }[];
  offers_opt: { on: number; off: number };
  payments: { methods: Bar[]; failed: number; abandoned: number; seat_clashes: number; refunds: Bar[]; refunded_paise: number };
};

export type Audience = "all" | "recent_30" | "recent_90";
export type Channel = "whatsapp" | "push" | "both";
export type AudienceSize = { audience: Audience; customers: number; with_app: number };

export type Campaign = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  channel: Channel;
  status: "queued" | "sending" | "done";
  send_after: string;
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  created_at: string;
};

export type MessageLog = {
  id: string;
  kind: string;
  channel: "whatsapp" | "push";
  mobile: string;
  body: string;
  status: "queued" | "sent" | "failed" | "skipped";
  error: string | null;
  send_after: string;
  sent_at: string | null;
  booking_code: string | null;
};
