-- Applied remotely as 20260818210830 artifact_collaboration_ydoc_search_path. Do not edit; this is the recorded history SQL.
CREATE OR REPLACE FUNCTION collab.resolve_editor_kind(
  p_artifact public.artifacts
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind', '')))
      IN ('html_email', 'media', 'code', 'image', 'video', 'audio')
      THEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind')))
    WHEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format', '')))
      IN ('html_email', 'html', 'email', 'code', 'image', 'video', 'audio')
      THEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format')))
    WHEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind', '')))
      IN ('rich_text', 'tiptap', 'tiptap_json')
      THEN 'rich_text'
    WHEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format', '')))
      IN ('tiptap_json', 'rich_text')
      THEN 'rich_text'
    ELSE 'rich_text'
  END;
$$;

CREATE OR REPLACE FUNCTION collab.is_rich_text_editor_kind(p_editor_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $$
  SELECT lower(trim(coalesce(p_editor_kind, ''))) IN ('rich_text', 'tiptap', 'tiptap_json');
$$;

REVOKE ALL ON FUNCTION collab.resolve_editor_kind(public.artifacts) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.is_rich_text_editor_kind(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION collab.resolve_editor_kind(public.artifacts) TO service_role;
GRANT EXECUTE ON FUNCTION collab.is_rich_text_editor_kind(text) TO service_role;
