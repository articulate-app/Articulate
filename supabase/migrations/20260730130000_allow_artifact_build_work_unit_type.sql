-- ai_create_artifact_build_v2 inserts unit_type = 'artifact', but the check
-- constraint still only allowed legacy component-build unit types. Without
-- 'artifact', ai_start_artifact_build fails with:
--   new row for relation "ai_build_work_units" violates check constraint
--   "ai_build_work_units_unit_type_check"
ALTER TABLE public.ai_build_work_units
  DROP CONSTRAINT IF EXISTS ai_build_work_units_unit_type_check;

ALTER TABLE public.ai_build_work_units
  ADD CONSTRAINT ai_build_work_units_unit_type_check
  CHECK (unit_type = ANY (ARRAY[
    'task'::text,
    'channel'::text,
    'component'::text,
    'research'::text,
    'artifact'::text
  ]));
