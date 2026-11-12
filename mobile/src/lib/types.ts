export type Theatre = { id: string; name: string; city: string; address: string };

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
  rating?: number | null; // average stars, once 5 or more people have rated
  rating_count?: number;
};

export type Availability = 'available' | 'filling_fast' | 'almost_full' | 'sold_out';

export type ShowTime = {
  id: string;
  starts_at: string;
  label: string;
  seats_left: number;
  seats_total: number;
  availability: Availability;
  from_price_paise: number | null;
};

export type MovieShows = { movie: Movie; shows: ShowTime[] };

export type Home = {
  theatre: Theatre;
  date: string;
  days: { date: string; has_shows: boolean }[];
  featured: MovieShows | null;
  now_showing: MovieShows[];
  coming_soon: Movie[];
};

export type ShowBrief = { id: string; starts_at: string; label: string; movie: Movie; theatre: Theatre };

export type SeatState = 'free' | 'booked' | 'blocked';
export type Seat = { id: string; row: string; number: number; r: number; c: number; class_id: string; state: SeatState };
export type SeatClass = { id: string; name: string; price_paise: number | null };

export type SeatMap = {
  show: ShowBrief;
  classes: SeatClass[];
  seats: Seat[];
  seats_left: number;
  booking_fee_paise: number;
  gst_rate_bp: number;
  max_seats: number;
  payment_gateway: string;
};

export type SeatGroup = { seat_ids: string[]; labels: string[]; class_name: string; total_paise: number };

export type Price = {
  tickets_paise: number;
  discount_paise: number;
  booking_fee_paise: number;
  gst_paise: number;
  total_paise: number;
};

export type BookingStart = {
  booking_id: string;
  code: string;
  price: Price;
  order: {
    order_id: string;
    amount_paise: number;
    gateway: string;
    key_id: string | null;
    upi_url: string | null;
    payee_upi_id: string | null;
    payee_name: string | null;
  };
};

export type SeatsTakenBody = {
  code: 'seats_taken';
  detail: string;
  taken: string[];
  suggestion: { seat_ids: string[]; labels: string[] };
};

export type BookingStatus = 'payment_pending' | 'payment_review' | 'confirmed' | 'failed' | 'refunded' | 'cancelled';

export type Booking = {
  id: string;
  code: string;
  status: BookingStatus;
  failure_reason: string | null;
  customer_name: string;
  show: ShowBrief;
  seats: { label: string; class_name: string; price_paise: number }[];
  price: Price;
  payment_method: string | null;
  gateway: string;
  upi_ref: string | null;
  refund_id: string | null;
  refund_paise: number;
  refund_pending: boolean;
  qr: string | null;
  rating: { stars: number; comment: string } | null;
  can_rate: boolean;
  created_at: string;
  confirmed_at: string | null;
};

export type Gender = 'male' | 'female' | 'other' | 'not_said';
export type AgeGroup = 'under_18' | '18_24' | '25_34' | '35_44' | '45_59' | '60_plus' | 'not_said';

export type Customer = {
  id: string;
  mobile: string;
  name: string;
  gender: Gender | null;
  age_group: AgeGroup | null;
  offers_opt_in: boolean;
  reminders_opt_in: boolean;
};

export type PayMethod = 'upi' | 'card' | 'netbanking';

// ---------- Gate (staff) ----------

export type StaffRole = 'owner' | 'manager' | 'gate' | 'super_admin';

export type StaffUser = {
  id: string;
  name: string;
  mobile: string;
  role: StaffRole;
  must_change_pin: boolean;
};

export type StaffLogin = {
  user: StaffUser;
  theatre: { id: string; name: string; city: string } | null;
  access_token: string;
};

export type GateShow = {
  id: string;
  movie_title: string;
  label: string;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'cancelled';
  gate_open: boolean;
  seats_sold: number;
  seats_admitted: number;
};

export type GateVerdict =
  | 'ok'
  | 'all_in'
  | 'not_paid'
  | 'cancelled'
  | 'other_show'
  | 'too_early'
  | 'show_over'
  | 'not_found'
  | 'fake';

export type GateEntry = {
  id: string;
  count: number;
  at: string;
  by: string;
  can_undo: boolean;
  offline?: boolean;
  problem?: string | null;
};

/** A ticket people have entered on, for the gate's Scanned tab */
export type ScannedTicket = {
  booking_id: string;
  code: string;
  customer_name: string;
  mobile_last4: string;
  seats: string[];
  seats_total: number;
  seats_admitted: number;
  last_at: string;
  entries: GateEntry[];
};

export type GateTicket = {
  verdict: GateVerdict;
  message: string;
  booking_id: string | null;
  code: string | null;
  customer_name: string;
  mobile_last4: string;
  movie_title: string;
  show_id: string | null;
  show_label: string;
  starts_at: string | null;
  seats: string[];
  seats_total: number;
  seats_admitted: number;
  seats_left: number;
  entries: GateEntry[];
};

export type Offer = { code: string; title: string; details: string };

export type PromoApplied = {
  code: string;
  title: string;
  discount_paise: number;
  price: { tickets_paise: number; discount_paise: number; booking_fee_paise: number; gst_paise: number; total_paise: number };
};
