-- Idempotency for Mandrill inbound reply → mention inserts
CREATE TABLE IF NOT EXISTS public.inbound_email_replies (
  id bigserial PRIMARY KEY,
  provider_message_id text NOT NULL,
  thread_id integer NOT NULL REFERENCES public.threads(id),
  mention_id integer REFERENCES public.mentions(id),
  from_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_replies_provider_message_id_key UNIQUE (provider_message_id)
);

CREATE INDEX IF NOT EXISTS inbound_email_replies_thread_id_idx
  ON public.inbound_email_replies (thread_id);

ALTER TABLE public.inbound_email_replies ENABLE ROW LEVEL SECURITY;
