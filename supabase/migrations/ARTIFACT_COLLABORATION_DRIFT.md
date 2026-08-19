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
7. Additive runtime work was applied as recorded remote migrations and copied locally:
   - `20260819090151_artifact_collaboration_runtime`
   - `20260819090222_artifact_collaboration_runtime_schema`
   - `20260819090312_artifact_collaboration_runtime_rpcs`
   - `20260819090346_artifact_collaboration_runtime_ops`
8. Follow-up RPCs were generated with `supabase migration new`, applied remotely, then copied to the recorded versions:
   - `20260819093943` artifact_collaboration_project_checkpoint
   - `20260819094040` artifact_collaboration_flush_rpcs
   - `20260819094101` artifact_collaboration_proposal_rpcs
9. The global flag remains `enabled=false` because project `hlszgarnpleikfkwujph` has production users.

A new clone applying all repo migrations recreates the same schema. `db push` will apply only versions missing on the target, so the six remote versions are not replayed there.
