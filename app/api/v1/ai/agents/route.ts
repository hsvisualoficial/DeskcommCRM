/**
 * GET  /api/v1/ai/agents  — list agents da org ativa (manager+)
 * POST /api/v1/ai/agents  — create agent (admin)
 *
 * Auth: cookie session. organization_id resolvido do JWT — nunca do body.
 * Audit: trigger trg_ai_agents_audit grava INSERT/UPDATE em audit_log automaticamente.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentCreateSchema } from "@/lib/ai/guardrails-schema";

export const dynamic = "force-dynamic";

const AGENT_COLUMNS =
  "id, organization_id, name, description, model, system_prompt, is_active, is_default, config, guardrails, active_kb_version_id, created_at, updated_at";

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authUser = await loadAuthUser();
  if (!authUser) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) {
    return fail("forbidden", "Nenhuma organização ativa.", 403, { requestId });
  }

  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    return fail("forbidden_role", "Permissão insuficiente. Requer role >= manager.", 403, {
      requestId,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .select(AGENT_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return fail("internal_error", "Erro ao listar agents.", 500, { requestId });
  }

  return ok(data ?? [], { requestId });
}

// ---------------------------------------------------------------------------
// POST — create (admin only)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authUser = await loadAuthUser();
  if (!authUser) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) {
    return fail("forbidden", "Nenhuma organização ativa.", 403, { requestId });
  }

  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return fail("forbidden_role", "Permissão insuficiente. Requer role admin.", 403, {
      requestId,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = agentCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ai_agents")
    .insert({
      organization_id: activeOrg.orgId,
      name: input.name,
      description: input.description ?? null,
      model: input.model ?? "anthropic/claude-sonnet-4-6",
      system_prompt: input.system_prompt,
      is_active: true,
      is_default: false,
      created_by: authUser.id,
    })
    .select(AGENT_COLUMNS)
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao criar agent.", 500, { requestId });
  }

  return ok(data, { status: 201, requestId });
}
