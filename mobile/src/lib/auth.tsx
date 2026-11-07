import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setAuthToken, setUnauthorizedHandler } from './api';
import { registerForNotifications, unregisterNotifications } from './notifications';
import type { Customer } from './types';

const TOKEN_KEY = 'hs_customer_token';

type AuthState = {
  ready: boolean;
  customer: Customer | null;
  signIn: (token: string, customer: Customer) => Promise<void>;
  signOut: () => Promise<void>;
  setCustomer: (c: Customer) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const signOut = useCallback(async () => {
    await unregisterNotifications(); // needs the login, so before it is cleared
    setAuthToken(null);
    setCustomer(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  const signIn = useCallback(async (token: string, c: Customer) => {
    setAuthToken(token);
    setCustomer(c);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    void registerForNotifications();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          setAuthToken(token);
          setCustomer(await api<Customer>('/api/app/me'));
          void registerForNotifications();
        }
      } catch {
        // Offline or expired: browse logged out; booking will ask to log in
      } finally {
        setReady(true);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(
    () => ({ ready, customer, signIn, signOut, setCustomer }),
    [ready, customer, signIn, signOut],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
