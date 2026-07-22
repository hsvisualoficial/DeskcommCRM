/**
 * GET /api/v1/pipelines/[id]/metrics
 *
 * Métricas rápidas do funil pro dashboard SDR:
 *  - contagem open/won/lost + taxa de conversão
 *  - conversão por motivo de perda (reusa crm_leads.lost_reason)
 *  - média de tempo de primeira resposta (SLA) via RPC
 *
 * Tenant flow: auth + org + RLS (cookie client).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface PipelineMetrics {
  open: number;
  won: number;
  lost: number;
  conversion_rate: number; // won / (won + lost), 0..1
  loss_reasons: Array<{ reason: string; count: number }>;
  avg_first_response_seconds: number | null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: pipelineId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail("unauthenticated", "Auth required.", 401, { requestId });

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) return fail("no_active_org", "No active organization.", 403, { requestId });
  const orgId = activeOrg.orgId;

  const base = () =>
    supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("pipeline_id", pipelineId);

  const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();

  const [openC, wonC, lostC, lostRows, frt] = await Promise.all([
    base().eq("status", "open"),
    base().eq("status", "won"),
    base().eq("status", "lost"),
    supabase
      .from("crm_leads")
      .select("lost_reason")
      .eq("organization_id", orgId)
      .eq("pipeline_id", pipelineId)
      .eq("status", "lost")
      .limit(2000),
    supabase.rpc("fn_sdr_first_response_avg_seconds", { p_organization_id: orgId, p_since: since }),
  ]);

  const open = openC.count ?? 0;
  const won = wonC.count ?? 0;
  const lost = lostC.count ?? 0;

  const counts = new Map<string, number>();
  for (const row of (lostRows.data ?? []) as Array<{ lost_reason: string | null }>) {
    const key = (row.lost_reason ?? "não informado").trim() || "não informado";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const loss_reasons = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const avgRaw = (frt as { data: number | null }).data;
  const avg_first_response_seconds =
    typeof avgRaw === "number" && Number.isFinite(avgRaw) ? Math.round(avgRaw) : null;

  const metrics: PipelineMetrics = {
    open,
    won,
    lost,
    conversion_rate: won + lost > 0 ? won / (won + lost) : 0,
    loss_reasons,
    avg_first_response_seconds,
  };

  return ok(metrics, { requestId });
}
