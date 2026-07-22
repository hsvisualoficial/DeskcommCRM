/**
 * GET  /api/v1/conversations/[id]/notes — lista notas internas da conversa.
 * POST /api/v1/conversations/[id]/notes — cria nota interna (manual ou ai_summary).
 *
 * Notas NÃO vão pro WhatsApp — vivem só no CRM. RLS por org + verificação
 * explícita de que a conversa pertence à org (evita nota cross-tenant).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { conversationNoteCreateSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLS =
  "id, conversation_id, contact_id, body, source, author_user_id, metadata, created_at";

export async function GET(
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

  const { data, error } = await supabase
    .from("conversation_notes")
    .select(COLS)
    .eq("organization_id", activeOrg.orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(
  req: NextRequest,
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

  let input;
  try {
    input = await validateRequest(conversationNoteCreateSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // Verifica que a conversa pertence à org (e captura contact_id).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("id", conversationId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  if (!conv) return fail("not_found", "Conversa não encontrada.", 404, { requestId });

  const { data, error } = await supabase
    .from("conversation_notes")
    .insert({
      organization_id: activeOrg.orgId,
      conversation_id: conversationId,
      contact_id: (conv as { contact_id: string | null }).contact_id,
      body: input.body,
      source: input.source,
      author_user_id: user.id,
      metadata: input.metadata ?? {},
    })
    .select(COLS)
    .single();

  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "conversation.note_created",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "conversation",
    resourceId: conversationId,
    requestId,
    metadata: { source: input.source, note_id: (data as { id: string }).id },
  });

  return ok(data, { requestId });
}
