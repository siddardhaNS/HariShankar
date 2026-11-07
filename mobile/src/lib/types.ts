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
  order: { order_id: string; amount_paise: number; gateway: string; key_id: string | null };
};

export type SeatsTakenBody = {
  code: 'seats_taken';
  detail: string;
  taken: string[];
  suggestion: { seat_ids: string[]; labels: string[] };
};

export type BookingStatus = 'payment_pending' | 'confirmed' | 'failed' | 'refunded' | 'cancelled';

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
  refund_id: string | null;
  refund_paise: number;
  qr: string | null;
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
