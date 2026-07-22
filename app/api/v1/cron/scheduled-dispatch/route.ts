/**
 * GET/POST /api/v1/cron/scheduled-dispatch
 *
 * Dispara as mensagens agendadas vencidas (scheduled_messages status='pending',
 * scheduled_for <= now) via WAHA, reusando sendMessageHandler. Rodado a cada
 * minuto pelo container scheduler (docker-compose). Auth por Bearer
 * INTERNAL_CRON_SECRET / INTERNAL_SECRET (fail-closed).
 *
 * Service-role (RLS bypass) — processa todas as orgs; cada linha carrega seu
 * organization_id confiável (não vem do body).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { resolveContactConversationId } from "@/lib/cadence/enqueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 25;

interface DueRow {
  id: string;
  organization_id: string;
  contact_id: string;
  conversation_id: string | null;
  body: string;
  created_by_user_id: string | null;
  attempts: number;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // --- auth (fail-closed) ---
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  const provided = bearer || headerSecret;
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_messages")
    .select("id, organization_id, contact_id, conversation_id, body, created_by_user_id, attempts")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);

  if (error) return fail("internal_error", error.message, 500, { requestId });

  const rows = (due ?? []) as DueRow[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      // Contato ainda enviável?
      const { data: contact } = await supabase
        .from("contacts")
        .select("is_blocked, is_anonymized")
        .eq("id", row.contact_id)
        .maybeSingle();
      const c = contact as { is_blocked?: boolean; is_anonymized?: boolean } | null;
      if (c?.is_blocked || c?.is_anonymized) {
        await supabase
          .from("scheduled_messages")
          .update({ status: "canceled", last_error: "contact_unavailable", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        skipped++;
        continue;
      }

      const conversationId =
        row.conversation_id ??
        (await resolveContactConversationId(supabase, row.organization_id, row.contact_id));
      if (!conversationId) {
        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            attempts: row.attempts + 1,
            last_error: "no_conversation",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failed++;
        continue;
      }

      const message = await sendMessageHandler(
        supabase,
        {
          organization_id: row.organization_id,
          actor: { type: "user", id: row.created_by_user_id ?? row.organization_id },
          requestId,
        },
        { conversation_id: conversationId, type: "text", body: row.body },
      );

      const msgStatus = (message as { status?: string; id?: string }).status;
      if (msgStatus === "failed") {
        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            attempts: row.attempts + 1,
            last_error: "send_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failed++;
      } else {
        await supabase
          .from("scheduled_messages")
          .update({
            status: "sent",
            attempts: row.attempts + 1,
            sent_message_id: (message as { id?: string }).id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        sent++;
        void audit({
          action: "message.schedule_dispatched",
          actorUserId: row.created_by_user_id,
          organizationId: row.organization_id,
          resourceType: "scheduled_message",
          resourceId: row.id,
          requestId,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "dispatch_error";
      await supabase
        .from("scheduled_messages")
        .update({
          status: "failed",
          attempts: row.attempts + 1,
          last_error: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return ok({ processed: rows.length, sent, failed, skipped }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
