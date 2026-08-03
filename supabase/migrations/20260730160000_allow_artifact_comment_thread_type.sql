-- Artifact comments use threads.thread_type = 'artifact_comment' + thread_targets.entity_type = 'artifact'.
alter table public.threads drop constraint if exists threads_thread_type_check;
alter table public.threads
  add constraint threads_thread_type_check
  check (thread_type = any (array['general'::text, 'output_comment'::text, 'artifact_comment'::text]));
