"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface QualifyResult {
  qualification: {
    score: number;
    intencao: string;
    orcamento: string;
    tipo_servico: string;
    urgencia: "alta" | "media" | "baixa" | "indefinida";
    resumo_qualificacao: string;
    handoff_recomendado: boolean;
    motivo_handoff: string;
  };
  applied: {
    score_updated: boolean;
    note_saved: boolean;
    lead_moved: boolean;
    handoff: boolean;
    transition_sent: boolean;
  };
}

export function useQualifyLead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: QualifyResult }>(
        `/api/v1/conversations/${conversationId}/qualify`,
        {},
        { timeoutMs: 60_000 },
      );
      return res.data;
    },
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] });
      // score/prioridade/status mudaram — atualiza inbox e contato
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
