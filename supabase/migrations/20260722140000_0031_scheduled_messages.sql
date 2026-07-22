-- Migration 0031: Disparos agendados / réguas de cadência (SDR wave 3)
-- EPIC-SDR wave 3 — acompanhamento e follow-up automatizado via WAHA.
--
-- scheduled_messages — fila de mensagens de WhatsApp a disparar no futuro
-- (follow-up manual do vendedor ou passo de régua de cadência). Um cron
-- (/api/v1/cron/scheduled-dispatch) consome as pendentes vencidas e envia via
-- WAHA reusando sendMessageHandler.
--
-- Cadência por etapa: configurada em crm_pipelines.settings.cadence (jsonb),
-- enfileirada pelo handler de mover lead. Não há tabela de config nova.
--
-- Tenant-aware (RLS via fn_user_org_ids); idempotente e portável em psql.

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  body text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  source text not null default 'manual',
  -- Referência do gatilho (ex.: 'stage:<uuid>') — usada pra deduplicar cadência.
  trigger_ref text,
  attempts smallint not null default 0,
  last_error text,
  sent_message_id uuid references public.messages(id) on delete set null,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_messages_status_check
    check (status = any (array['pending'::text, 'sent'::text, 'failed'::text, 'canceled'::text])),
  constraint scheduled_messages_source_check
    check (source = any (array['manual'::text, 'cadence'::text])),
  constraint scheduled_messages_body_len check (char_length(body) between 1 and 4000)
);

-- Consulta principal do dispatcher: pendentes vencidas.
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (status, scheduled_for);
create index if not exists scheduled_messages_org_contact_idx
  on public.scheduled_messages (organization_id, contact_id, status);

-- Dedupe de cadência: no máximo 1 passo pendente por contato+gatilho.
create unique index if not exists scheduled_messages_cadence_dedupe_idx
  on public.scheduled_messages (contact_id, trigger_ref)
  where status = 'pending' and trigger_ref is not null;

alter table public.scheduled_messages enable row level security;
drop policy if exists tenant_isolation_scheduled_messages_all on public.scheduled_messages;
create policy tenant_isolation_scheduled_messages_all on public.scheduled_messages for all
  using (organization_id in (select * from public.fn_user_org_ids()))
  with check (organization_id in (select * from public.fn_user_org_ids()));

comment on table public.scheduled_messages is 'Fila de mensagens WhatsApp agendadas (follow-up manual ou régua de cadência). Consumida pelo cron scheduled-dispatch via WAHA.';
