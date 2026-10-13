import { useCallback, useEffect, useState, type DependencyList } from 'react';

const CHANGED = 'kp:data-changed';

/** 데이터가 바뀌었음을 알림 → 화면의 모든 useAsync 가 다시 불러온다 */
export function notifyChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/** 비동기 로딩 상태 + reload. deps 가 바뀌거나 notifyChanged() 시 다시 불러온다. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: Error) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}
