/**
 * Append-only audit log writer. Fire-and-forget — failure must NEVER block the
 * primary mutation. Errors are surfaced via console.error (Sentry breadcrumb in prod).
 *
 * Schema source: docs/specs/01-spec-platform-base.md §2.5
 *   columns: organization_id, actor_user_id, actor_api_token_id,
 *            acting_as_platform_admin, actor_ip, actor_user_agent,
 *            action, resource_type, resource_id, request_id,
 *            bypassed_rls, metadata, created_at
 */
import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditAction } from "./actions";

interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  organizationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  bypassedRls?: boolean;
  actingAsPlatformAdmin?: boolean;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("api_audit_log").insert({
      action: entry.action,
      actor_user_id: entry.actorUserId ?? null,
      organization_id: entry.organizationId ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
      request_id: entry.requestId ?? null,
      actor_ip: entry.ip ?? null,
      actor_user_agent: entry.userAgent ?? null,
      bypassed_rls: entry.bypassedRls ?? false,
      acting_as_platform_admin: entry.actingAsPlatformAdmin ?? false,
    });
    if (error) {
      console.error("[audit] insert error", error.message);
    }
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}

/**
 * Stable sha256 hex of normalized email. Used in audit metadata to correlate
 * failed logins without storing PII plaintext.
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
