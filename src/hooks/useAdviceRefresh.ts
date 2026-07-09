import { useCallback, useEffect, useRef, useState } from "react";

export type AdviceRefreshEvent = "record_added" | "record_deleted" | "settings_updated" | "feedback_saved";

type RefreshHandler = (event: AdviceRefreshEvent) => void | Promise<void>;

type UseAdviceRefreshOptions = {
  watch: readonly unknown[];
  refreshTodayAdvice: RefreshHandler;
  refreshCurrentCaffeineStatus?: RefreshHandler;
  refreshRecentRecords?: RefreshHandler;
  refreshInsightStats?: RefreshHandler;
  refreshOnMount?: boolean;
};

export function useAdviceRefresh(options: UseAdviceRefreshOptions) {
  const optionsRef = useRef(options);
  const pendingEventRef = useRef<AdviceRefreshEvent | null>(null);
  const hasMountedRef = useRef(false);
  const [refreshTick, setRefreshTick] = useState(0);

  optionsRef.current = options;

  const emitAdviceRefresh = useCallback((event: AdviceRefreshEvent) => {
    pendingEventRef.current = event;
    setRefreshTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const shouldRefreshOnMount = !hasMountedRef.current && optionsRef.current.refreshOnMount !== false;
    hasMountedRef.current = true;

    const event = pendingEventRef.current ?? (shouldRefreshOnMount ? "settings_updated" : null);
    if (!event) return;

    const timer = window.setTimeout(() => {
      const current = optionsRef.current;
      void current.refreshTodayAdvice(event);
      void current.refreshCurrentCaffeineStatus?.(event);
      void current.refreshRecentRecords?.(event);
      void current.refreshInsightStats?.(event);
      pendingEventRef.current = null;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshTick, ...options.watch]);

  return { emitAdviceRefresh };
}
