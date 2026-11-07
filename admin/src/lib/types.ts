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
};
export type AdminSeatMap = { show_id: string | null; classes: { id: string; name: string }[]; seats: AdminSeat[] };

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
  seats_admitted: number;
  created_at: string;
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
  gate: "Scanning only",
};

export type TheatrePayments = { upi_id: string; upi_name: string };
