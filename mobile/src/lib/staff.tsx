import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setStaffToken, setStaffUnauthorizedHandler } from './api';
import type { StaffLogin } from './types';

const TOKEN_KEY = 'hs_staff_token';

type Staff = Omit<StaffLogin, 'access_token'>;

type StaffState = {
  ready: boolean;
  staff: Staff | null;
  signIn: (r: StaffLogin) => Promise<void>;
  signOut: () => Promise<void>;
};

const StaffContext = createContext<StaffState | null>(null);

/** Gate staff session: mobile + PIN, kept apart from the customer login. */
export function StaffProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Staff | null>(null);

  const signOut = useCallback(async () => {
    setStaffToken(null);
    setStaff(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  const signIn = useCallback(async ({ access_token, ...rest }: StaffLogin) => {
    setStaffToken(access_token);
    setStaff(rest);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
  }, []);

  useEffect(() => {
    setStaffUnauthorizedHandler(() => void signOut());
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          setStaffToken(token);
          setStaff(await api<Staff>('/api/admin/auth/me', { as: 'staff' }));
        }
      } catch {
        // Expired (12 hours) or offline: log in again on the gate screen
      } finally {
        setReady(true);
      }
    })();
    return () => setStaffUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(() => ({ ready, staff, signIn, signOut }), [ready, staff, signIn, signOut]);
  return <StaffContext value={value}>{children}</StaffContext>;
}

export function useStaff() {
  const ctx = use(StaffContext);
  if (!ctx) throw new Error('useStaff must be inside StaffProvider');
  return ctx;
}
