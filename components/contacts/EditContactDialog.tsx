"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactPatchSchema, type ContactPatch } from "@/lib/schemas/contacts";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import type { Contact } from "@/lib/types/contacts";
import { CustomFieldsEditor } from "@/components/contacts/CustomFieldsEditor";
import { PriorityBadge } from "@/components/leads/PriorityBadge";
import { SEGMENT_CUSTOM_FIELDS } from "@/lib/leads/segment-fields";
import { scoreToPriority, PRIORITY_RANGE_HINT } from "@/lib/leads/priority";

interface FormShape {
  name?: string;
  email?: string;
  phone_number?: string;
  tagsRaw?: string;
  score?: number;
}

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditContactDialog({ contact, open, onOpenChange }: Props) {
  const update = useUpdateContact(contact.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    contact.custom_fields ?? {},
  );

  const form = useForm<FormShape>({
    defaultValues: {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone_number: contact.phone_number ?? "",
      tagsRaw: contact.tags.join(", "),
      score: contact.score ?? 0,
    },
  });

  // Prévia ao vivo da prioridade conforme o score digitado (espelha o DB).
  const watchedScore = form.watch("score");
  const previewPriority = scoreToPriority(Number(watchedScore) || 0);

  useEffect(() => {
    if (open) {
      form.reset({
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone_number: contact.phone_number ?? "",
        tagsRaw: contact.tags.join(", "),
        score: contact.score ?? 0,
      });
      setCustomFields(contact.custom_fields ?? {});
    }
  }, [open, contact, form]);

  async function onSubmit(values: FormShape) {
    setServerError(null);
    const tags = (values.tagsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const scoreNum = Math.max(0, Math.min(100, Math.round(Number(values.score) || 0)));

    const payload: Record<string, unknown> = {};
    if (values.name?.trim()) payload.name = values.name.trim();
    if (values.email?.trim()) payload.email = values.email.trim();
    if (values.phone_number?.trim()) payload.phone_number = values.phone_number.trim();
    payload.tags = tags;
    payload.score = scoreNum;
    payload.custom_fields = customFields;

    const parsed = contactPatchSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    try {
      await update.mutateAsync(parsed.data as ContactPatch);
      toast.success("Contato atualizado");
      onOpenChange(false);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
          <DialogDescription>Atualize os dados deste contato.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ec-name">Nome</Label>
            <Input id="ec-name" {...form.register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-email">Email</Label>
            <Input id="ec-email" type="email" {...form.register("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-phone">Telefone (E.164)</Label>
            <Input id="ec-phone" {...form.register("phone_number")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-tags">Tags</Label>
            <Input id="ec-tags" {...form.register("tagsRaw")} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ec-score">Score de qualificação</Label>
              <PriorityBadge tag={previewPriority} />
            </div>
            <Input
              id="ec-score"
              type="number"
              min={0}
              max={100}
              {...form.register("score", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">{PRIORITY_RANGE_HINT}</p>
          </div>

          <div className="space-y-2">
            <Label>Campos por segmento</Label>
            <CustomFieldsEditor
              fields={SEGMENT_CUSTOM_FIELDS}
              value={customFields}
              onChange={setCustomFields}
              mode="contact"
              disabled={update.isPending}
            />
          </div>

          {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
