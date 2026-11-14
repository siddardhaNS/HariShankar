import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { api, setMaintenanceHandler } from './api';

/**
 * Whether the theatre has closed the customer app for maintenance (switched on
 * the admin website's Settings page). Checked on start, when the app comes back
 * to the front, every minute, and whenever a customer request is refused with
 * the maintenance answer. Gate staff screens ignore it.
 */
type Maintenance = { on: boolean; message: string; checking: boolean; check: () => Promise<void> };

const Ctx = createContext<Maintenance>({ on: false, message: '', checking: false, check: async () => {} });

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ on: false, message: '' });
  const [checking, setChecking] = useState(false);

  // Quiet check in the background
  const refresh = useCallback(async () => {
    try {
      const s = await api<{ maintenance: boolean; message: string }>('/api/app/status', { timeoutMs: 8_000 });
      setState({ on: s.maintenance, message: s.message });
    } catch {
      // Offline or server down: keep what we knew; the normal error screens cover it
    }
  }, []);

  // "Try again" on the maintenance screen, with a spinner
  const check = useCallback(async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  }, [refresh]);

  useEffect(() => {
    setMaintenanceHandler((message) => setState({ on: true, message }));
    const first = setTimeout(() => void refresh(), 0);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    const every = setInterval(() => void refresh(), 60_000);
    return () => {
      clearTimeout(first);
      setMaintenanceHandler(null);
      sub.remove();
      clearInterval(every);
    };
  }, [refresh]);

  const value = useMemo(() => ({ ...state, checking, check }), [state, checking, check]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMaintenance = () => useContext(Ctx);
