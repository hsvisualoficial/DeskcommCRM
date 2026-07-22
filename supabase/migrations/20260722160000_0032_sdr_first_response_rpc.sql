-- Migration 0032: RPC de tempo médio de primeira resposta (SDR wave 3, dashboard)
-- EPIC-SDR wave 3 — métrica de SLA no dashboard do Kanban.
--
-- fn_sdr_first_response_avg_seconds(org, since): média (segundos) entre a
-- primeira mensagem do cliente (inbound) de cada conversa e a primeira resposta
-- do atendente (outbound) posterior, na janela informada.
--
-- SECURITY INVOKER (default): a RLS de `messages` aplica ao chamador, então o
-- parâmetro de org apenas escopa/indexa a query — sem risco cross-tenant.

create or replace function public.fn_sdr_first_response_avg_seconds(
  p_organization_id uuid,
  p_since timestamptz
) returns numeric
  language sql
  stable
  set search_path = public
as $$
  with firsts as (
    select
      m.conversation_id,
      min(m.sent_at) filter (where m.direction = 'inbound') as first_in
    from public.messages m
    where m.organization_id = p_organization_id
      and m.sent_at >= p_since
    group by m.conversation_id
  ),
  paired as (
    select
      f.conversation_id,
      f.first_in,
      (
        select min(o.sent_at)
        from public.messages o
        where o.conversation_id = f.conversation_id
          and o.direction = 'outbound'
          and o.sent_at > f.first_in
      ) as first_out
    from firsts f
    where f.first_in is not null
  )
  select avg(extract(epoch from (first_out - first_in)))
  from paired
  where first_out is not null;
$$;

grant execute on function public.fn_sdr_first_response_avg_seconds(uuid, timestamptz) to authenticated;
