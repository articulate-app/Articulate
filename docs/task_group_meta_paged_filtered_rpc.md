# task_group_meta_paged_filtered – RPC contract (avoid PGRST202)

## Response shape

```json
{ "groups": [{ "group_key": "string", "label": "string" }], "next_cursor": <jsonb or null> }
```

## Function signature (DB)

One function only; no overloads. All params nullable except `p_limit` (has default).

- `p_assignee_ids` int[] default null  
- `p_channels` int[] default null  
- `p_content_type_ids` int[] default null  
- `p_cursor` jsonb default null  
- `p_delivery_date_gte` date default null  
- `p_delivery_date_lt` date default null  
- `p_group_by` text default null  
- `p_group_order` text default null  
- `p_is_overdue` boolean default null  
- `p_is_publication_overdue` boolean default null  
- `p_language_ids` int[] default null  
- `p_limit` int default 20  
- `p_production_type_ids` int[] default null  
- `p_project_ids` int[] default null  
- `p_publication_date_gte` date default null  
- `p_publication_date_lt` date default null  
- `p_q` text default null  
- `p_status_names` text[] default null  

## Frontend

- **Always send every param** in the RPC payload (use `TaskGroupMetaPagedFilteredParams`).  
- Use `null` for any unused param so the schema cache matches a single function.  
- Both `use-task-group-meta-paged-query` and `use-task-group-meta-all-query` must send this full payload.

## Avoiding PGRST202

1. **No overloads** – Keep exactly one `public.task_group_meta_paged_filtered(...)` definition.  
2. **Param types** – Don’t change types (e.g. text → date, json → jsonb) without updating the FE and redeploying.  
3. **Schema cache** – After changing the function, reload PostgREST schema (Supabase: Settings → API → “Reload schema cache”, or redeploy/restart API).  
4. **Naming** – Param names must match exactly (e.g. `p_cursor` not `p_next_cursor`).
