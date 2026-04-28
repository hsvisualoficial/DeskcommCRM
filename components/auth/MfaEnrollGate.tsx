"use client";

import { MfaEnrollModal } from "@/components/auth/MfaEnrollModal";

/**
 * Full-viewport blocker shown to users (admin / platform_admin) who haven't
 * enrolled MFA yet. The modal cannot be dismissed — the user MUST complete
 * enrollment to access the app.
 */
export function MfaEnrollGate() {
  return (
    <div className="fixed inset-0 z-40 bg-background">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">
          Configurando autenticação em duas etapas...
        </p>
      </div>
      <MfaEnrollModal />
    </div>
  );
}
