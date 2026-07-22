"use client";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Lead } from "@/lib/types/leads";
import {
  useScheduledMessages,
  useCreateScheduledMessage,
  useCancelScheduledMessage,
  useActivateCadence,
} from "@/hooks/kanban/useScheduledMessages";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
}

/** datetime-local default: agora + 1h, no fuso local. */
function defaultLocalDateTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowupDialog({ open, onOpenChange, lead }: Props) {
  const contactId = lead.contact_id;
  const nome = lead.contact?.display_name?.trim() || lead.contact?.name?.trim() || "";

  const [when, setWhen] = useState(defaultLocalDateTime());
  const [body, setBody] = useState("");
  const listQ = useScheduledMessages(contactId);
  const createM = useCreateScheduledMessage(contactId);
  const cancelM = useCancelScheduledMessage(contactId);
  const activateM = useActivateCadence(lead.id, contactId);

  // Régua rápida: passos default editáveis (+1d, +3d, +7d).
  const defaultSteps = useMemo(
    () => [
      { delay_hours: 24, body: `Oi ${nome || "{{nome}}"}, tudo certo? Passando pra saber se posso te ajudar em algo. 😊` },
      { delay_hours: 72, body: `${nome || "{{nome}}"}, ainda tem interesse? Consigo condições especiais essa semana.` },
      { delay_hours: 168, body: `${nome || "{{nome}}"}, última chamada por aqui — me avisa se seguimos ou se prefere que eu encerre. Abraço!` },
    ],
    [nome],
  );
  const [steps, setSteps] = useState(defaultSteps);

  useEffect(() => {
    if (open) {
      setWhen(defaultLocalDateTime());
      setBody(nome ? `Oi ${nome}, ` : "");
      setSteps(defaultSteps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id]);

  const canSchedule = !!contactId && body.trim().length > 0 && !!when;

  async function schedule() {
    if (!contactId || !canSchedule) return;
    const iso = new Date(when).toISOString();
    if (Number.isNaN(Date.parse(iso))) {
      toast.error("Data/hora inválida");
      return;
    }
    try {
      await createM.mutateAsync({ contact_id: contactId, body: body.trim(), scheduled_for: iso, lead_id: lead.id });
      toast.success("Follow-up agendado");
      setBody(nome ? `Oi ${nome}, ` : "");
    } catch {
      /* toast via hook */
    }
  }

  async function activate() {
    if (!contactId) return;
    try {
      const res = await activateM.mutateAsync({
        contact_id: contactId,
        steps: steps.map((s) => ({ delay_hours: s.delay_hours, body: s.body.trim() })),
      });
      toast.success(`Régua ativada: ${res.data.scheduled} mensagens agendadas`);
    } catch {
      /* toast via hook */
    }
  }

  const pending = (listQ.data ?? []).filter((m) => m.status === "pending");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Follow-up & Cadência</DialogTitle>
          <DialogDescription>
            Agende mensagens de WhatsApp para {nome || "este contato"}. Enviadas automaticamente via WAHA.
          </DialogDescription>
        </DialogHeader>

        {!contactId ? (
          <p className="text-sm text-error-fg">
            Este lead não tem contato vinculado. Vincule um contato para agendar mensagens.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Follow-up único */}
            <div className="space-y-2">
              <Label>Agendar follow-up</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="fu-when" className="text-xs text-muted-foreground">Data e hora</Label>
                  <Input
                    id="fu-when"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </div>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Mensagem do follow-up…"
                rows={3}
              />
              <Button size="sm" onClick={schedule} disabled={!canSchedule || createM.isPending}>
                {createM.isPending ? "Agendando…" : "Agendar follow-up"}
              </Button>
            </div>

            <Separator />

            {/* Régua rápida */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ativar régua de cadência</Label>
                <span className="text-[11px] text-muted-foreground">+1 dia · +3 dias · +7 dias</span>
              </div>
              {steps.map((s, i) => (
                <div key={i} className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">
                    Passo {i + 1} — em {s.delay_hours >= 24 ? `${Math.round(s.delay_hours / 24)}d` : `${s.delay_hours}h`}
                  </span>
                  <Textarea
                    value={s.body}
                    onChange={(e) =>
                      setSteps((prev) => prev.map((p, idx) => (idx === i ? { ...p, body: e.target.value } : p)))
                    }
                    rows={2}
                    className="text-xs"
                  />
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={activate} disabled={activateM.isPending}>
                {activateM.isPending ? "Ativando…" : "Ativar régua de cadência"}
              </Button>
            </div>

            <Separator />

            {/* Agendados pendentes */}
            <div className="space-y-2">
              <Label>Agendados</Label>
              {pending.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma mensagem agendada pendente.</p>
              ) : (
                <ul className="space-y-1.5">
                  {pending.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start gap-2 rounded-md border border-border p-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={m.source === "cadence" ? "info" : "neutral"} className="h-4 px-1.5 text-[10px]">
                            {m.source === "cadence" ? "Régua" : "Follow-up"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(m.scheduled_for), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-text-muted">{m.body}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => cancelM.mutate(m.id)}
                        disabled={cancelM.isPending}
                      >
                        Cancelar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
