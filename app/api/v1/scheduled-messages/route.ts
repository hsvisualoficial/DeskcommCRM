/**
 * GET  /api/v1/scheduled-messages?contact_id=... — lista agendamentos do contato.
 * POST /api/v1/scheduled-messages — agenda uma mensagem (follow-up).
 *
 * Padrão: auth (cookie → RLS por org) + Zod + ok/fail + audit. O disparo é feito
 * depois pelo cron scheduled-dispatch via WAHA.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { scheduledMessageCreateSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { resolveContactConversationId } from "@/lib/cadence/enqueue";

export const dynamic = "force-dynamic";

const COLS =
  "id, contact_id, conversation_id, lead_id, body, scheduled_for, status, source, sent_message_id, last_error, created_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail("unauthenticated", "Auth required.", 401, { requestId });

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) return fail("no_active_org", "No active organization.", 403, { requestId });

  const contactId = req.nextUrl.searchParams.get("contact_id");
  const conversationId = req.nextUrl.searchParams.get("conversation_id");

  let q = supabase
    .from("scheduled_messages")
    .select(COLS)
    .eq("organization_id", activeOrg.orgId)
    .order("scheduled_for", { ascending: true });
  if (contactId) q = q.eq("contact_id", contactId);
  if (conversationId) q = q.eq("conversation_id", conversationId);

  const { data, error } = await q;
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
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
    input = await validateRequest(scheduledMessageCreateSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // Não permite agendar no passado (60s de tolerância pra clock skew).
  if (Date.parse(input.scheduled_for) < Date.now() - 60_000) {
    return fail("invalid_request", "A data/hora do agendamento deve ser no futuro.", 400, { requestId });
  }

  // Contato pertence à org?
  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .select("id, is_blocked, is_anonymized")
    .eq("id", input.contact_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (cErr) return fail("internal_error", cErr.message, 500, { requestId });
  if (!contact) return fail("not_found", "Contato não encontrado.", 404, { requestId });
  if ((contact as { is_blocked: boolean }).is_blocked || (contact as { is_anonymized: boolean }).is_anonymized) {
    return fail("contact_unavailable", "Contato bloqueado/anonimizado — não é possível agendar mensagens.", 422, { requestId });
  }

  const conversationId =
    input.conversation_id ??
    (await resolveContactConversationId(supabase, activeOrg.orgId, input.contact_id));

  const { data, error } = await supabase
    .from("scheduled_messages")
    .insert({
      organization_id: activeOrg.orgId,
      contact_id: input.contact_id,
      conversation_id: conversationId,
      lead_id: input.lead_id ?? null,
      body: input.body,
      scheduled_for: input.scheduled_for,
      source: "manual",
      created_by_user_id: user.id,
    })
    .select(COLS)
    .single();

  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "message.scheduled",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "scheduled_message",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { scheduled_for: input.scheduled_for, contact_id: input.contact_id },
  });

  return ok(data, { requestId });
}
