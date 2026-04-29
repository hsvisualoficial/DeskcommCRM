"use client";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const reasonSchema = z.string().min(10, "Mínimo 10 caracteres").max(500, "Máximo 500 caracteres");

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SuspendDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuspendDialog({ open, onClose, organizationId: _organizationId }: SuspendDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validation = reasonSchema.safeParse(reason);
  const isValid = validation.success;

  function handleConfirm() {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Razão inválida");
      return;
    }
    // STUB — Wave 8 implementará o endpoint real /api/v1/admin/tenants/[id]/suspend
    toast.info("Suspensão disponível em S-11.08 (Wave 8)", {
      description: "O endpoint de suspensão será implementado na próxima wave.",
    });
    setReason("");
    setError(null);
    onClose();
  }

  function handleClose() {
    setReason("");
    setError(null);
    onClose();
  }

  return (
    <AlertDialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Suspender tenant</AlertDialogTitle>
          <AlertDialogDescription>
            A suspensão bloqueará o acesso dos usuários deste tenant à plataforma.
            Esta ação pode ser revertida.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="suspend-reason">
            Motivo da suspensão{" "}
            <span className="text-muted-foreground text-xs font-normal">
              ({reason.length}/500)
            </span>
          </Label>
          <Textarea
            id="suspend-reason"
            placeholder="Descreva o motivo da suspensão (mínimo 10 caracteres)..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={4}
            maxLength={500}
            aria-describedby={error ? "suspend-reason-error" : undefined}
          />
          {error && (
            <p id="suspend-reason-error" className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid}
          >
            Confirmar suspensão
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
