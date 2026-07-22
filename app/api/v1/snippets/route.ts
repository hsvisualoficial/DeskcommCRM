/**
 * GET  /api/v1/snippets — lista respostas rápidas da org (ativas primeiro).
 * POST /api/v1/snippets — cria uma resposta rápida.
 *
 * Thin wrapper: auth (cookie session → RLS por org) + Zod + ok/fail + audit.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { snippetCreateSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
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

  const { data, error } = await supabase
    .from("chat_snippets")
    .select("id, organization_id, shortcut, title, content, category, is_active, created_at, updated_at")
    .eq("organization_id", activeOrg.orgId)
    .order("is_active", { ascending: false })
    .order("shortcut", { ascending: true });

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
    input = await validateRequest(snippetCreateSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const { data, error } = await supabase
    .from("chat_snippets")
    .insert({
      organization_id: activeOrg.orgId,
      created_by_user_id: user.id,
      shortcut: input.shortcut,
      content: input.content,
      title: input.title ?? null,
      category: input.category ?? null,
      is_active: input.is_active,
    })
    .select("id, organization_id, shortcut, title, content, category, is_active, created_at, updated_at")
    .single();

  if (error) {
    // 23505 = unique violation (atalho já existe nesta org)
    if (error.code === "23505") {
      return fail("conflict", `Já existe um atalho "/${input.shortcut}" nesta organização.`, 409, { requestId });
    }
    return fail("internal_error", error.message, 500, { requestId });
  }

  await audit({
    action: "snippet.created",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "chat_snippet",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { shortcut: input.shortcut },
  });

  return ok(data, { requestId });
}
