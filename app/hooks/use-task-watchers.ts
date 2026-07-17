"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { TaskBootstrapTaskWatcher } from "@/lib/types/task-details-bootstrap";
import { taskBootstrapWatcherToWatcherUser } from "@/lib/types/task-details-bootstrap";

export type TaskWatcherUser = {
  watcher_user_id: number;
  full_name: string | null;
  photo: string | null;
};

export type UseTaskWatchersOptions = {
  /** When true, initial lists come only from task-details-bootstrap (no list_* RPC on open). */
  seedFromBootstrap: boolean;
  /** From bootstrap `task_watchers` (undefined/omit until merged → empty list). */
  initialTaskWatchers?: TaskBootstrapTaskWatcher[] | null;
  /** From bootstrap `eligible_task_watchers`. */
  initialEligibleTaskWatchers?: TaskBootstrapTaskWatcher[] | null;
};

function dedupeByWatcherUserId(items: TaskWatcherUser[]): TaskWatcherUser[] {
  const map = new Map<number, TaskWatcherUser>();
  for (const item of items) {
    if (!map.has(item.watcher_user_id)) map.set(item.watcher_user_id, item);
  }
  return Array.from(map.values());
}

function toFiniteInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * RPC payloads are expected to return `watcher_user_id`, but some environments may still return `user_id`.
 * We normalize to `watcher_user_id` to keep the UI stable.
 */
function normalizeWatcherRow(row: any): TaskWatcherUser | null {
  const id = toFiniteInt(row?.watcher_user_id ?? row?.user_id);
  if (id == null) return null;
  return {
    watcher_user_id: id,
    full_name: row?.full_name ?? null,
    photo: row?.photo ?? null,
  };
}

function normalizeBootstrapList(
  rows: TaskBootstrapTaskWatcher[] | null | undefined,
): TaskWatcherUser[] {
  if (!Array.isArray(rows)) return [];
  const mapped = rows
    .map((r) => taskBootstrapWatcherToWatcherUser(r))
    .filter((w) => Number.isFinite(w.watcher_user_id));
  return dedupeByWatcherUserId(mapped);
}

/**
 * Task Watchers
 * - Only project watchers can be task watchers (enforced by RPC).
 * - Use RPCs for mutations (RLS may block direct writes).
 */
export function useTaskWatchers(taskId?: number, options?: UseTaskWatchersOptions) {
  const supabase = createClientComponentClient();
  const useBootstrapAwaitPath = options !== undefined;
  const {
    seedFromBootstrap = false,
    initialTaskWatchers,
    initialEligibleTaskWatchers,
  } = options ?? {};

  const [watchers, setWatchers] = useState<TaskWatcherUser[]>([]);
  const [eligible, setEligible] = useState<TaskWatcherUser[]>([]);

  const [isWatchersLoading, setIsWatchersLoading] = useState(false);
  const [isEligibleLoading, setIsEligibleLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [watchersError, setWatchersError] = useState<string | null>(null);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const loadWatchers = useCallback(async () => {
    if (!taskId) return;
    setIsWatchersLoading(true);
    setWatchersError(null);
    try {
      // Always use RPCs for reads/mutations (avoids PostgREST relationship cache join issues).
      const { data, error } = await supabase.rpc("list_task_watchers", {
        p_task_id: taskId,
      });
      if (error) throw error;

      const next = (Array.isArray(data) ? data : [])
        .map(normalizeWatcherRow)
        .filter(Boolean) as TaskWatcherUser[];

      setWatchers(dedupeByWatcherUserId(next));
    } catch (err: any) {
      setWatchersError(err?.message || "Failed to load watchers");
    } finally {
      setIsWatchersLoading(false);
    }
  }, [supabase, taskId]);

  const loadEligible = useCallback(async () => {
    if (!taskId) return;
    setIsEligibleLoading(true);
    setEligibleError(null);
    try {
      // Eligible list = project watchers minus current task watchers (enforced by RPC).
      const { data, error } = await supabase.rpc("list_eligible_task_watchers", {
        p_task_id: taskId,
      });
      if (error) throw error;

      const next = (Array.isArray(data) ? data : [])
        .map(normalizeWatcherRow)
        .filter(Boolean) as TaskWatcherUser[];

      setEligible(dedupeByWatcherUserId(next));
    } catch (err: any) {
      setEligibleError(err?.message || "Failed to load eligible users");
    } finally {
      setIsEligibleLoading(false);
    }
  }, [supabase, taskId]);

  const addWatchers = useCallback(
    async (userIds: number[]) => {
      if (!taskId) return;
      const ids = Array.isArray(userIds)
        ? userIds.map(Number).filter((x) => Number.isFinite(x))
        : [];
      if (ids.length === 0) return;

      setIsMutating(true);
      setMutationError(null);
      try {
        const { data, error } = await supabase.rpc("add_task_watchers", {
          p_task_id: taskId,
          p_user_ids: ids,
        });
        if (error) throw error;

        const next = (Array.isArray(data) ? data : [])
          .map(normalizeWatcherRow)
          .filter(Boolean) as TaskWatcherUser[];

        setWatchers(dedupeByWatcherUserId(next));
        await loadEligible();
      } catch (err: any) {
        setMutationError(err?.message || "Failed to add watchers");
      } finally {
        setIsMutating(false);
      }
    },
    [supabase, taskId, loadEligible]
  );

  const addWatcher = useCallback(
    async (userId: number) => {
      await addWatchers([userId]);
    },
    [addWatchers]
  );

  const removeWatcher = useCallback(
    async (watcherUserId: number) => {
      if (!taskId) return;
      setIsMutating(true);
      setMutationError(null);
      try {
        const { data, error } = await supabase.rpc("remove_task_watcher", {
          p_task_id: taskId,
          p_user_id: watcherUserId,
        });
        if (error) throw error;

        const next = (Array.isArray(data) ? data : [])
          .map(normalizeWatcherRow)
          .filter(Boolean) as TaskWatcherUser[];

        setWatchers(dedupeByWatcherUserId(next));
        await loadEligible();
      } catch (err: any) {
        setMutationError(err?.message || "Failed to remove watcher");
      } finally {
        setIsMutating(false);
      }
    },
    [supabase, taskId, loadEligible]
  );

  useEffect(() => {
    if (!taskId) {
      setWatchers([]);
      setEligible([]);
      setWatchersError(null);
      setEligibleError(null);
      setMutationError(null);
      return;
    }
    if (!useBootstrapAwaitPath) {
      void loadWatchers();
      void loadEligible();
      return;
    }
    if (!seedFromBootstrap) {
      setWatchers([]);
      setEligible([]);
      setWatchersError(null);
      setEligibleError(null);
      return;
    }
    setWatchers(normalizeBootstrapList(initialTaskWatchers));
    setEligible(normalizeBootstrapList(initialEligibleTaskWatchers));
    setWatchersError(null);
    setEligibleError(null);
  }, [
    taskId,
    useBootstrapAwaitPath,
    seedFromBootstrap,
    initialTaskWatchers,
    initialEligibleTaskWatchers,
    loadWatchers,
    loadEligible,
  ]);

  const isLoading = useMemo(
    () => isWatchersLoading || isEligibleLoading,
    [isWatchersLoading, isEligibleLoading]
  );

  return {
    watchers,
    eligible,
    isWatchersLoading,
    isEligibleLoading,
    isMutating,
    isLoading,
    watchersError,
    eligibleError,
    mutationError,
    loadWatchers,
    loadEligible,
    addWatcher,
    addWatchers,
    removeWatcher,
  };
}


