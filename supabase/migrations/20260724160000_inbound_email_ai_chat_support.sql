-- Support email → ai-chat alongside mention replies
ALTER TABLE public.inbound_email_replies
  ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE public.inbound_email_replies
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'mention_reply',
  ADD COLUMN IF NOT EXISTS ai_thread_id uuid REFERENCES public.ai_threads(id),
  ADD COLUMN IF NOT EXISTS assistant_message_id uuid;

ALTER TABLE public.inbound_email_replies
  DROP CONSTRAINT IF EXISTS inbound_email_replies_kind_check;

ALTER TABLE public.inbound_email_replies
  ADD CONSTRAINT inbound_email_replies_kind_check
  CHECK (kind IN ('mention_reply', 'ai_chat'));

CREATE INDEX IF NOT EXISTS inbound_email_replies_ai_thread_id_idx
  ON public.inbound_email_replies (ai_thread_id);
