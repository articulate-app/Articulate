"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTasksScope } from "../contexts/tasks-scope-context";

/** URL param keys (pills + filter pane) -> RPC filter keys. Same as unified-grouped-task-list. */
const FILTER_MAPPING: Record<string, string> = {
  assignedTo: "assigned_to_name",
  status: "project_status_name",
  contentType: "content_type_title",
  productionType: "production_type_title",
  language: "language_code",
  channels: "channel_names",
  overdueStatus: "overdueStatus",
};

/**
 * Build canonical filter object from URL params for task_group_* RPCs.
 * Use this for KanbanView (and any consumer that needs URL-derived filters) so filter pane + pills drive the same query.
 */
export function useTasksUrlFilters(): Record<string, string | string[]> {
  const params = useSearchParams();
  const { scope } = useTasksScope();
  const scopeAssigneeId = scope.type === "user" ? scope.userId : undefined;
  return useMemo(() => {
    const out: Record<string, string | string[]> = {};
    for (const [urlKey, filterKey] of Object.entries(FILTER_MAPPING)) {
      const value = params.get(urlKey);
      if (value) {
        out[filterKey] = value.includes(",") ? value.split(",") : value;
      }
    }
    const deliveryDateFrom = params.get("deliveryDateFrom");
    const deliveryDateTo = params.get("deliveryDateTo");
    const publicationDateFrom = params.get("publicationDateFrom");
    const publicationDateTo = params.get("publicationDateTo");
    if (deliveryDateFrom) out["delivery_date_gte"] = deliveryDateFrom;
    if (deliveryDateTo) out["delivery_date_lt"] = deliveryDateTo;
    if (publicationDateFrom) out["publication_date_gte"] = publicationDateFrom;
    if (publicationDateTo) out["publication_date_lt"] = publicationDateTo;
    if (scopeAssigneeId != null && Number.isFinite(scopeAssigneeId)) {
      out["assigned_to_name"] = String(scopeAssigneeId);
    }
    return out;
  }, [params.toString(), scopeAssigneeId]);
}
