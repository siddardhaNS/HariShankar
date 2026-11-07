// Development: run `adb reverse tcp:8000 tcp:8000` so the emulator (or a USB
// phone) reaches the API on the computer as localhost. Over Wi-Fi instead, set
// EXPO_PUBLIC_API_URL to the computer's LAN address.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const TIMEOUT_MS = 15_000;

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

function readError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '');
  return status >= 500 ? 'Something went wrong on our side. Please try again' : 'Something went wrong';
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "Can't reach the theatre's server. Check your internet and try again", null);
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (res.status === 401 && authToken) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, readError(body, res.status), body);
  return body as T;
}
