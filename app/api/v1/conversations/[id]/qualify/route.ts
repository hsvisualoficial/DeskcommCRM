/**
 * POST /api/v1/conversations/[id]/qualify — qualifica o lead com IA e aplica as
 * ações no CRM (EPIC-SDR wave 4).
 *
 * Fluxo:
 *   1. Extrai qualificação estruturada do histórico (score, intenção, orçamento,
 *      tipo de serviço, urgência, handoff) via structured output.
 *   2. Atualiza contacts.score + custom_fields (priority_tag é gerado no DB).
 *   3. Salva um resumo de qualificação em conversation_notes (source=ai_summary).
 *   4. Handoff inteligente se HOT (score>=70) ou handoff recomendado:
 *      move o lead para uma etapa requires_human, dispara o handoff (silencia o
 *      bot + status=pending + alerta ai.handoff_triggered) e envia a mensagem
 *      de transição amigável no WhatsApp.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { loadHistoryWithBudget } from "@/lib/ai/runtime/history";
import {
  isQualifyConfigured,
  qualifyLead,
  qualificationCustomFields,
  formatQualificationNote,
} from "@/lib/ai/sdr/qualify";
import { triggerHandoff, type HandoffReason } from "@/lib/ai/handoff/orchestrator";
import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOT_THRESHOLD = 70;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: conversationId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail("unauthenticated", "Auth required.", 401, { requestId });

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) return fail("no_active_org", "No active organization.", 403, { requestId });
  const orgId = activeOrg.orgId;

  if (!isQualifyConfigured()) {
    return fail("ai_not_configured", "IA não configurada (ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY).", 503, { requestId });
  }

  // Conversa da org + contato.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id, contacts:contact_id (id, display_name, name, custom_fields)")
    .eq("id", conversationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  if (!conv) return fail("not_found", "Conversa não encontrada.", 404, { requestId });

  const contactId = (conv as { contact_id: string | null }).contact_id;
  type ContactRef = { id: string; display_name: string | null; name: string | null; custom_fields: Record<string, unknown> | null };
  const contactsField = (conv as unknown as { contacts: ContactRef | ContactRef[] | null }).contacts;
  const contact = Array.isArray(contactsField) ? contactsField[0] : contactsField;
  const contactName = contact?.display_name?.trim() || contact?.name?.trim() || null;

  const messages = await loadHistoryWithBudget(supabase, {
    conversationId,
    organizationId: orgId,
    messageWindow: 60,
    tokenWindow: 6000,
  });
  if (messages.length === 0) {
    return fail("empty_conversation", "Não há mensagens suficientes para qualificar.", 422, { requestId });
  }

  // 1. Extração estruturada.
  let q;
  try {
    q = await qualifyLead({ organizationId: orgId, contactName, messages });
  } catch (err) {
    return fail("ai_error", err instanceof Error ? err.message : "Falha na qualificação.", 502, { requestId });
  }

  const applied = { score_updated: false, note_saved: false, lead_moved: false, handoff: false, transition_sent: false };

  // 2. score + custom_fields no contato.
  if (contactId) {
    const merged = { ...((contact?.custom_fields as Record<string, unknown> | null) ?? {}), ...qualificationCustomFields(q) };
    const { error: upErr } = await supabase
      .from("contacts")
      .update({ score: q.score, custom_fields: merged, updated_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("organization_id", orgId);
    applied.score_updated = !upErr;
  }

  // 3. Nota de qualificação.
  {
    const { error: noteErr } = await supabase.from("conversation_notes").insert({
      organization_id: orgId,
      conversation_id: conversationId,
      contact_id: contactId,
      body: formatQualificationNote(q),
      source: "ai_summary",
      author_user_id: user.id,
      metadata: { kind: "sdr_qualification", score: q.score },
    });
    applied.note_saved = !noteErr;
  }

  // 4. Handoff inteligente.
  const isHot = q.score >= HOT_THRESHOLD || q.handoff_recomendado;
  if (isHot && contactId) {
    // Lead mais recente do contato.
    const { data: leadRow } = await supabase
      .from("crm_leads")
      .select("id, pipeline_id")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lead = leadRow as { id: string; pipeline_id: string } | null;

    // Move pro estágio de handoff (requires_human) do pipeline do lead.
    if (lead) {
      const { data: stage } = await supabase
        .from("crm_stages")
        .select("id")
        .eq("organization_id", orgId)
        .eq("pipeline_id", lead.pipeline_id)
        .eq("requires_human", true)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      const stageId = (stage as { id: string } | null)?.id;
      if (stageId) {
        try {
          await moveLeadHandler(
            supabase,
            { organization_id: orgId, actor: { type: "user", id: user.id }, requestId },
            lead.id,
            { to_stage_id: stageId, reason: "Handoff SDR — lead quente qualificado por IA" },
          );
          applied.lead_moved = true;
        } catch {
          /* estágio de handoff ausente/incompatível — segue sem mover */
        }
      }
    }

    // Dispara o handoff (silencia bot + status=pending + alerta interno).
    const reason: HandoffReason = q.handoff_recomendado ? "requested_human" : "critical_stage";
    const res = await triggerHandoff({
      conversationId,
      organizationId: orgId,
      reason,
      leadId: lead?.id ?? null,
      metadata: { source: "sdr_qualify", score: q.score, by_user: user.id },
    });
    applied.handoff = res.triggered;

    // Mensagem de transição amigável no WhatsApp (best-effort).
    try {
      const nome = contactName ? `, ${contactName.split(/\s+/)[0]}` : "";
      await sendMessageHandler(
        supabase,
        { organization_id: orgId, actor: { type: "user", id: user.id }, requestId },
        {
          conversation_id: conversationId,
          type: "text",
          body: `Perfeito${nome}! Já tenho as informações que preciso — vou te conectar agora com um dos nossos especialistas para seguir seu atendimento. Só um instante 😊`,
        },
      );
      applied.transition_sent = true;
    } catch {
      /* WAHA indisponível / sem sessão — o handoff já foi registrado */
    }
  }

  await audit({
    action: "ai.sdr_qualified",
    actorUserId: user.id,
    organizationId: orgId,
    resourceType: "conversation",
    resourceId: conversationId,
    requestId,
    metadata: { score: q.score, hot: isHot, ...applied },
  });

  return ok({ qualification: q, applied }, { requestId });
}
