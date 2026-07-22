-- Migration 0029: Lead scoring SDR/Pré-vendas (Fase 1)
-- EPIC-SDR wave 1 — B2C + Prestadores de Serviço.
--
-- Adiciona à tabela `contacts` (a pessoa = o "lead" no contexto SDR, unidade que
-- aparece no Inbox e é referenciada pelo card do Kanban via crm_leads.contact_id):
--   * score        integer  — pontuação de qualificação (0-100), editável.
--   * priority_tag  text     — COLUNA GERADA a partir do score (HOT/WARM/COLD).
--                              Doutrina DIRC "Calcular": derivada, sempre em sync,
--                              sem trigger. Thresholds: >=70 HOT, >=40 WARM, COLD.
--   * custom_fields jsonb    — dados específicos por segmento (orçamento, tipo de
--                              imóvel, modelo do veículo, etc.).
--
-- Motivo de perda do Kanban NÃO é adicionado aqui: `crm_leads.lost_reason` já
-- existe (baseline) + constraint `crm_leads_lost_reason_required` já o exige
-- quando status='lost'. A Fase 1 apenas passa a coletá-lo no drag-to-lost (UI).
--
-- Idempotente e portável em psql puro (add column if not exists, DO-guard na
-- constraint, create index if not exists).

alter table public.contacts
  add column if not exists score integer not null default 0;

-- priority_tag depende de score existir primeiro (mesma migration, ordem acima).
alter table public.contacts
  add column if not exists priority_tag text
  generated always as (
    case
      when score >= 70 then 'HOT'
      when score >= 40 then 'WARM'
      else 'COLD'
    end
  ) stored;

alter table public.contacts
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- Limite de sanidade coerente com os thresholds do priority_tag (0-100).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_score_range'
  ) then
    alter table public.contacts
      add constraint contacts_score_range check (score >= 0 and score <= 100);
  end if;
end $$;

-- Filtragem por prioridade dentro do tenant (ex.: "leads quentes desta org").
create index if not exists contacts_org_priority_idx
  on public.contacts (organization_id, priority_tag);

comment on column public.contacts.score is 'Pontuação de qualificação SDR (0-100). Alimenta priority_tag.';
comment on column public.contacts.priority_tag is 'Prioridade derivada do score (GENERATED): >=70 HOT, >=40 WARM, senão COLD.';
comment on column public.contacts.custom_fields is 'Dados específicos por segmento (orçamento, tipo de imóvel/serviço, etc.). Schema declarativo no app (SEGMENT_CUSTOM_FIELDS / pipeline.settings.fields).';
