-- Assign a system (global) briefing component to a project library,
-- and stop listing explicitly excluded (include=false) components.

CREATE OR REPLACE FUNCTION public.pbc_add_global_component_to_project(
  p_project_id integer,
  p_briefing_component_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  IF NOT public.can_edit_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_briefing_component_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.briefing_components bc
    WHERE bc.id = p_briefing_component_id
  ) THEN
    RAISE EXCEPTION 'System component not found';
  END IF;

  FOR r IN
    SELECT pbt.briefing_type_id
    FROM public.project_briefing_types pbt
    WHERE pbt.project_id = p_project_id
  LOOP
    INSERT INTO public.project_briefing_types_components (
      project_id,
      briefing_type_id,
      briefing_component_id,
      project_component_id,
      include,
      position,
      custom_title,
      custom_description
    ) VALUES (
      p_project_id,
      r.briefing_type_id,
      p_briefing_component_id,
      NULL,
      true,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (project_id, briefing_type_id, briefing_component_id)
    DO UPDATE SET include = true;

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Add a briefing type to the project before assigning system components';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_components_latest(p_project_id integer)
RETURNS TABLE(
  component_key text,
  component_id integer,
  is_project_component boolean,
  effective_title text,
  effective_description text,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
WITH
saved_global AS (
  SELECT DISTINCT briefing_component_id AS component_id
  FROM public.project_briefing_types_components
  WHERE project_id = p_project_id
    AND briefing_component_id IS NOT NULL
    AND coalesce(include, true) = true

  UNION

  SELECT DISTINCT briefing_component_id AS component_id
  FROM public.project_ct_channel_briefing_components
  WHERE project_id = p_project_id
    AND briefing_component_id IS NOT NULL
),
saved_project AS (
  SELECT DISTINCT id AS component_id
  FROM public.project_briefing_components
  WHERE project_id = p_project_id
),
saved AS (
  SELECT
    ('g:' || sg.component_id::text) AS component_key,
    sg.component_id,
    false AS is_project_component
  FROM saved_global sg

  UNION ALL

  SELECT
    ('p:' || sp.component_id::text) AS component_key,
    sp.component_id,
    true AS is_project_component
  FROM saved_project sp
),
latest_pccb AS (
  SELECT DISTINCT ON (k)
    k,
    custom_title,
    custom_description
  FROM (
    SELECT
      CASE
        WHEN pccb.briefing_component_id IS NOT NULL THEN 'g:' || pccb.briefing_component_id::text
        ELSE 'p:' || pccb.project_component_id::text
      END AS k,
      pccb.custom_title,
      pccb.custom_description,
      pccb.id
    FROM public.project_ct_channel_briefing_components pccb
    WHERE pccb.project_id = p_project_id
      AND (pccb.briefing_component_id IS NOT NULL OR pccb.project_component_id IS NOT NULL)
  ) x
  ORDER BY k, id DESC
),
latest_pbtc AS (
  SELECT DISTINCT ON (k)
    k,
    custom_title,
    custom_description
  FROM (
    SELECT
      CASE
        WHEN pbtc.briefing_component_id IS NOT NULL THEN 'g:' || pbtc.briefing_component_id::text
        ELSE 'p:' || pbtc.project_component_id::text
      END AS k,
      pbtc.custom_title,
      pbtc.custom_description,
      pbtc.id
    FROM public.project_briefing_types_components pbtc
    WHERE pbtc.project_id = p_project_id
      AND coalesce(pbtc.include, true) = true
      AND (pbtc.briefing_component_id IS NOT NULL OR pbtc.project_component_id IS NOT NULL)
  ) x
  ORDER BY k, id DESC
)
SELECT
  s.component_key,
  s.component_id,
  s.is_project_component,
  coalesce(
    lp.custom_title,
    lb.custom_title,
    CASE WHEN s.is_project_component THEN pbc.title ELSE bc.title END
  ) AS effective_title,
  coalesce(
    lp.custom_description,
    lb.custom_description,
    CASE WHEN s.is_project_component THEN pbc.description ELSE bc.description END
  ) AS effective_description,
  CASE
    WHEN lp.k IS NOT NULL THEN 'override_pccb'
    WHEN lb.k IS NOT NULL THEN 'override_pbtc'
    ELSE 'base'
  END AS source
FROM saved s
LEFT JOIN latest_pccb lp ON lp.k = s.component_key
LEFT JOIN latest_pbtc lb ON lb.k = s.component_key
LEFT JOIN public.briefing_components bc
  ON (NOT s.is_project_component AND bc.id = s.component_id)
LEFT JOIN public.project_briefing_components pbc
  ON (s.is_project_component AND pbc.id = s.component_id)
ORDER BY effective_title ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.pbc_add_global_component_to_project(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pbc_add_global_component_to_project(integer, integer) TO service_role;
