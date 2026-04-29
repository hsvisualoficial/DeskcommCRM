/**
 * POST /api/v1/leads
 *
 * Creates a lead in a pipeline. Server controls:
 *   - organization_id (from active org, NEVER from body)
 *   - status='open', source_metadata={}, custom_fields={}
 *   - position_in_stage = MAX(position) + 1000 within target stage (default 1000)
 *
 * Stage must belong to pipeline (P-01). Status transitions are trigger-driven;
 * this endpoint never sets status directly.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { createLeadSchema, validateRequest } from "@/lib/schemas";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authUser = await loadAuthUser();
  if (!authUser) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) {
    return fail("no_active_org", "Nenhuma organização ativa.", 403, { requestId });
  }

  let input;
  try {
    input = await validateRequest(createLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();

  // Validate stage belongs to pipeline (P-01) within the active org.
  const { data: stage, error: stageErr } = await supabase
    .from("crm_stages")
    .select("id, pipeline_id, organization_id")
    .eq("id", input.stage_id)
    .maybeSingle();

  if (stageErr) {
    return fail("internal_error", stageErr.message, 500, { requestId });
  }
  if (!stage || stage.organization_id !== activeOrg.orgId) {
    return fail("not_found", "Stage não encontrado.", 404, { requestId });
  }
  if (stage.pipeline_id !== input.pipeline_id) {
    return fail(
      "stage_pipeline_mismatch",
      "Stage não pertence ao pipeline informado.",
      422,
      { requestId },
    );
  }

  // Compute next position_in_stage = MAX + 1000 (default 1000).
  const { data: maxRow, error: maxErr } = await supabase
    .from("crm_leads")
    .select("position_in_stage")
    .eq("stage_id", input.stage_id)
    .order("position_in_stage", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    return fail("internal_error", maxErr.message, 500, { requestId });
  }
  const nextPos = maxRow?.position_in_stage
    ? Number(maxRow.position_in_stage) + 1000
    : 1000;

  const { data: lead, error: insErr } = await supabase
    .from("crm_leads")
    .insert({
      organization_id: activeOrg.orgId,
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      title: input.title,
      description: input.description ?? null,
      contact_id: input.contact_id ?? null,
      value_cents: input.value_cents ?? null,
      currency: input.currency ?? "BRL",
      owner_user_id: input.owner_user_id ?? null,
      expected_close_date: input.expected_close_date ?? null,
      tags: input.tags ?? [],
      source: input.source,
      source_metadata: {},
      custom_fields: {},
      status: "open",
      position_in_stage: nextPos,
      created_by_user_id: authUser.id,
    })
    .select("*")
    .single();

  if (insErr || !lead) {
    return fail(
      "internal_error",
      insErr?.message ?? "Falha ao criar lead.",
      500,
      { requestId },
    );
  }

  await supabase
    .rpc("emit_event", {
      p_event_type: "lead.created",
      p_entity_kind: "crm_lead",
      p_entity_id: lead.id,
      p_payload: {
        pipeline_id: lead.pipeline_id,
        stage_id: lead.stage_id,
        title: lead.title,
      },
      p_metadata: { request_id: requestId, actor_user_id: authUser.id },
      p_organization_id: activeOrg.orgId,
    })
    .then(({ error }) => {
      if (error) console.error("[lead.create] emit_event failed", error.message);
    });

  await audit({
    action: "lead.created",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "crm_lead",
    resourceId: lead.id,
    requestId,
    metadata: {
      pipeline_id: lead.pipeline_id,
      stage_id: lead.stage_id,
      title: lead.title,
    },
  });

  return ok(lead, { requestId, status: 201 });
}
