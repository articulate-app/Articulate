# Artifact collaboration migration drift

Remote project `hlszgarnpleikfkwujph` applied the first collaboration schema as six MCP migrations. The branch originally had a single unapplied file `20260818182907_artifact_collaboration_ydoc.sql` that was **never** in `supabase_migrations.schema_migrations`.

## Remote history (already applied, do not edit)

| Version | Name |
|---|---|
| 20260818210548 | artifact_collaboration_ydoc |
| 20260818210613 | artifact_collaboration_ydoc_rpcs |
| 20260818210627 | artifact_collaboration_ydoc_persist |
| 20260818210642 | artifact_collaboration_ydoc_seed_compact |
| 20260818210650 | artifact_collaboration_ydoc_realtime_grants |
| 20260818210830 | artifact_collaboration_ydoc_search_path |

SQL for each file is the exact `statements` recorded remotely. Local copies start with `Applied remotely as … Do not edit`.

## How the drift was resolved

1. Inspected remote `supabase_migrations.schema_migrations` via Supabase MCP (`list_migrations` + `execute_sql`).
2. Confirmed `20260818182907` does not exist remotely, so it was **not** marked applied.
3. Deleted the local-only `20260818182907_artifact_collaboration_ydoc.sql`.
4. Added the six recorded files using the remote SQL, unchanged.
5. Did **not** run `supabase migration repair --status applied` for the deleted version.
6. CLI `migration list --linked` could not authenticate with the database password in this environment; remote history was confirmed via MCP instead.
7. Additive runtime work was applied as two new remote migrations and copied locally:
   - `20260819090151_artifact_collaboration_runtime`
   - `20260819090222_artifact_collaboration_runtime_schema`
8. Remaining projection/checkpoint/proposal RPCs still need a follow-up recorded migration if they are not present yet. The global flag remains `enabled=false`.

A new clone applying all repo migrations recreates the same schema. `db push` will apply only versions missing on the target, so the six remote versions are not replayed there.
