-- Migration 0030: Snippets/Respostas rápidas + Notas internas da conversa
-- EPIC-SDR wave 2 (produtividade do Inbox).
--
-- chat_snippets      — templates de resposta rápida por organização, disparados
--                      por atalho ("/agendar") no composer; content aceita
--                      variáveis {{nome}}, {{servico}}, {{valor}} etc.
-- conversation_notes — notas internas por conversa (manuais ou geradas por IA:
--                      "Resumir atendimento"). NÃO vão pro WhatsApp.
--
-- Ambas tenant-aware (organization_id + RLS via fn_user_org_ids), idempotentes
-- e portáveis em psql puro.

-- ---------------------------------------------------------------------------
-- chat_snippets
-- ---------------------------------------------------------------------------
create table if not exists public.chat_snippets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shortcut text not null,
  title text,
  content text not null,
  category text,
  is_active boolean not null default true,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_snippets_shortcut_format check (shortcut ~ '^[a-z0-9_-]{1,40}$'),
  constraint chat_snippets_content_len check (char_length(content) between 1 and 4000)
);

-- Atalho único por org (é a chave de disparo no "/").
create unique index if not exists chat_snippets_org_shortcut_idx
  on public.chat_snippets (organization_id, shortcut);
create index if not exists chat_snippets_org_active_idx
  on public.chat_snippets (organization_id, is_active);

alter table public.chat_snippets enable row level security;
drop policy if exists tenant_isolation_chat_snippets_all on public.chat_snippets;
create policy tenant_isolation_chat_snippets_all on public.chat_snippets for all
  using (organization_id in (select * from public.fn_user_org_ids()))
  with check (organization_id in (select * from public.fn_user_org_ids()));

comment on table public.chat_snippets is 'Respostas rápidas por org, disparadas por atalho no composer do inbox. content aceita variáveis {{...}}.';

-- ---------------------------------------------------------------------------
-- conversation_notes
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid,
  body text not null,
  source text not null default 'manual',
  author_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint conversation_notes_source_check check (source = any (array['manual'::text, 'ai_summary'::text])),
  constraint conversation_notes_body_len check (char_length(body) between 1 and 8000)
);

create index if not exists conversation_notes_conv_idx
  on public.conversation_notes (organization_id, conversation_id, created_at desc);

alter table public.conversation_notes enable row level security;
drop policy if exists tenant_isolation_conversation_notes_all on public.conversation_notes;
create policy tenant_isolation_conversation_notes_all on public.conversation_notes for all
  using (organization_id in (select * from public.fn_user_org_ids()))
  with check (organization_id in (select * from public.fn_user_org_ids()));

comment on table public.conversation_notes is 'Notas internas por conversa (manuais ou geradas por IA). Nunca enviadas ao WhatsApp.';

-- ---------------------------------------------------------------------------
-- Seed de respostas rápidas iniciais (genérico + idempotente, sem hardcode de
-- IDs). Semeia pra toda org que ainda não tem o atalho. Novas orgs podem semear
-- no onboarding depois.
-- ---------------------------------------------------------------------------
insert into public.chat_snippets (organization_id, shortcut, title, content, category)
select o.id, s.shortcut, s.title, s.content, s.category
from public.organizations o
cross join (values
  ('saudacao', 'Saudação', 'Olá {{nome}}, tudo bem? Sou da equipe e vou te ajudar por aqui. 😊', 'Geral'),
  ('agendar', 'Agendar visita', '{{nome}}, consigo agendar um horário pra você. Qual o melhor dia e período?', 'Agendamento'),
  ('localizacao', 'Localização', '{{nome}}, nosso endereço é [preencher]. Quer que eu envie a localização no mapa?', 'Geral'),
  ('orcamento', 'Enviar orçamento', '{{nome}}, sobre {{servico}}: o valor fica em {{valor}}. Posso detalhar as condições?', 'Vendas'),
  ('followup', 'Follow-up', 'Oi {{nome}}, passando pra saber se ficou alguma dúvida. Posso ajudar em mais alguma coisa?', 'Pós-venda')
) as s(shortcut, title, content, category)
on conflict (organization_id, shortcut) do nothing;
