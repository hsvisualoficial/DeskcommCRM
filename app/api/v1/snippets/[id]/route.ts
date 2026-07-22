/**
 * PATCH  /api/v1/snippets/[id] — atualiza uma resposta rápida.
 * DELETE /api/v1/snippets/[id] — remove uma resposta rápida.
 *
 * RLS por org garante isolamento; filtramos organization_id explicitamente
 * também (defesa em profundidade — CLAUDE.md).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { snippetUpdateSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLS =
  "id, organization_id, shortcut, title, content, category, is_active, created_at, updated_at";

export async function PATCH(
  req: NextRequest,
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

  let input;
  try {
    input = await validateRequest(snippetUpdateSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.shortcut !== undefined) patch.shortcut = input.shortcut;
  if (input.content !== undefined) patch.content = input.content;
  if (input.title !== undefined) patch.title = input.title;
  if (input.category !== undefined) patch.category = input.category;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("chat_snippets")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .select(COLS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Já existe um atalho com esse nome nesta organização.", 409, { requestId });
    }
    return fail("internal_error", error.message, 500, { requestId });
  }
  if (!data) return fail("not_found", "Atalho não encontrado.", 404, { requestId });

  await audit({
    action: "snippet.updated",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "chat_snippet",
    resourceId: id,
    requestId,
    metadata: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  return ok(data, { requestId });
}

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
    .from("chat_snippets")
    .delete()
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .select("id")
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Atalho não encontrado.", 404, { requestId });

  await audit({
    action: "snippet.deleted",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "chat_snippet",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
