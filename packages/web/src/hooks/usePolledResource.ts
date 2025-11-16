import { useCallback, useEffect, useRef, useState } from 'react';

export interface PolledResource<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly loading: boolean;
  refresh(): void;
}

export function usePolledResource<T>(
  key: string,
  load: () => Promise<T>,
  intervalMs: number | null,
): PolledResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const run = async (): Promise<void> => {
      try {
        const result = await loadRef.current();
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught : new Error(String(caught)));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();

    if (intervalMs === null) {
      return () => {
        active = false;
      };
    }

    const timer = setInterval(() => void run(), intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, intervalMs, tick]);

  return { data, error, loading, refresh };
}
