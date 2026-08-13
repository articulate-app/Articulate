-- Rolling conversation summary per AI thread. Older messages are folded into
-- context_summary instead of being silently dropped by the recent-window cap.
alter table public.ai_threads
  add column if not exists context_summary text,
  add column if not exists context_summary_until_message_id uuid,
  add column if not exists context_summary_until_created_at timestamptz,
  add column if not exists context_summary_updated_at timestamptz;
