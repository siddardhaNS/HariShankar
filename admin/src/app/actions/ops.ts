"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import type { ActionResult, AdminBooking, Layout, LayoutRow, Movie, Promotion, TheatrePayments } from "@/lib/types";

async function run<T>(fn: () => Promise<T>, paths: string[]): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    throw e; // redirects (session ended) and real bugs
  }
}

// ---------- Hall layout ----------

export async function saveLayout(rows: LayoutRow[]) {
  return run(() => api<Layout>("/api/admin/layout", { method: "PUT", body: JSON.stringify({ rows }) }), [
    "/shows/layout",
    "/block-rows",
    "/",
  ]);
}

// ---------- Movies ----------

export type MovieInput = Omit<Movie, "id" | "upcoming_shows">;

export async function saveMovie(id: string | null, movie: MovieInput) {
  return run(
    () =>
      api<Movie>(id ? `/api/admin/movies/${encodeURIComponent(id)}` : "/api/admin/movies", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(movie),
      }),
    ["/shows/movies", "/shows"],
  );
}

// ---------- Shows ----------

export type CreateShowsInput = {
  movie_id: string;
  dates: string[];
  times: string[];
  prices: Record<string, number>;
  interval_min: number;
  booking_opens_at: string | null;
};
type CreateShowsOut = { created: number; skipped: { date: string; time: string; reason: string }[] };

export async function createShows(input: CreateShowsInput) {
  return run(() => api<CreateShowsOut>("/api/admin/shows", { method: "POST", body: JSON.stringify(input) }), [
    "/shows",
    "/",
  ]);
}

export async function updatePrices(showId: string, prices: Record<string, number>) {
  return run(
    () => api(`/api/admin/shows/${encodeURIComponent(showId)}/prices`, { method: "PUT", body: JSON.stringify({ prices }) }),
    ["/shows"],
  );
}

export async function cancelShow(showId: string, reason: string) {
  return run(
    () =>
      api<{ bookings_refunded: number; amount_refunded_paise: number }>(
        `/api/admin/shows/${encodeURIComponent(showId)}/cancel`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    ["/shows", "/", "/bookings"],
  );
}

// ---------- Blocking ----------

type BlockOut = { blocked: number; skipped_sold: string[]; skipped_already: string[] };

export async function blockSeats(seatIds: string[], showId: string | null, reason: string) {
  return run(
    () => api<BlockOut>("/api/admin/blocks", { method: "POST", body: JSON.stringify({ seat_ids: seatIds, show_id: showId, reason }) }),
    ["/block-rows", "/shows"],
  );
}

export async function releaseSeats(seatIds: string[], showId: string | null) {
  return run(
    () => api<BlockOut>("/api/admin/blocks/release", { method: "POST", body: JSON.stringify({ seat_ids: seatIds, show_id: showId }) }),
    ["/block-rows", "/shows"],
  );
}

// ---------- Bookings ----------

export async function refundBooking(bookingId: string, reason: string) {
  return run(
    () =>
      api<AdminBooking>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    ["/bookings", "/", "/shows"],
  );
}

// ---------- Direct UPI ----------

export async function reviewPayment(bookingId: string, received: boolean) {
  return run(
    () =>
      api<AdminBooking>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/review`, {
        method: "POST",
        body: JSON.stringify({ received }),
      }),
    ["/bookings", "/"],
  );
}

export async function markRefundSent(bookingId: string, ref: string) {
  return run(
    () =>
      api<AdminBooking>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/refund-sent`, {
        method: "POST",
        body: JSON.stringify({ ref }),
      }),
    ["/bookings", "/"],
  );
}

export async function savePaymentSettings(settings: TheatrePayments) {
  return run(
    () => api<TheatrePayments>("/api/admin/theatre/payments", { method: "PUT", body: JSON.stringify(settings) }),
    ["/bookings", "/"],
  );
}

// ---------- Promotions ----------

export type PromotionInput = Omit<Promotion, "id" | "details" | "uses" | "discount_given_paise" | "created_at">;

export async function savePromotion(id: string | null, input: PromotionInput) {
  const { code, kind, value, ...rest } = input;
  return run(
    () =>
      api<Promotion>(id ? `/api/admin/promotions/${encodeURIComponent(id)}` : "/api/admin/promotions", {
        method: id ? "PATCH" : "POST",
        // Code and discount type are fixed once customers may have used them
        body: JSON.stringify(id ? rest : { code, kind, value, ...rest }),
      }),
    ["/promotions"],
  );
}

export async function setPromotionActive(id: string, is_active: boolean) {
  return run(
    () => api<Promotion>(`/api/admin/promotions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ is_active }) }),
    ["/promotions"],
  );
}
