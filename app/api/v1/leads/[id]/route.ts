/**
 * PATCH /api/v1/leads/[id]
 *
 * Partial update of a lead. RLS-scoped to caller's org. Status transitions
 * (won/lost) and stage moves go through dedicated endpoints — this route
 * NEVER sets status, stage_id, pipeline_id, position_in_stage.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { updateLeadSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
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
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }

  let input;
  try {
    input = await validateRequest(updateLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const { data: existing, error: selErr } = await supabase
    .from("crm_leads")
    .select("id, organization_id")
    .eq("id", leadId)
    .maybeSingle();
  if (selErr) {
    return fail("internal_error", selErr.message, 500, { requestId });
  }
  if (!existing) {
    return fail("not_found", "Lead não encontrado.", 404, { requestId });
  }

  // Build patch from defined fields only (avoid clobbering with undefined).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.contact_id !== undefined) patch.contact_id = input.contact_id;
  if (input.value_cents !== undefined) patch.value_cents = input.value_cents;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.owner_user_id !== undefined) {
    patch.owner_user_id = input.owner_user_id;
    if (input.owner_user_id !== null) {
      patch.assigned_at = new Date().toISOString();
    }
  }
  if (input.expected_close_date !== undefined) {
    patch.expected_close_date = input.expected_close_date;
  }
  if (input.tags !== undefined) patch.tags = input.tags;

  const { data: updated, error: updErr } = await supabase
    .from("crm_leads")
    .update(patch)
    .eq("id", leadId)
    .select("*")
    .maybeSingle();

  if (updErr) {
    return fail("internal_error", updErr.message, 500, { requestId });
  }
  if (!updated) {
    return fail("not_found", "Lead não encontrado.", 404, { requestId });
  }

  await supabase
    .rpc("emit_event", {
      p_event_type: "lead.updated",
      p_entity_kind: "crm_lead",
      p_entity_id: leadId,
      p_payload: { fields: Object.keys(input) },
      p_metadata: { request_id: requestId, actor_user_id: user.id },
      p_organization_id: existing.organization_id,
    })
    .then(({ error }) => {
      if (error) console.error("[lead.update] emit_event failed", error.message);
    });

  await audit({
    action: "lead.updated",
    actorUserId: user.id,
    organizationId: existing.organization_id,
    resourceType: "crm_lead",
    resourceId: leadId,
    requestId,
    metadata: { fields: Object.keys(input) },
  });

  return ok(updated, { requestId });
}
