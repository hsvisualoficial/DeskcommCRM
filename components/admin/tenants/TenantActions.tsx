"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SuspendDialog } from "./SuspendDialog";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantActionsProps {
  organizationId: string;
  status: "active" | "suspended" | "onboarding" | "redacted";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantActions({ organizationId, status }: TenantActionsProps) {
  const [suspendOpen, setSuspendOpen] = useState(false);

  const canSuspend = status === "active" || status === "onboarding";
  const isSuspended = status === "suspended";
  const isRedacted = status === "redacted";

  function handleImpersonate() {
    // STUB — Wave 7 (S-11.07) implementará impersonation real
    toast.info("Impersonate disponível em S-11.07", {
      description: "A funcionalidade de impersonation será implementada na Wave 7.",
    });
  }

  function handleReactivate() {
    // STUB — Wave 8 (S-11.08) implementará reactivation real
    toast.info("Reativação disponível em S-11.08", {
      description: "O endpoint de reativação será implementado na Wave 8.",
    });
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Ações
        </h2>

        {/* Impersonate — stub */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleImpersonate}
                  disabled={isRedacted}
                  aria-label="Impersonar tenant (disponível em S-11.07)"
                >
                  Impersonar tenant
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isRedacted
                ? "Tenant redigido — ação não disponível"
                : "Disponível em S-11.07 (Wave 7)"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Suspend / Reactivate */}
        {canSuspend && (
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setSuspendOpen(true)}
            aria-label="Suspender tenant"
          >
            Suspender tenant
          </Button>
        )}

        {isSuspended && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleReactivate}
                  aria-label="Reativar tenant (disponível em S-11.08)"
                >
                  Reativar tenant
                </Button>
              </TooltipTrigger>
              <TooltipContent>Disponível em S-11.08 (Wave 8)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {isRedacted && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Tenant redigido — ações de gestão não disponíveis.
          </p>
        )}
      </div>

      <SuspendDialog
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}
