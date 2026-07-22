"use client";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Robot } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PriorityBadge } from "@/components/leads/PriorityBadge";
import { scoreToPriority } from "@/lib/leads/priority";
import { useConversationSummary } from "@/hooks/inbox/useConversationSummary";
import { useQualifyLead } from "@/hooks/inbox/useQualifyLead";
import {
  useConversationNotes,
  useCreateNote,
} from "@/hooks/inbox/useConversationNotes";

interface Props {
  conversationId: string;
}

export function ConversationNotesPanel({ conversationId }: Props) {
  const summary = useConversationSummary(conversationId);
  const qualify = useQualifyLead(conversationId);
  const notesQ = useConversationNotes(conversationId);
  const createNote = useCreateNote(conversationId);
  const [manual, setManual] = useState("");

  function runQualify() {
    qualify.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(
          res.applied.handoff
            ? `Lead qualificado (score ${res.qualification.score}) — handoff acionado`
            : `Lead qualificado — score ${res.qualification.score}`,
        );
      },
    });
  }

  function saveSummary() {
    const text = summary.data?.text;
    if (!text) return;
    createNote.mutate(
      { body: text, source: "ai_summary" },
      {
        onSuccess: () => {
          toast.success("Resumo salvo como nota interna");
          summary.reset();
        },
      },
    );
  }

  function saveManual() {
    const body = manual.trim();
    if (!body) return;
    createNote.mutate(
      { body, source: "manual" },
      {
        onSuccess: () => {
          setManual("");
          toast.success("Nota adicionada");
        },
      },
    );
  }

  const notes = notesQ.data ?? [];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Atendimento
      </h3>

      {/* Qualificar lead com IA (SDR) */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center gap-2"
        onClick={runQualify}
        disabled={qualify.isPending}
      >
        <Robot size={14} weight="duotone" aria-hidden />
        {qualify.isPending ? "Qualificando…" : "Qualificar lead com IA"}
      </Button>

      {qualify.data && (
        <Card className="space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-text-muted">Score</span>
              <span className="text-sm font-semibold tabular-nums text-text">
                {qualify.data.qualification.score}/100
              </span>
              <PriorityBadge tag={scoreToPriority(qualify.data.qualification.score)} size="sm" />
            </div>
            {qualify.data.applied.handoff && (
              <Badge variant="warning" className="h-4 px-1.5 text-[10px]">
                🚀 Handoff acionado
              </Badge>
            )}
          </div>
          <div className="space-y-0.5 text-text-muted">
            <p>• Intenção: {qualify.data.qualification.intencao}</p>
            <p>• Tipo: {qualify.data.qualification.tipo_servico}</p>
            <p>• Orçamento: {qualify.data.qualification.orcamento}</p>
            <p>• Urgência: {qualify.data.qualification.urgencia}</p>
          </div>
          {qualify.data.applied.handoff && (
            <p className="text-[11px] text-text-muted">
              Lead {qualify.data.applied.lead_moved ? "movido para a etapa de atendimento" : "sinalizado"} ·{" "}
              {qualify.data.applied.transition_sent ? "mensagem de transição enviada" : "bot silenciado para atendimento humano"}
            </p>
          )}
        </Card>
      )}

      {/* Resumo com IA */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center gap-2"
        onClick={() => summary.mutate()}
        disabled={summary.isPending}
      >
        <Robot size={14} weight="duotone" aria-hidden />
        {summary.isPending ? "Resumindo…" : "Resumir Atendimento com IA"}
      </Button>

      {summary.data && (
        <Card className="space-y-2 p-3 text-xs">
          <div>
            <p className="font-semibold text-text">1. Dor / Necessidade</p>
            <p className="text-text-muted">{summary.data.dor}</p>
          </div>
          <div>
            <p className="font-semibold text-text">2. Detalhes / Orçamento</p>
            <p className="text-text-muted">{summary.data.detalhes}</p>
          </div>
          <div>
            <p className="font-semibold text-text">3. Próximo passo</p>
            <p className="text-text-muted">{summary.data.proximo_passo}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={saveSummary}
              disabled={createNote.isPending}
            >
              Salvar como nota
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => summary.reset()}
              disabled={createNote.isPending}
            >
              Descartar
            </Button>
          </div>
        </Card>
      )}

      <Separator className="my-1" />

      {/* Nota manual */}
      <div className="space-y-1.5">
        <Textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Adicionar nota interna…"
          rows={2}
          className="text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 w-full text-xs"
          onClick={saveManual}
          disabled={!manual.trim() || createNote.isPending}
        >
          Adicionar nota
        </Button>
      </div>

      {/* Lista de notas */}
      <div className="space-y-2 pt-1">
        {notesQ.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : notes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhuma nota interna ainda.</p>
        ) : (
          notes.map((n) => (
            <Card key={n.id} className="space-y-1 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant={n.source === "ai_summary" ? "info" : "neutral"}
                  className="h-4 px-1.5 text-[10px]"
                >
                  {n.source === "ai_summary" ? "IA" : "Nota"}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(n.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-text-muted">{n.body}</p>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
