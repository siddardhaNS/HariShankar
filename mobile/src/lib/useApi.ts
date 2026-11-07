import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from './api';

/** Load a GET endpoint when the screen gains focus; `reload` for pull-to-refresh. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'quiet') => {
      if (!path) {
        setLoading(false);
        return;
      }
      const n = ++seq.current;
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await api<T>(path);
        if (n === seq.current) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (n === seq.current) setError(e instanceof ApiError ? e.message : 'Something went wrong');
      } finally {
        if (n === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      void load(data === null ? 'initial' : 'quiet');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  return { data, error, loading: loading && data === null, refreshing, reload: () => load('refresh') };
}
