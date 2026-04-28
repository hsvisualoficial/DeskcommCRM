/**
 * Canonical audit action codes. Append new codes at the end; never rename.
 * Each code maps 1:1 with a row in api_audit_log.action.
 */
export type AuditAction =
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.mfa_enrolled"
  | "auth.mfa_failed"
  | "auth.recovery_code_used";
