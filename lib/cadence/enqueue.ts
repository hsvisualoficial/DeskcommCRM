/**
 * Réguas de cadência — enfileiramento de mensagens agendadas (SDR wave 3).
 *
 * A configuração da cadência por etapa vive em `crm_pipelines.settings.cadence`
 * (jsonb), reutilizando o mesmo mecanismo declarativo de `settings.fields` /
 * `settings.lost_reasons`. Cada regra: { trigger_stage_id, delay_hours, body }.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applySnippetVariables, buildSnippetVariables } from "@/lib/inbox/snippet-vars";

type SB = SupabaseClient;

/** Conversa 1:1 mais recente do contato (pra amarrar o disparo agendado). */
export async function resolveContactConversationId(
  supabase: SB,
  organizationId: string,
  contactId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("is_group", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

interface CadenceRule {
  trigger_stage_id?: string;
  delay_hours?: number;
  body?: string;
}

/**
 * Enfileira os passos de cadência configurados para a etapa em que o lead
 * acabou de entrar. Idempotente por contato+gatilho (índice único parcial em
 * pending → duplicatas viram 23505 e são ignoradas). Fire-and-forget.
 */
export async function enqueueStageCadence(
  supabase: SB,
  args: {
    organizationId: string;
    leadId: string;
    contactId: string | null;
    newStageId: string;
    pipelineSettings: unknown;
    actorUserId: string;
  },
): Promise<number> {
  if (!args.contactId) return 0;

  const settings = (args.pipelineSettings ?? {}) as { cadence?: CadenceRule[] };
  const rules = Array.isArray(settings.cadence) ? settings.cadence : [];
  const matched = rules.filter(
    (r) => r?.trigger_stage_id === args.newStageId && typeof r.body === "string" && r.body.trim().length > 0,
  );
  if (matched.length === 0) return 0;

  const { data: contact } = await supabase
    .from("contacts")
    .select("display_name, name, phone_number, custom_fields")
    .eq("id", args.contactId)
    .maybeSingle();
  const vars = buildSnippetVariables((contact as Record<string, unknown> | null) ?? null);
  const conversationId = await resolveContactConversationId(supabase, args.organizationId, args.contactId);

  let enqueued = 0;
  for (let i = 0; i < matched.length; i++) {
    const r = matched[i]!;
    const delayH = typeof r.delay_hours === "number" && r.delay_hours >= 0 ? r.delay_hours : 24;
    const scheduledFor = new Date(Date.now() + delayH * 3_600_000).toISOString();
    const body = applySnippetVariables(r.body!, vars).slice(0, 4000);

    const { error } = await supabase.from("scheduled_messages").insert({
      organization_id: args.organizationId,
      contact_id: args.contactId,
      conversation_id: conversationId,
      lead_id: args.leadId,
      body,
      scheduled_for: scheduledFor,
      source: "cadence",
      trigger_ref: `stage:${args.newStageId}:${i}`,
      created_by_user_id: args.actorUserId,
    });
    if (!error) enqueued++;
    else if (error.code !== "23505") console.error("[cadence] enqueue failed", error.message);
  }
  return enqueued;
}
