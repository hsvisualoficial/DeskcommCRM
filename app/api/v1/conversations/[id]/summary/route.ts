/**
 * POST /api/v1/conversations/[id]/summary — resume o atendimento com IA.
 *
 * Lê o histórico recente da conversa e devolve um resumo estruturado em 3
 * tópicos (dor / detalhes-orçamento / próximo passo) + um texto pronto pra
 * salvar como nota interna. NÃO persiste nada — o salvamento é um POST
 * separado em /notes (source=ai_summary), decidido pelo usuário.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { loadHistoryWithBudget } from "@/lib/ai/runtime/history";
import {
  isSummaryConfigured,
  summarizeConversation,
  formatSummaryNote,
} from "@/lib/ai/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  if (!isSummaryConfigured()) {
    return fail(
      "ai_not_configured",
      "IA não configurada. Defina ANTHROPIC_API_KEY (ou AI_GATEWAY_API_KEY) no ambiente.",
      503,
      { requestId },
    );
  }

  // Conversa pertence à org? Captura o contato pra dar nome ao resumo.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id, contacts:contact_id (display_name, name)")
    .eq("id", conversationId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  if (!conv) return fail("not_found", "Conversa não encontrada.", 404, { requestId });

  // PostgREST tipa o embed como array; normaliza pra objeto único.
  type ContactRef = { display_name: string | null; name: string | null };
  const contactsField = (conv as unknown as { contacts: ContactRef | ContactRef[] | null }).contacts;
  const contact = Array.isArray(contactsField) ? contactsField[0] : contactsField;
  const contactName = contact?.display_name?.trim() || contact?.name?.trim() || null;

  const messages = await loadHistoryWithBudget(supabase, {
    conversationId,
    organizationId: activeOrg.orgId,
    messageWindow: 60,
    tokenWindow: 6000,
  });

  if (messages.length === 0) {
    return fail("empty_conversation", "Não há mensagens suficientes para resumir.", 422, { requestId });
  }

  let summary;
  try {
    summary = await summarizeConversation({
      organizationId: activeOrg.orgId,
      contactName,
      messages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar resumo.";
    return fail("ai_error", message, 502, { requestId });
  }

  await audit({
    action: "conversation.summarized",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "conversation",
    resourceId: conversationId,
    requestId,
    metadata: { message_count: messages.length },
  });

  return ok({ ...summary, text: formatSummaryNote(summary) }, { requestId });
}
