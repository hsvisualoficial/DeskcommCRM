/**
 * DELETE /api/v1/scheduled-messages/[id] — cancela um agendamento pendente.
 * (Só cancela quem ainda está 'pending'; enviados/falhados ficam no histórico.)
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

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
    .from("scheduled_messages")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Agendamento não encontrado ou já processado.", 404, { requestId });

  await audit({
    action: "message.schedule_canceled",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "scheduled_message",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
