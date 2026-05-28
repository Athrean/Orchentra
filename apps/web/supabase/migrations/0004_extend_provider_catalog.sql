-- Extend provider_credentials.provider CHECK constraint to cover xAI, Groq, Azure OpenAI.

alter table public.provider_credentials
  drop constraint if exists provider_credentials_provider_check;

alter table public.provider_credentials
  add constraint provider_credentials_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'openrouter', 'xai', 'groq', 'azure-openai'));
