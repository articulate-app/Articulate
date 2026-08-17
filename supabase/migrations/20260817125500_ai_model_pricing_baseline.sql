insert into public.ai_model_pricing (
  provider,
  model_name,
  currency,
  input_token_price,
  output_token_price,
  effective_from
) values
  ('openai', 'gpt-5.4-mini', 'USD', 0.00075, 0.0045, current_date),
  ('openai', 'gpt-5.5', 'USD', 0.005, 0.03, current_date)
on conflict (provider, model_name, effective_from) do update
set currency = excluded.currency,
    input_token_price = excluded.input_token_price,
    output_token_price = excluded.output_token_price;
