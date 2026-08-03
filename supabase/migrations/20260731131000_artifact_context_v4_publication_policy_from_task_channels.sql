-- Companion marker for remote deploy of v4 publication_policy (task/project channels).
-- Full function body lives in 20260731130000_artifact_context_channel_policies_without_artifact_channel.sql.

grant execute on function public.ai_get_artifact_generation_context_v4(uuid,uuid,uuid,uuid) to authenticated, service_role;
comment on function public.ai_get_artifact_generation_context_v4(uuid,uuid,uuid,uuid) is
  'Artifact generation context; publication_policy from task/project channels (never artifact.channel_id).';
