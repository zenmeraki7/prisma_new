// FILE: frontend/hooks/useBulkEditJobHistory.ts

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isBulkEditTerminalStatus,
  listBulkEditJobs,
  type BulkEditJob,
} from "../../frontend/lib/bulkEdit/bulkEditApi";

export interface UseBulkEditJobHistoryOptions {
  enabled?: boolean;
  take?: number;
  intervalMs?: number;
  errorRetryMs?: number;
}

export interface UseBulkEditJobHistoryResult {
  jobs: BulkEditJob[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setJobs: React.Dispatch<React.SetStateAction<BulkEditJob[]>>;
}

function hasActiveJobs(jobs: BulkEditJob[]): boolean {
  return jobs.some((job) => !isBulkEditTerminalStatus(job.status));
}

export function useBulkEditJobHistory(
  options: UseBulkEditJobHistoryOptions = {},
): UseBulkEditJobHistoryResult {
  const {
    enabled = true,
    take = 20,
    intervalMs = 5000,
    errorRetryMs = 7000,
  } = options;

  const [jobs, setJobs] = useState<BulkEditJob[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(false);
  const inFlightRef = useRef<boolean>(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;

    inFlightRef.current = true;

    try {
      if (!mountedRef.current || jobs.length === 0) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await listBulkEditJobs(take);

      if (!mountedRef.current) return;

      setJobs(data.jobs || []);
      setError(null);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.message || "Failed to load bulk edit history");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, [enabled, jobs.length, take]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();

    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const scheduleNext = (delay: number) => {
      if (cancelled) return;
      clearTimer();
      timerRef.current = window.setTimeout(async () => {
        await refresh();
      }, delay);
    };

    const run = async () => {
      await refresh();

      if (cancelled || !mountedRef.current) return;

      const active = hasActiveJobs(jobs);
      scheduleNext(error ? errorRetryMs : active ? intervalMs : 12000);
    };

    run();

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [enabled, refresh, intervalMs, errorRetryMs, clearTimer, jobs, error]);

  return {
    jobs,
    loading,
    refreshing,
    error,
    refresh,
    setJobs,
  };
}