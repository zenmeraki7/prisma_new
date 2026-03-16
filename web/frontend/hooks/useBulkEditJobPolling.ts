// FILE: frontend/hooks/useBulkEditJobPolling.ts

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBulkEditJob,
  isBulkEditTerminalStatus,
  type BulkEditJob,
} from "../../frontend/lib/bulkEdit/bulkEditApi";

export interface UseBulkEditJobPollingOptions {
  enabled?: boolean;
  intervalMs?: number;
  errorRetryMs?: number;
  stopOnTerminal?: boolean;
}

export interface UseBulkEditJobPollingResult {
  job: BulkEditJob | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setJob: React.Dispatch<React.SetStateAction<BulkEditJob | null>>;
}

export function useBulkEditJobPolling(
  jobId: string | null,
  options: UseBulkEditJobPollingOptions = {},
): UseBulkEditJobPollingResult {
  const {
    enabled = true,
    intervalMs = 4000,
    errorRetryMs = 6000,
    stopOnTerminal = true,
  } = options;

  const [job, setJob] = useState<BulkEditJob | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(jobId && enabled));
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
    if (!jobId || !enabled || inFlightRef.current) return;

    inFlightRef.current = true;

    try {
      if (!mountedRef.current || !job) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await getBulkEditJob(jobId);

      if (!mountedRef.current) return;

      setJob(data.job);
      setError(null);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.message || "Failed to refresh bulk edit job");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, [enabled, job, jobId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();

    if (!jobId || !enabled) {
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

      const latestTerminal = stopOnTerminal && isBulkEditTerminalStatus(job?.status);
      if (latestTerminal) return;

      scheduleNext(error ? errorRetryMs : intervalMs);
    };

    run();

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [
    jobId,
    enabled,
    refresh,
    intervalMs,
    errorRetryMs,
    stopOnTerminal,
    clearTimer,
    job?.status,
    error,
  ]);

  useEffect(() => {
    if (!enabled || !jobId || !job || !stopOnTerminal) return;
    if (isBulkEditTerminalStatus(job.status)) {
      clearTimer();
    }
  }, [enabled, job, jobId, stopOnTerminal, clearTimer]);

  return {
    job,
    loading,
    refreshing,
    error,
    refresh,
    setJob,
  };
}