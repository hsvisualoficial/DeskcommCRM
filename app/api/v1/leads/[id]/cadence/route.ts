/**
 * POST /api/v1/leads/[id]/cadence — ativa uma régua de cadência para o contato
 * do lead: enfileira N passos {delay_hours, body} a partir de agora.
 *
 * Usado pelo botão "Ativar Régua de Cadência" no painel do lead. Cada passo
 * vira um scheduled_message (source=cadence) disparado depois pelo cron via WAHA.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { cadenceActivateSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { resolveContactConversationId } from "@/lib/cadence/enqueue";
import { applySnippetVariables, buildSnippetVariables } from "@/lib/inbox/snippet-vars";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail("unauthenticated", "Auth required.", 401, { requestId });

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) return fail("no_active_org", "No active organization.", 403, { requestId });

  let input;
  try {
    input = await validateRequest(cadenceActivateSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // Lead pertence à org e casa com o contato informado?
  const { data: lead, error: lErr } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("id", leadId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (lErr) return fail("internal_error", lErr.message, 500, { requestId });
  if (!lead) return fail("not_found", "Lead não encontrado.", 404, { requestId });
  const contactId = (lead as { contact_id: string | null }).contact_id;
  if (!contactId || contactId !== input.contact_id) {
    return fail("invalid_request", "Lead sem contato válido para cadência.", 422, { requestId });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("display_name, name, phone_number, custom_fields, is_blocked, is_anonymized")
    .eq("id", contactId)
    .maybeSingle();
  const c = contact as {
    is_blocked?: boolean;
    is_anonymized?: boolean;
  } | null;
  if (c?.is_blocked || c?.is_anonymized) {
    return fail("contact_unavailable", "Contato bloqueado/anonimizado — cadência não permitida.", 422, { requestId });
  }

  const vars = buildSnippetVariables((contact as Record<string, unknown> | null) ?? null);
  const conversationId = await resolveContactConversationId(supabase, activeOrg.orgId, contactId);
  const now = Date.now();

  const rows = input.steps.map((s, i) => ({
    organization_id: activeOrg.orgId,
    contact_id: contactId,
    conversation_id: conversationId,
    lead_id: leadId,
    body: applySnippetVariables(s.body, vars).slice(0, 4000),
    scheduled_for: new Date(now + s.delay_hours * 3_600_000).toISOString(),
    source: "cadence" as const,
    trigger_ref: `manual-cadence:${requestId}:${i}`,
    created_by_user_id: user.id,
  }));

  const { data, error } = await supabase.from("scheduled_messages").insert(rows).select("id");
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "cadence.activated",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "crm_lead",
    resourceId: leadId,
    requestId,
    metadata: { steps: input.steps.length, contact_id: contactId },
  });

  return ok({ scheduled: (data ?? []).length }, { requestId });
}
