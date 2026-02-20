# Activity Log: Filters and Search Proposal

## Objective

Add server-side filters and search to the project activity log table, so filtering applies to the entire database (not just preloaded rows).

---

## Current State

- **Source**: `project_activity_feed` view/table
- **Pagination**: Keyset pagination via `listProjectActivityFeedPage`
- **Sort**: timestamp, action, assigned_to_name, task_name

---

## Proposed Filters

| Filter | Type | DB column / logic | Notes |
|--------|------|-------------------|-------|
| **Search** | text | Full-text or `ilike` on action, details, task_name, assigned_to_name | Free-text search across main fields |
| **User** | multi-select | `user_id` | Filter by actor(s) |
| **Action** | multi-select | `action` | Filter by action type (e.g. "updated status", "changed due date") |
| **Date range** | from/to | `timestamp` | Filter by date range |
| **Task** | optional | `task_id` | Filter by specific task ID |

---

## Implementation Options

### Option A: PostgREST filters ( Supabase )

Use `.filter()` / `.or()` on the existing query:

```ts
// Example: search
query = query.or(`action.ilike.%${search}%,task_name.ilike.%${search}%,assigned_to_name.ilike.%${search}%`)

// Example: user filter
query = query.in('user_id', userIds)

// Example: action filter
query = query.in('action', actions)

// Example: date range
query = query.gte('timestamp', fromDate).lte('timestamp', toDate)
```

**Pros**: No DB changes, reuses existing view.  
**Cons**: `ilike` on large tables can be slow; no full-text ranking.

### Option B: RPC with filters

Add `fn_list_project_activity_feed` (or similar) that accepts filter params:

```sql
fn_list_project_activity_feed(
  p_project_id bigint,
  p_limit int,
  p_cursor jsonb,
  p_search text DEFAULT NULL,
  p_user_ids int[] DEFAULT NULL,
  p_actions text[] DEFAULT NULL,
  p_from_timestamp timestamptz DEFAULT NULL,
  p_to_timestamp timestamptz DEFAULT NULL
)
```

**Pros**: Full control over SQL, indexing, full-text search.  
**Cons**: Requires migration and maintenance of RPC.

### Option C: Full-text search (PostgreSQL)

If the view supports it, add `tsvector` / `tsquery` for search:

```sql
-- In view or RPC
WHERE (
  p_search IS NULL
  OR to_tsvector('english', action || ' ' || COALESCE(task_name,'') || ' ' || COALESCE(assigned_to_name,'') || ' ' || COALESCE(details,'')) @@ plainto_tsquery('english', p_search)
)
```

---

## Recommendation

**Phase 1 (quick win)**  
- Use **Option A** with PostgREST filters.
- Add: search (ilike on action, task_name, assigned_to_name, details), user filter, action filter, date range.
- Wire filters into `listProjectActivityFeedPage` and `useProjectActivityFeedInfinite`.

**Phase 2 (if needed)**  
- If performance is an issue, move to **Option B** with an RPC and proper indexes.
- Add full-text search if `ilike` is too slow.

---

## UI Placement

- **Search**: Input above the table (e.g. placeholder: "Search activity…").
- **Filters**: Dropdown or filter bar (User, Action, Date range) with clear/reset.
- **URL sync**: Encode filters in query params (e.g. `?search=foo&user=1,2&action=updated`) for shareable links.

---

## API Changes

### `listProjectActivityFeedPage` (extended)

```ts
interface ProjectActivityFeedFilters {
  search?: string | null
  userIds?: number[] | null
  actions?: string[] | null
  fromTimestamp?: string | null
  toTimestamp?: string | null
  taskId?: number | null
}

listProjectActivityFeedPage({
  projectId,
  pageSize,
  sort,
  cursor,
  filters, // NEW
})
```

### Hook

```ts
useProjectActivityFeedInfinite({
  projectId,
  pageSize,
  sort,
  filters, // NEW - triggers refetch when changed
})
```

---

## Next Steps

1. Define filter UI components (search input, user multi-select, action multi-select, date range).
2. Extend `project-activity.ts` with filter logic.
3. Update `use-project-activity-feed-infinite.ts` to accept and pass filters.
4. Sync filters to URL params for shareability.
